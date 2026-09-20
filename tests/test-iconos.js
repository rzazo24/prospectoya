/**
 * Comprueba con Chrome real que los iconos declarados en index.html se cargan
 * (rutas correctas, formato válido) y que los PNG tienen su tamaño exacto.
 *
 *   cd tests && node test-iconos.js
 */
const fs = require("fs");
const path = require("path");
const { comprobar, resumen, leer, carpetaTemporal, copiar, navegador, domConChrome, leerDiag, campos, servirHttp } = require("./util");

if (!navegador()) {
  console.log("OMITIDO: no encuentro Chrome/Chromium (define la variable CHROME con la ruta al ejecutable)");
  process.exit(0);
}

const FICHEROS = ["index.html", "styles.css", "api.js", "app.js", "tema.js", "favicon.svg", "favicon-32.png", "favicon.ico", "apple-touch-icon.png"];

const DRIVER = `
  <pre id="diag" style="display:none"></pre>
  <script>
    const diag = document.getElementById("diag");
    const log = (m) => { diag.textContent += m + "\\n"; };

    const enlaces = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')];
    log("declarados=" + enlaces.length);

    const cargar = (href) =>
      new Promise((resolver) => {
        const img = new Image();
        img.onload = () => resolver(href + "|ok|" + img.naturalWidth + "x" + img.naturalHeight);
        img.onerror = () => resolver(href + "|falla|0x0");
        img.src = href;
      });

    Promise.all(enlaces.map((e) => cargar(e.getAttribute("href")))).then((resultados) => {
      resultados.forEach((linea) => log("icono=" + linea));
      log("fallos=" + resultados.filter((l) => l.includes("|falla|")).length);
    });
  </script>
`;

(async () => {
  const sitio = carpetaTemporal("iconos");
  copiar(sitio, FICHEROS);
  fs.writeFileSync(path.join(sitio, "test.html"), leer("index.html").replace("</body>", `${DRIVER}</body>`));

  const { url, cerrar } = await servirHttp(sitio);

  let dom;
  try {
    dom = await domConChrome(`${url}/test.html`, { presupuesto: 5000 });
  } finally {
    cerrar();
  }

  const diag = leerDiag(dom);
  const datos = campos(diag);
  const iconos = diag
    .split("\n")
    .filter((linea) => linea.startsWith("icono="))
    .map((linea) => linea.slice("icono=".length));

  /** Tamaño cargado de un icono, o "(no carga)". */
  const tamano = (nombre) => {
    const linea = iconos.find((l) => l.startsWith(`${nombre}|ok|`));
    return linea ? linea.split("|")[2] : "(no carga)";
  };

  comprobar("index.html declara 4 iconos", datos.declarados === "4", datos.declarados);
  comprobar("los 4 se cargan sin error", iconos.length === 4 && iconos.every((l) => l.includes("|ok|")), iconos.join("  "));
  comprobar("favicon-32.png es 32x32", tamano("favicon-32.png") === "32x32", tamano("favicon-32.png"));
  comprobar("apple-touch-icon.png es 180x180", tamano("apple-touch-icon.png") === "180x180", tamano("apple-touch-icon.png"));
  comprobar("favicon.svg carga con tamaño conocido", /^\d+x\d+$/.test(tamano("favicon.svg")), tamano("favicon.svg"));
  comprobar("favicon.ico carga con tamaño conocido", /^\d+x\d+$/.test(tamano("favicon.ico")), tamano("favicon.ico"));

  resumen("iconos en Chrome real");
})();
