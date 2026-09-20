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
const detailSection = document.getElementById("detail-section");
const detailName = document.getElementById("detail-name");
const detailLab = document.getElementById("detail-lab");
const sectionsAccordion = document.getElementById("sections-accordion");
const docTabs = document.querySelectorAll(".doc-tab");

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
      // TODO: mostrar mensaje de error amigable en la UI
    }
  }, 300);
});

function renderSuggestions(medicamentos) {
  suggestionsList.innerHTML = "";

  if (medicamentos.length === 0) {
    suggestionsList.hidden = true;
    return;
  }

  // TODO: limitar a ~8 sugerencias y añadir laboratorio como texto secundario
  medicamentos.slice(0, 8).forEach((med) => {
    const li = document.createElement("li");
    li.textContent = med.nombre;
    li.addEventListener("click", () => {
      suggestionsList.hidden = true;
      searchInput.value = med.nombre;
      selectMedicamento(med);
    });
    suggestionsList.appendChild(li);
  });

  suggestionsList.hidden = false;
}

// TODO: al pulsar Enter en el input, hacer la búsqueda completa y
// renderizar resultsList (lista completa, no solo el dropdown de sugerencias)

// --- Selección de medicamento y carga de detalle ---

async function selectMedicamento(medicamento) {
  currentNRegistro = medicamento.nregistro;
  detailName.textContent = medicamento.nombre;
  detailLab.textContent = medicamento.labtitular || "";
  detailSection.hidden = false;

  // TODO Fase 2: llamar a comprobarProblemaSuministro() con el CN
  // y mostrar #supply-issue-badge si corresponde.

  await cargarSecciones(currentTipoDoc);

  // TODO: extraer y renderizar #quick-summary a partir de las secciones
  // de posología, contraindicaciones y advertencias.
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
  sectionsAccordion.innerHTML = "<p>Cargando...</p>";

  try {
    const secciones = await listarSecciones(tipoDoc, currentNRegistro);
    renderAccordion(secciones);
  } catch (err) {
    console.error(err);
    sectionsAccordion.innerHTML = "<p>No se ha podido cargar el documento.</p>";
  }
}

function renderAccordion(secciones) {
  sectionsAccordion.innerHTML = "";

  // NOTA: la forma exacta del array `secciones` que devuelve CIMA
  // (nombres de campos para id/título) hay que confirmarla contra la
  // respuesta real de la API antes de dar esto por cerrado.
  secciones.forEach((seccion) => {
    const item = document.createElement("div");
    item.className = "accordion-item";

    const header = document.createElement("div");
    header.className = "accordion-header";
    header.textContent = seccion.titulo || seccion.seccion;

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
        body.innerHTML = "Cargando...";
        const html = await obtenerContenidoSeccion(
          currentTipoDoc,
          currentNRegistro,
          seccion.seccion || seccion.id
        );
        // TODO: sanitizar `html` antes de asignarlo si se añaden más
        // fuentes de datos en el futuro (ver nota en api.js)
        body.innerHTML = html;
        body.dataset.loaded = "true";
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
