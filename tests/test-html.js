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
  // --- App instalable (PWA): lo que tiene que declarar cada página ---
  const manifest = doc.querySelector('link[rel="manifest"]');
  comprobar("declara el manifest de la app", Boolean(manifest) && manifest.getAttribute("href") === "manifest.webmanifest");
  comprobar("el manifest declarado existe", fs.existsSync(path.join(RAIZ, "manifest.webmanifest")));
  comprobar(
    "theme-color con los dos temas (claro y oscuro)",
    [...doc.querySelectorAll('meta[name="theme-color"]')]
      .map((m) => m.getAttribute("content"))
      .join(" ") === "#4d6bfe #16171b"
  );
  comprobar(
    "metas de app instalada (Android e iOS)",
    doc.querySelector('meta[name="mobile-web-app-capable"]')?.getAttribute("content") === "yes" &&
      doc.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute("content") === "ProspectoYa"
  );
  comprobar("carga pwa.js (service worker y aviso de conexión)", Boolean(doc.querySelector('script[src="pwa.js"]')));
  {
    const aviso = doc.getElementById("aviso-conexion");
    comprobar(
      "aviso de sin conexión, oculto de salida",
      Boolean(aviso) && aviso.hasAttribute("hidden") && aviso.getAttribute("role") === "status",
      aviso ? aviso.outerHTML.slice(0, 60) : "(no está)"
    );
  }
  {
    const aviso = doc.getElementById("aviso-version");
    const boton = doc.getElementById("recargar-version");
    comprobar(
      "aviso de versión nueva, oculto de salida y con botón de recargar",
      Boolean(aviso) && aviso.hasAttribute("hidden") && aviso.getAttribute("role") === "status" && Boolean(boton) && boton.tagName === "BUTTON",
      aviso ? aviso.outerHTML.slice(0, 60) : "(no está)"
    );
  }
  // --- Botón de "volver arriba" (lo comparten las dos páginas) ---
  {
    const subir = doc.getElementById("btn-subir");
    comprobar(
      "botón de volver arriba: es un <button>, arranca oculto y lleva etiqueta",
      Boolean(subir) &&
        subir.tagName === "BUTTON" &&
        subir.getAttribute("type") === "button" &&
        subir.hasAttribute("hidden") &&
        Boolean(subir.getAttribute("aria-label")) &&
        Boolean(subir.querySelector('svg[aria-hidden="true"]')),
      subir ? subir.outerHTML.slice(0, 70) : "(no está)"
    );
    comprobar("carga arriba.js (el botón lo comparten las dos páginas)", Boolean(doc.querySelector('script[src="arriba.js"]')));
  }
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

// --- buscador: campo sin texto dentro y ejemplos de búsqueda ---------
console.log("--- index.html (campo de búsqueda y ejemplos) ---");
{
  const doc = new JSDOM(leer("index.html")).window.document;
  const campo = doc.getElementById("search-input");
  const ejemplos = [...doc.querySelectorAll("#search-examples .js-ejemplo")];
  const valores = ejemplos.map((b) => b.dataset.ejemplo);

  comprobar(
    "el campo de búsqueda no lleva texto dentro y sigue teniendo etiqueta accesible",
    Boolean(campo) && !campo.hasAttribute("placeholder") && Boolean(doc.querySelector('label[for="search-input"]')),
    campo ? campo.outerHTML.slice(0, 80) : "(no está)"
  );
  comprobar(
    "los cinco ejemplos de búsqueda son los acordados",
    valores.join(",") === "metformina,paracetamol,trajenta,crestor,662025",
    valores.join(",")
  );
  comprobar(
    "el ejemplo del código nacional es el número a secas (sin «CN»)",
    (ejemplos[4] ? ejemplos[4].textContent.trim() : "") === "662025",
    ejemplos[4] ? ejemplos[4].textContent.trim() : "(no está)"
  );
  comprobar("la ayuda sigue accesible desde el buscador (barra de arriba)", Boolean(doc.querySelector('.topbar a[href="ayuda.html"]')));
  // El buscador va sin pie a propósito (interfaz limpia): el aviso sanitario está
  // en la ayuda y de citar la fuente se encarga el badge del hero.
  comprobar("el buscador no tiene pie (es a propósito)", !doc.querySelector("footer.site-footer"));
  comprobar("y aun sin pie sigue citando la fuente: AEMPS en el badge", doc.body.textContent.includes("AEMPS"));
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
  comprobar("la ayuda sí conserva el pie (fuente de datos y repositorio)", Boolean(doc.querySelector("footer.site-footer")));
  comprobar("aviso sanitario destacado", Boolean(doc.querySelector(".ayuda .aviso")));
  comprobar("tabla de atajos con 4 filas", doc.querySelectorAll(".ayuda-tabla tbody tr").length === 4);
  comprobar("explica el código nacional", doc.body.textContent.includes("código nacional"));
  comprobar("sin marcadores de plantilla", !html.includes("CONTINUA"));
  comprobar("sin <pre>/<textarea> visibles", !doc.querySelector("pre:not(#diag)"));
}

resumen("estructura HTML");
