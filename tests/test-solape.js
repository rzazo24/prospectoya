/**
 * Test de regresión del z-index del autocompletado, con Chrome real.
 *
 * Con document.elementFromPoint() se mira qué elemento queda ENCIMA a lo largo
 * del desplegable, después de haber pintado resultados (que también animan).
 * Se ejecuta dos veces:
 *
 *   1. con el styles.css del proyecto -> el desplegable debe ganar (0 tapados);
 *   2. con ese mismo CSS sin el arreglo (sin el position/z-index de
 *      .search-section) -> debe fallar.
 *
 * El segundo caso es lo que convierte esto en una red de seguridad: si alguien
 * quita el arreglo, el test lo detecta; y si alguien "arregla" el test, el
 * segundo caso avisa de que ya no comprueba nada.
 *
 *   cd tests && node test-solape.js
 */
const fs = require("fs");
const path = require("path");
const { comprobar, resumen, leer, carpetaTemporal, copiar, navegador, domConChrome, leerDiag, campos } = require("./util");

if (!navegador()) {
  console.log("OMITIDO: no encuentro Chrome/Chromium (define la variable CHROME con la ruta al ejecutable)");
  process.exit(0);
}

const MEDICAMENTOS = [
  { nregistro: "77758", nombre: "PARACETAMOL CINFA 1 g COMPRIMIDOS EFG", labtitular: "Laboratorios Cinfa S.A.", receta: true, generico: true, comerc: true },
  { nregistro: "70001", nombre: "PARACETAMOL KERN PHARMA 500 mg COMPRIMIDOS EFG", labtitular: "Kern Pharma S.L.", receta: false, generico: true, comerc: true },
  { nregistro: "70310", nombre: "PARACETAMOL NORMON 650 mg COMPRIMIDOS EFG", labtitular: "Laboratorios Normon S.A.", receta: false, generico: true, comerc: true },
];

const DRIVER = `
  <pre id="diag" style="display:none"></pre>
  <script>
    const diag = document.getElementById("diag");
    const log = (m) => { diag.textContent += m + "\\n"; };
    window.fetch = async (url) => {
      const u = String(url);
      let data = {};
      if (u.includes("/presentaciones?")) data = { totalFilas: 1, resultados: [{ nregistro: "77758", cn: "662025", nombre: "PARACETAMOL CINFA 1 g COMPRIMIDOS EFG , 20 comprimidos", labtitular: "CINFA", receta: true, generico: true, comerc: true }] };
      else if (u.includes("/medicamentos?")) data = { totalFilas: 3, resultados: ${JSON.stringify(MEDICAMENTOS)} };
      else data = [];
      return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
    };

    const input = document.getElementById("search-input");
    const form = document.getElementById("search-form");
    const escribir = (v) => { input.value = v; input.dispatchEvent(new Event("input", { bubbles: true })); };

    // 1) Primera búsqueda: deja los resultados pintados
    escribir("paracetamol");
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    // 2) Segunda búsqueda: el desplegable se abre sobre esos resultados
    setTimeout(() => {
      escribir("paracetamol cinfa");
      setTimeout(() => {
        const lista = document.getElementById("search-suggestions");
        const r = lista.getBoundingClientRect();
        const sugerencias = [...lista.querySelectorAll("li")];
        const x = Math.round(r.left + r.width / 2);

        // Se recorre toda la altura del desplegable: en cualquier punto, el
        // elemento de arriba tiene que seguir siendo del desplegable.
        const tapados = [];
        for (let y = Math.round(r.top) + 6; y <= Math.round(r.bottom) - 6; y += 12) {
          const el = document.elementFromPoint(x, y);
          if (!lista.contains(el)) {
            tapados.push(y + ":" + (el ? el.tagName.toLowerCase() + "." + (el.className || "(sin clase)") : "null"));
          }
        }

        log("desplegable_visible=" + (!lista.hidden));
        log("sugerencias=" + sugerencias.length);
        log("altura=" + Math.round(r.height));
        log("tapados=" + tapados.length);
        log("ejemplo_tapado=" + (tapados[0] || "(ninguno)"));

        // Al desplazar la página, el desplegable pasa por debajo de la barra
        // superior fija (z-index 20): la barra debe seguir ganando.
        const composerTop = document.querySelector(".composer-wrap").getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, composerTop + 55);
        const enBarra = document.elementFromPoint(x, 25);
        log("barra_encima=" + (enBarra && enBarra.closest(".topbar") ? "si" : "no"));
      }, 800);
    }, 700);
  </script>
`;

/**
 * Devuelve el CSS del proyecto sin el arreglo: quita el `position` y el
 * `z-index` de la regla .search-section (lo que había antes del fix).
 */
function cssSinArreglo(css) {
  const inicio = css.indexOf(".search-section {");
  if (inicio === -1) return null;
  const fin = css.indexOf("}", inicio);
  const bloque = css.slice(inicio, fin).replace(/position:\s*relative;/, "").replace(/z-index:\s*3;/, "");
  return css.slice(0, inicio) + bloque + css.slice(fin);
}

/** Deja en la carpeta temporal una copia de index.html apuntando a ese CSS. */
function preparar(sitio, nombreCss, css) {
  fs.writeFileSync(path.join(sitio, nombreCss), css);
  const html = leer("index.html").replace('href="styles.css"', `href="${nombreCss}"`).replace("</body>", `${DRIVER}</body>`);
  fs.writeFileSync(path.join(sitio, nombreCss.replace(".css", ".html")), html);
}

function medir(sitio, pagina) {
  return domConChrome(`file://${path.join(sitio, pagina)}`, { alto: 820, presupuesto: 9000 }).then((dom) => campos(leerDiag(dom)));
}

(async () => {
  const sitio = carpetaTemporal("solape");
  copiar(sitio, ["api.js", "app.js", "tema.js", "pwa.js", "index.html", "favicon.svg"]);

  const css = leer("styles.css");
  const cssViejo = cssSinArreglo(css);
  comprobar("existe la regla .search-section (de la que depende el arreglo)", cssViejo !== null);

  preparar(sitio, "actual.css", css);
  preparar(sitio, "sin-arreglo.css", cssViejo || css);

  const actual = await medir(sitio, "actual.html");
  const viejo = await medir(sitio, "sin-arreglo.html");

  console.log("--- con el styles.css del proyecto ---");
  comprobar(
    "el desplegable está abierto con sugerencias",
    actual.desplegable_visible === "true" && Number(actual.sugerencias) > 0,
    `visible=${actual.desplegable_visible} li=${actual.sugerencias}`
  );
  comprobar("ningún punto del desplegable queda tapado por los resultados", actual.tapados === "0", `${actual.tapados} tapados, p. ej. ${actual.ejemplo_tapado}`);
  comprobar("al hacer scroll sigue ganando la barra superior", actual.barra_encima === "si", actual.barra_encima);

  console.log("--- con el mismo CSS sin el arreglo (debe fallar) ---");
  comprobar(
    "el escenario sin arreglo dibuja el desplegable",
    viejo.desplegable_visible === "true" && Number(viejo.sugerencias) > 0,
    `visible=${viejo.desplegable_visible} li=${viejo.sugerencias}`
  );
  comprobar("el test detecta la regresión (aparecen puntos tapados)", Number(viejo.tapados) > 0, `${viejo.tapados} tapados`);

  resumen("z-index del autocompletado");
})();
