/**
 * Verifica las dos páginas con Chrome real, servidas por HTTP (igual que en
 * Vercel) para que localStorage y las rutas relativas se comporten como en
 * producción:
 *
 *  - index.html: sin errores de JS, metaetiquetas al compartir con la imagen
 *    existente, enlace a la ayuda que resuelve, y el tema elegido se guarda.
 *  - ayuda.html: sin errores, hereda el tema de la otra página (misma clave de
 *    localStorage), el botón funciona y el enlace al repositorio va al final.
 *  - la maqueta del social preview: el lienzo mide 1280x640 y los bloques (marca,
 *    titular, entradilla, buscador, chips y cierre) van centrados, con el mismo
 *    aire arriba y abajo. Se sirve aquí para poder medirla con Chrome.
 *
 *   cd tests && node test-paginas.js
 */
const fs = require("fs");
const path = require("path");
const { RAIZ, comprobar, resumen, leer, carpetaTemporal, copiar, navegador, domConChrome, leerDiag, campos, servirHttp } = require("./util");

if (!navegador()) {
  console.log("OMITIDO: no encuentro Chrome/Chromium (define la variable CHROME con la ruta al ejecutable)");
  process.exit(0);
}

const FICHEROS = [
  "index.html",
  "ayuda.html",
  "styles.css",
  "api.js",
  "app.js",
  "tema.js",
  "arriba.js",
  "pwa.js",
  "sw.js",
  "manifest.webmanifest",
  "favicon.svg",
  "favicon-32.png",
  "favicon.ico",
  "apple-touch-icon.png",
  "icono-192.png",
  "icono-512.png",
  "icono-maskable-192.png",
  "icono-maskable-512.png",
  "social-preview.png",
];

// Las páginas de prueba vuelcan su diagnóstico como "clave=valor" en un <pre>,
// que es lo que se lee del DOM final de Chrome.

// Común a las dos páginas: la cápsula del logo tiene que quedar centrada en su
// cuadrado. Se compara el centro del dibujo (getBBox, en unidades del viewBox)
// con el centro de la caja de .brand-mark, en píxeles. Si alguien retoca los
// path y los deja descentrados, esto lo canta.
const MEDIR_LOGO = `
    const medirLogo = () => {
      const marca = document.querySelector(".brand-mark");
      const svg = marca.querySelector("svg");
      const cajaMarca = marca.getBoundingClientRect();
      const cajaSvg = svg.getBoundingClientRect();
      const dibujo = svg.getBBox();
      const escala = cajaSvg.width / svg.viewBox.baseVal.width;
      const dx = cajaSvg.x + (dibujo.x + dibujo.width / 2) * escala - (cajaMarca.x + cajaMarca.width / 2);
      const dy = cajaSvg.y + (dibujo.y + dibujo.height / 2) * escala - (cajaMarca.y + cajaMarca.height / 2);
      return Math.abs(dx).toFixed(1) + "," + Math.abs(dy).toFixed(1);
    };
    log("logo_desfase=" + medirLogo());
`;

const DIAG_INDEX = `
  <pre id="diag" style="display:none"></pre>
  <script>
    const diag = document.getElementById("diag");
    const log = (m) => { diag.textContent += m + "\\n"; };
    let errores = 0;
    window.addEventListener("error", () => { errores++; });
    const meta = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.getAttribute("content") : null;
    };

    log("og:title=" + meta('meta[property="og:title"]'));
    log("og:image=" + meta('meta[property="og:image"]'));
    log("og:image:size=" + meta('meta[property="og:image:width"]') + "x" + meta('meta[property="og:image:height"]'));
    log("twitter:card=" + meta('meta[name="twitter:card"]'));

    // La og:image es una URL absoluta de producción; se comprueba que ese
    // fichero existe en ESTE sitio, pidiendo sólo su ruta.
    const rutaOg = new URL(meta('meta[property="og:image"]')).pathname;
    fetch(rutaOg).then((r) => log("og:image_http=" + r.status)).catch(() => log("og:image_http=error"));
    fetch("/ayuda.html").then((r) => log("ayuda_http=" + r.status)).catch(() => log("ayuda_http=error"));

    document.getElementById("theme-toggle").click();
    log("tema=" + document.documentElement.dataset.tema);
    log("localstorage=" + localStorage.getItem("prospectoya-tema"));
    ${MEDIR_LOGO}
    log("errores_js=" + errores);
  </script>
`;

const DIAG_AYUDA = `
  <pre id="diag" style="display:none"></pre>
  <script>
    const diag = document.getElementById("diag");
    const log = (m) => { diag.textContent += m + "\\n"; };
    let errores = 0;
    window.addEventListener("error", () => { errores++; });

    log("tema_inicial=" + document.documentElement.dataset.tema);
    const boton = document.getElementById("theme-toggle");
    log("boton_tema=" + (boton ? "presente" : "ausente"));
    if (boton) {
      boton.click();
      log("tema_tras_pulsar=" + document.documentElement.dataset.tema);
      boton.click();
      log("tema_tras_volver=" + document.documentElement.dataset.tema);
    }

    const enlaces = [...document.querySelectorAll("a")];
    const esRepo = (a) => Boolean(a) && a.href.includes("github.com/rzazo24/prospectoya");
    log("enlace_repo=" + (enlaces.some(esRepo) ? "si" : "no"));
    log("ultimo_enlace_repo=" + (esRepo(enlaces[enlaces.length - 1]) ? "si" : "no"));
    log("ultimo_enlace_ayuda_repo=" + (esRepo([...document.querySelectorAll(".ayuda a")].pop()) ? "si" : "no"));
    log("secciones=" + document.querySelectorAll(".ayuda h2").length);
    log("atajos=" + document.querySelectorAll(".ayuda-tabla tbody tr").length);
    log("cita_aemps=" + (document.body.textContent.includes("AEMPS") ? "si" : "no"));
    ${MEDIR_LOGO}
    log("errores_js=" + errores);
  </script>
`;

// La maqueta del social preview (tests/maqueta-social-preview.html) se mide
// aquí porque es donde hay Chrome: la tarjeta se genera a mano desde ella, así
// que lo que se comprueba es que no se desmonte. Ya pasó una vez: sin
// `box-sizing: border-box` (que sí tiene styles.css) el .lienzo medía 1280 más
// sus 180px de padding, y la tarjeta salía 90px hacia la derecha.
const DIAG_TARJETA = `
  <pre id="diag" style="display:none"></pre>
  <script>
    const diag = document.getElementById("diag");
    const log = (m) => { diag.textContent += m + "\\n"; };
    const caja = (selector) => document.querySelector(selector).getBoundingClientRect();

    window.addEventListener("load", () => {
      const lienzo = caja(".lienzo");
      // El centro bueno es el de la IMAGEN (el viewport), no el del .lienzo: si
      // el padding lo estira, comparando con su propio centro no se vería nada.
      const centro = window.innerWidth / 2;
      log("lienzo=" + lienzo.width.toFixed(1) + "x" + lienzo.height.toFixed(1));
      for (const [nombre, selector] of [["marca", ".marca"], ["h1", "h1"], ["entradilla", ".entradilla"], ["buscador", ".buscador"], ["chips", ".chips"], ["cierre", ".cierre"]]) {
        const c = caja(selector);
        log("desfase_" + nombre + "=" + (c.x + c.width / 2 - centro).toFixed(1));
      }
      log("aire_arriba=" + caja(".marca").y.toFixed(1));
      log("aire_abajo=" + (lienzo.y + lienzo.height - (caja(".cierre").y + caja(".cierre").height)).toFixed(1));
      // El buscador tiene que llevar el mismo aire a los dos lados (la tarjeta va
      // vacía: con el padding de la web, la tinta se iba 8,5px a la derecha)
      const buscador = caja(".buscador");
      const lupa = caja(".buscador .lupa");
      const boton = caja(".buscador .flecha");
      log("aire_lupa=" + (lupa.x - buscador.x).toFixed(1));
      log("aire_boton=" + (buscador.x + buscador.width - (boton.x + boton.width)).toFixed(1));
      log("listo=si");
    });
  </script>
`;

(async () => {
  const sitio = carpetaTemporal("paginas");
  copiar(sitio, FICHEROS);

  // Las dos páginas se sirven con el driver inyectado al final del <body>
  for (const [fichero, driver] of [
    ["index.html", DIAG_INDEX],
    ["ayuda.html", DIAG_AYUDA],
  ]) {
    fs.writeFileSync(path.join(sitio, fichero), leer(fichero).replace("</body>", `${driver}</body>`));
  }

  // La maqueta de la tarjeta social también se sirve (con su fuente) para poder
  // medirla con Chrome, igual que las páginas.
  fs.copyFileSync(path.join(RAIZ, "tests/inter-latin.woff2"), path.join(sitio, "inter-latin.woff2"));
  fs.writeFileSync(
    path.join(sitio, "maqueta.html"),
    leer("tests/maqueta-social-preview.html").replace("</body>", `${DIAG_TARJETA}</body>`)
  );

  const { url, cerrar } = await servirHttp(sitio);

  try {
    // Mismo perfil de Chrome en las dos visitas: así se comprueba que el tema
    // se conserva al pasar de una página a otra.
    const perfil = path.join(sitio, "perfil-chrome");
    const centrado = (valor) => (valor || "").split(",").every((n) => Number(n) <= 0.5);

    console.log("--- index.html ---");
    const index = campos(leerDiag(await domConChrome(`${url}/index.html`, { perfil, presupuesto: 6000 })));
    comprobar("sin errores de JS", index.errores_js === "0", index.errores_js);
    comprobar("la cápsula del logo queda centrada en su cuadrado (±0,5 px)", centrado(index.logo_desfase), index.logo_desfase);
    comprobar("og:title presente", Boolean(index["og:title"]), index["og:title"]);
    comprobar("og:image es una URL absoluta", (index["og:image"] || "").startsWith("https://"), index["og:image"]);
    comprobar("og:image existe en el sitio (HTTP 200)", index["og:image_http"] === "200", index["og:image_http"]);
    comprobar("og:image declarada como 1280x640", index["og:image:size"] === "1280x640", index["og:image:size"]);
    comprobar("twitter:card=summary_large_image", index["twitter:card"] === "summary_large_image", index["twitter:card"]);
    comprobar("el enlace a la ayuda responde 200", index["ayuda_http"] === "200", index["ayuda_http"]);
    comprobar("el botón de tema deja el tema en oscuro", index.tema === "oscuro", index.tema);
    comprobar("y lo recuerda en localStorage", index.localstorage === "oscuro", index.localstorage);

    console.log("--- ayuda.html ---");
    const ayuda = campos(leerDiag(await domConChrome(`${url}/ayuda.html`, { perfil, presupuesto: 6000 })));
    comprobar("sin errores de JS", ayuda.errores_js === "0", ayuda.errores_js);
    comprobar("hereda el tema elegido en la otra página", ayuda.tema_inicial === "oscuro", ayuda.tema_inicial);
    comprobar("el botón de tema está presente", ayuda.boton_tema === "presente", ayuda.boton_tema);
    comprobar("el botón cambia el tema (claro)", ayuda.tema_tras_pulsar === "claro", ayuda.tema_tras_pulsar);
    comprobar("y lo vuelve a cambiar (oscuro)", ayuda.tema_tras_volver === "oscuro", ayuda.tema_tras_volver);
    comprobar("enlaza con el repositorio", ayuda.enlace_repo === "si");
    comprobar("el último enlace de la página es el repositorio", ayuda.ultimo_enlace_repo === "si", ayuda.ultimo_enlace_repo);
    comprobar("el último enlace de la ayuda es el repositorio", ayuda.ultimo_enlace_ayuda_repo === "si", ayuda.ultimo_enlace_ayuda_repo);
    comprobar("9 secciones", ayuda.secciones === "9", ayuda.secciones);
    comprobar("tabla de atajos con 4 filas", ayuda.atajos === "4", ayuda.atajos);
    comprobar("cita la fuente de datos (AEMPS)", ayuda.cita_aemps === "si", ayuda.cita_aemps);
    comprobar("y el logo también está centrado aquí", centrado(ayuda.logo_desfase), ayuda.logo_desfase);

    console.log("--- maqueta del social preview (1280x640) ---");
    const tarjeta = campos(leerDiag(await domConChrome(`${url}/maqueta.html`, { ancho: 1280, alto: 640, presupuesto: 4000 })));
    const bloques = ["marca", "h1", "entradilla", "buscador", "chips", "cierre"];
    comprobar("la maqueta se mide entera", tarjeta.listo === "si", Object.keys(tarjeta).join(" "));
    comprobar("el lienzo mide 1280x640 (el padding no lo estira)", tarjeta.lienzo === "1280.0x640.0", tarjeta.lienzo);
    comprobar(
      "los seis bloques van centrados (±0,5 px)",
      bloques.every((nombre) => Math.abs(Number(tarjeta["desfase_" + nombre])) <= 0.5),
      bloques.map((nombre) => `${nombre}:${tarjeta["desfase_" + nombre]}`).join(" ")
    );
    comprobar(
      "el aire de arriba y el de abajo están equilibrados (±2 px)",
      Math.abs(Number(tarjeta.aire_arriba) - Number(tarjeta.aire_abajo)) <= 2,
      `${tarjeta.aire_arriba} / ${tarjeta.aire_abajo}`
    );
    comprobar(
      "el buscador de la tarjeta lleva el mismo aire a los dos lados (±0,5 px)",
      Math.abs(Number(tarjeta.aire_lupa) - Number(tarjeta.aire_boton)) <= 0.5,
      `lupa:${tarjeta.aire_lupa} botón:${tarjeta.aire_boton}`
    );
  } finally {
    cerrar();
  }

  resumen("páginas en Chrome real");
})();
