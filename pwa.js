/*
 * pwa.js
 * Lo que hace instalable la web: registra el service worker (sw.js, que guarda
 * una copia de la "cáscara" para que abra al instante y también sin conexión),
 * avisa cuando no hay conexión y avisa cuando se ha publicado una versión nueva.
 *
 * Lo cargan las dos páginas. Si el navegador no soporta service workers no pasa
 * nada: la web funciona igual, sólo que sin copia guardada ni avisos.
 */

(function () {
  const avisoConexion = document.getElementById("aviso-conexion");
  const avisoVersion = document.getElementById("aviso-version");
  const botonRecargar = document.getElementById("recargar-version");

  // --- Aviso de "sin conexión" ---
  // El texto vive en el HTML de cada página; aquí sólo se enseña u oculta.
  function actualizarConexion(sinConexion) {
    if (avisoConexion) avisoConexion.hidden = !sinConexion;
  }

  actualizarConexion(!navigator.onLine);
  window.addEventListener("offline", function () {
    actualizarConexion(true);
  });
  window.addEventListener("online", function () {
    actualizarConexion(false);
  });

  // --- Recargar cuando hay versión nueva ---
  // No se recarga sola: decidir cuándo hacerlo es del usuario (puede estar
  // leyendo un prospecto).
  if (botonRecargar) {
    botonRecargar.addEventListener("click", function () {
      location.reload();
    });
  }

  // --- Service worker ---
  if (!("serviceWorker" in navigator)) return;

  /**
   * Pregunta al service worker en marcha qué versión lleva (sw.js responde).
   * Devuelve null si no contesta.
   */
  function pedirVersion(trabajador) {
    return new Promise(function (listo) {
      if (!trabajador) {
        listo(null);
        return;
      }

      const canal = new MessageChannel();
      const plazo = setTimeout(function () {
        listo(null);
      }, 3000);

      canal.port1.onmessage = function (evento) {
        clearTimeout(plazo);
        listo((evento.data && evento.data.version) || null);
      };

      trabajador.postMessage({ tipo: "version" }, [canal.port2]);
    });
  }

  let versionConocida = null;

  // --- Aviso de versión nueva ---
  // Un cambio de control no basta para avisar: el navegador también lo hace al
  // reactivar el worker o al reclamar la página sin que haya nada nuevo. Se
  // avisa sólo si la versión que manda ahora es distinta de la del principio.
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    pedirVersion(navigator.serviceWorker.controller).then(function (versionNueva) {
      if (!avisoVersion || !versionNueva) return;

      if (!versionConocida) {
        // Primera instalación (la página no venía controlada): no hay nada que
        // avisar, sólo apuntar la versión que acaba de entrar.
        versionConocida = versionNueva;
        return;
      }

      if (versionNueva !== versionConocida) avisoVersion.hidden = false;
    });
  });

  // Al tener el DOM listo (no se espera a las imágenes: eso retrasaría la
  // instalación y no aporta nada). El readyState se mira porque este script
  // podría cargarse más tarde con defer/async.
  function registrar() {
    navigator.serviceWorker
      .register("sw.js")
      .then(function (registro) {
        // Primero se apunta qué versión manda ahora mismo; sólo después se
        // busca si hay una nueva (si no, el aviso podría llegar antes que el
        // dato y no se daría por bueno).
        return pedirVersion(navigator.serviceWorker.controller).then(function (version) {
          versionConocida = version;

          // El navegador sólo busca versiones nuevas por su cuenta cada 24 h,
          // así que se pregunta a mano: al abrir y al volver a la pestaña. Es
          // una petición condicional (casi siempre responde 304) y no bloquea.
          registro.update().catch(function () {
            // Sin conexión, o el servidor caído: no hay nada que hacer
          });

          document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "visible") {
              registro.update().catch(function () {});
            }
          });
        });
      })
      .catch(function (err) {
        // Sin service worker la web sigue funcionando (sólo pierde la copia
        // guardada y los avisos), así que esto es un aviso y no un error.
        console.warn("pwa.js: no he podido registrar el service worker:", err);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", registrar);
  } else {
    registrar();
  }
})();

