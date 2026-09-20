/**
 * Comprueba la estructura de las dos páginas del sitio: cabeceras, iconos,
 * scripts que existen de verdad, y el contenido y los enlaces de la ayuda.
 *
 *   cd tests && node test-html.js
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { RAIZ, leer, comprobar, resumen } = require("./util");

for (const fichero of ["index.html", "ayuda.html"]) {
  const html = leer(fichero);
  const doc = new JSDOM(html).window.document;

  console.log(`--- ${fichero} ---`);
  comprobar("lang=es", doc.documentElement.lang === "es");
  comprobar("title y meta description", Boolean(doc.querySelector("title").textContent) && Boolean(doc.querySelector('meta[name="description"]')));
  comprobar(
    "favicon svg + png + ico + apple-touch-icon",
    Boolean(doc.querySelector('link[rel="icon"][href="favicon.svg"]')) &&
      Boolean(doc.querySelector('link[href="favicon-32.png"]')) &&
      Boolean(doc.querySelector('link[href="favicon.ico"]')) &&
      Boolean(doc.querySelector('link[href="apple-touch-icon.png"]'))
  );
  comprobar("carga styles.css", Boolean(doc.querySelector('link[href="styles.css"]')));
  comprobar("carga tema.js", Boolean(doc.querySelector('script[src="tema.js"]')));
  comprobar("tema aplicado antes de pintar (script en el <head>)", html.includes('localStorage.getItem("prospectoya-tema")'));
  comprobar("botón de tema", Boolean(doc.getElementById("theme-toggle")));
  comprobar("la clave del tema coincide con la de tema.js", leer("tema.js").includes('"prospectoya-tema"'));
  comprobar(
    "todos los <script src> existen",
    [...doc.querySelectorAll("script[src]")].every((s) => fs.existsSync(path.join(RAIZ, s.getAttribute("src")))),
    [...doc.querySelectorAll("script[src]")].map((s) => s.getAttribute("src")).join(" ")
  );
}

// --- og / twitter: sólo index.html ------------------------------
console.log("--- index.html (metaetiquetas al compartir) ---");
{
  const doc = new JSDOM(leer("index.html")).window.document;
  const meta = (selector) => {
    const el = doc.querySelector(selector);
    return el ? el.getAttribute("content") : null;
  };

  comprobar("og:title", Boolean(meta('meta[property="og:title"]')));
  comprobar("og:description", Boolean(meta('meta[property="og:description"]')));
  comprobar("og:type=website", meta('meta[property="og:type"]') === "website");
  comprobar("og:locale=es_ES", meta('meta[property="og:locale"]') === "es_ES");
  comprobar("og:image (ruta del fichero del repo)", meta('meta[property="og:image"]') === "https://prospectoya.vercel.app/social-preview.png", meta('meta[property="og:image"]'));
  comprobar("og:image:width x height = 1280x640", meta('meta[property="og:image:width"]') === "1280" && meta('meta[property="og:image:height"]') === "640");
  comprobar("twitter:card=summary_large_image", meta('meta[name="twitter:card"]') === "summary_large_image");
}

// --- contenido de la ayuda --------------------------------------
console.log("--- ayuda.html (contenido) ---");
{
  const html = leer("ayuda.html");
  const doc = new JSDOM(html).window.document;
  const enlaces = [...doc.querySelectorAll("a")];
  const repo = enlaces.find((a) => a.href.includes("github.com/rzazo24/prospectoya"));

  comprobar("no carga app.js ni api.js (no son del buscador)", !doc.querySelector('script[src="app.js"]') && !doc.querySelector('script[src="api.js"]'));
  comprobar("9 secciones (h2)", doc.querySelectorAll(".ayuda h2").length === 9, String(doc.querySelectorAll(".ayuda h2").length));
  comprobar("enlace al repositorio", Boolean(repo));
  comprobar("el repositorio es el último enlace de la página", Boolean(enlaces[enlaces.length - 1]) && enlaces[enlaces.length - 1].href.includes("github.com/rzazo24/prospectoya"));
  comprobar("el repositorio es el último enlace de la ayuda", [...doc.querySelectorAll(".ayuda a")].pop().href.includes("github.com/rzazo24/prospectoya"));
  comprobar("enlace de vuelta al buscador", Boolean(doc.querySelector('.ayuda a[href="./"]')));
  comprobar("cita la AEMPS", doc.body.textContent.includes("AEMPS"));
  comprobar("aviso sanitario destacado", Boolean(doc.querySelector(".ayuda .aviso")));
  comprobar("tabla de atajos con 4 filas", doc.querySelectorAll(".ayuda-tabla tbody tr").length === 4);
  comprobar("explica el código nacional", doc.body.textContent.includes("código nacional"));
  comprobar("sin marcadores de plantilla", !html.includes("CONTINUA"));
  comprobar("sin <pre>/<textarea> visibles", !doc.querySelector("pre:not(#diag)"));
}

resumen("estructura HTML");
