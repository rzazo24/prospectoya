/**
 * tema.js
 * Tema claro/oscuro y su botón en la barra superior.
 *
 * Lo cargan index.html y ayuda.html: la clave de localStorage y el atributo
 * `data-tema` del <html> son los mismos, así que el tema elegido se mantiene al
 * moverse entre la búsqueda y la ayuda.
 *
 * IMPORTANTE: el script en línea del <head> (que aplica el tema antes del primer
 * pintado para que no haya destello) lee esa misma clave. Si se cambia aquí,
 * hay que cambiarla también allí.
 */

const CLAVE_TEMA = "prospectoya-tema";

const themeToggle = document.getElementById("theme-toggle");

/** Tema activo según el atributo del <html> (lo fija el script del <head>). */
function temaActual() {
  return document.documentElement.dataset.tema === "oscuro" ? "oscuro" : "claro";
}

/**
 * Aplica el tema y, opcionalmente, lo recuerda en localStorage.
 * @param {"claro"|"oscuro"} tema
 * @param {boolean} guardar
 */
function aplicarTema(tema, guardar) {
  document.documentElement.dataset.tema = tema;

  // La página puede no tener botón de tema (p. ej. una versión futura sin topbar)
  if (themeToggle) {
    themeToggle.setAttribute("aria-pressed", String(tema === "oscuro"));
    themeToggle.title = tema === "oscuro" ? "Cambiar a tema claro" : "Cambiar a tema oscuro";
  }

  if (guardar) {
    try {
      localStorage.setItem(CLAVE_TEMA, tema);
    } catch (err) {
      // localStorage bloqueado (modo privado): el tema sigue funcionando en la sesión
    }
  }
}

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    aplicarTema(temaActual() === "oscuro" ? "claro" : "oscuro", true);
  });
}

// Estado inicial del botón (el tema ya viene puesto desde el <head>)
aplicarTema(temaActual(), false);
