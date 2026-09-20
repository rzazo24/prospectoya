/**
 * Comprueba el botón de "volver arriba" con Chrome real, en las dos páginas:
 *
 *  - arranca oculto y aparece al bajar por la página;
 *  - al pulsarlo pide subir al principio, sin recargar ni cambiar la URL;
 *  - mientras tiene el foco no se oculta (para no dejar tirado a quien navega
 *    con el teclado) y se oculta al salir de él;
 *  - si el sistema pide menos movimiento, sube de golpe en vez de con animación;
 *  - cuando está el aviso de "versión nueva" abajo, se aparta para no taparlo.
 *
 * Lo que se comprueba no es dónde acaba la página (una animación no es cosa de
 * un test), sino **qué se le pide a la ventana**: el driver espía
 * `window.scrollTo` y anota `top` y `behavior`.
 *
 *   cd tests && node test-arriba.js
 */
const fs = require("fs");
const path = require("path");
const { comprobar, resumen, leer, carpetaTemporal, copiar, navegador, domConChrome, leerDiag, campos, servirHttp } = require("./util");

if (!navegador()) {
  console.log("OMITIDO: no encuentro Chrome/Chromium (define la variable CHROME con la ruta al ejecutable)");
  process.exit(0);
}

const FICHEROS = ["index.html", "ayuda.html", "styles.css", "tema.js", "arriba.js", "api.js", "app.js", "pwa.js", "favicon.svg"];

const DRIVER = `
  <pre id="diag" style="display:none"></pre>
  <script>
    const diag = document.getElementById("diag");
    const log = (m) => { diag.textContent += m + "\\n"; };
    const espera = (ms) => new Promise((listo) => setTimeout(listo, ms));

    const boton = document.getElementById("btn-subir");
    const avisoVersion = document.getElementById("aviso-version");

    log("boton=" + (boton ? "si" : "no"));
    log("etiqueta=" + (boton ? boton.getAttribute("aria-label") : "(no está)"));
    log("oculto_de_salida=" + (boton ? boton.hidden : "(no está)"));

    if (boton) {
      // Se apunta lo que se le pide a la ventana: así no depende de si la
      // animación de subida termina o no
      const pedidos = [];
      const original = window.scrollTo.bind(window);
      window.scrollTo = (opciones, y) => {
        pedidos.push(typeof opciones === "object" ? "top=" + opciones.top + " behavior=" + opciones.behavior : "y=" + y);
        return original(opciones, y);
      };
      const ultimo = () => pedidos[pedidos.length - 1] || "(ninguno)";

      // Página más larga, para poder bajar de verdad
      const relleno = document.createElement("div");
      relleno.style.height = "3000px";
      document.body.appendChild(relleno);

      (async () => {
        // 1) Bajar por la página
        window.scrollTo(0, 1200);
        await espera(80);
        log("bajado=" + Math.round(window.scrollY));
        log("visible_tras_bajar=" + (boton.hidden ? "no" : "si"));

        // 2) Pulsarlo (como haría alguien con el teclado: con el foco puesto)
        boton.focus();
        boton.click();
        await espera(80);
        log("pedido_clic=" + ultimo());
        log("foco_en_boton=" + (document.activeElement === boton ? "si" : "no"));
        log("visible_con_foco=" + (boton.hidden ? "no" : "si"));
        log("hash=" + (location.hash || "(vacío)"));

        // 3) El sistema pide menos movimiento: sube de golpe
        window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
        window.scrollTo(0, 1200);
        await espera(80);
        boton.click();
        await espera(80);
        log("pedido_sin_movimiento=" + ultimo());
        log("posicion_final=" + Math.round(window.scrollY));

        // 4) Al salir del botón, ya puede ocultarse
        boton.blur();
        await espera(80);
        log("oculto_tras_blur=" + (boton.hidden ? "si" : "no"));

        // 5) Arriba del todo no se enseña
        window.scrollTo(0, 0);
        await espera(80);
        log("oculto_arriba_del_todo=" + (boton.hidden ? "si" : "no"));

        // 6) Con el aviso de versión abajo, el botón se aparta y no se solapan
        if (avisoVersion) {
          window.scrollTo(0, 1200);
          await espera(80);
          log("bottom_sin_aviso=" + getComputedStyle(boton).bottom);
          avisoVersion.hidden = false;
          await espera(80);
          log("bottom_con_aviso=" + getComputedStyle(boton).bottom);
          const cajaBoton = boton.getBoundingClientRect();
          const cajaAviso = avisoVersion.getBoundingClientRect();
          log("se_solapan=" + (cajaBoton.bottom > cajaAviso.top + 1 ? "si" : "no"));
          avisoVersion.hidden = true;
        }

        log("listo=si");
      })();
    } else {
      log("listo=si");
    }
  </script>
`;

(async () => {
  const sitio = carpetaTemporal("arriba");
  copiar(sitio, FICHEROS);

  // Las dos páginas se sirven con el driver al final del <body>
  for (const fichero of ["index.html", "ayuda.html"]) {
    fs.writeFileSync(path.join(sitio, fichero), leer(fichero).replace("</body>", `${DRIVER}</body>`));
  }

  const { url, cerrar } = await servirHttp(sitio);

  try {
    console.log("--- index.html (buscador) ---");
    const buscador = campos(leerDiag(await domConChrome(`${url}/index.html`, { alto: 800, presupuesto: 9000 })));

    comprobar("la página se mide entera (no se queda a medias)", buscador.listo === "si", Object.keys(buscador).join(" "));
    comprobar("el botón está en la página", buscador.boton === "si", buscador.boton);
    comprobar("lleva etiqueta para lectores de pantalla", buscador.etiqueta === "Volver arriba", buscador.etiqueta);
    comprobar("arranca oculto (no se ha bajado nada)", buscador.oculto_de_salida === "true", buscador.oculto_de_salida);

    comprobar("al bajar por la página aparece", buscador.visible_tras_bajar === "si", buscador.visible_tras_bajar);
    comprobar("y se ha bajado de verdad", Number(buscador.bajado) > 400, buscador.bajado);

    comprobar("al pulsarlo pide subir al principio, con animación", buscador.pedido_clic === "top=0 behavior=smooth", buscador.pedido_clic);
    comprobar("el foco se queda en el botón (teclado)", buscador.foco_en_boton === "si", buscador.foco_en_boton);
    comprobar("y entonces no se oculta (no deja tirado al usuario)", buscador.visible_con_foco === "si", buscador.visible_con_foco);
    comprobar("no cambia la URL (es un botón, no un enlace)", buscador.hash === "(vacío)", buscador.hash);

    comprobar("con menos movimiento pedido por el sistema sube de golpe", buscador.pedido_sin_movimiento === "top=0 behavior=auto", buscador.pedido_sin_movimiento);
    comprobar("y deja la página arriba del todo", buscador.posicion_final === "0", buscador.posicion_final);

    comprobar("al salir del botón con el tabulador se oculta", buscador.oculto_tras_blur === "si", buscador.oculto_tras_blur);
    comprobar("arriba del todo no se enseña", buscador.oculto_arriba_del_todo === "si", buscador.oculto_arriba_del_todo);

    comprobar(
      "con el aviso de versión abajo, el botón se aparta",
      buscador.bottom_con_aviso !== buscador.bottom_sin_aviso && buscador.bottom_con_aviso !== "",
      `${buscador.bottom_sin_aviso} -> ${buscador.bottom_con_aviso}`
    );
    comprobar("y no se tapan el uno al otro", buscador.se_solapan === "no", buscador.se_solapan);

    console.log("--- ayuda.html ---");
    const ayuda = campos(leerDiag(await domConChrome(`${url}/ayuda.html`, { alto: 800, presupuesto: 9000 })));

    comprobar("el botón también está en la ayuda", ayuda.boton === "si", ayuda.boton);
    comprobar("arranca oculto y aparece al bajar", ayuda.oculto_de_salida === "true" && ayuda.visible_tras_bajar === "si", `${ayuda.oculto_de_salida} / ${ayuda.visible_tras_bajar}`);
    comprobar("y sube al pulsarlo", ayuda.pedido_clic === "top=0 behavior=smooth", ayuda.pedido_clic);
    comprobar("la ayuda se mide entera", ayuda.listo === "si", Object.keys(ayuda).join(" "));
  } finally {
    cerrar();
  }

  resumen("botón de volver arriba");
})();
