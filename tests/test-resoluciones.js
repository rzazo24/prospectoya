/**
 * Comprueba que la web se adapta a las resoluciones de escritorio, con Chrome
 * real: que no desborde a lo ancho, que el contenedor aproveche la pantalla en
 * las resoluciones grandes y que, con un medicamento abierto, la lista de
 * resultados y el documento vayan lado a lado (maestro-detalle) sin estirar el
 * renglón del prospecto.
 *
 * Los anchos de móvil (390px) los cubre test-movil.js. Aquí se inyectan
 * resultados y un detalle falsos desde el driver: lo que se mide es el CSS, no
 * la API ni el buscador.
 *
 *   cd tests && node test-resoluciones.js
 */
const fs = require("fs");
const path = require("path");
const { comprobar, resumen, leer, carpetaTemporal, copiar, navegador, domConChrome, leerDiag, campos, servirHttp } = require("./util");

if (!navegador()) {
  console.log("OMITIDO: no encuentro Chrome/Chromium (define la variable CHROME con la ruta al ejecutable)");
  process.exit(0);
}

const FICHEROS = ["index.html", "ayuda.html", "styles.css", "api.js", "app.js", "tema.js", "arriba.js", "pwa.js", "favicon.svg"];

const DRIVER = `
  <pre id="diag" style="display:none"></pre>
  <script>
    const diag = document.getElementById("diag");
    const log = (m) => { diag.textContent += m + "\\n"; };
    const caja = (sel) => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect() : null; };
    const lista = document.getElementById("results-list");
    const detalle = document.getElementById("detail-section");

    // Resultados de relleno: sin ellos la lista no se reparte en columnas
    for (let i = 1; i <= 8; i++) {
      const li = document.createElement("li");
      li.innerHTML = '<span class="result-name">Medicamento de prueba ' + i +
        '</span><span class="result-lab">Laboratorios de prueba S.A.</span>';
      lista.appendChild(li);
    }

    const medir = (etiqueta) => {
      const raiz = document.documentElement;
      const vw = raiz.clientWidth; // sin contar la barra de scroll
      const app = caja(".app");
      const resultados = caja("#results-section");
      const documento = caja("#detail-section");
      const parrafo = document.querySelector(".accordion-body p");
      const columnas = new Set([...lista.children].map((li) => Math.round(li.getBoundingClientRect().x))).size;

      log(etiqueta + "_cliente=" + vw);
      log(etiqueta + "_scroll=" + raiz.scrollWidth);
      log(etiqueta + "_app=" + Math.round(app.width));
      log(etiqueta + "_desfase=" + (app.x + app.width / 2 - vw / 2).toFixed(1));
      log(etiqueta + "_columnas=" + columnas);
      log(etiqueta + "_lado_a_lado=" + (!detalle.hidden && resultados.right <= documento.left + 0.5 ? "si" : "no"));
      log(etiqueta + "_texto=" + (parrafo ? Math.round(parrafo.getBoundingClientRect().width) : 0));
    };

    window.addEventListener("load", () => {
      medir("antes");

      // Un medicamento abierto, sin tocar la API: sólo para medir el layout
      detalle.hidden = false;
      document.getElementById("detail-name").textContent = "METFORMINA CINFA 850 mg COMPRIMIDOS EFG";
      const resumen = document.getElementById("quick-summary");
      resumen.hidden = false;
      resumen.innerHTML = '<p class="quick-summary-title">Resumen rápido</p><div class="quick-summary-grid">' +
        Array.from({ length: 4 }, (_, i) => '<div class="quick-summary-card"><p class="quick-summary-card-title">Apartado ' + i +
          '</p><p>Texto de prueba del resumen rápido.</p></div>').join("") + '</div>';
      document.getElementById("sections-accordion").innerHTML =
        '<div class="accordion-item"><div class="accordion-header">1. Qué es y para qué se utiliza</div>' +
        '<div class="accordion-body open"><p>' +
        "Texto de prueba con la longitud típica de un prospecto, para medir cuánto mide el renglón en una pantalla ancha. ".repeat(4) +
        '</p></div></div>';

      requestAnimationFrame(() => {
        medir("despues");

        // Lo mismo que mide test-solape (que nada tape el desplegable), pero con
        // el detalle abierto: es el caso nuevo del maestro-detalle.
        const sugerencias = document.getElementById("search-suggestions");
        sugerencias.hidden = false;
        sugerencias.innerHTML = Array.from({ length: 5 }, (_, i) =>
          '<li><span class="suggestion-name">Medicamento de prueba ' + i +
          '</span><span class="suggestion-lab">Laboratorio</span></li>').join("");

        setTimeout(() => {
          const cajaSugerencias = sugerencias.getBoundingClientRect();
          const encima = document.elementFromPoint(cajaSugerencias.x + cajaSugerencias.width / 2, cajaSugerencias.y + 20);
          log("desplegable_arriba=" + (encima && sugerencias.contains(encima) ? "si" : "no"));
          log("listo=si");
        }, 60);
      });
    });
  </script>
`;

/** Lo que se espera de cada resolución (medido en Chrome, no estimado). */
const CASOS = [
  { ancho: 900, alto: 900, texto: "escritorio de siempre (por debajo del corte)", app: 780, exacta: true, columnas: 1, lado: "no" },
  { ancho: 1180, alto: 900, texto: "portátil ancho (primer corte)", app: 1000, columnas: 2, lado: "si" },
  { ancho: 1600, alto: 950, texto: "pantalla muy ancha", app: 1200, columnas: 3, lado: "si" },
  { ancho: 2560, alto: 1200, texto: "pantalla enorme", app: 1350, columnas: 4, lado: "si" },
];

(async () => {
  const sitio = carpetaTemporal("resoluciones");
  copiar(sitio, FICHEROS);
  fs.writeFileSync(path.join(sitio, "resoluciones.html"), leer("index.html").replace("</body>", `${DRIVER}</body>`));

  const { url, cerrar } = await servirHttp(sitio);

  try {
    for (const caso of CASOS) {
      console.log(`--- ${caso.ancho}x${caso.alto} · ${caso.texto} ---`);
      const d = campos(leerDiag(await domConChrome(`${url}/resoluciones.html`, { ancho: caso.ancho, alto: caso.alto, presupuesto: 4000 })));

      comprobar("la página se mide entera", d.listo === "si", Object.keys(d).join(" "));
      comprobar(
        "no desborda a lo ancho",
        Number(d.antes_scroll) <= Number(d.antes_cliente) + 1,
        `${d.antes_scroll} > ${d.antes_cliente}`
      );
      comprobar(
        caso.exacta
          ? `el contenedor mide lo de siempre (${caso.app}px)`
          : `el contenedor aprovecha el ancho (≥${caso.app}px)`,
        caso.exacta ? Number(d.antes_app) === caso.app : Number(d.antes_app) >= caso.app,
        `${d.antes_app}px`
      );
      comprobar("el contenedor va centrado", Math.abs(Number(d.antes_desfase)) <= 0.5, d.antes_desfase);
      comprobar(
        caso.columnas === 1 ? "los resultados van en una columna" : `los resultados van en ${caso.columnas} columnas o más`,
        caso.columnas === 1 ? Number(d.antes_columnas) === 1 : Number(d.antes_columnas) >= caso.columnas,
        `${d.antes_columnas} columna(s)`
      );
      comprobar(
        caso.lado === "si"
          ? "con el detalle abierto, la lista y el documento van lado a lado"
          : "con el detalle abierto siguen apilados (a este ancho no caben)",
        d.despues_lado_a_lado === caso.lado,
        d.despues_lado_a_lado
      );
      comprobar("el renglón del prospecto no se estira (≤705px)", Number(d.despues_texto) <= 705, `${d.despues_texto}px`);
      comprobar("nada tapa el desplegable del buscador", d.desplegable_arriba === "si", d.desplegable_arriba);
    }
  } finally {
    cerrar();
  }

  resumen("resoluciones de pantalla");
})();
