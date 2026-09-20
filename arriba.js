/*
 * arriba.js
 * Botón de "volver arriba": aparece abajo a la derecha en cuanto se baja por la
 * página y devuelve al principio de la web al pulsarlo.
 *
 * Lo cargan las dos páginas (el buscador y la ayuda: las dos son largas). El
 * botón vive en el HTML de cada una (`#btn-subir`) y aquí sólo se enseña, se
 * oculta y se le da la orden de subir.
 *
 * Tres detalles pensados a propósito:
 *  - es un <button>, así que funciona con teclado y con lectores de pantalla, y
 *    no añade nada a la URL (nada de enlaces "#");
 *  - mientras el botón tiene el foco no se oculta, para no dejar tirado a quien
 *    navega con el teclado justo después de usarlo;
 *  - si el sistema pide menos movimiento (prefers-reduced-motion), se sube de
 *    golpe en vez de con animación.
 */

(function () {
  const boton = document.getElementById("btn-subir");
  if (!boton) return;

  // Se enseña a partir de aquí: bajar una pantalla ya justifica el atajo
  const ALTURA_MINIMA = 400;

  function actualizarBoton() {
    const conFoco = document.activeElement === boton;
    boton.hidden = !conFoco && window.scrollY < ALTURA_MINIMA;
  }

  actualizarBoton();
  // passive: el manejador no cancela el desplazamiento, así que el navegador no
  // espera a que termine
  window.addEventListener("scroll", actualizarBoton, { passive: true });
  window.addEventListener("resize", actualizarBoton);
  // Al salir del botón con el tabulador ya puede ocultarse
  boton.addEventListener("blur", actualizarBoton);

  boton.addEventListener("click", function () {
    const sinAnimacion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: sinAnimacion ? "auto" : "smooth" });
    // Con el foco puesto sigue visible hasta que el usuario se vaya del botón
    actualizarBoton();
  });
})();
