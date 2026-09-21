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
      const vh = raiz.clientHeight;
      const app = caja(".app");
      const ventana = caja("#detail-section");
      const parrafo = document.querySelector(".accordion-body p");
      const columnas = new Set([...lista.children].map((li) => Math.round(li.getBoundingClientRect().x))).size;

      // Las 5 tarjetas del resumen se reparten en filas: la incompleta (siempre
      // hay una) tiene que quedar centrada, no pegada a la izquierda.
      const rejilla = caja(".quick-summary-grid");
      const tarjetas = [...document.querySelectorAll(".quick-summary-card")].map((t) => t.getBoundingClientRect());
      const filas = new Map();
      tarjetas.forEach((t) => {
        const clave = Math.round(t.top);
        if (!filas.has(clave)) filas.set(clave, []);
        filas.get(clave).push(t);
      });
      const centroRejilla = rejilla ? rejilla.x + rejilla.width / 2 : 0;
      const desvios = [...filas.values()].map((grupo) => {
        const ini = Math.min(...grupo.map((t) => t.left));
        const fin = Math.max(...grupo.map((t) => t.right));
        return Math.abs((ini + fin) / 2 - centroRejilla);
      });
      // Hueco que le sobra al renglón dentro de su columna (el texto tiene que
      // llegar a los dos lados: con la columna de más, quedaba un hueco a la
      // derecha que se veía como si estuviera descentrado).
      const cuerpo = document.querySelector(".accordion-body");
      let huecoTexto = 0;
      if (parrafo && cuerpo) {
        const estilo = getComputedStyle(cuerpo);
        const contenido = cuerpo.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
        const piezas = [...cuerpo.querySelectorAll("p, li")].map((p) => p.getBoundingClientRect().width);
        huecoTexto = piezas.length ? contenido - Math.max(...piezas) : 0;
      }

      log(etiqueta + "_cliente=" + vw);
      log(etiqueta + "_scroll=" + raiz.scrollWidth);
      log(etiqueta + "_app=" + Math.round(app.width));
      log(etiqueta + "_desfase=" + (app.x + app.width / 2 - vw / 2).toFixed(1));
      log(etiqueta + "_columnas=" + columnas);
      log(etiqueta + "_filas_tarjetas=" + filas.size);
      log(etiqueta + "_desvio_tarjetas=" + (desvios.length ? Math.max(...desvios).toFixed(1) : 0));
      log(etiqueta + "_texto=" + (parrafo ? Math.round(parrafo.getBoundingClientRect().width) : 0));
      log(etiqueta + "_hueco_texto=" + huecoTexto.toFixed(1));
      // El badge de problema de suministro es Fase 2 y va con el atributo hidden:
      // mientras nadie lo active no puede verse (el display de .badge se imponía
      // al atributo y el aviso salía siempre, incluso sin problema de suministro).
      log("badge_display=" + getComputedStyle(document.getElementById("supply-issue-badge")).display);

      if (!ventana || ventana.width === 0) return; // ventana cerrada
      log(etiqueta + "_ventana_ancho=" + ventana.width.toFixed(1));
      log(etiqueta + "_ventana_alto=" + ventana.height.toFixed(1));
      log(etiqueta + "_ventana_desfase_h=" + (ventana.x + ventana.width / 2 - vw / 2).toFixed(1));
      log(etiqueta + "_ventana_desfase_v=" + (ventana.y + ventana.height / 2 - vh / 2).toFixed(1));
      log(etiqueta + "_ventana_pasada=" + (ventana.height > vh + 0.5 ? "si" : "no"));
      log(etiqueta + "_modal=" + (detalle.matches(":modal") ? "si" : "no"));
      log(etiqueta + "_velo=" + getComputedStyle(detalle, "::backdrop").backgroundColor);
    };

    window.addEventListener("load", () => {
      medir("antes");

      // Un medicamento abierto, sin tocar la API: sólo para medir el layout.
      // Se abre como en la web (showModal): ventana centrada y fondo inerte.
      detalle.showModal();
      // La animación de entrada desplaza la ventana 6px mientras corre (y con
      // el reloj virtual de Chrome no se sabe cuándo ha terminado): se quita
      // para medir dónde queda colocada de verdad.
      const sinAnimacion = document.createElement("style");
      sinAnimacion.textContent = ".dialogo-detalle { animation: none !important; }";
      document.head.appendChild(sinAnimacion);
      document.getElementById("detail-name").textContent = "METFORMINA CINFA 850 mg COMPRIMIDOS EFG";
      const resumen = document.getElementById("quick-summary");
      resumen.hidden = false;
      resumen.innerHTML = '<p class="quick-summary-title">Resumen rápido</p><div class="quick-summary-grid">' +
        Array.from({ length: 5 }, (_, i) => '<div class="quick-summary-card"><p class="quick-summary-card-title">Apartado ' + i +
          '</p><p>Texto de prueba del resumen rápido.</p></div>').join("") + '</div>';
      document.getElementById("sections-accordion").innerHTML =
        '<div class="accordion-item"><div class="accordion-header">1. Qué es y para qué se utiliza</div>' +
        '<div class="accordion-body open"><p>' +
        "Texto de prueba con la longitud típica de un prospecto, para medir cuánto mide el renglón en una pantalla ancha. ".repeat(4) +
        '</p></div></div>';

      requestAnimationFrame(() => {
        // La ventana tiene una animación de entrada (aparecer, 280ms): se mide
        // cuando ya ha terminado, si no el centrado saldría desplazado.
        setTimeout(() => {
          medir("despues");

          // La ✕ tiene que verse (que el título no la tape) y cerrar la ventana
          const boton = document.getElementById("detail-close");
          const c = boton.getBoundingClientRect();
          const encimaDelCierre = document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2);
          log("cierre_visible=" + (encimaDelCierre && boton.contains(encimaDelCierre) ? "si" : "no"));
          boton.click();
          log("cierre_ok=" + (detalle.open ? "no" : "si"));

          // Lo mismo que mide test-solape (que nada tape el desplegable). Con la
          // ventana abierta el fondo queda inerte, así que se mide ya cerrada.
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
        }, 320);
      });
    });
  </script>
`;

/** Lo que se espera de cada resolución (medido en Chrome, no estimado). */
const CASOS = [
  { ancho: 900, alto: 900, texto: "escritorio de siempre (por debajo del corte)", app: 780, exacta: true, columnas: 1 },
  { ancho: 1180, alto: 900, texto: "portátil ancho (primer corte)", app: 1000, columnas: 2 },
  { ancho: 1600, alto: 950, texto: "pantalla muy ancha", app: 1200, columnas: 3 },
  { ancho: 2560, alto: 1200, texto: "pantalla enorme", app: 1350, columnas: 4 },
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
        "el detalle se abre en una ventana modal (fondo inerte y Esc para cerrar)",
        d.despues_modal === "si",
        d.despues_modal
      );
      comprobar(
        "la ventana va centrada en la pantalla (≤0,5px)",
        Math.abs(Number(d.despues_ventana_desfase_h)) <= 0.5 && Math.abs(Number(d.despues_ventana_desfase_v)) <= 0.5,
        `horizontal ${d.despues_ventana_desfase_h}px, vertical ${d.despues_ventana_desfase_v}px`
      );
      comprobar(
        "la ventana mide el renglón cómodo más su relleno (≤743px)",
        Number(d.despues_ventana_ancho) <= 743,
        `${d.despues_ventana_ancho}px`
      );
      comprobar("la ventana no se sale de la pantalla", d.despues_ventana_pasada === "no", d.despues_ventana_pasada);
      comprobar("el fondo se oscurece", d.despues_velo !== "rgba(0, 0, 0, 0)", d.despues_velo);
      comprobar("el renglón del prospecto no se estira (≤705px)", Number(d.despues_texto) <= 705, `${d.despues_texto}px`);
      comprobar(
        "el texto llena su columna (sin hueco a la derecha)",
        Number(d.despues_hueco_texto) <= 1,
        `${d.despues_hueco_texto}px de hueco`
      );
      comprobar(
        "las filas incompletas del resumen van centradas (≤0,6px)",
        Number(d.despues_desvio_tarjetas) <= 0.6,
        `${d.despues_desvio_tarjetas}px de desvío`
      );
      comprobar(
        `con la ventana abierta la lista sigue en ${caso.columnas} columna(s) o más`,
        Number(d.despues_columnas) >= caso.columnas,
        `${d.despues_columnas} columna(s)`
      );
      comprobar(
        "la ✕ se ve (no la tapa el título) y cierra la ventana",
        d.cierre_visible === "si" && d.cierre_ok === "si",
        `visible=${d.cierre_visible}, cierra=${d.cierre_ok}`
      );
      comprobar(
        "el badge de problema de suministro no se ve (es Fase 2, va con `hidden`)",
        d.badge_display === "none",
        d.badge_display
      );
      comprobar("nada tapa el desplegable del buscador", d.desplegable_arriba === "si", d.desplegable_arriba);
    }
  } finally {
    cerrar();
  }

  resumen("resoluciones de pantalla");
})();
