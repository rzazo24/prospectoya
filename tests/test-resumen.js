/**
 * Test de la extracción del resumen rápido (extraerResumenRapido/buscarCampo
 * en app.js), con fetch simulado. Hasta ahora esta lógica no tenía ningún
 * test dedicado — se detectaban sus fallos a mano contra la API real (así
 * salieron la tarjeta de Alcohol y los dos arreglos que cubre este fichero).
 *
 * Carga index.html + api.js + app.js reales en jsdom, igual que
 * test-busqueda.js, pero con un prospecto simulado pensado para forzar los
 * dos patrones de CIMA que se sabe que dan problemas:
 *
 *  - Listas de contraindicaciones cuyos <li> empiezan en minúscula en el HTML
 *    origen ("si es alérgico a…"), como continuación implícita del subtítulo.
 *  - Un subtítulo general ("Embarazo y lactancia") seguido de una frase
 *    genérica y LUEGO de un sub-subtítulo más concreto ("Embarazo:") con el
 *    contenido de verdad — comprobado con datos reales el 22/09/2026
 *    (nregistro 68477, lorazepam).
 *
 *   cd tests && node test-resumen.js
 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const RAIZ = path.resolve(__dirname, "..");
const api = fs.readFileSync(path.join(RAIZ, "api.js"), "utf8");
const app = fs.readFileSync(path.join(RAIZ, "app.js"), "utf8");
const tema = fs.readFileSync(path.join(RAIZ, "tema.js"), "utf8");
const pwa = fs.readFileSync(path.join(RAIZ, "pwa.js"), "utf8");
const arriba = fs.readFileSync(path.join(RAIZ, "arriba.js"), "utf8");

let html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
for (const [fichero, codigo] of [["tema.js", tema], ["arriba.js", arriba], ["api.js", api], ["app.js", app], ["pwa.js", pwa]]) {
  html = html.replace(`<script src="${fichero}"></script>`, `<script>${codigo}</script>`);
}

// Prospecto simulado: una sola sección ("Qué necesita saber…") con las dos
// trampas seguidas, tal como puede llegar de verdad de CIMA.
const NREGISTRO = "90001";
const SECCIONES = [{ seccion: "2", titulo: "Qué necesita saber antes de empezar a tomar Medicamento Ejemplo", orden: 3 }];
const CONTENIDO_SECCION_2 = `
  <p><strong>No tome Medicamento Ejemplo</strong></p>
  <ul>
    <li>si es alérgico al principio activo o a alguno de los demás componentes.</li>
    <li>si tiene insuficiencia hepática grave.</li>
  </ul>
  <p><strong>Embarazo y lactancia</strong></p>
  <p>Consulte a su médico o farmacéutico antes de utilizar cualquier medicamento.</p>
  <p><strong>Embarazo:</strong></p>
  <p>Si está embarazada, no debe usar Medicamento Ejemplo sin consultar antes a su médico.</p>
`;

const erroresJsdom = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => erroresJsdom.push(e.message));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://prospectoya.test/",
  virtualConsole: vc,
  beforeParse(window) {
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    window.Element.prototype.scrollIntoView = function () {};
    window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
    window.fetch = async (url) => {
      const u = String(url);
      let data = [];
      if (u.includes("/docSegmentado/secciones/")) {
        data = SECCIONES;
      } else if (u.includes("/docSegmentado/contenido/")) {
        data = [{ seccion: "2", titulo: SECCIONES[0].titulo, contenido: CONTENIDO_SECCION_2, orden: 3 }];
      }
      return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
    };
  },
});
const { window } = dom;

let fallos = 0;
function comprobar(descripcion, condicion, extra = "") {
  if (!condicion) fallos++;
  console.log(`${condicion ? "OK   " : "FALLA"} ${descripcion}${extra ? "  (" + extra + ")" : ""}`);
}

(async () => {
  const { resumen } = await window.extraerResumenRapido(NREGISTRO);

  // --- Capitalización: la lista empieza en minúscula en el HTML origen ---
  comprobar(
    "contraindicaciones: el texto sale con mayúscula inicial aunque el <li> de CIMA empiece en minúscula",
    resumen.contraindicaciones && resumen.contraindicaciones.texto.startsWith("Si es alérgico"),
    resumen.contraindicaciones ? resumen.contraindicaciones.texto : "(no encontrado)"
  );

  // --- Subtítulo anidado: "Embarazo y lactancia" → frase genérica → "Embarazo:" → contenido real ---
  const embarazo = resumen.embarazo ? resumen.embarazo.texto : "";
  comprobar(
    "embarazo: no se queda solo con la frase genérica de después del subtítulo",
    embarazo !== "Consulte a su médico o farmacéutico antes de utilizar cualquier medicamento.",
    embarazo
  );
  comprobar(
    "embarazo: sigue hasta el sub-subtítulo \"Embarazo:\" y recoge el contenido real",
    embarazo.includes("no debe usar Medicamento Ejemplo sin consultar antes"),
    embarazo
  );

  comprobar("sin errores de jsdom durante la ejecución", erroresJsdom.length === 0, erroresJsdom.join(" | "));

  console.log(fallos === 0 ? "\nTODO OK (extracción del resumen rápido)" : `\n${fallos} fallo(s) (extracción del resumen rápido)`);
  process.exitCode = fallos === 0 ? 0 : 1;
})();
