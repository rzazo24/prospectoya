/**
 * Comprueba en Chrome, con viewport de móvil (390x844), las condiciones que
 * disparan el zoom al escribir en el buscador:
 *
 *  - el campo debe medir 16px o más: por debajo de 16px los navegadores móviles
 *    (Safari en iOS, Samsung Internet, Firefox Android…) amplían la página al
 *    enfocarlo, y escribiendo resulta muy molesto;
 *  - el viewport no debe prohibir el zoom (`user-scalable=no` / `maximum-scale`):
 *    también lo evitaría, pero rompe la accesibilidad, porque quita el pellizco;
 *  - el compositor no debe ampliar al doble toque (`touch-action`) y la página no
 *    debe desbordar a lo ancho, porque eso provoca reencuadres al abrirse el
 *    teclado.
 *
 * El ancho de móvil se consigue con un iframe de 390px: Chrome en Linux no baja
 * de ~500px de ancho de ventana, y así las media queries se evalúan al ancho de
 * un móvil de verdad.
 *
 *   cd tests && node test-movil.js
 */
const fs = require("fs");
const path = require("path");
const { comprobar, resumen, leer, carpetaTemporal, copiar, navegador, domConChrome, leerDiag, campos, servirHttp } = require("./util");

if (!navegador()) {
  console.log("OMITIDO: no encuentro Chrome/Chromium (define la variable CHROME con la ruta al ejecutable)");
  process.exit(0);
}

const FICHEROS = ["index.html", "styles.css", "api.js", "app.js", "tema.js", "favicon.svg"];

// Página con el iframe estrecho y el diagnóstico del contenido
const PAGINA_MOVIL = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Prueba de móvil</title>
</head>
<body style="margin:0">
  <pre id="diag" style="display:none"></pre>
  <iframe id="marco" src="index.html" width="390" height="844" style="border:0"></iframe>
  <script>
    const log = (m) => { document.getElementById("diag").textContent += m + "\\n"; };
    const marco = document.getElementById("marco");

    marco.addEventListener("load", () => {
      const doc = marco.contentDocument;
      const ventana = marco.contentWindow;
      const input = doc.getElementById("search-input");
      const composer = doc.querySelector(".composer");
      const viewport = doc.querySelector('meta[name="viewport"]').content;
      const fuente = getComputedStyle(input).fontSize;

      log("ancho_viewport=" + ventana.innerWidth);
      log("font_input=" + fuente);
      log("font_input_num=" + parseFloat(fuente));
      log("alto_input=" + input.offsetHeight);
      log("viewport=" + viewport);
      log("viewport_bloquea_zoom=" + /user-scalable\\s*=\\s*(no|0)|maximum-scale/i.test(viewport));
      log("touch_action=" + getComputedStyle(composer).touchAction);
      log("ancho_composer=" + Math.round(composer.getBoundingClientRect().width));
      log("ancho_documento=" + doc.documentElement.scrollWidth);
      log("desborda=" + (doc.documentElement.scrollWidth > ventana.innerWidth + 1));
    });
  </script>
</body>
</html>
`;

(async () => {
  const sitio = carpetaTemporal("movil");
  copiar(sitio, FICHEROS);
  fs.writeFileSync(path.join(sitio, "movil.html"), PAGINA_MOVIL);

  const { url, cerrar } = await servirHttp(sitio);

  let datos;
  try {
    datos = campos(leerDiag(await domConChrome(`${url}/movil.html`, { ancho: 1100, alto: 900, presupuesto: 5000 })));
  } finally {
    cerrar();
  }

  comprobar("el iframe se mide a 390px (ancho de móvil)", datos.ancho_viewport === "390", datos.ancho_viewport);
  comprobar(
    "el buscador tiene 16px o más (por debajo, los móviles hacen zoom al enfocar)",
    Number(datos.font_input_num) >= 16,
    `${datos.font_input} medidos`
  );
  comprobar("el campo sigue teniendo un tamaño cómodo (>=40px de alto)", Number(datos.alto_input) >= 40, datos.alto_input);
  comprobar("el viewport no prohíbe el zoom (el pellizco sigue disponible)", datos.viewport_bloquea_zoom === "false", datos.viewport);
  comprobar("el compositor no amplía al doble toque (touch-action)", datos.touch_action === "manipulation", datos.touch_action);
  comprobar("no hay desbordes horizontales", datos.desborda === "false", `documento=${datos.ancho_documento}px ventana=${datos.ancho_viewport}px`);
  comprobar("el compositor cabe en el ancho del móvil", Number(datos.ancho_composer) <= Number(datos.ancho_viewport), datos.ancho_composer);

  resumen("buscador en móvil");
})();
