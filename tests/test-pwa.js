/**
 * Comprueba que la web se puede instalar como app (PWA), que funciona sin
 * conexión y que avisa cuando hay una versión nueva:
 *
 *  - `manifest.webmanifest`: existe, se sirve con su tipo MIME, es JSON válido
 *    y declara lo que pide Chrome para ofrecer la instalación (nombre, arranque,
 *    `display: standalone`, colores y los iconos de 192 y 512 px);
 *  - iconos: se cargan de verdad y miden lo que dice el manifest; los
 *    `maskable` son opacos y llevan la marca dentro del 80% central, que es lo
 *    que recortan los lanzadores al enmascarar el icono (si se sale, se corta
 *    la cápsula);
 *  - `sw.js`: es JavaScript válido, guarda en la cáscara sólo ficheros que
 *    existen y NADA de la API de CIMA (los datos van siempre a la red);
 *  - con Chrome real, tres pasadas y el mismo perfil (ahí viven el registro y
 *    el caché):
 *      1. primera visita: `pwa.js` registra el service worker, éste toma el
 *         control y precachea la cáscara. No se avisa de nada: es la
 *         instalación, no una actualización;
 *      2. versión nueva: se sube `VERSION` en el `sw.js` de la copia temporal y
 *         al volver a la web el service worker nuevo entra solo, borra el caché
 *         anterior y aparece el aviso de "hay una versión nueva" con su botón de
 *         recargar;
 *      3. sin servidor: la página se sigue abriendo (la sirve el service worker
 *         desde su copia), sin avisos falsos.
 *
 * Dos detalles de cómo se mide (por qué no vale lo de las otras suites):
 *  1. el service worker tarda en tiempo real, así que aquí Chrome va SIN
 *     `--virtual-time-budget` (con el reloj virtual no llegaba ni a activarse);
 *  2. para que el volcado del DOM no llegue antes de tiempo, la página incluye
 *     una imagen que apunta a la "compuerta": un servidor que no contesta hasta
 *     que la propia página pide soltarla. La imagen es de otro puerto a
 *     propósito, para que el service worker no la intercepte (si la
 *     interceptara, en la pasada sin conexión fallaría al instante y el volcado
 *     llegaría antes de que la página hubiera medido nada).
 *
 *   cd tests && node test-pwa.js
 */
const fs = require("fs");
const http = require("http");
const path = require("path");
const vm = require("vm");
const { JSDOM, VirtualConsole } = require("jsdom");
const { RAIZ, comprobar, resumen, leer, carpetaTemporal, copiar, navegador, domConChrome, leerDiag, campos, servirHttp, tamanoPng } = require("./util");

/** Lo que copia la suite y precachea el service worker en la carpeta temporal. */
const FICHEROS = [
  "index.html",
  "ayuda.html",
  "styles.css",
  "tema.js",
  "arriba.js",
  "api.js",
  "app.js",
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
];

const ICONOS = [
  { src: "icono-192.png", sizes: "192x192", purpose: "any" },
  { src: "icono-512.png", sizes: "512x512", purpose: "any" },
  { src: "icono-maskable-192.png", sizes: "192x192", purpose: "maskable" },
  { src: "icono-maskable-512.png", sizes: "512x512", purpose: "maskable" },
];


// --- 1. El manifest, como fichero ---------------------------------------
console.log("--- manifest.webmanifest ---");

let manifest = null;
try {
  manifest = JSON.parse(leer("manifest.webmanifest"));
} catch (err) {
  comprobar("es JSON válido", false, err.message);
}

if (manifest) {
  comprobar("es JSON válido", true);
  comprobar("tiene nombre y nombre corto (el del icono, máx. 12)", Boolean(manifest.name) && manifest.short_name.length <= 12, manifest.short_name);
  comprobar("explica qué es (descripción) y está en español", Boolean(manifest.description) && manifest.lang === "es");
  comprobar("arranca en la web (start_url relativa)", manifest.start_url === "./", manifest.start_url);
  comprobar("se abre sin barra de navegador (display standalone)", manifest.display === "standalone", manifest.display);
  comprobar("alcance relativo (funciona también en una subcarpeta)", manifest.scope === "./", manifest.scope);

  // Los colores tienen que ser los tokens de styles.css: si cambia la paleta,
  // este test obliga a actualizar el manifest y los <meta theme-color>.
  const css = leer("styles.css");
  const fondos = [...css.matchAll(/--bg:\s*(#[0-9a-f]{6});/g)].map((m) => m[1]);
  comprobar("el color de tema es --brand de styles.css", css.includes(`--brand: ${manifest.theme_color};`), manifest.theme_color);
  comprobar("el color de fondo es --bg del tema claro", manifest.background_color === fondos[0], `${manifest.background_color} frente a ${fondos[0]}`);
  comprobar(
    "los theme-color de las páginas son --brand y el --bg del tema oscuro",
    ["index.html", "ayuda.html"].every((f) => {
      const metas = [...leer(f).matchAll(/<meta name="theme-color" content="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
      return metas.join(" ") === `${manifest.theme_color} ${fondos[1]}`;
    }),
    `${manifest.theme_color} y ${fondos[1]}`
  );
}

// --- 2. Los iconos del manifest -----------------------------------------
console.log("--- iconos del manifest ---");
{
  const iconos = (manifest && manifest.icons) || [];
  comprobar("declara los 4 iconos (192 y 512, normal y maskable)", iconos.length === 4, String(iconos.length));

  for (const esperado of ICONOS) {
    const icono = iconos.find((i) => i.src === esperado.src);

    if (!icono) {
      comprobar(`está declarado ${esperado.src}`, false);
      continue;
    }

    const ruta = path.join(RAIZ, icono.src);
    const tam = fs.existsSync(ruta) ? tamanoPng(ruta) : null;
    comprobar(
      `${esperado.src} (${esperado.purpose}): existe, es PNG y mide lo que dice`,
      Boolean(tam) && tam.ancho === tam.alto && `${tam.ancho}x${tam.alto}` === icono.sizes && icono.type === "image/png",
      tam ? `${tam.ancho}x${tam.alto} (declarado ${icono.sizes})` : "(no existe o no es PNG)"
    );
  }
}


// --- 3. El service worker, como fichero ---------------------------------
console.log("--- sw.js ---");
const sw = leer("sw.js");

/** La versión que declara sw.js (la suite la lee para comprobarla). */
const VERSION_SW = (sw.match(/const VERSION = "([^"]+)";/) || [])[1];
{
  let errorSw = null;
  try {
    new vm.Script(sw);
  } catch (err) {
    errorSw = err.message;
  }

  comprobar("es JavaScript válido", errorSw === null, errorSw || "");
  comprobar(
    "atiende install, activate y fetch",
    ["install", "activate", "fetch"].every((evento) => sw.includes(`self.addEventListener("${evento}"`))
  );
  comprobar("lleva la versión en el nombre del caché (para poder subirla)", /const VERSION = "[^"]+";/.test(sw) && sw.includes("`prospectoya-${VERSION}`"));
  comprobar("la versión nueva entra sin esperar a cerrar la pestaña (skipWaiting)", sw.includes("self.skipWaiting()"));
  comprobar("toma el control de lo que ya está abierto (clients.claim)", sw.includes("self.clients.claim()"));
  comprobar("sabe decir su versión si se la preguntan", sw.includes('addEventListener("message"') && sw.includes('tipo: "version"'));

  const lista = (sw.match(/const APP_SHELL = \[([\s\S]*?)\];/) || [])[1] || "";
  const recursos = [...lista.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const faltan = recursos.filter((r) => r !== "./" && !fs.existsSync(path.join(RAIZ, r)));

  comprobar(
    "la cáscara trae las dos páginas, los estilos y el JS",
    ["index.html", "ayuda.html", "styles.css", "app.js", "tema.js", "pwa.js", "manifest.webmanifest"].every((f) => recursos.includes(f)),
    recursos.join(" ")
  );
  comprobar("todos los ficheros de la cáscara existen en el repo", faltan.length === 0, faltan.join(", "));
  comprobar("la lista de la cáscara no ha cambiado sin querer", recursos.length === 18, String(recursos.length));
  comprobar("los iconos del manifest están en la cáscara", ICONOS.every((i) => recursos.includes(i.src)));
  comprobar("nada de otros orígenes (sólo ficheros propios)", !recursos.some((r) => /^https?:/i.test(r)));
  comprobar("no cachea ni intercepta la API de CIMA (los datos van siempre a la red)", !/cima\.aemps\.es/.test(sw));
  comprobar("no se mete con las suites de tests/", sw.includes("tests/"));
}

// --- 4. El aviso de versión nueva, con el pwa.js de verdad --------------
// Con jsdom se puede simular un cambio de versión sin depender de lo que tarde
// Chrome en activar un service worker nuevo (que, además, no activa mientras la
// página no ha terminado de cargar: eso hace imposible medirlo en las pasadas
// por Chrome, donde sí se comprueba todo lo demás).
console.log("--- aviso de versión nueva (pwa.js en jsdom) ---");

const avisoListo = (async () => {
  const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

  // Service worker de mentira: pwa.js sólo necesita registrar, preguntar la
  // versión por un MessageChannel y escuchar el cambio de control.
  const canalFalso = () => {
    const port1 = { onmessage: null };
    const port2 = {
      postMessage: (datos) => setTimeout(() => port1.onmessage && port1.onmessage({ data: datos }), 0),
    };
    return { port1, port2 };
  };

  const estado = { version: "v1", update: 0, registrar: 0, preguntas: 0, oyentes: [] };

  const serviceWorkerFalso = {
    get controller() {
      return {
        postMessage: (datos, puertos) => {
          estado.preguntas++;
          puertos[0].postMessage({ tipo: "version", version: estado.version });
        },
      };
    },
    register: async () => {
      estado.registrar++;
      return {
        update: async () => {
          estado.update++;
          return {};
        },
        addEventListener() {},
      };
    },
    addEventListener: (tipo, fn) => estado.oyentes.push(fn),
  };

  const errores = [];
  const consola = new VirtualConsole();
  consola.on("jsdomError", (err) => errores.push(err.message));

  const html = leer("index.html")
    .replace(/<script src="(tema|api|app)\.js"><\/script>/g, "")
    .replace('<script src="pwa.js"></script>', `<script>${leer("pwa.js")}</script>`);

  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "https://prospectoya.test/",
    virtualConsole: consola,
    beforeParse(window) {
      window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      window.MessageChannel = function () {
        const canal = canalFalso();
        this.port1 = canal.port1;
        this.port2 = canal.port2;
      };
      Object.defineProperty(window.navigator, "serviceWorker", { value: serviceWorkerFalso, configurable: true });
    },
  });

  const aviso = () => dom.window.document.getElementById("aviso-version");
  const cambiarControl = (versionNueva) => {
    estado.version = versionNueva;
    estado.oyentes.forEach((fn) => fn());
  };

  /** Espera a que se cumpla algo (los avisos llegan por promesas). */
  const hastaQue = async (condicion, ms = 2000) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      if (condicion()) return true;
      await esperar(10);
    }
    return false;
  };

    comprobar("el aviso arranca oculto", aviso().hidden === true);
    comprobar("pwa.js registra el service worker", await hastaQue(() => estado.registrar === 1), String(estado.registrar));
    comprobar(
      "y pregunta a mano si hay versión nueva (no espera 24 h)",
      await hastaQue(() => estado.update >= 1) && await hastaQue(() => estado.preguntas >= 1),
      `update=${estado.update} preguntas=${estado.preguntas}`
    );

    // Cambio de control sin cambio de versión: pasa de verdad (el navegador
    // reactiva o reclama la página), y no debe avisar de nada.
    cambiarControl("v1");
    await hastaQue(() => estado.preguntas >= 2);
    comprobar("un cambio de control sin versión nueva NO avisa", aviso().hidden === true);

    // Cambio de versión de verdad
    cambiarControl("v2");
    await hastaQue(() => estado.preguntas >= 3);
    await esperar(20);
    comprobar("un cambio de versión de verdad avisa", aviso().hidden === false);
    comprobar("y el aviso lleva el botón de recargar", dom.window.document.getElementById("recargar-version").textContent.trim() === "Recargar");

    // El botón recarga la página (jsdom no navega: lo anota como "no
    // implementado", que es justo lo que se comprueba)
    errores.length = 0;
    dom.window.document.getElementById("recargar-version").click();
    await hastaQue(() => errores.length > 0);
    comprobar(
      "el botón pide recargar la página",
      errores.some((m) => /not implemented/i.test(m) && /navigation|reload/i.test(m)),
      errores.join(" | ")
    );

  dom.window.close();
})().catch((err) => comprobar("la prueba del aviso termina sin errores", false, err.message));


// --- 5. Con Chrome real -------------------------------------------------
if (!navegador()) {
  console.log("OMITIDO: no encuentro Chrome/Chromium (define la variable CHROME con la ruta al ejecutable).");
  console.log("(las comprobaciones de ficheros y del aviso ya se han hecho)");
  avisoListo.then(() => resumen("PWA"));
  return;
}

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/**
 * Servidor "compuerta": no contesta a `/__espera` hasta que la página pide
 * `/__soltar` (o pasan 20 s, para no colgar nada).
 *
 * Se sirve desde OTRO puerto a propósito: así la imagen de la compuerta es de
 * otro origen, el service worker no la intercepta y en la pasada sin conexión
 * sigue funcionando (si fuera del mismo origen, la interceptaría, fallaría al
 * instante y el volcado del DOM llegaría antes de que la página midiera nada).
 */
function servirCompuerta(msMaximo = 20000) {
  let pendientes = [];
  let alarma = null;

  const soltar = () => {
    clearTimeout(alarma);
    alarma = null;
    const esperando = pendientes;
    pendientes = [];
    esperando.forEach((responder) => responder());
  };

  const servidor = http.createServer((peticion, respuesta) => {
    const ruta = (peticion.url || "/").split("?")[0];

    if (ruta === "/__espera") {
      pendientes.push(() => {
        respuesta.writeHead(200, { "Content-Type": "image/gif", Connection: "close" });
        respuesta.end(PIXEL);
      });
      clearTimeout(alarma);
      alarma = setTimeout(soltar, msMaximo);
      alarma.unref();
      return;
    }

    if (ruta === "/__soltar") {
      soltar();
      respuesta.writeHead(204, { Connection: "close" });
      respuesta.end();
      return;
    }

    respuesta.writeHead(404, { Connection: "close" });
    respuesta.end("404");
  });

  return new Promise((resolver) => {
    servidor.listen(0, "127.0.0.1", () => {
      resolver({
        url: `http://127.0.0.1:${servidor.address().port}`,
        cerrar: () => {
          soltar();
          servidor.close();
          if (typeof servidor.closeAllConnections === "function") servidor.closeAllConnections();
        },
      });
    });
  });
}

/**
 * La página que se mide en Chrome: el index.html (o ayuda.html) del proyecto con
 * este trozo al final. Mide con la API del navegador —manifest, iconos por
 * canvas, service worker, cachés y los dos avisos— y, cuando ya lo tiene todo,
 * suelta la compuerta.
 */
const driver = (soltar, esperar) => `
  <pre id="diag" style="display:none"></pre>
  <script>
    const diag = document.getElementById("diag");
    const log = (m) => { diag.textContent += m + "\\n"; };
    const espera = (ms) => new Promise((listo) => setTimeout(listo, ms));

    const avisoConexion = document.getElementById("aviso-conexion");
    const avisoVersion = document.getElementById("aviso-version");
    const botonRecargar = document.getElementById("recargar-version");
    const enlace = document.querySelector('link[rel="manifest"]');
    const haySw = "serviceWorker" in navigator;

    // Si la página ya venía controlada por un service worker, un cambio de
    // control es una versión nueva. Se apunta desde el principio, que puede
    // pasar en cualquier momento.
    const veniaControlada = haySw && Boolean(navigator.serviceWorker.controller);
    const cambioDeControl = new Promise((listo) => {
      if (!veniaControlada) {
        listo("no aplica");
        return;
      }
      navigator.serviceWorker.addEventListener("controllerchange", () => listo("si"));
    });

    log("url=" + location.href);
    log("pagina=" + (document.querySelector(".ayuda") ? "ayuda" : document.querySelector(".hero") ? "buscador" : "otra"));
    log("manifest_declarado=" + (enlace ? enlace.getAttribute("href") : "(ninguno)"));
    log("venia_controlada=" + (veniaControlada ? "si" : "no"));
    log("conexion_oculta_de_salida=" + (avisoConexion ? avisoConexion.hidden : "(no está)"));
    log("version_oculta_de_salida=" + (avisoVersion ? avisoVersion.hidden : "(no está)"));
    log("version_boton=" + (botonRecargar ? botonRecargar.textContent.trim() : "(no está)"));

    /** Insiste con fn() hasta que devuelva algo o se agote el tiempo. */
    async function hastaQue(fn, ms) {
      const fin = Date.now() + ms;
      while (Date.now() < fin) {
        const valor = await fn();
        if (valor) return valor;
        await espera(100);
      }
      return null;
    }

    /** Carga un icono en un canvas y mira los píxeles de verdad. */
    function medirIcono(src) {
      return new Promise((listo) => {
        const img = new Image();
        img.onload = () => {
          const lienzo = document.createElement("canvas");
          lienzo.width = img.naturalWidth;
          lienzo.height = img.naturalHeight;
          const ctx = lienzo.getContext("2d");
          ctx.drawImage(img, 0, 0);
          const datos = ctx.getImageData(0, 0, lienzo.width, lienzo.height).data;
          const centro = (lienzo.width - 1) / 2;
          let transparentes = 0;
          let marca = 0;
          let marcaFuera = 0;

          for (let y = 0; y < lienzo.height; y++) {
            for (let x = 0; x < lienzo.width; x++) {
              const i = (y * lienzo.width + x) * 4;
              if (datos[i + 3] < 255) transparentes++;
              // La marca es la cápsula blanca del logo
              if (datos[i + 3] > 128 && datos[i] > 200 && datos[i + 1] > 200 && datos[i + 2] > 200) {
                marca++;
                if (Math.hypot(x - centro, y - centro) > 0.4 * lienzo.width) marcaFuera++;
              }
            }
          }

          listo([img.naturalWidth + "x" + img.naturalHeight, transparentes, marca, marcaFuera].join(" "));
        };
        img.onerror = () => listo("no carga");
        img.src = src;
      });
    }

    /** Pregunta al service worker en marcha qué versión lleva. */
    function pedirVersion(trabajador) {
      return new Promise((listo) => {
        if (!trabajador) {
          listo("(sin control)");
          return;
        }
        const canal = new MessageChannel();
        canal.port1.onmessage = (evento) => listo((evento.data && evento.data.version) || "(sin respuesta)");
        trabajador.postMessage({ tipo: "version" }, [canal.port2]);
        setTimeout(() => listo("(sin respuesta)"), 3000);
      });
    }

    (async () => {
      // 1) ¿Hay red de verdad? (en la pasada sin conexión el servidor está apagado)
      let red = "?";
      try {
        const prueba = await fetch("/sin-cache-" + Date.now() + ".txt");
        red = prueba.ok ? "viva" : "responde";
      } catch (err) {
        red = "caida";
      }
      log("red=" + red);

      // 2) El manifest, como lo ve el navegador (tipo MIME incluido)
      try {
        const respuesta = await fetch(enlace.getAttribute("href"));
        log("manifest_http=" + respuesta.status);
        log("manifest_tipo=" + (respuesta.headers.get("content-type") || "").split(";")[0].trim());
        const datos = await respuesta.json();
        log("manifest_nombre=" + datos.name);
        log("manifest_display=" + datos.display);
        log("manifest_start_url=" + datos.start_url);
        log("manifest_iconos=" + (datos.icons || []).length);
      } catch (err) {
        log("manifest_http=error");
      }

      // 3) Los iconos del manifest, píxel a píxel
      const iconos = [
        ["normal192", "icono-192.png"],
        ["normal512", "icono-512.png"],
        ["maskable192", "icono-maskable-192.png"],
        ["maskable512", "icono-maskable-512.png"],
      ];
      for (const [clave, src] of iconos) {
        log("icono_" + clave + "=" + (await medirIcono(src)));
      }

      // 4) El service worker: lo registra pwa.js al terminar de cargar
      log("sw_soportado=" + haySw);
      if (haySw) {
        const registro = await hastaQue(() => navigator.serviceWorker.getRegistration(), 10000);
        log("sw_registrado=" + (registro ? "si" : "no"));

        if (registro) {
          const activo = await Promise.race([navigator.serviceWorker.ready.then(() => true), espera(10000).then(() => false)]);
          // "activating" -> "activated": se espera a que termine de activarse
          await hastaQue(() => registro.active && registro.active.state === "activated", 5000);
          log("sw_activo=" + (activo ? (registro.active ? registro.active.state : "(sin activar)") : "no llega"));
          log("sw_script=" + (registro.active ? new URL(registro.active.scriptURL).pathname : "(sin script)"));
          log("sw_alcance=" + new URL(registro.scope).pathname);

          // En la primera visita el service worker toma el control con
          // clients.claim(); eso también dispara controllerchange.
          if (!navigator.serviceWorker.controller) {
            await Promise.race([
              new Promise((listo) => navigator.serviceWorker.addEventListener("controllerchange", () => listo(), { once: true })),
              espera(5000),
            ]);
          }
          log("sw_controla=" + (navigator.serviceWorker.controller ? "si" : "no"));
          log("sw_version=" + (await pedirVersion(navigator.serviceWorker.controller)));

          try {
            const nombres = await caches.keys();
            const propio = nombres.find((n) => n.startsWith("prospectoya-")) || "";
            log("cache_nombres=" + nombres.join(","));
            log("cache_version=" + (propio ? propio.replace("prospectoya-", "") : "(ninguno)"));
            const claves = propio ? (await (await caches.open(propio)).keys()).map((p) => new URL(p.url).pathname) : [];
            log("cache_entradas=" + claves.length);
            log("cache_index=" + (claves.includes("/index.html") || claves.includes("/") ? "si" : "no"));
            log("cache_ayuda=" + (claves.includes("/ayuda.html") ? "si" : "no"));
            log("cache_css=" + (claves.includes("/styles.css") ? "si" : "no"));
            log("cache_aemps=" + claves.filter((c) => /aemps/i.test(c)).length);
          } catch (err) {
            log("cache_nombres=(error " + err.message + ")");
          }
        }
      }

      // 5) Versión nueva: con red se espera al cambio de control y se mira el
      //    aviso (sin red no hay comprobación de actualización posible)
      if (red === "caida") {
        log("version_cambio=sin red");
      } else {
        log("version_cambio=" + (await Promise.race([cambioDeControl, espera(15000).then(() => "no llega")])));
      }
      log("version_aviso=" + (avisoVersion ? (avisoVersion.hidden ? "oculto" : "visible") : "(no está)"));

      // 6) Aviso de "sin conexión": lo gobiernan los eventos del navegador
      window.dispatchEvent(new Event("offline"));
      log("conexion_offline=" + (avisoConexion ? (avisoConexion.hidden ? "oculta" : "visible") : "(no está)"));
      window.dispatchEvent(new Event("online"));
      log("conexion_online=" + (avisoConexion ? (avisoConexion.hidden ? "oculta" : "visible") : "(no está)"));

      log("listo=si");
      // Ya está todo medido: que la compuerta suelte la página
      try {
        await fetch("${soltar}", { mode: "no-cors" });
      } catch (err) {
        // Si la compuerta no está, no pasa nada: se suelta sola por tiempo
      }
    })();
  </script>
  <img src="${esperar}" width="1" height="1" alt="">
`;

// --- 6. Las dos pasadas por Chrome --------------------------------------
(async () => {
  await avisoListo;

  const sitio = carpetaTemporal("pwa");
  copiar(sitio, FICHEROS);

  const compuerta = await servirCompuerta();
  const { url, cerrar } = await servirHttp(sitio);
  const trozo = driver(`${compuerta.url}/__soltar`, `${compuerta.url}/__espera`);

  // Las dos páginas se sirven con el driver al final (y con la compuerta)
  for (const fichero of ["index.html", "ayuda.html"]) {
    fs.writeFileSync(path.join(sitio, fichero), leer(fichero).replace("</body>", `${trozo}</body>`));
  }

  // Mismo perfil en las tres pasadas: ahí viven el registro y el caché
  const perfil = path.join(sitio, "perfil-chrome");
  const medir = async (ruta) => campos(leerDiag(await domConChrome(`${url}${ruta}`, { perfil, presupuesto: 0, tiempoMaximo: 90000 })));
  const icono = (datos, clave) => (datos[`icono_${clave}`] || "").split(" ");

  try {
    // --- Pasada 1: primera visita ---------------------------------------
    console.log("--- pasada 1: primera visita (index.html) ---");
    const uno = await medir("/index.html");

    comprobar("la página se mide entera (no se queda a medias)", uno.listo === "si", Object.keys(uno).join(" "));
    comprobar("es el buscador", uno.pagina === "buscador", uno.pagina);
    comprobar("declara el manifest", uno.manifest_declarado === "manifest.webmanifest", uno.manifest_declarado);
    comprobar(
      "el manifest se sirve con su tipo MIME (HTTP 200, application/manifest+json)",
      uno.manifest_http === "200" && uno.manifest_tipo === "application/manifest+json",
      `${uno.manifest_http} ${uno.manifest_tipo}`
    );
    comprobar(
      "el navegador sabe qué app es (nombre, standalone y arranque)",
      Boolean(uno.manifest_nombre) && uno.manifest_display === "standalone" && uno.manifest_start_url === "./",
      `${uno.manifest_nombre} / ${uno.manifest_display} / ${uno.manifest_start_url}`
    );
    comprobar("declara los 4 iconos", uno.manifest_iconos === "4", uno.manifest_iconos);

    comprobar("el icono normal de 192 carga y mide 192x192", icono(uno, "normal192")[0] === "192x192", icono(uno, "normal192")[0]);
    comprobar("el icono normal tiene las esquinas redondeadas (transparentes)", Number(icono(uno, "normal192")[1]) > 0, icono(uno, "normal192")[1]);
    comprobar("el icono normal de 512 carga y mide 512x512", icono(uno, "normal512")[0] === "512x512", icono(uno, "normal512")[0]);
    comprobar("el icono maskable de 192 carga y mide 192x192", icono(uno, "maskable192")[0] === "192x192", icono(uno, "maskable192")[0]);
    comprobar("el maskable no tiene ni un píxel transparente (fondo a sangre)", Number(icono(uno, "maskable512")[1]) === 0, icono(uno, "maskable512")[1]);
    comprobar(
      "la marca del maskable cabe en la zona segura (no la corta la máscara del lanzador)",
      Number(icono(uno, "maskable512")[2]) > 0 && Number(icono(uno, "maskable512")[3]) === 0,
      `marca=${icono(uno, "maskable512")[2]} fuera=${icono(uno, "maskable512")[3]}`
    );

    comprobar("el navegador soporta service workers", uno.sw_soportado === "true", uno.sw_soportado);
    comprobar("pwa.js lo registra por su cuenta (no lo hace el test)", uno.sw_registrado === "si", uno.sw_registrado);
    comprobar("queda activo", uno.sw_activo === "activated", uno.sw_activo);
    comprobar("es el sw.js de la raíz y con alcance en la raíz", uno.sw_script === "/sw.js" && uno.sw_alcance === "/", `${uno.sw_script} ${uno.sw_alcance}`);
    comprobar("toma el control de la página abierta (clients.claim)", uno.sw_controla === "si", uno.sw_controla);
    comprobar("el service worker en marcha dice su versión", uno.sw_version === VERSION_SW, uno.sw_version);
    comprobar("la página no venía controlada: es instalación, no actualización", uno.venia_controlada === "no", uno.venia_controlada);
    comprobar("guarda el caché con la versión en el nombre", (uno.cache_nombres || "").startsWith(`prospectoya-${VERSION_SW}`), uno.cache_nombres);
    comprobar("la cáscara queda precacheada", Number(uno.cache_entradas) >= 18, uno.cache_entradas);
    comprobar(
      "con las dos páginas y los estilos dentro",
      uno.cache_index === "si" && uno.cache_ayuda === "si" && uno.cache_css === "si",
      `index=${uno.cache_index} ayuda=${uno.cache_ayuda} css=${uno.cache_css}`
    );
    comprobar("y con nada de la API de CIMA", uno.cache_aemps === "0", uno.cache_aemps);
    comprobar("no avisa de versión nueva en la primera visita", uno.version_aviso === "oculto", uno.version_aviso);
    comprobar("los dos avisos arrancan ocultos", uno.conexion_oculta_de_salida === "true" && uno.version_oculta_de_salida === "true");
    comprobar("el aviso de conexión aparece al quedarse sin red", uno.conexion_offline === "visible", uno.conexion_offline);
    comprobar("y desaparece al volver", uno.conexion_online === "oculta", uno.conexion_online);

    // --- Pasada 2: sin servidor ------------------------------------------
    // Se apaga el servidor del sitio: sólo queda el service worker (y la
    // compuerta, que va por otro puerto).
    cerrar();

    console.log("--- pasada 2: sin servidor (ayuda.html) ---");
    const tres = await medir("/ayuda.html?paso=2");

    comprobar("sin servidor, la red está caída de verdad", tres.red === "caida", tres.red);
    comprobar("la página de ayuda se abre igual (la sirve el service worker)", tres.pagina === "ayuda", tres.pagina);
    comprobar("y llega entera: la página termina de medirse", tres.listo === "si", Object.keys(tres).join(" "));
    comprobar("el service worker controla la página", tres.sw_controla === "si", tres.sw_controla);
    comprobar("sigue siendo el mismo service worker", tres.sw_version === VERSION_SW, tres.sw_version);
    comprobar("el manifest sale de la copia guardada (HTTP 200)", tres.manifest_http === "200", tres.manifest_http);
    comprobar(
      "los iconos se cargan sin red",
      icono(tres, "maskable512")[0] === "512x512" && Number(icono(tres, "maskable512")[1]) === 0,
      tres.icono_maskable512
    );
    comprobar("sigue sin guardarse nada de la API de CIMA", tres.cache_aemps === "0", tres.cache_aemps);
    comprobar(
      "sin red no avisa de versión nueva (no ha podido comprobarlo)",
      tres.version_cambio === "sin red" && tres.version_aviso === "oculto",
      `${tres.version_cambio} / ${tres.version_aviso}`
    );
    comprobar(
      "el aviso de conexión funciona igual sin red",
      tres.conexion_offline === "visible" && tres.conexion_online === "oculta",
      `${tres.conexion_offline} / ${tres.conexion_online}`
    );
  } finally {
    cerrar();
    compuerta.cerrar();
  }

  resumen("PWA (instalable, sin conexión y con aviso de versión)");
})();

