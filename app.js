/**
 * app.js
 * Lógica de interfaz: búsqueda con autocompletado, render de resultados,
 * carga del detalle (prospecto/ficha técnica) y acordeón de secciones.
 *
 * Depende de las funciones definidas en api.js.
 */

const searchInput = document.getElementById("search-input");
const suggestionsList = document.getElementById("search-suggestions");
const resultsList = document.getElementById("results-list");
const resultsStatus = document.getElementById("results-status");
const detailSection = document.getElementById("detail-section");
const detailName = document.getElementById("detail-name");
const detailLab = document.getElementById("detail-lab");
const sectionsAccordion = document.getElementById("sections-accordion");
const docTabs = document.querySelectorAll(".doc-tab");

// Máximo de sugerencias en el desplegable y de resultados pintados de una vez.
// (La API de CIMA ignora `pagina`/`tamanioPagina` en /medicamentos y devuelve
// hasta 200 filas de golpe, así que el recorte se hace aquí.)
const MAX_SUGERENCIAS = 8;
const MAX_RESULTADOS = 60;

let currentNRegistro = null;
let currentTipoDoc = 2; // 2 = prospecto por defecto, 1 = ficha técnica
let debounceTimer = null;

// --- Búsqueda con autocompletado ---

searchInput.addEventListener("input", (e) => {
  const term = e.target.value.trim();
  clearTimeout(debounceTimer);

  if (term.length < 3) {
    suggestionsList.hidden = true;
    return;
  }

  // Debounce simple para no saturar la API mientras el usuario escribe
  debounceTimer = setTimeout(async () => {
    try {
      const data = await buscarMedicamentos({ nombre: term });
      renderSuggestions(data.resultados || []);
    } catch (err) {
      console.error(err);
      suggestionsList.hidden = true;
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
    suggestionsList.hidden = true;
    return;
  }

  // Se limita a MAX_SUGERENCIAS y se añade el laboratorio como texto secundario
  medicamentos.slice(0, MAX_SUGERENCIAS).forEach((med) => {
    const li = document.createElement("li");

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

    li.addEventListener("click", () => {
      suggestionsList.hidden = true;
      searchInput.value = med.nombre;
      selectMedicamento(med);
    });

    suggestionsList.appendChild(li);
  });

  suggestionsList.hidden = false;
}

// Al pulsar Enter se lanza la búsqueda completa y se pinta #results-list
// (el desplegable de sugerencias es solo un atajo de autocompletado).
searchInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  clearTimeout(debounceTimer);
  buscarYRenderizarResultados(searchInput.value.trim());
});

/**
 * Busca medicamentos y pinta la lista completa de resultados.
 * @param {string} term - texto introducido por el usuario
 */
async function buscarYRenderizarResultados(term) {
  suggestionsList.hidden = true;

  if (term.length < 3) {
    resultsList.innerHTML = "";
    mostrarEstadoResultados("Escribe al menos 3 letras para empezar a buscar.", true);
    return;
  }

  resultsList.innerHTML = "";
  mostrarEstadoResultados(`Buscando «${term}»…`);

  try {
    const data = await buscarMedicamentos({ nombre: term });
    renderResultados(data.resultados || [], term, data.totalFilas);
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
 */
function renderResultados(medicamentos, term, totalFilas) {
  resultsList.innerHTML = "";

  if (medicamentos.length === 0) {
    mostrarEstadoResultados(
      `Sin resultados para «${term}». Prueba con el principio activo (por ejemplo, «paracetamol»).`
    );
    return;
  }

  const visibles = medicamentos.slice(0, MAX_RESULTADOS);
  visibles.forEach((med) => resultsList.appendChild(crearItemResultado(med)));

  const total = Number.isFinite(totalFilas) ? totalFilas : medicamentos.length;
  let estado = `${total} resultado${total === 1 ? "" : "s"} para «${term}»`;
  if (visibles.length < total) {
    estado += ` — mostrando los primeros ${visibles.length}`;
  }
  mostrarEstadoResultados(estado);
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

/** Mensaje de estado bajo el buscador (resultados encontrados o error). */
function mostrarEstadoResultados(mensaje, esError = false) {
  resultsStatus.textContent = mensaje || "";
  resultsStatus.classList.toggle("error", Boolean(esError));
  resultsStatus.hidden = !mensaje;
}

// --- Selección de medicamento y carga de detalle ---

async function selectMedicamento(medicamento) {
  currentNRegistro = medicamento.nregistro;
  detailName.textContent = medicamento.nombre;
  detailLab.textContent = medicamento.labtitular || "";
  detailSection.hidden = false;
  detailSection.scrollIntoView({ behavior: "smooth", block: "start" });

  // TODO Fase 2: llamar a comprobarProblemaSuministro() con el CN
  // y mostrar #supply-issue-badge si corresponde.
  // (Ojo: /medicamentos no devuelve `cn`; habría que pedirlo con
  // obtenerMedicamento({ nregistro }) para tener el Código Nacional.)

  await cargarSecciones(currentTipoDoc);
}

// --- Tabs Prospecto / Ficha técnica ---

docTabs.forEach((tab) => {
  tab.addEventListener("click", async () => {
    docTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentTipoDoc = Number(tab.dataset.docType);
    if (currentNRegistro) await cargarSecciones(currentTipoDoc);
  });
});

// --- Acordeón de secciones ---

async function cargarSecciones(tipoDoc) {
  const nregistro = currentNRegistro;
  sectionsAccordion.innerHTML = "<p>Cargando…</p>";

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
    header.textContent = seccion.titulo || `Sección ${idSeccion}`;

    const body = document.createElement("div");
    body.className = "accordion-body";
    body.dataset.loaded = "false";

    header.addEventListener("click", async () => {
      const isOpen = body.classList.contains("open");

      // Cerrar todas las demás secciones (comportamiento tipo acordeón)
      document.querySelectorAll(".accordion-body.open").forEach((b) => {
        if (b !== body) b.classList.remove("open");
      });

      if (isOpen) {
        body.classList.remove("open");
        return;
      }

      if (body.dataset.loaded === "false") {
        const tipoDoc = currentTipoDoc;
        const nregistro = currentNRegistro;
        body.innerHTML = "Cargando…";

        try {
          const html = await obtenerContenidoSeccion(tipoDoc, nregistro, idSeccion);
          if (tipoDoc !== currentTipoDoc || nregistro !== currentNRegistro) return;
          // TODO: sanitizar `html` antes de asignarlo si se añaden más
          // fuentes de datos en el futuro (ver nota en api.js)
          body.innerHTML = html || "<p>Esta sección no tiene contenido.</p>";
          body.dataset.loaded = "true";
        } catch (err) {
          console.error(err);
          body.innerHTML = "<p>No se ha podido cargar esta sección.</p>";
          body.dataset.loaded = "false";
          body.classList.add("open");
          return;
        }
      }

      body.classList.add("open");
    });

    item.appendChild(header);
    item.appendChild(body);
    sectionsAccordion.appendChild(item);
  });
}

// --- TODO Fase 2 ---
// - Botón "copiar para IA": recopilar el texto de las secciones abiertas
//   (o de todas) y copiarlo al portapapeles en formato limpio (markdown).
// - "Mi botiquín": guardar/leer medicamentos favoritos en localStorage.
// - Historial de búsquedas recientes en localStorage.
