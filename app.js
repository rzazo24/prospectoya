/*
 * app.js
 * Lógica de interfaz: búsqueda con autocompletado, render de resultados,
 * carga del detalle (prospecto/ficha técnica) y acordeón de secciones.
 *
 * El detalle se abre en un <dialog> nativo (ventana centrada, fondo inerte,
 * Esc para cerrar); da igual de dónde venga la elección: una sugerencia del
 * desplegable o un resultado de la lista.
 *
 * Depende de api.js (llamadas a CIMA) y de tema.js (tema claro/oscuro).
 */

const searchInput = document.getElementById("search-input");
const suggestionsList = document.getElementById("search-suggestions");
const searchForm = document.getElementById("search-form");
const searchSubmit = document.getElementById("search-submit");
const composerWrap = document.querySelector(".composer-wrap");
const searchExamples = document.getElementById("search-examples");
const resultsList = document.getElementById("results-list");
const resultsStatus = document.getElementById("results-status");
const detailSection = document.getElementById("detail-section");
const detailBody = document.getElementById("detail-body");
const detailClose = document.getElementById("detail-close");
const detailName = document.getElementById("detail-name");
const detailLab = document.getElementById("detail-lab");
const detailCN = document.getElementById("detail-cn");
const quickSummary = document.getElementById("quick-summary");
const sectionsAccordion = document.getElementById("sections-accordion");
const docTabs = document.querySelectorAll(".doc-tab");

// Máximo de sugerencias en el desplegable y de resultados pintados de una vez.
// (La API de CIMA ignora `pagina`/`tamanioPagina` en /medicamentos y devuelve
// hasta 200 filas de golpe, así que el recorte se hace aquí.)
const MAX_SUGERENCIAS = 8;
const MAX_RESULTADOS = 60;

// Patrones para distinguir un código nacional (CN, 6 dígitos exactos) o un
// nº de registro (5-6 dígitos) de una búsqueda por nombre.
const RE_SOLO_DIGITOS = /^\d+$/;
const RE_CODIGO_NACIONAL = /^\d{6}$/;

// Si el navegador no soporta IntersectionObserver, se piden los CN de los
// primeros resultados de la lista (en vez de esperar a que entren en pantalla).
const MAX_CNS_SIN_OBSERVADOR = 12;
// Cuántos CN se muestran en un resultado antes de resumir el resto con "+N".
const MAX_CNS_VISIBLES = 2;

let currentNRegistro = null;
let currentTipoDoc = 2; // 2 = prospecto por defecto, 1 = ficha técnica
let debounceTimer = null;
let indiceSugerenciaActiva = -1; // -1 = ninguna sugerencia marcada con el teclado

// --- Búsqueda con autocompletado ---

function ocultarSugerencias() {
  suggestionsList.hidden = true;
  searchInput.setAttribute("aria-expanded", "false");
  marcarSugerenciaActiva(-1);
}

function mostrarSugerencias() {
  suggestionsList.hidden = false;
  searchInput.setAttribute("aria-expanded", "true");
}

/** El botón de la flecha sólo se activa cuando hay algo escrito, como en ChatGPT. */
function actualizarBotonEnvio() {
  searchSubmit.disabled = searchInput.value.trim().length === 0;
}

/** ¿El término es sólo dígitos (código nacional o nº de registro)? */
function esNumerico(term) {
  return RE_SOLO_DIGITOS.test(term);
}

/** Longitudes con las que merece la pena consultar un código: el CN son 6
 *  dígitos exactos y los nº de registro van de 5 a 10 (hay también tipo EMA,
 *  p.ej. "1231752001"), así que por debajo de 5 no se consulta. */
function tieneLongitudDeCodigo(term) {
  return term.length >= 5;
}

/**
 * Lanza la consulta adecuada según lo escrito: por código nacional si son 6
 * dígitos, por nº de registro si es un número sin coincidencia como CN, y por
 * nombre en el resto de casos.
 * @param {string} term - texto del buscador
 * @returns {Promise<{resultados: Array, totalFilas: number, porCodigoNacional: string|null}>}
 */
async function consultarSegunTermino(term) {
  if (RE_CODIGO_NACIONAL.test(term)) {
    // /presentaciones devuelve el envase exacto con su `cn` y el `nregistro`
    const porCN = await listarPresentaciones({ cn: term });
    const resultados = porCN.resultados || [];
    if (resultados.length > 0) {
      return { resultados, totalFilas: porCN.totalFilas, porCodigoNacional: term };
    }
    // Un número de 6 dígitos también puede ser un nº de registro antiguo
    const porNregistro = await buscarMedicamentos({ nregistro: term });
    return {
      resultados: porNregistro.resultados || [],
      totalFilas: porNregistro.totalFilas,
      porCodigoNacional: null,
    };
  }

  if (esNumerico(term)) {
    const porNregistro = await buscarMedicamentos({ nregistro: term });
    return {
      resultados: porNregistro.resultados || [],
      totalFilas: porNregistro.totalFilas,
      porCodigoNacional: null,
    };
  }

  const porNombre = await buscarMedicamentos({ nombre: term });
  return {
    resultados: porNombre.resultados || [],
    totalFilas: porNombre.totalFilas,
    porCodigoNacional: null,
  };
}

searchInput.addEventListener("input", (e) => {
  const term = e.target.value.trim();
  clearTimeout(debounceTimer);
  actualizarBotonEnvio();

  if (term.length < 3) {
    ocultarSugerencias();
    return;
  }

  // Con números no se consulta hasta tener un código con longitud válida:
  // a medias, el filtro `cn` nunca coincidiría (es exacto) y el de `nregistro`
  // devolvería cero filas.
  if (esNumerico(term) && !tieneLongitudDeCodigo(term)) {
    ocultarSugerencias();
    return;
  }

  // Debounce simple para no saturar la API mientras el usuario escribe
  debounceTimer = setTimeout(async () => {
    try {
      const data = await consultarSegunTermino(term);
      renderSuggestions(data.resultados);
    } catch (err) {
      console.error(err);
      ocultarSugerencias();
      mostrarEstadoResultados(
        "No se ha podido consultar la API de CIMA. Comprueba tu conexión e inténtalo de nuevo.",
        true
      );
    }
  }, 300);
});

function renderSuggestions(medicamentos) {
  suggestionsList.innerHTML = "";

  if (medicamentos.length === 0) {
    ocultarSugerencias();
    return;
  }

  // Se limita a MAX_SUGERENCIAS y se añade el laboratorio como texto secundario
  medicamentos.slice(0, MAX_SUGERENCIAS).forEach((med, indice) => {
    const li = document.createElement("li");
    li.id = `sugerencia-${indice}`;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", "false");

    const nombre = document.createElement("span");
    nombre.className = "suggestion-name";
    nombre.textContent = med.nombre;
    li.appendChild(nombre);

    if (med.labtitular) {
      const lab = document.createElement("span");
      lab.className = "suggestion-lab";
      lab.textContent = med.labtitular;
      li.appendChild(lab);
    }

    // Pasar el ratón también marca la opción, para que teclado y puntero
    // no apunten a dos sugerencias distintas a la vez.
    li.addEventListener("mouseenter", () => marcarSugerenciaActiva(indice));

    li.addEventListener("click", () => {
      ocultarSugerencias();
      searchInput.value = med.nombre;
      actualizarBotonEnvio();
      selectMedicamento(med);
    });

    suggestionsList.appendChild(li);
  });

  marcarSugerenciaActiva(-1);
  mostrarSugerencias();
}

/**
 * Marca la sugerencia que elegiría Enter (realce equivalente al hover).
 * @param {number} indice - posición dentro del desplegable; -1 = ninguna
 */
function marcarSugerenciaActiva(indice) {
  const items = Array.from(suggestionsList.querySelectorAll("li"));
  indiceSugerenciaActiva = indice >= 0 && indice < items.length ? indice : -1;

  items.forEach((li, i) => {
    const activa = i === indiceSugerenciaActiva;
    li.classList.toggle("is-active", activa);
    li.setAttribute("aria-selected", String(activa));
  });

  // aria-activedescendant mantiene el foco en el input mientras se recorre la lista
  if (indiceSugerenciaActiva === -1) {
    searchInput.removeAttribute("aria-activedescendant");
    return;
  }

  const activo = items[indiceSugerenciaActiva];
  searchInput.setAttribute("aria-activedescendant", activo.id);
  // block:"nearest" evita que la página salte al moverse por la lista
  activo.scrollIntoView({ block: "nearest" });
}

/** Mueve la sugerencia activa con ↑ / ↓, dando la vuelta en los extremos. */
function moverSugerenciaActiva(delta) {
  const total = suggestionsList.querySelectorAll("li").length;
  if (total === 0) return;

  const siguiente =
    indiceSugerenciaActiva === -1
      ? (delta > 0 ? 0 : total - 1)
      : (indiceSugerenciaActiva + delta + total) % total;

  marcarSugerenciaActiva(siguiente);
}

/** Sugerencia marcada con el teclado, o null si no hay ninguna. */
function sugerenciaActiva() {
  if (indiceSugerenciaActiva < 0) return null;
  return suggestionsList.querySelectorAll("li")[indiceSugerenciaActiva] || null;
}

// Estado inicial del botón de envío (el HTML lo trae desactivado y el input vacío)
actualizarBotonEnvio();

// Al enviar el formulario (botón con la flecha o Enter) se lanza la búsqueda
// completa y se pinta #results-list. El desplegable es solo un atajo.
searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  clearTimeout(debounceTimer);
  buscarYRenderizarResultados(searchInput.value.trim());
});

searchInput.addEventListener("keydown", (e) => {
  const desplegableAbierto = !suggestionsList.hidden;

  if (e.key === "Escape") {
    ocultarSugerencias();
    return;
  }

  // ↑ / ↓ recorren las sugerencias sin sacar el foco del input
  if (desplegableAbierto && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    e.preventDefault();
    moverSugerenciaActiva(e.key === "ArrowDown" ? 1 : -1);
    return;
  }

  if (e.key !== "Enter") return;
  e.preventDefault();
  clearTimeout(debounceTimer);

  // Con una sugerencia marcada, Enter abre su ficha en lugar de buscar el texto
  const activa = sugerenciaActiva();
  if (desplegableAbierto && activa) {
    activa.click();
    return;
  }

  buscarYRenderizarResultados(searchInput.value.trim());
});

// Cualquier clic fuera del buscador cierra el desplegable
document.addEventListener("pointerdown", (e) => {
  if (!composerWrap.contains(e.target)) ocultarSugerencias();
});

// Tabular fuera del campo también lo cierra (con el foco fuera ya no se puede
// elegir nada): las opciones no son focusables (se marcan con
// aria-activedescendant), así que el único destino legítimo del foco dentro
// del combobox es el propio input.
searchInput.addEventListener("focusout", (e) => {
  if (e.relatedTarget !== searchInput) ocultarSugerencias();
});

// Chips de ejemplo ("Prueba con…"): buscan directamente al pulsarlos
if (searchExamples) {
  searchExamples.addEventListener("click", (e) => {
    const chip = e.target.closest(".js-ejemplo");
    if (!chip) return;
    searchInput.value = chip.dataset.ejemplo;
    actualizarBotonEnvio();
    clearTimeout(debounceTimer);
    buscarYRenderizarResultados(chip.dataset.ejemplo);
    searchInput.focus();
  });
}

/**
 * Busca por nombre, código nacional (6 dígitos) o nº de registro y pinta la
 * lista completa de resultados.
 * @param {string} term - texto introducido por el usuario
 */
async function buscarYRenderizarResultados(term) {
  ocultarSugerencias();

  if (term.length < 3) {
    resultsList.innerHTML = "";
    mostrarEstadoResultados("Escribe al menos 3 letras para empezar a buscar.", true);
    return;
  }

  // Un número a medias (menos de 5 dígitos) no se consulta: la API ignora los
  // filtros vacíos y devolvería el catálogo completo
  if (esNumerico(term) && !tieneLongitudDeCodigo(term)) {
    resultsList.innerHTML = "";
    mostrarEstadoResultados(
      `«${term}» no es un código válido: el código nacional (CN) tiene 6 dígitos y el nº de registro, 5 o más.`,
      true
    );
    return;
  }

  resultsList.innerHTML = "";
  mostrarEstadoResultados(`Buscando «${term}»…`);

  try {
    const { resultados, totalFilas, porCodigoNacional } = await consultarSegunTermino(term);
    renderResultados(resultados, term, totalFilas, porCodigoNacional);
  } catch (err) {
    console.error(err);
    resultsList.innerHTML = "";
    mostrarEstadoResultados(
      "No se ha podido completar la búsqueda. Comprueba tu conexión e inténtalo de nuevo.",
      true
    );
  }
}

/**
 * Pinta en #results-list los medicamentos encontrados (lista completa, no
 * el desplegable) y actualiza el mensaje de estado.
 * @param {Array} medicamentos
 * @param {string} term - texto buscado (para el mensaje de estado)
 * @param {number} totalFilas - total que informa la API
 * @param {string|null} porCodigoNacional - CN usado en la búsqueda, si lo hubo
 */
function renderResultados(medicamentos, term, totalFilas, porCodigoNacional = null) {
  resultsList.innerHTML = "";

  if (medicamentos.length === 0) {
    mostrarEstadoResultados(mensajeSinResultados(term));
    return;
  }

  const visibles = medicamentos.slice(0, MAX_RESULTADOS);
  const items = visibles.map((med) => crearItemResultado(med));
  items.forEach((li) => resultsList.appendChild(li));

  // Los CN que no vengan ya en la respuesta (búsquedas por nombre) se piden
  // cuando el resultado entra en pantalla, de uno en uno y con caché.
  const sinCN = items.filter((li) => li.dataset.cnPendiente === "true");
  if (observadorCN) {
    sinCN.forEach((li) => observadorCN.observe(li));
  } else {
    sinCN.slice(0, MAX_CNS_SIN_OBSERVADOR).forEach(cargarCNDeResultado);
  }

  const total = Number.isFinite(totalFilas) ? totalFilas : medicamentos.length;
  const busca = porCodigoNacional
    ? `el código nacional «${porCodigoNacional}»`
    : `«${term}»`;
  let estado = `${total} resultado${total === 1 ? "" : "s"} para ${busca}`;
  if (visibles.length < total) {
    estado += ` — mostrando los primeros ${visibles.length}`;
  }
  mostrarEstadoResultados(estado);
}

/** Mensaje cuando la búsqueda no devuelve nada, con la pista adecuada. */
function mensajeSinResultados(term) {
  if (esNumerico(term)) {
    return `Sin resultados para el código «${term}». Comprueba que el código nacional (6 dígitos) sea el de tu envase.`;
  }
  return `Sin resultados para «${term}». Prueba con el principio activo (por ejemplo, «paracetamol»).`;
}

/** Crea el <li> de un resultado, clicable para cargar su detalle. */
function crearItemResultado(medicamento) {
  const li = document.createElement("li");
  li.dataset.nregistro = medicamento.nregistro;

  const nombre = document.createElement("span");
  nombre.className = "result-name";
  nombre.textContent = medicamento.nombre;
  li.appendChild(nombre);

  if (medicamento.labtitular) {
    const lab = document.createElement("span");
    lab.className = "result-lab";
    lab.textContent = medicamento.labtitular;
    li.appendChild(lab);
  }

  // Código nacional: las respuestas de /presentaciones ya lo traen (búsquedas
  // por CN); en el resto se rellena en diferido, cuando el resultado se ve.
  const cn = document.createElement("span");
  cn.className = "result-cn";
  if (medicamento.cn) {
    cn.textContent = `CN ${medicamento.cn}`;
  } else {
    cn.hidden = true;
    li.dataset.cnPendiente = "true";
  }
  li.appendChild(cn);

  const etiquetas = document.createElement("span");
  etiquetas.className = "result-tags";

  const anadirEtiqueta = (texto, clase) => {
    const etiqueta = document.createElement("span");
    etiqueta.className = `result-tag ${clase}`;
    etiqueta.textContent = texto;
    etiquetas.appendChild(etiqueta);
  };

  if (medicamento.receta) anadirEtiqueta("Con receta", "result-tag-receta");
  if (medicamento.generico) anadirEtiqueta("EFG", "result-tag-efg");
  if (medicamento.comerc === false) anadirEtiqueta("No comercializado", "result-tag-nocomerc");

  if (etiquetas.childElementCount > 0) li.appendChild(etiquetas);

  li.addEventListener("click", () => {
    marcarResultadoActivo(medicamento.nregistro);
    // Si el CN aún no se había pedido (o no había entrado en pantalla), se
    // pinta ahora: la respuesta suele estar ya en caché.
    cargarCNDeResultado(li);
    selectMedicamento(medicamento);
  });

  return li;
}

/** Marca visualmente el resultado seleccionado. */
function marcarResultadoActivo(nregistro) {
  resultsList.querySelectorAll("li").forEach((li) => {
    li.classList.toggle("active", li.dataset.nregistro === String(nregistro));
  });
}

// --- Código nacional (CN) de los resultados ---
// /medicamentos NO devuelve el CN: sólo /presentaciones lo trae (uno por
// envase). Como no admite consultas por lotes, se pide un medicamento a la vez,
// cacheado, y sólo cuando el resultado entra en pantalla.

/** Caché nregistro → promesa con sus CN. Guardar la promesa evita pedir dos
 *  veces lo mismo si el usuario abre la ficha antes de que llegue la respuesta. */
const cacheCN = new Map();

/** Observa los resultados para pedir su CN cuando se ven; null si no hay soporte. */
const observadorCN =
  typeof IntersectionObserver === "function"
    ? new IntersectionObserver(
        (entradas) => {
          entradas.forEach((entrada) => {
            if (!entrada.isIntersecting) return;
            observadorCN.unobserve(entrada.target);
            cargarCNDeResultado(entrada.target);
          });
        },
        { rootMargin: "150px" } // se adelanta un poco al scroll
      )
    : null;

/**
 * CN (uno por envase) de un medicamento, con caché.
 * @param {string} nregistro
 * @returns {Promise<string[]>} lista de códigos nacionales (vacía si no hay)
 */
function cnsDeMedicamento(nregistro) {
  const clave = String(nregistro || "");
  // Sin nregistro no se consulta: la API ignora los filtros vacíos y
  // devolvería las presentaciones de todo el catálogo.
  if (!clave) return Promise.resolve([]);

  if (!cacheCN.has(clave)) {
    const promesa = listarPresentaciones({ nregistro: clave })
      .then((data) =>
        (data.resultados || []).map((presentacion) => presentacion.cn).filter(Boolean)
      )
      .catch((err) => {
        cacheCN.delete(clave); // que un fallo puntual no se quede cacheado
        throw err;
      });
    cacheCN.set(clave, promesa);
  }

  return cacheCN.get(clave);
}

/** Pide (o reutiliza de la caché) el CN de un resultado y lo pinta. */
async function cargarCNDeResultado(li) {
  if (!li.isConnected) return;

  try {
    const cns = await cnsDeMedicamento(li.dataset.nregistro);
    if (li.isConnected) pintarCNDeResultado(li, cns);
  } catch (err) {
    // El resultado sigue siendo válido sin el CN: no se muestra nada y ya está.
    console.error(err);
  }
}

/** Vuelca los CN en el hueco `.result-cn` del resultado. */
function pintarCNDeResultado(li, cns) {
  const hueco = li.querySelector(".result-cn");
  if (!hueco || cns.length === 0) return;

  const visibles = cns.slice(0, MAX_CNS_VISIBLES).map((cn) => `CN ${cn}`);
  const restantes = cns.length - visibles.length;

  hueco.textContent = restantes > 0 ? `${visibles.join(" · ")} · +${restantes}` : visibles.join(" · ");
  hueco.title = `${cns.length === 1 ? "Código nacional" : "Códigos nacionales"}: ${cns.join(", ")}`;
  hueco.hidden = false;
}

/** Mensaje de estado bajo el buscador (resultados encontrados o error). */
function mostrarEstadoResultados(mensaje, esError = false) {
  resultsStatus.textContent = mensaje || "";
  resultsStatus.classList.toggle("error", Boolean(esError));
  resultsStatus.hidden = !mensaje;
}

// --- Selección de medicamento y carga de detalle ---

/**
 * Abre el detalle en su ventana. `showModal()` deja el resto de la página
 * inerte y el foco dentro de la ventana, y Esc la cierra (evento `cancel`).
 * Si ya estaba abierta no se vuelve a abrir: `showModal()` avisaría por consola.
 */
function abrirDetalle() {
  if (!detailSection.open) detailSection.showModal();
  // Un prospecto nuevo se lee desde arriba aunque el anterior se hubiera bajado.
  detailBody.scrollTop = 0;
}

function cerrarDetalle() {
  if (detailSection.open) detailSection.close();
}

detailClose.addEventListener("click", cerrarDetalle);
// El velo oscurecido no es un elemento: el clic del fondo llega con el propio
// <dialog> como destino (lo de dentro siempre pasa por .dialogo-panel).
detailSection.addEventListener("click", (e) => {
  if (e.target === detailSection) cerrarDetalle();
});

async function selectMedicamento(medicamento) {
  currentNRegistro = medicamento.nregistro;
  detailName.textContent = medicamento.nombre;
  detailLab.textContent = medicamento.labtitular || "";
  abrirDetalle();

  // TODO Fase 2: llamar a comprobarProblemaSuministro() con el CN
  // (ya disponible en mostrarCNsDeDetalle()) y mostrar #supply-issue-badge.
  // Ojo: /psuministro responde por CN de un envase concreto, no por nregistro.

  // El resumen rápido, el acordeón y los CN son consultas independientes:
  // se lanzan en paralelo para no encadenar esperas.
  await Promise.all([
    cargarSecciones(currentTipoDoc),
    renderQuickSummary(medicamento.nregistro),
    mostrarCNsDeDetalle(medicamento.nregistro),
  ]);
}

/**
 * Pinta en #detail-cn los códigos nacionales (uno por envase) del medicamento
 * abierto. Reutiliza la misma caché que la lista de resultados, así que si el
 * usuario ya había hecho scroll hasta su resultado no hay petición extra.
 * @param {string} nregistro
 */
async function mostrarCNsDeDetalle(nregistro) {
  detailCN.hidden = true;
  detailCN.textContent = "";

  try {
    const cns = await cnsDeMedicamento(nregistro);
    // Si mientras tanto se ha abierto otro medicamento, no se pisa su cabecera
    if (currentNRegistro !== nregistro || cns.length === 0) return;

    detailCN.textContent = `${cns.length === 1 ? "Código nacional" : "Códigos nacionales"} (envases): ${cns.join(", ")}`;
    detailCN.hidden = false;
  } catch (err) {
    console.error(err);
  }
}

// --- Tabs Prospecto / Ficha técnica ---

docTabs.forEach((tab) => {
  tab.addEventListener("click", async () => {
    docTabs.forEach((t) => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    currentTipoDoc = Number(tab.dataset.docType);
    if (currentNRegistro) await cargarSecciones(currentTipoDoc);
  });
});

// --- Acordeón de secciones ---

async function cargarSecciones(tipoDoc) {
  const nregistro = currentNRegistro;
  sectionsAccordion.innerHTML = '<p class="cargando">Cargando el documento…</p>';

  try {
    const secciones = await listarSecciones(tipoDoc, nregistro);
    if (nregistro !== currentNRegistro) return; // el usuario ya cambió de medicamento
    renderAccordion(secciones);
  } catch (err) {
    console.error(err);
    if (nregistro !== currentNRegistro) return;
    sectionsAccordion.innerHTML = "<p>No se ha podido cargar el documento.</p>";
  }
}

function renderAccordion(secciones) {
  sectionsAccordion.innerHTML = "";

  // Forma de la respuesta, VERIFICADA contra la API real (20/09/2026):
  //   [{ seccion: "2", titulo: "Qué necesita saber antes de empezar…", orden: 3 }, …]
  // No se ordena por `orden`: en la ficha técnica ese campo no es monótono
  // (4, 4.1, 4.2 comparten valores bajos), pero el array ya llega en el
  // orden correcto del documento.
  if (!Array.isArray(secciones) || secciones.length === 0) {
    sectionsAccordion.innerHTML = "<p>No hay secciones disponibles para este documento.</p>";
    return;
  }

  secciones.forEach((seccion) => {
    const idSeccion = seccion.seccion || seccion.id;

    const item = document.createElement("div");
    item.className = "accordion-item";

    const header = document.createElement("div");
    header.className = "accordion-header";
    header.setAttribute("role", "button");
    header.setAttribute("tabindex", "0");
    header.setAttribute("aria-expanded", "false");

    const titulo = document.createElement("span");
    titulo.className = "accordion-title";
    titulo.textContent = seccion.titulo || `Sección ${idSeccion}`;
    header.appendChild(titulo);
    header.appendChild(crearChevron());

    const body = document.createElement("div");
    body.className = "accordion-body";
    body.dataset.loaded = "false";

    const alternar = async () => {
      const abierto = body.classList.contains("open");

      // Cerrar todas las demás secciones (comportamiento tipo acordeón)
      document.querySelectorAll(".accordion-body.open").forEach((b) => {
        if (b !== body) b.classList.remove("open");
      });

      if (abierto) {
        body.classList.remove("open");
        header.setAttribute("aria-expanded", "false");
        return;
      }

      body.classList.add("open");
      header.setAttribute("aria-expanded", "true");

      if (body.dataset.loaded !== "false") return;

      const tipoDoc = currentTipoDoc;
      const nregistro = currentNRegistro;
      body.innerHTML = '<p class="cargando">Cargando…</p>';

      try {
        const html = await obtenerContenidoSeccion(tipoDoc, nregistro, idSeccion);
        if (tipoDoc !== currentTipoDoc || nregistro !== currentNRegistro) return;
        // TODO: sanitizar `html` antes de asignarlo si se añaden más
        // fuentes de datos en el futuro (ver nota en api.js)
        body.innerHTML = html || "<p>Esta sección no tiene contenido.</p>";
        quitarEstilosInline(body);
        body.dataset.loaded = "true";
      } catch (err) {
        console.error(err);
        body.innerHTML = "<p>No se ha podido cargar esta sección.</p>";
        body.dataset.loaded = "false";
      }
    };

    header.addEventListener("click", alternar);
    header.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        alternar();
      }
    });

    item.appendChild(header);
    item.appendChild(body);
    sectionsAccordion.appendChild(item);
  });
}

/** Chevron del acordeón (SVG creado sin innerHTML). */
function crearChevron() {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "accordion-chevron");

  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", "m6 9 6 6 6-6");
  svg.appendChild(path);

  return svg;
}

/**
 * Limpia el HTML que llega de CIMA para que se vea con la tipografía del sitio:
 * quita los estilos en línea (CIMA manda Times New Roman 11pt con márgenes en
 * pt) y los párrafos que solo contienen espacios duros.
 * No modifica el texto: solo presentación.
 */
function quitarEstilosInline(contenedor) {
  contenedor.querySelectorAll("[style]").forEach((nodo) => nodo.removeAttribute("style"));

  // <font face="Times New Roman">…</font> → se deja solo su contenido
  contenedor.querySelectorAll("font").forEach((nodo) => {
    nodo.replaceWith(...nodo.childNodes);
  });

  contenedor.querySelectorAll("p").forEach((p) => {
    const vacio = !p.textContent.replace(/\u00a0/g, " ").trim();
    if (vacio && !p.querySelector("img, br, table, a")) p.remove();
  });
}

// --- Resumen rápido (dosis, contraindicaciones y alertas clave) ---
//
// Cómo se localiza cada dato (verificado contra la API real el 20/09/2026):
// el prospecto NO tiene una sección "Contraindicaciones": todo eso vive
// dentro de "Qué necesita saber antes de empezar a tomar…", dividido en
// subtítulos ("No tome…", "Embarazo y lactancia", "Conducción y uso de
// máquinas", "Toma de … con alimentos, bebidas y alcohol"). Por eso cada
// campo busca primero en las secciones del prospecto, luego en los
// subtítulos del contenido y, si no hay nada, en la ficha técnica.

const CAMPOS_RESUMEN = [
  {
    id: "posologia",
    etiqueta: "Dosis y forma de tomarlo",
    secciones: [/c[óo]mo tomar/i, /posolog/i, /forma de administraci/i],
    subTitulos: [/^posolog/i, /^dosis/i, /^cu[áa]nto (?:tomar|usar)/i, /^adultos/i, /^uso en/i],
    frases: [/\b\d+(?:[.,]\d+)?\s*(?:mg|g|ml)\b/i],
    extraerPorFrases: true,
    contextoPrevio: true,
    prefijarTitulo: true,
    primerosBloques: 3,
    truncar: 420,
  },
  {
    id: "contraindicaciones",
    etiqueta: "No lo tome si… (contraindicaciones)",
    secciones: [/contraindicac/i, /qu[ée] necesita saber/i],
    seccionesEspecificas: [/contraindicac/i],
    subTitulos: [/^no tome/i, /^no usar/i, /^no utilice/i, /^no debe/i, /contraindicac/i],
    frases: [/est[áa] contraindicad/i, /no debe (?:tomar|usar|utilizar)/i],
    extraerPorFrases: true,
    seccionCompleta: true,
    truncar: 420,
  },
  {
    id: "embarazo",
    etiqueta: "Embarazo y lactancia",
    secciones: [/embarazo/i, /lactanc/i, /fertilidad/i, /qu[ée] necesita saber/i, /advertencias/i],
    seccionesEspecificas: [/embarazo/i, /lactanc/i, /fertilidad/i],
    subTitulos: [/embarazo/i, /lactanc/i],
    frases: [/est[áa] embarazada/i, /lactanc/i],
    extraerPorFrases: true,
    seccionCompleta: true,
    truncar: 380,
  },
  {
    id: "conduccion",
    etiqueta: "Conducción y uso de máquinas",
    secciones: [/conduc/i, /m[áa]quinas/i, /qu[ée] necesita saber/i, /advertencias/i],
    seccionesEspecificas: [/conduc/i, /m[áa]quinas/i],
    subTitulos: [/conduc/i, /m[áa]quinas/i],
    frases: [/conducir/i, /maquinaria/i],
    extraerPorFrases: true,
    seccionCompleta: true,
    truncar: 320,
  },
  {
    id: "alcohol",
    etiqueta: "Alcohol",
    secciones: [/alcohol/i, /alimentos/i, /qu[ée] necesita saber/i, /interacci/i, /advertencias/i],
    subTitulos: [/alcohol/i],
    frases: [/alcohol/i],
    extraerPorFrases: true,
    prioridadFrases: true,
    maxFrases: 1,
    truncar: 320,
  },
];

/**
 * Extrae el resumen del medicamento y lo pinta en #quick-summary.
 * Si no se encuentra ningún dato, el bloque queda oculto.
 * @param {string} nregistro
 */
async function renderQuickSummary(nregistro) {
  quickSummary.hidden = false;
  quickSummary.innerHTML = "<p class='quick-summary-loading'>Cargando resumen…</p>";

  let datos;
  try {
    datos = await extraerResumenRapido(nregistro);
  } catch (err) {
    console.error(err);
    quickSummary.hidden = true;
    quickSummary.innerHTML = "";
    return;
  }

  // Si el usuario ya ha seleccionado otro medicamento, se descarta este resultado
  if (nregistro !== currentNRegistro) return;

  const conDatos = CAMPOS_RESUMEN.filter((campo) => datos.resumen[campo.id]);

  if (conDatos.length === 0) {
    quickSummary.hidden = true;
    quickSummary.innerHTML = "";
    return;
  }

  quickSummary.innerHTML = "";

  const titulo = document.createElement("h3");
  titulo.className = "quick-summary-title";
  titulo.textContent = "Resumen rápido";
  quickSummary.appendChild(titulo);

  const grid = document.createElement("div");
  grid.className = "quick-summary-grid";
  conDatos.forEach((campo) =>
    grid.appendChild(crearTarjetaResumen(campo, datos.resumen[campo.id]))
  );
  quickSummary.appendChild(grid);

  const nota = document.createElement("p");
  nota.className = "quick-summary-note";
  const origen = {
    "Prospecto": "del prospecto",
    "Ficha técnica": "de la ficha técnica",
  };
  const documentos = [...new Set(conDatos.map((campo) => datos.resumen[campo.id].documento))];
  nota.textContent =
    `Resumen extraído automáticamente ${documentos.map((d) => origen[d] || d).join(" y ")}. ` +
    "No sustituye el consejo de un profesional sanitario.";
  quickSummary.appendChild(nota);
}

/** Construye la tarjeta de un campo del resumen (texto plano, sin HTML). */
function crearTarjetaResumen(campo, dato) {
  const tarjeta = document.createElement("article");
  tarjeta.className = `quick-summary-card quick-summary-card-${campo.id}`;

  const titulo = document.createElement("h4");
  titulo.className = "quick-summary-card-title";
  titulo.textContent = campo.etiqueta;
  tarjeta.appendChild(titulo);

  const texto = document.createElement("p");
  texto.textContent = dato.texto; // textContent: aquí nunca se inyecta HTML
  tarjeta.appendChild(texto);

  const fuente = document.createElement("p");
  fuente.className = "quick-summary-source";
  fuente.textContent = `${dato.documento} · ${dato.origen}`;
  tarjeta.appendChild(fuente);

  return tarjeta;
}


/**
 * Recorre los documentos (prospecto primero, ficha técnica como respaldo) y
 * devuelve los campos del resumen que han podido localizarse.
 * @returns {Promise<{resumen: Object, sinDatos: string[]}>}
 */
async function extraerResumenRapido(nregistro) {
  const resumen = {};
  const pendientes = new Set(CAMPOS_RESUMEN.map((campo) => campo.id));

  for (const tipoDoc of [2, 1]) {
    if (pendientes.size === 0) break;

    const campos = CAMPOS_RESUMEN.filter((campo) => pendientes.has(campo.id));
    let cargadas = [];

    try {
      cargadas = await cargarDocumentoParaResumen(tipoDoc, nregistro, campos);
    } catch (err) {
      console.error(`No se pudo cargar el documento ${tipoDoc}:`, err);
      continue;
    }

    for (const campo of campos) {
      const candidatas = cargadas.filter((cargada) =>
        coincide(cargada.seccion.titulo, campo.secciones)
      );
      const dato = buscarCampo(candidatas, campo);
      if (dato) {
        resumen[campo.id] = dato;
        pendientes.delete(campo.id);
      }
    }
  }

  return { resumen, sinDatos: [...pendientes] };
}

/**
 * Descarga las secciones de un documento que interesan para los campos dados
 * y las convierte en bloques de texto.
 * @returns {Promise<Array<{seccion: Object, documento: string, bloques: Array}>>}
 */
async function cargarDocumentoParaResumen(tipoDoc, nregistro, campos) {
  const documento = tipoDoc === 2 ? "Prospecto" : "Ficha técnica";
  const secciones = await listarSecciones(tipoDoc, nregistro);
  const patrones = campos.flatMap((campo) => campo.secciones);

  const objetivo = secciones.filter((seccion) => coincide(seccion.titulo, patrones));

  const cargadas = await Promise.all(
    objetivo.map(async (seccion) => {
      try {
        const html = await obtenerContenidoSeccion(tipoDoc, nregistro, seccion.seccion);
        return { seccion, documento, bloques: extraerBloques(html) };
      } catch (err) {
        console.warn(`No se pudo leer la sección ${seccion.seccion}:`, err);
        return null;
      }
    })
  );

  return cargadas.filter(Boolean);
}

/**
 * Busca un campo del resumen dentro de las secciones candidatas.
 * Orden de búsqueda: subtítulo → frase clave → sección completa → inicio.
 * @returns {{texto: string, origen: string, documento: string}|null}
 */
function buscarCampo(secciones, campo) {
  /** Frases concretas que mencionan las palabras clave del campo. */
  const porFrases = () => {
    for (const candidata of secciones) {
      for (const bloque of candidata.bloques) {
        const frases = extraerFrases(
          bloque.texto,
          campo.frases,
          campo.maxFrases || 2,
          campo.contextoPrevio
        );
        if (frases) {
          return {
            texto: recortar(frases, campo.truncar),
            origen: candidata.seccion.titulo,
            documento: candidata.documento,
          };
        }
      }
    }
    return null;
  };

  // 0) Algunos campos (p. ej. alcohol) son más fiables buscados por frase: el
  //    subtítulo "…con alimentos, bebidas y alcohol" habla de otras cosas
  //    antes de llegar a la advertencia que de verdad interesa.
  if (campo.prioridadFrases) {
    const dato = porFrases();
    if (dato) return dato;
  }

  // 1) Subtítulo del tipo "Embarazo y lactancia" o "No tome…"
  for (const candidata of secciones) {
    const indice = candidata.bloques.findIndex(
      (bloque) => bloque.titulo && coincide(bloque.titulo, campo.subTitulos)
    );
    if (indice !== -1) {
      const bloque = candidata.bloques[indice];
      const encontrado = recogerTexto(candidata.bloques, indice, campo);
      if (encontrado) {
        // En posología interesa saber a quién va dirigida la dosis
        // ("Adultos: …", "Uso en niños: …"), salvo si el texto ya lo repite.
        const inicio = encontrado.toLowerCase().slice(0, 60);
        const yaSeRepite = inicio.includes(bloque.titulo.toLowerCase());
        const prefijo =
          campo.prefijarTitulo && !yaSeRepite ? `${formatearTitulo(bloque.titulo)} ` : "";
        return {
          texto: limpiarTexto(`${prefijo}${encontrado}`),
          origen: candidata.seccion.titulo,
          documento: candidata.documento,
        };
      }
    }
  }

  // 2) Frases concretas (sin cambiar el orden de prioridad)
  if (campo.extraerPorFrases) {
    const dato = porFrases();
    if (dato) return dato;
  }

  // 3) Secciones que YA son el dato en sí (p. ej. "4.3 Contraindicaciones" o
  //    "4.7 Efectos sobre la capacidad para conducir…" de la ficha técnica).
  //    Importante: solo valen las secciones específicas del campo, nunca las
  //    contenedoras del prospecto ("Qué necesita saber antes de empezar…"),
  //    porque su contenido empieza por otros temas y confundiría.
  if (campo.seccionCompleta) {
    const especificas = secciones.filter((candidata) =>
      coincide(candidata.seccion.titulo, campo.seccionesEspecificas)
    );
    for (const candidata of especificas) {
      const texto = limpiarTexto(
        candidata.bloques.map((bloque) => bloque.texto || "").join(" ")
      );
      if (texto) {
        return {
          texto: recortar(texto, campo.truncar),
          origen: candidata.seccion.titulo,
          documento: candidata.documento,
        };
      }
    }
  }

  // 4) Primeros bloques de la sección (la posología suele ir al principio)
  if (campo.primerosBloques) {
    for (const candidata of secciones) {
      const texto = limpiarTexto(
        candidata.bloques
          .filter((bloque) => bloque.texto)
          .slice(0, campo.primerosBloques)
          .map((bloque) => bloque.texto)
          .join(" ")
      );
      if (texto) {
        return {
          texto: recortar(texto, campo.truncar),
          origen: candidata.seccion.titulo,
          documento: candidata.documento,
        };
      }
    }
  }

  return null;
}

/** Recoge el texto de un bloque con subtítulo y los que le siguen. */
function recogerTexto(bloques, indice, campo) {
  const maxBloques = campo.maxBloques || 3;
  const partes = [];

  for (let i = indice; i < bloques.length && partes.length < maxBloques; i++) {
    if (i > indice && bloques[i].titulo) break; // empieza otro subtítulo
    if (bloques[i].texto) partes.push(bloques[i].texto);
  }

  return recortar(limpiarTexto(partes.join(" ")), campo.truncar);
}

/**
 * Devuelve solo las frases del texto que encajan con los patrones, unidas en
 * un párrafo corto. Sirve para campos que no tienen subtítulo propio (p. ej.
 * el alcohol, que aparece como una frase suelta dentro de "Advertencias").
 * @param {boolean} contextoPrevio - arrastra la frase anterior cuando parece
 *   una etiqueta corta ("Adultos: Dosis de medio comprimido…"), para no
 *   empezar la dosis por la mitad.
 */
function extraerFrases(texto, patrones, maximo, contextoPrevio) {
  if (!texto) return "";

  // Se corta por final de frase manteniendo el separador. Ojo: NO se corta
  // por ":" porque aparece dentro de paréntesis y partía frases completas.
  const oraciones = texto
    .split(/(?<=[.;!?])\s+/)
    .map((oracion) => oracion.trim())
    .filter(Boolean);

  const elegidas = [];

  oraciones.forEach((oracion, i) => {
    if (elegidas.length >= maximo) return;
    if (!coincide(oracion, patrones)) return;

    if (contextoPrevio && elegidas.length === 0 && i > 0 && oraciones[i - 1].length <= 90) {
      elegidas.push(oraciones[i - 1]);
    }
    elegidas.push(oracion);
  });

  return limpiarTexto(elegidas.join(" "));
}

/**
 * Convierte el HTML de una sección en bloques planos { titulo, texto }.
 * Los párrafos que van entero en negrita/subrayado se toman como subtítulos y
 * su contenido se acumula en `texto`.
 * CIMA alterna <p><strong>…</strong></p> y <ul><li><strong>…</strong></li></ul>
 * para los mismos subtítulos, así que hay que cubrir ambos casos.
 */
function extraerBloques(html) {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  const bloques = [];

  doc.body.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, div").forEach((el) => {
    if (el.querySelector("p, li, h1, h2, h3, h4, h5, h6, div")) return; // no es bloque hoja

    const texto = limpiarTexto(el.textContent);
    if (!texto) return;

    if (esTituloBloque(el, texto)) {
      bloques.push({ titulo: texto, texto: "" });
      return;
    }

    const ultimo = bloques[bloques.length - 1];
    if (ultimo && ultimo.titulo) {
      ultimo.texto = ultimo.texto ? `${ultimo.texto} ${texto}` : texto;
    } else {
      bloques.push({ titulo: null, texto });
    }
  });

  return bloques;
}

/** Decide si un bloque es un subtítulo (todo su contenido va destacado). */
function esTituloBloque(el, texto) {
  if (/^H[1-6]$/.test(el.tagName)) return true;
  if (texto.length > 120) return false;

  const destacados = el.querySelectorAll(
    'strong, b, u, [style*="font-weight:bold"], [style*="font-weight: bold"], [style*="font-weight:700"]'
  );
  if (destacados.length === 0) return false;

  const textoDestacado = limpiarTexto(
    Array.from(destacados).map((nodo) => nodo.textContent).join(" ")
  );

  return textoDestacado.length > 0 && textoDestacado === texto;
}

/** Añade dos puntos a un subtítulo si no termina ya en signo de puntuación. */
function formatearTitulo(titulo) {
  const limpio = limpiarTexto(titulo);
  return /[.:;]$/.test(limpio) ? limpio : `${limpio}:`;
}

/** Normaliza espacios (incluido el espacio duro) y recorta los extremos. */
function limpiarTexto(texto) {
  return (texto || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

/** ¿El texto encaja con alguno de los patrones indicados? */
function coincide(texto, patrones) {
  if (!texto || !patrones || patrones.length === 0) return false;
  return patrones.some((patron) => patron.test(texto));
}

/** Recorta a `maximo` caracteres intentando no partir una frase. */
function recortar(texto, maximo) {
  if (!texto || texto.length <= maximo) return texto;

  const corte = texto.slice(0, maximo);
  const ultimoPunto = Math.max(
    corte.lastIndexOf(". "),
    corte.lastIndexOf("; "),
    corte.lastIndexOf(": ")
  );

  const recorte = ultimoPunto > maximo * 0.4 ? corte.slice(0, ultimoPunto + 1) : corte;
  return `${recorte.trim()} […]`;
}

// --- TODO Fase 2 ---
// - Botón "copiar para IA": recopilar el texto de las secciones abiertas
//   (o de todas) y copiarlo al portapapeles en formato limpio (markdown).
// - "Mi botiquín": guardar/leer medicamentos favoritos en localStorage.
// - Historial de búsquedas recientes en localStorage.
