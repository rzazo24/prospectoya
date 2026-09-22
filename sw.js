/*
 * sw.js — service worker de ProspectoYa.
 *
 * Qué guarda: sólo la "cáscara" de la web (las dos páginas, los estilos, el JS
 * propio, el manifest y los iconos), para que abra al instante en las visitas
 * siguientes y también sin conexión.
 *
 * Qué NO guarda: nada de la API de CIMA. Los datos de medicamentos van siempre
 * directos a la red —son de la AEMPS y tienen que estar frescos—, así que sin
 * conexión la web se abre igual, pero las búsquedas dan error (y la página
 * avisa con el cartel de "sin conexión", ver pwa.js).
 *
 * Estrategia:
 *  - Navegación (abrir una página): primero la red y, si falla, la copia
 *    guardada. Así, con conexión, siempre se ve lo último publicado.
 *  - Resto de ficheros propios: se sirve la copia guardada y se pide una
 *    versión nueva en segundo plano. No hay que rehacer nada a mano: los
 *    cambios entran en la visita siguiente.
 *
 * Si se cambia la lista APP_SHELL hay que subir VERSION: el caché lleva la
 * versión en el nombre, y al activarse el service worker nuevo borra los
 * anteriores.
 */

const VERSION = "v18";
const CACHE = `prospectoya-${VERSION}`;

/** La cáscara: todo lo que hace falta para abrir la web sin conexión. */
const APP_SHELL = [
  "./",
  "index.html",
  "ayuda.html",
  "styles.css",
  "tema.js",
  "arriba.js",
  "api.js",
  "app.js",
  "pwa.js",
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

/** Carpeta donde vive la web: "/" en Vercel, la subcarpeta si se sirve ahí. */
const RAIZ = new URL(self.registration.scope).pathname;

/**
 * Descarga los ficheros de la cáscara. Uno que falle no tumba el resto (mejor
 * una copia incompleta que un service worker que no llega a activarse).
 */
async function guardarCascara() {
  const cache = await caches.open(CACHE);
  const fallos = [];

  await Promise.all(
    APP_SHELL.map(async (recurso) => {
      try {
        // cache: "reload" ignora el caché HTTP: se guarda lo recién publicado.
        await cache.add(new Request(recurso, { cache: "reload" }));
      } catch (err) {
        fallos.push(recurso);
      }
    })
  );

  if (fallos.length) console.warn(`sw.js: no he podido guardar: ${fallos.join(", ")}`);
}

self.addEventListener("install", (event) => {
  // skipWaiting: la versión nueva entra sin esperar a que se cierren las
  // pestañas abiertas. Es seguro porque esta web no tiene estado en memoria
  // que mezclar (las páginas ya cargadas siguen igual hasta que se recarguen).
  event.waitUntil(guardarCascara().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Fuera los cachés de versiones anteriores
      const nombres = await caches.keys();
      await Promise.all(
        nombres
          .filter((nombre) => nombre.startsWith("prospectoya-") && nombre !== CACHE)
          .map((nombre) => caches.delete(nombre))
      );
      // Y toma el control de las pestañas ya abiertas
      await self.clients.claim();
    })()
  );
});

/**
 * La página puede preguntar qué versión está en marcha (pwa.js lo hace para
 * avisar de versión nueva sólo cuando la versión ha cambiado de verdad: hay
 * cambios de control que no son una actualización).
 */
self.addEventListener("message", (event) => {
  const datos = event.data || {};
  if (datos.tipo !== "version") return;

  const respuesta = { tipo: "version", version: VERSION };
  if (event.ports && event.ports[0]) event.ports[0].postMessage(respuesta);
  else if (event.source) event.source.postMessage(respuesta);
});

self.addEventListener("fetch", (event) => {
  const peticion = event.request;
  if (peticion.method !== "GET") return;
  const url = new URL(peticion.url);

  // La API de CIMA —y cualquier otro origen— va directa a la red: no se
  // intercepta ni se guarda. Tampoco se tocan las suites de tests/.
  if (url.origin !== self.location.origin || url.pathname.startsWith(`${RAIZ}tests/`)) return;

  event.respondWith(peticion.mode === "navigate" ? redPrimero(peticion) : cacheConRevalidacion(peticion));
});

/** Con conexión, la página recién publicada; sin ella, la copia guardada. */
async function redPrimero(peticion) {
  try {
    const respuesta = await fetch(peticion);
    if (respuesta && respuesta.ok) {
      const cache = await caches.open(CACHE);
      cache.put(peticion, respuesta.clone());
    }
    return respuesta;
  } catch (err) {
    const guardada = await caches.match(peticion, { ignoreSearch: true });
    return guardada || (await caches.match("index.html")) || Response.error();
  }
}

/** La copia guardada (instantánea) y, a la vez, se pide una versión nueva. */
async function cacheConRevalidacion(peticion) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(peticion, { ignoreSearch: true });

  const enRed = fetch(peticion)
    .then((respuesta) => {
      if (respuesta && respuesta.ok && respuesta.type === "basic") {
        cache.put(peticion, respuesta.clone());
      }
      return respuesta;
    })
    .catch(() => null);

  return guardada || (await enRed) || Response.error();
}
