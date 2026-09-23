/**
 * Test de humo del buscador (composer tipo ChatGPT/DeepSeek) de ProspectoYa.
 * Carga index.html + tema.js + pwa.js + api.js + app.js reales en jsdom, con
 * fetch simulado. Sólo lee los ficheros del proyecto: no escribe nada en el repo.
 *
 *   cd tests && node test-busqueda.js
 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

/** Raíz del proyecto (una carpeta por encima de tests/). */
const RAIZ = path.resolve(__dirname, "..");
const api = fs.readFileSync(path.join(RAIZ, "api.js"), "utf8");
const app = fs.readFileSync(path.join(RAIZ, "app.js"), "utf8");
const tema = fs.readFileSync(path.join(RAIZ, "tema.js"), "utf8");
const pwa = fs.readFileSync(path.join(RAIZ, "pwa.js"), "utf8");
const arriba = fs.readFileSync(path.join(RAIZ, "arriba.js"), "utf8");

// Los <script src> se sustituyen por su código en línea: jsdom no carga
// ficheros externos, y así se ejecuta exactamente lo que carga la página.
let html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
for (const [fichero, codigo] of [["tema.js", tema], ["arriba.js", arriba], ["api.js", api], ["app.js", app], ["pwa.js", pwa]]) {
  html = html.replace(`<script src="${fichero}"></script>`, `<script>${codigo}</script>`);
}

// Respuestas simuladas de la API de CIMA
const MEDICAMENTOS = [
  { nregistro: "77758", nombre: "PARACETAMOL CINFA 1 g COMPRIMIDOS", labtitular: "CINFA", receta: false, generico: true, comerc: true },
  {
    nregistro: "70001",
    nombre: "PARACETAMOL KERN PHARMA 500 mg",
    labtitular: "KERN PHARMA",
    receta: false,
    generico: true,
    comerc: true,
    // psum, triangulo, docs y nosustituible: campos reales de /medicamentos y
    // /presentaciones que ya trae el propio medicamento (verificado contra la
    // API real, 22/09/2026); no hace falta pedirlos aparte.
    psum: true,
    triangulo: true,
    nosustituible: { id: 2, nombre: "Medicamentos con principios activos de estrecho margen terapéutico" },
    docs: [
      { tipo: 1, url: "https://cima.aemps.es/cima/pdfs/ft/70001/FT_70001.pdf", urlHtml: "https://cima.aemps.es/cima/dochtml/ft/70001/FT_70001.html", secc: true },
      { tipo: 2, url: "https://cima.aemps.es/cima/pdfs/p/70001/P_70001.pdf", urlHtml: "https://cima.aemps.es/cima/dochtml/p/70001/P_70001.html", secc: true },
    ],
  },
];

// Presentaciones simuladas: /medicamentos NO trae el CN, /presentaciones sí
// (y, para el 70001, tampoco trae dcp.id: el vmp para buscar equivalentes)
const PRESENTACIONES = [
  { nregistro: "77758", cn: "662025", nombre: "PARACETAMOL CINFA 1 g COMPRIMIDOS EFG , 20 comprimidos", labtitular: "CINFA", receta: false, generico: true, comerc: true },
  { nregistro: "77758", cn: "662026", nombre: "PARACETAMOL CINFA 1 g COMPRIMIDOS EFG , 40 comprimidos", labtitular: "CINFA", receta: false, generico: true, comerc: true },
  { nregistro: "70001", cn: "700123", nombre: "PARACETAMOL KERN PHARMA 500 mg , 20 comprimidos", labtitular: "KERN PHARMA", receta: false, generico: true, comerc: true, dcp: { id: "V-PARA-500" } },
  { nregistro: "123456", cn: "999888", nombre: "MEDICAMENTO ANTIGUO 100 mg , 30 comprimidos", labtitular: "LAB", comerc: true },
  { nregistro: "BE900001IP", cn: "768768", nombre: "CRESTOR IMPORTACION 10 mg , 28 comprimidos", labtitular: "GRUNENTHAL", comerc: true },
  { nregistro: "99001", cn: "990011", nombre: "IBUPROFENO PRUEBA 400 mg , 20 comprimidos", labtitular: "LABORATORIO PRUEBA", comerc: true },
];

// Medicamento de importación paralela (documentación reducida): comprobado
// contra la API real con CN 768768 (Crestor 10 mg, nregistro BE250187IP).
// docs[] solo trae el PDF sin segmentar (sin urlHtml, sin ficha técnica), y
// /docSegmentado/secciones no devuelve [] para él, sino {error: "..."} (ver
// el mock de más abajo y listarSecciones() en api.js).
const IMPORTACION_PARALELA = {
  nregistro: "BE900001IP",
  nombre: "CRESTOR IMPORTACION 10 mg",
  labtitular: "GRUNENTHAL",
  comerc: true,
  docs: [
    { tipo: 2, url: "https://cima.aemps.es/cima/pdfs/p/BE900001IP/P_BE900001IP.pdf", secc: false },
  ],
};

// Equivalentes simulados de /medicamentos?vmp=V-PARA-500: el propio 70001
// (hay que filtrarlo) más otros dos con el mismo principio activo, dosis y forma.
const EQUIVALENTES = [
  MEDICAMENTOS[1],
  { nregistro: "70002", nombre: "PARACETAMOL OTROLAB 500 mg", labtitular: "OTROLAB" },
  { nregistro: "70003", nombre: "PARACETAMOL TERCEROLAB 500 mg", labtitular: "TERCEROLAB" },
];

// Medicamento "antiguo" con nº de registro de 6 dígitos: sólo aparece al
// consultar por código (no está en la lista de resultados por nombre)
const POR_NREGISTRO = { nregistro: "123456", nombre: "MEDICAMENTO ANTIGUO 100 mg", labtitular: "LAB", comerc: true };

// Nº de registro propio para las pruebas de "mi botiquín": cachePresentaciones
// guarda el CN por nregistro, así que si estas pruebas reutilizaran el 77758 o
// el 70001, precalentarían su caché antes de tiempo y falsearían las pruebas
// de la sección 7 (que comprueban que el CN se pide la primera vez que un
// resultado entra en pantalla).
const PARA_BOTIQUIN = { nregistro: "99001", nombre: "IBUPROFENO PRUEBA 400 mg", labtitular: "LABORATORIO PRUEBA", comerc: true };

// URLs de las peticiones simuladas, para comprobar qué se consulta y cuándo
const peticiones = [];

const erroresJsdom = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => erroresJsdom.push(e.message));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://prospectoya.test/",
  virtualConsole: vc,
  beforeParse(window) {
    // jsdom no implementa matchMedia, scrollIntoView ni IntersectionObserver
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    window.Element.prototype.scrollIntoView = function () {};
    // Observador simulado: al observar un elemento se considera visible al momento
    window.IntersectionObserver = class {
      constructor(callback) {
        this.callback = callback;
      }
      observe(el) {
        this.callback([{ target: el, isIntersecting: true }], this);
      }
      unobserve() {}
      disconnect() {}
    };
    // jsdom tampoco implementa <dialog>: se simula abrir/cerrar lo justo para
    // poder comprobar el estado. El centrado, el velo y el fondo inerte de
    // verdad se miden en Chrome (test-resoluciones.js).
    window.HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    window.HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
      this.dispatchEvent(new window.Event("close"));
    };
    window.fetch = async (url) => {
      const u = String(url);
      peticiones.push(u);
      const params = new URLSearchParams(u.split("?")[1] || "");
      let data = {};

      if (u.includes("/presentaciones?")) {
        const cn = params.get("cn");
        const nregistro = params.get("nregistro");
        const filas = cn
          ? PRESENTACIONES.filter((p) => p.cn === cn)
          : PRESENTACIONES.filter((p) => p.nregistro === nregistro);
        data = { totalFilas: filas.length, pagina: 1, tamanioPagina: 200, resultados: filas };
      } else if (u.includes("/medicamentos?vmp=")) {
        const filas = params.get("vmp") === "V-PARA-500" ? EQUIVALENTES : [];
        data = { totalFilas: filas.length, pagina: 1, tamanioPagina: 200, resultados: filas };
      } else if (u.includes("/medicamentos?")) {
        const nregistro = params.get("nregistro");
        let filas = nregistro
          ? MEDICAMENTOS.concat(POR_NREGISTRO, PARA_BOTIQUIN).filter((m) => m.nregistro === nregistro)
          : MEDICAMENTOS;
        // Filtros combinables: se simulan igual que la API real los combina
        // (AND), sobre lo que ya haya devuelto la búsqueda por nombre/nregistro.
        const laboratorio = params.get("laboratorio");
        if (laboratorio) {
          filas = filas.filter((m) => (m.labtitular || "").toLowerCase().includes(laboratorio.toLowerCase()));
        }
        const receta = params.get("receta");
        if (receta !== null) filas = filas.filter((m) => Boolean(m.receta) === (receta === "1"));
        const comerc = params.get("comerc");
        if (comerc !== null) filas = filas.filter((m) => Boolean(m.comerc) === (comerc === "1"));
        data = { totalFilas: filas.length, pagina: 1, tamanioPagina: 200, resultados: filas };
      } else if (u.includes("/docSegmentado/secciones/")) {
        // La API real no devuelve [] para un documento sin segmentar, sino
        // un objeto {error: "..."} con HTTP 200 (ver listarSecciones() en
        // api.js): se simula igual para BE900001IP, la importación paralela.
        data = params.get("nregistro") === "BE900001IP"
          ? { error: "No existen secciones para el medicamento indicado" }
          : [];
      } else if (u.includes("/docSegmentado/contenido/")) {
        data = [{ seccion: "1", titulo: "Sección", contenido: "<p>Texto</p>", orden: 1 }];
      }

      return {
        ok: true,
        status: 200,
        json: async () => data,
        text: async () => JSON.stringify(data),
      };
    };
  },
});

const { window } = dom;
const { document } = window;

let fallos = 0;
function comprobar(descripcion, condicion, extra = "") {
  if (!condicion) fallos++;
  console.log(`${condicion ? "OK   " : "FALLA"} ${descripcion}${extra ? "  (" + extra + ")" : ""}`);
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const input = document.getElementById("search-input");
const lista = document.getElementById("search-suggestions");
const boton = document.getElementById("search-submit");
const detalle = document.getElementById("detail-section");

const pulsar = (key) =>
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
const escribir = (valor) => {
  input.value = valor;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
};

(async () => {
  // --- 1. Estado inicial -------------------------------------------------
  comprobar("el botón de envío arranca desactivado (input vacío)", boton.disabled === true);
  comprobar("el desplegable arranca cerrado", lista.hidden === true);
  comprobar("el <ul> declara role=listbox", lista.getAttribute("role") === "listbox");
  comprobar("el input declara role=combobox", input.getAttribute("role") === "combobox");

  // --- 2. Autocompletado al escribir ------------------------------------
  escribir("parac");
  comprobar("el botón de envío se activa al escribir", boton.disabled === false);
  await esperar(500);

  const opciones = lista.querySelectorAll("li");
  comprobar("se pintan 2 sugerencias", opciones.length === 2, `li=${opciones.length}`);
  comprobar("el desplegable queda abierto", lista.hidden === false);
  comprobar("aria-expanded=true en el input", input.getAttribute("aria-expanded") === "true");
  comprobar(
    "cada opción es role=option con id sugerencia-N",
    opciones.length === 2 &&
      opciones[0].getAttribute("role") === "option" &&
      opciones[0].id === "sugerencia-0" &&
      opciones[1].id === "sugerencia-1"
  );

  // --- 2b. Un clic de ratón en una sugerencia tiene que poder elegirla ---
  // Las opciones no son focusables: un mousedown de verdad sobre una de ellas
  // le quita el foco a #search-input ANTES del click (mousedown → blur/
  // focusout → mouseup → click), y el focusout de arriba cierra el
  // desplegable — con la opción ya oculta, el click nunca llega a elegirla.
  // jsdom no reproduce ese blur automático de un navegador real (por eso
  // este fallo se coló hasta que se probó con un clic de verdad, vía CDP), así
  // que aquí se comprueba directamente el mecanismo del arreglo: el mousedown
  // sobre el desplegable llega con su acción por defecto cancelada.
  const eventoMousedown = new window.MouseEvent("mousedown", { bubbles: true, cancelable: true });
  opciones[0].dispatchEvent(eventoMousedown);
  comprobar(
    "un mousedown en el desplegable no le quita el foco al input (si no, un clic de verdad no elegiría nada)",
    eventoMousedown.defaultPrevented === true
  );

  // --- 3. Navegación con ↑ / ↓ ------------------------------------------
  pulsar("ArrowDown");
  comprobar("↓ marca la primera sugerencia", opciones[0].classList.contains("is-active"));
  comprobar("aria-selected=true en la marcada", opciones[0].getAttribute("aria-selected") === "true");
  comprobar(
    "aria-activedescendant apunta a la marcada",
    input.getAttribute("aria-activedescendant") === "sugerencia-0"
  );

  pulsar("ArrowDown");
  comprobar(
    "otro ↓ baja a la segunda",
    opciones[1].classList.contains("is-active") && !opciones[0].classList.contains("is-active")
  );

  pulsar("ArrowUp");
  comprobar("↑ vuelve a la primera", opciones[0].classList.contains("is-active"));

  pulsar("ArrowUp");
  comprobar("↑ en la primera da la vuelta a la última", opciones[1].classList.contains("is-active"));

  // --- 4. Enter abre la sugerencia marcada ------------------------------
  pulsar("Enter");
  await esperar(80);
  comprobar("Enter elige la sugerencia marcada", input.value === MEDICAMENTOS[1].nombre, input.value);
  comprobar("el desplegable se cierra al elegir", lista.hidden === true);
  comprobar("aria-activedescendant se limpia", input.hasAttribute("aria-activedescendant") === false);
  comprobar("se abre la ventana del detalle", detalle.open === true);
  comprobar(
    "el detalle lleva el nombre de la sugerencia",
    document.getElementById("detail-name").textContent === MEDICAMENTOS[1].nombre
  );
  // showModal() enfocaría por su cuenta la ✕ (el primer elemento enfocable de
  // dentro), y con :focus-visible eso se veía como un anillo encendido nada
  // más abrirse. abrirDetalle() enfoca el propio <dialog> para evitarlo.
  comprobar(
    "el foco va al <dialog>, no a la ✕ (evita el anillo de foco al abrir)",
    document.activeElement === detalle,
    document.activeElement ? document.activeElement.id || document.activeElement.tagName : "(ninguno)"
  );
  // psum, triangulo y docs ya vienen en el propio medicamento (MEDICAMENTOS[1]
  // los lleva puestos): selectMedicamento() no pide nada aparte para pintarlos.
  comprobar("el badge de problema de suministro sale (psum=true)", document.getElementById("supply-issue-badge").hidden === false);
  comprobar("el badge de seguimiento adicional sale (triangulo=true)", document.getElementById("monitoring-badge").hidden === false);
  const enlaceOficial = document.getElementById("detail-doc-oficial");
  comprobar(
    "el enlace al documento oficial sale y apunta al prospecto (pestaña activa)",
    enlaceOficial.hidden === false && enlaceOficial.href === "https://cima.aemps.es/cima/dochtml/p/70001/P_70001.html",
    enlaceOficial.href
  );

  // Al cambiar de pestaña, el enlace tiene que seguir a la pestaña activa
  document.querySelector('.doc-tab[data-doc-type="1"]').click();
  await esperar(50);
  comprobar(
    "al cambiar a Ficha técnica, el enlace pasa a apuntar a la ficha técnica",
    enlaceOficial.href === "https://cima.aemps.es/cima/dochtml/ft/70001/FT_70001.html",
    enlaceOficial.href
  );
  document.querySelector('.doc-tab[data-doc-type="2"]').click();
  await esperar(50);

  // --- 4c. Medicamentos equivalentes (mismo vmp) -------------------------
  // dcp.id ("V-PARA-500") sale de /presentaciones, la misma petición que ya
  // se pidió para el CN: no debe repetirse por pedir también el vmp.
  comprobar(
    "el vmp se saca de la misma petición que el CN (sin repetirla)",
    peticiones.filter((u) => u.includes("/presentaciones?nregistro=70001")).length === 1,
    peticiones.filter((u) => u.includes("nregistro=70001")).join(" | ")
  );
  const equivalentesSeccion = document.getElementById("equivalentes");
  comprobar("la sección de equivalentes sale", equivalentesSeccion.hidden === false);
  comprobar(
    "avisa de que es de margen terapéutico estrecho (nosustituible)",
    document.getElementById("equivalentes-nota").textContent.includes("estrecho margen terapéutico"),
    document.getElementById("equivalentes-nota").textContent
  );
  const itemsEquivalentes = document.querySelectorAll(".equivalentes-item");
  comprobar(
    "se listan los otros dos (el propio medicamento se filtra)",
    itemsEquivalentes.length === 2,
    itemsEquivalentes.length
  );
  comprobar(
    "no incluye al propio medicamento entre los equivalentes",
    ![...itemsEquivalentes].some((li) => li.textContent.includes("PARACETAMOL KERN PHARMA"))
  );

  // Elegir un equivalente reutiliza selectMedicamento(): cambia la ficha abierta
  itemsEquivalentes[0].click();
  await esperar(50);
  comprobar(
    "elegir un equivalente abre su ficha en la misma ventana",
    document.getElementById("detail-name").textContent === "PARACETAMOL OTROLAB 500 mg",
    document.getElementById("detail-name").textContent
  );
  comprobar("la ventana sigue abierta (no se cierra al cambiar de medicamento)", detalle.open === true);

  // --- 4b. La ventana del detalle se cierra -----------------------------
  const botonCerrar = document.getElementById("detail-close");
  comprobar(
    "la ventana trae botón de cerrar con etiqueta",
    botonCerrar !== null && botonCerrar.getAttribute("aria-label") === "Cerrar el detalle"
  );
  botonCerrar.click();
  comprobar("la ✕ cierra la ventana", detalle.open === false);
  comprobar(
    // El último medicamento abierto es el equivalente elegido más arriba,
    // no MEDICAMENTOS[1]: cerrar no debe borrar el contenido de la ficha.
    "cerrar no borra lo que había dentro",
    document.getElementById("detail-name").textContent === "PARACETAMOL OTROLAB 500 mg"
  );

  detalle.showModal();
  comprobar("se puede volver a abrir", detalle.open === true);
  // En un navegador de verdad, un clic en el velo llega con el propio <dialog>
  // como destino (el velo no es un elemento); eso es lo que se simula aquí.
  detalle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  comprobar("un clic en el fondo oscurecido la cierra", detalle.open === false);

  // --- 4d. Documentación reducida (importación paralela): sin secciones,
  // pero con enlace al PDF ------------------------------------------------
  // listarSecciones() (api.js) tiene que normalizar el {error:...} a un
  // array vacío: sin eso, renderAccordion() se queda igual (tiene su propio
  // Array.isArray de sobra), pero cargarDocumentoParaResumen() sí rompería
  // (llama a .filter() directamente sobre lo que devuelva la API).
  const seccionesSinSegmentar = await window.listarSecciones(2, "BE900001IP");
  comprobar(
    "listarSecciones normaliza el {error:...} de la API a un array vacío",
    Array.isArray(seccionesSinSegmentar) && seccionesSinSegmentar.length === 0,
    JSON.stringify(seccionesSinSegmentar)
  );

  await window.selectMedicamento(IMPORTACION_PARALELA);
  await esperar(100);
  comprobar(
    "sin secciones (la API responde con {error:...}) el acordeón no rompe y avisa",
    document.getElementById("sections-accordion").textContent.includes("No hay secciones disponibles"),
    document.getElementById("sections-accordion").textContent
  );
  comprobar(
    "sin urlHtml, el enlace al documento oficial usa el PDF (url) en su lugar",
    enlaceOficial.hidden === false && enlaceOficial.href === IMPORTACION_PARALELA.docs[0].url,
    enlaceOficial.href
  );
  detalle.close();

  // --- 4e. Mi botiquín (guardar/quitar medicamentos en localStorage) -----
  // Usa nregistros propios (PARA_BOTIQUIN, IMPORTACION_PARALELA), no el 77758
  // ni el 70001: cachePresentaciones guarda el CN por nregistro, así que abrir
  // aquí un medicamento que la sección 7 comprueba más abajo precalentaría su
  // caché antes de tiempo y falsearía esa prueba (le pasó a esta misma suite:
  // "se pide el CN de cada resultado visible" fallaba si estas pruebas
  // reutilizaban el 77758).
  window.localStorage.removeItem("prospectoya-botiquin"); // estado limpio, por si acaso
  await window.selectMedicamento(PARA_BOTIQUIN);
  await esperar(100);

  const botiquinEstrella = document.getElementById("botiquin-toggle");
  const botiquinSeccion = document.getElementById("botiquin-section");
  const botiquinBoton = document.getElementById("botiquin-boton");
  const botiquinListaEl = document.getElementById("botiquin-lista");
  comprobar("el botón del botiquín arranca sin marcar (medicamento no guardado)", botiquinEstrella.getAttribute("aria-pressed") === "false");
  comprobar("la sección de botiquín arranca oculta (nada guardado)", botiquinSeccion.hidden === true);

  botiquinEstrella.click();
  comprobar("al pulsar la estrella, aria-pressed pasa a true", botiquinEstrella.getAttribute("aria-pressed") === "true");
  comprobar(
    "se guarda en localStorage (nregistro, nombre y laboratorio, nada más)",
    JSON.parse(window.localStorage.getItem("prospectoya-botiquin")).length === 1,
    window.localStorage.getItem("prospectoya-botiquin")
  );
  comprobar("la sección de botiquín ya no está oculta", botiquinSeccion.hidden === false);
  // Desplegable, como "Filtros": no ocupa sitio hasta que se abre a propósito,
  // ni siquiera la primera vez que se guarda algo (decidido el 23/09/2026).
  comprobar("pero la lista arranca plegada (no ocupa sitio sola)", botiquinListaEl.hidden === true);
  comprobar("el botón lleva el número de guardados", botiquinBoton.textContent.includes("(1)"), botiquinBoton.textContent);

  botiquinBoton.click();
  comprobar("pulsar el botón despliega la lista", botiquinListaEl.hidden === false && botiquinBoton.getAttribute("aria-expanded") === "true");
  const chipsBotiquin = document.querySelectorAll(".botiquin-item");
  comprobar(
    "sale un chip con el nombre del medicamento",
    chipsBotiquin.length === 1 && chipsBotiquin[0].textContent.includes(PARA_BOTIQUIN.nombre),
    chipsBotiquin.length
  );

  // Abrir otro medicamento: la estrella no debe arrastrar el estado del anterior
  await window.selectMedicamento(IMPORTACION_PARALELA);
  await esperar(100);
  comprobar("con otro medicamento abierto, la estrella vuelve a estar sin marcar", botiquinEstrella.getAttribute("aria-pressed") === "false");

  // Reabrir el guardado: la estrella lo refleja
  await window.selectMedicamento(PARA_BOTIQUIN);
  await esperar(100);
  comprobar("al reabrir el medicamento guardado, la estrella vuelve a marcarse", botiquinEstrella.getAttribute("aria-pressed") === "true");

  // Clic en el chip del botiquín: pide datos frescos (nunca usa lo guardado
  // tal cual, que solo lleva nombre y laboratorio, ver AGENTS.md/api.js)
  peticiones.length = 0;
  document.querySelector(".botiquin-item-abrir").click();
  await esperar(100);
  comprobar(
    "el chip del botiquín vuelve a pedir el medicamento a la API (datos frescos)",
    peticiones.some((u) => u.includes(`/medicamentos?nregistro=${PARA_BOTIQUIN.nregistro}`)),
    peticiones.join(" | ")
  );
  comprobar(
    "y abre su ficha",
    document.getElementById("detail-name").textContent === PARA_BOTIQUIN.nombre,
    document.getElementById("detail-name").textContent
  );
  comprobar("la lista se queda desplegada (no se cierra sola al elegir un chip)", botiquinListaEl.hidden === false);

  // Quitar desde el propio chip (sin pasar por la estrella)
  document.querySelector(".botiquin-item-quitar").click();
  comprobar("quitar desde el chip vacía la sección", botiquinSeccion.hidden === true);
  comprobar("y la pliega (para la próxima vez que se guarde algo)", botiquinListaEl.hidden === true && botiquinBoton.getAttribute("aria-expanded") === "false");
  comprobar(
    "y localStorage queda vacío",
    JSON.parse(window.localStorage.getItem("prospectoya-botiquin")).length === 0,
    window.localStorage.getItem("prospectoya-botiquin")
  );
  comprobar(
    "la estrella del medicamento que sigue abierto también se actualiza",
    botiquinEstrella.getAttribute("aria-pressed") === "false"
  );

  // Un valor corrupto en localStorage (modo privado, cuota, u otra app tocando
  // la clave) no debe romper la lectura: se trata como botiquín vacío.
  window.localStorage.setItem("prospectoya-botiquin", "esto no es JSON válido");
  let botiquinCorrupto;
  let leerBotiquinLanzoError = false;
  try {
    botiquinCorrupto = window.leerBotiquin();
  } catch (err) {
    leerBotiquinLanzoError = true;
  }
  comprobar(
    "un valor corrupto en localStorage no rompe leerBotiquin() (se trata como vacío)",
    !leerBotiquinLanzoError && Array.isArray(botiquinCorrupto) && botiquinCorrupto.length === 0,
    leerBotiquinLanzoError ? "lanzó una excepción" : JSON.stringify(botiquinCorrupto)
  );
  window.localStorage.removeItem("prospectoya-botiquin");

  detalle.close();

  // --- 5. Escape y clic fuera -------------------------------------------
  escribir("ibupro");
  await esperar(500);
  comprobar("el desplegable se reabre al escribir", lista.hidden === false);

  pulsar("Escape");
  comprobar("Escape cierra el desplegable", lista.hidden === true);

  escribir("omepra");
  await esperar(500);
  document.body.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
  comprobar("un clic fuera cierra el desplegable", lista.hidden === true);

  // --- 5b. Tabular fuera del campo también cierra el desplegable --------
  escribir("parac");
  input.focus();
  await esperar(500);
  comprobar("el desplegable se reabre para probar el tabulado", lista.hidden === false);

  boton.focus();
  comprobar("tabular al botón de enviar cierra el desplegable", lista.hidden === true);

  // --- 6. Texto demasiado corto -----------------------------------------
  escribir("pa");
  await esperar(400);
  comprobar("con menos de 3 letras no hay sugerencias", lista.hidden === true);

  // --- 7. Enter sin sugerencia marcada = búsqueda completa --------------
  escribir("parac");
  pulsar("Enter");
  await esperar(200);
  const resultados = document.querySelectorAll("#results-list li");
  comprobar("Enter lanza la búsqueda completa", resultados.length === 2, `resultados=${resultados.length}`);
  comprobar(
    "el estado de resultados se actualiza",
    document.getElementById("results-status").textContent.includes("resultado"),
    document.getElementById("results-status").textContent
  );
  // El CN de cada resultado se pide cuando entra en pantalla (observador simulado)
  comprobar(
    "se pide el CN de cada resultado visible",
    peticiones.some((u) => u.includes("/presentaciones?nregistro=77758")),
    peticiones.join(" | ")
  );
  comprobar(
    "el CN se pinta en el resultado",
    document.querySelector("#results-list li .result-cn").textContent.includes("CN 662025"),
    document.querySelector("#results-list li .result-cn").textContent
  );

  // --- 7b. Filtros combinables (receta, comercialización, laboratorio) ---
  const filtrosBoton = document.getElementById("filtros-boton");
  const filtrosPanel = document.getElementById("filtros-panel");
  comprobar("el panel de filtros arranca cerrado", filtrosPanel.hidden === true);
  filtrosBoton.click();
  comprobar("el botón de filtros lo abre", filtrosPanel.hidden === false && filtrosBoton.getAttribute("aria-expanded") === "true");

  peticiones.length = 0;
  const filtroLab = document.getElementById("filtro-laboratorio");
  filtroLab.value = "CINFA";
  filtroLab.dispatchEvent(new window.Event("input", { bubbles: true }));
  await esperar(400); // el filtro de laboratorio lleva su propio debounce (300ms)
  comprobar(
    "elegir un filtro repite la búsqueda con el término que ya había",
    peticiones.some((u) => u.includes("/medicamentos?") && u.includes("laboratorio=CINFA") && u.includes("nombre=parac")),
    peticiones.join(" | ")
  );
  comprobar(
    "el resultado se recorta al laboratorio elegido",
    document.querySelectorAll("#results-list li").length === 1,
    document.querySelectorAll("#results-list li").length
  );
  comprobar("el botón de filtros se resalta con algún filtro puesto", filtrosBoton.classList.contains("activo"));

  // Con el campo de búsqueda vacío, cambiar un filtro no dispara ninguna petición
  escribir("");
  peticiones.length = 0;
  const filtroReceta = document.getElementById("filtro-receta");
  filtroReceta.value = "1";
  filtroReceta.dispatchEvent(new window.Event("change", { bubbles: true }));
  await esperar(50);
  comprobar("sin nada escrito, cambiar un filtro no busca nada", peticiones.length === 0, peticiones.join(" | "));

  // "Limpiar filtros" vacía los tres campos y, si hay término, vuelve a buscar sin filtrar
  escribir("parac");
  document.getElementById("filtros-limpiar").click();
  await esperar(400);
  comprobar(
    "limpiar filtros deja los tres campos vacíos",
    filtroLab.value === "" && filtroReceta.value === "" && document.getElementById("filtro-comerc").value === ""
  );
  comprobar("limpiar filtros quita el resaltado del botón", filtrosBoton.classList.contains("activo") === false);
  comprobar(
    "y la lista vuelve a los dos resultados sin filtrar",
    document.querySelectorAll("#results-list li").length === 2,
    document.querySelectorAll("#results-list li").length
  );

  // Los filtros no afectan al desplegable de sugerencias, solo a la lista completa
  filtroLab.value = "CINFA";
  filtroLab.dispatchEvent(new window.Event("input", { bubbles: true }));
  await esperar(400);
  peticiones.length = 0;
  escribir("parac");
  await esperar(400);
  comprobar(
    "las sugerencias en vivo no llevan el filtro de laboratorio",
    peticiones.some((u) => u.includes("/medicamentos?nombre=parac") && !u.includes("laboratorio")),
    peticiones.join(" | ")
  );
  document.getElementById("filtros-limpiar").click();
  await esperar(50);

  // --- 8. Búsqueda por código nacional (CN) ------------------------------
  peticiones.length = 0;
  escribir("662025");
  pulsar("Enter");
  await esperar(150);

  const itemsCN = document.querySelectorAll("#results-list li");
  comprobar(
    "la búsqueda por CN usa /presentaciones?cn=",
    peticiones.some((u) => u.includes("/presentaciones?cn=662025")),
    peticiones.join(" | ")
  );
  comprobar("el CN exacto devuelve 1 resultado", itemsCN.length === 1, `li=${itemsCN.length}`);
  comprobar(
    "el resultado muestra el CN",
    itemsCN[0] && itemsCN[0].querySelector(".result-cn").textContent === "CN 662025",
    itemsCN[0] ? itemsCN[0].querySelector(".result-cn").textContent : "sin resultado"
  );
  comprobar(
    "no se pide el CN aparte (ya venía en la respuesta)",
    peticiones.filter((u) => u.includes("/presentaciones?nregistro=")).length === 0,
    peticiones.join(" | ")
  );
  comprobar(
    "el estado habla del código nacional",
    document.getElementById("results-status").textContent.includes("código nacional"),
    document.getElementById("results-status").textContent
  );

  // --- 9. Nº de registro que no es CN: respaldo automático --------------
  peticiones.length = 0;
  escribir("123456");
  pulsar("Enter");
  await esperar(200);
  comprobar(
    "primero prueba como CN y luego como nº de registro",
    peticiones.some((u) => u.includes("/presentaciones?cn=123456")) &&
      peticiones.some((u) => u.includes("/medicamentos?nregistro=123456")),
    peticiones.join(" | ")
  );
  comprobar(
    "muestra el medicamento encontrado por nº de registro",
    document.querySelectorAll("#results-list li").length === 1 &&
      document.getElementById("detail-name") !== null,
    `li=${document.querySelectorAll("#results-list li").length}`
  );
  comprobar(
    "su CN se resuelve en diferido",
    peticiones.some((u) => u.includes("/presentaciones?nregistro=123456")) &&
      document.querySelector("#results-list li .result-cn").textContent === "CN 999888",
    document.querySelector("#results-list li .result-cn").textContent
  );

  // --- 10. Código incompleto: aviso sin consultar -----------------------
  peticiones.length = 0;
  escribir("702");
  await esperar(60);
  pulsar("Enter");
  await esperar(80);
  comprobar("un código incompleto no consulta la API", peticiones.length === 0, peticiones.join(" | "));
  comprobar(
    "avisa de que el código no es válido",
    document.getElementById("results-status").textContent.includes("no es un código válido"),
    document.getElementById("results-status").textContent
  );

  // --- 11. Búsqueda por nombre: el CN llega en diferido -----------------
  peticiones.length = 0;
  escribir("parac");
  pulsar("Enter");
  await esperar(200);

  const primero = document.querySelector("#results-list li");
  comprobar("el resultado reserva hueco para el CN", Boolean(primero.querySelector(".result-cn")));
  comprobar(
    "el CN ya cacheado no se vuelve a pedir",
    peticiones.filter((u) => u.includes("/presentaciones?nregistro=")).length === 0,
    peticiones.join(" | ")
  );
  comprobar(
    "el CN aparece en el resultado",
    primero.querySelector(".result-cn").textContent.includes("CN 662025"),
    primero.querySelector(".result-cn").textContent
  );
  comprobar(
    "los dos envases se listan (sin resumir)",
    primero.querySelector(".result-cn").textContent === "CN 662025 · CN 662026",
    primero.querySelector(".result-cn").textContent
  );
  comprobar(
    "el title del CN enumera los envases",
    primero.querySelector(".result-cn").title.includes("662026"),
    primero.querySelector(".result-cn").title
  );

  // --- 11. Ficha del medicamento: todos los CN de sus envases -----------
  peticiones.length = 0;
  primero.click();
  await esperar(150);

  const detalleCN = document.getElementById("detail-cn");
  comprobar(
    "la ficha lista los CN de los envases",
    detalleCN.hidden === false &&
      detalleCN.textContent.includes("662025") &&
      detalleCN.textContent.includes("662026"),
    detalleCN.textContent
  );
  comprobar(
    "abrir la ficha no repite la petición de CN (caché)",
    peticiones.filter((u) => u.includes("/presentaciones?nregistro=77758")).length === 0,
    peticiones.join(" | ")
  );
  // Este medicamento (MEDICAMENTOS[0]) no lleva psum, triangulo ni docs: los
  // dos badges y el enlace tienen que quedar ocultos, no a medias ni con
  // datos del medicamento anterior.
  comprobar("sin psum, el badge de suministro queda oculto", document.getElementById("supply-issue-badge").hidden === true);
  comprobar("sin triangulo, el badge de seguimiento queda oculto", document.getElementById("monitoring-badge").hidden === true);
  comprobar("sin docs, el enlace al documento oficial queda oculto", document.getElementById("detail-doc-oficial").hidden === true);
  comprobar(
    "sin dcp.id en sus presentaciones, la sección de equivalentes queda oculta",
    document.getElementById("equivalentes").hidden === true
  );

  // --- 12. Sin errores de runtime ---------------------------------------
  comprobar("sin errores de jsdom durante la ejecución", erroresJsdom.length === 0, erroresJsdom.join(" | "));

  console.log(fallos === 0 ? "\nTODO OK" : `\n${fallos} comprobación(es) fallida(s)`);
  process.exitCode = fallos === 0 ? 0 : 1;
})();
