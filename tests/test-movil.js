/**
 * Comprueba en Chrome, con viewport de móvil (390x844), las condiciones que
 * disparan el zoom al escribir en el buscador:
 *
 *  - el campo debe medir 16px o más: por debajo de 16px los navegadores móviles
 *    (Safari en iOS, Samsung Internet, Firefox Android…) amplían la página al
 *    enfocarlo, y escribiendo resulta muy molesto;
 *  - el viewport no debe prohibir el zoom (`user-scalable=no` / `maximum-scale`):
 *    también lo evitaría, pero rompe la accesibilidad, porque quita el pellizco;
 *  - el compositor no debe ampliar al doble toque (`touch-action`) y la página no
 *    debe desbordar a lo ancho, porque eso provoca reencuadres al abrirse el
 *    teclado.
 *
 * Y, además, la colocación del bloque de arriba (hero + buscador + chips), que en
 * el móvil es lo único que se ve: que quede centrado en la pantalla, que el
 * buscador no sea un rectángulo demasiado alto, que la tinta del badge deje el
 * mismo aire a los lados y que, en cuanto hay resultados, todo vuelva al flujo de
 * siempre (el bloque arriba, el hueco automático a 0 y nada fuera de la vista).
 *
 * El ancho de móvil se consigue con un iframe de 390px: Chrome en Linux no baja
 * de ~500px de ancho de ventana, y así las media queries se evalúan al ancho de
 * un móvil de verdad.
 *
 *   cd tests && node test-movil.js
 */
const fs = require("fs");
const path = require("path");
const { comprobar, resumen, leer, carpetaTemporal, copiar, navegador, domConChrome, leerDiag, campos, servirHttp } = require("./util");

if (!navegador()) {
  console.log("OMITIDO: no encuentro Chrome/Chromium (define la variable CHROME con la ruta al ejecutable)");
  process.exit(0);
}

const FICHEROS = ["index.html", "styles.css", "api.js", "app.js", "tema.js", "arriba.js", "pwa.js", "favicon.svg"];

// Página con el iframe estrecho y el diagnóstico del contenido
const PAGINA_MOVIL = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Prueba de móvil</title>
</head>
<body style="margin:0">
  <pre id="diag" style="display:none"></pre>
  <iframe id="marco" src="index.html" width="390" height="844" style="border:0"></iframe>
  <script>
    const log = (m) => { document.getElementById("diag").textContent += m + "\\n"; };
    const marco = document.getElementById("marco");

    marco.addEventListener("load", () => {
      const doc = marco.contentDocument;
      const ventana = marco.contentWindow;
      const input = doc.getElementById("search-input");
      const composer = doc.querySelector(".composer");
      const viewport = doc.querySelector('meta[name="viewport"]').content;
      const fuente = getComputedStyle(input).fontSize;

      log("ancho_viewport=" + ventana.innerWidth);
      log("font_input=" + fuente);
      log("font_input_num=" + parseFloat(fuente));
      log("alto_input=" + input.offsetHeight);
      log("viewport=" + viewport);
      log("viewport_bloquea_zoom=" + /user-scalable\\s*=\\s*(no|0)|maximum-scale/i.test(viewport));
      log("touch_action=" + getComputedStyle(composer).touchAction);
      log("ancho_composer=" + Math.round(composer.getBoundingClientRect().width));
      log("ancho_documento=" + doc.documentElement.scrollWidth);
      log("desborda=" + (doc.documentElement.scrollWidth > ventana.innerWidth + 1));

      // --- El bloque de arriba (hero + buscador + chips), centrado ---
      // La animación de entrada desplaza el hero y el buscador 6px mientras corre,
      // y con el reloj virtual de Chrome no se sabe cuándo ha terminado: se quita
      // para medir dónde quedan colocados de verdad (mismo apaño que en
      // test-resoluciones.js).
      const sinAnimacion = doc.createElement("style");
      sinAnimacion.textContent = ".hero, .search-section { animation: none !important; }";
      doc.head.appendChild(sinAnimacion);
      // Se mide desde el borde de abajo del topbar hasta el bloque y desde el
      // bloque hasta el borde de abajo de la pantalla: si los dos huecos son
      // iguales, el bloque está centrado.
      const hero = doc.querySelector(".hero");
      const busca = doc.getElementById("search-section");
      const topbar = doc.querySelector(".topbar").getBoundingClientRect();
      const rellenoHero = parseFloat(ventana.getComputedStyle(hero).paddingTop);
      const arriba = hero.getBoundingClientRect().top + rellenoHero - topbar.bottom;
      const abajo = ventana.innerHeight - busca.getBoundingClientRect().bottom;
      log("hueco_arriba=" + arriba.toFixed(1));
      log("hueco_abajo=" + abajo.toFixed(1));

      // Lo mismo con el centrado deshecho: así se ve que la medición de arriba
      // lo detecta (sin él, el bloque se queda pegado al topbar).
      const parche = doc.createElement("style");
      parche.textContent = "body{display:block!important} .app{display:block!important;padding-bottom:3rem!important}" +
        " .hero{margin-top:0!important} .results-section{margin-bottom:0!important;padding-top:1.75rem!important}";
      doc.head.appendChild(parche);
      const heroSin = doc.querySelector(".hero").getBoundingClientRect();
      log("sin_arreglo_arriba=" + (heroSin.top + rellenoHero - topbar.bottom).toFixed(1));
      log("sin_arreglo_abajo=" + (ventana.innerHeight - busca.getBoundingClientRect().bottom).toFixed(1));
      parche.remove();

      // El rectángulo del buscador, más bajo que antes (66px) sin apretar el campo
      log("alto_composer=" + composer.getBoundingClientRect().height.toFixed(1));

      // La "tinta" del badge (icono y texto): el aire a los dos lados, igual
      const badge = doc.querySelector(".hero-badge").getBoundingClientRect();
      const icono = doc.querySelector(".hero-badge svg").getBoundingClientRect();
      const rango = doc.createRange();
      rango.selectNodeContents(doc.querySelector(".hero-badge").lastChild);
      const textoBadge = rango.getBoundingClientRect();
      log("badge_aire_izq=" + (icono.left - badge.left).toFixed(1));
      log("badge_aire_der=" + (badge.right - textoBadge.right).toFixed(1));

      // Con resultados, el centrado deja de actuar: el hero vuelve arriba, el
      // #app recupera su aire de abajo y el hueco automático vale 0 (si no,
      // el principio de la lista se iría por encima del borde y no se podría leer).
      const lista = doc.getElementById("results-list");
      for (let i = 0; i < 30; i++) {
        const li = doc.createElement("li");
        li.textContent = "Medicamento de prueba " + i;
        lista.appendChild(li);
      }
      log("con_lista_hero_arriba=" + (doc.querySelector(".hero").getBoundingClientRect().top - topbar.bottom).toFixed(1));
      log("con_lista_margen_hero=" + ventana.getComputedStyle(hero).marginTop);
      log("con_lista_relleno_app=" + ventana.getComputedStyle(doc.querySelector(".app")).paddingBottom);
      log("con_lista_alto_documento=" + doc.documentElement.scrollHeight);
    });
  </script>
</body>
</html>
`;

(async () => {
  const sitio = carpetaTemporal("movil");
  copiar(sitio, FICHEROS);
  fs.writeFileSync(path.join(sitio, "movil.html"), PAGINA_MOVIL);

  const { url, cerrar } = await servirHttp(sitio);

  let datos;
  try {
    datos = campos(leerDiag(await domConChrome(`${url}/movil.html`, { ancho: 1100, alto: 900, presupuesto: 5000 })));
  } finally {
    cerrar();
  }

  comprobar("el iframe se mide a 390px (ancho de móvil)", datos.ancho_viewport === "390", datos.ancho_viewport);
  comprobar(
    "el buscador tiene 16px o más (por debajo, los móviles hacen zoom al enfocar)",
    Number(datos.font_input_num) >= 16,
    `${datos.font_input} medidos`
  );
  comprobar("el campo sigue teniendo un tamaño cómodo (>=40px de alto)", Number(datos.alto_input) >= 40, datos.alto_input);
  comprobar("el viewport no prohíbe el zoom (el pellizco sigue disponible)", datos.viewport_bloquea_zoom === "false", datos.viewport);
  comprobar("el compositor no amplía al doble toque (touch-action)", datos.touch_action === "manipulation", datos.touch_action);
  comprobar("no hay desbordes horizontales", datos.desborda === "false", `documento=${datos.ancho_documento}px ventana=${datos.ancho_viewport}px`);
  comprobar("el compositor cabe en el ancho del móvil", Number(datos.ancho_composer) <= Number(datos.ancho_viewport), datos.ancho_composer);

  // --- El bloque de arriba (hero + buscador + chips), centrado ---
  comprobar(
    "el bloque de arriba queda centrado en la pantalla (±1px)",
    Math.abs(Number(datos.hueco_arriba) - Number(datos.hueco_abajo)) <= 1,
    `hueco arriba=${datos.hueco_arriba}px abajo=${datos.hueco_abajo}px`
  );
  comprobar(
    "sin el centrado la medición lo nota (el bloque se queda arriba)",
    Math.abs(Number(datos.sin_arreglo_arriba) - Number(datos.sin_arreglo_abajo)) > 100,
    `sin arreglo: arriba=${datos.sin_arreglo_arriba}px abajo=${datos.sin_arreglo_abajo}px`
  );
  comprobar(
    "el rectángulo del buscador no pasa de 58px de alto (antes 66px)",
    Number(datos.alto_composer) <= 58,
    `${datos.alto_composer}px de alto`
  );
  comprobar(
    "el badge deja el mismo aire a la izquierda y a la derecha (±0,5px)",
    Math.abs(Number(datos.badge_aire_izq) - Number(datos.badge_aire_der)) <= 0.5,
    `izquierda=${datos.badge_aire_izq}px derecha=${datos.badge_aire_der}px`
  );
  // Con resultados vuelve el flujo de siempre: los márgenes automáticos valen 0
  // (si no, el principio de la lista quedaría fuera de la vista, porque con
  // justify-content: center no se puede desplazar hacia arriba).
  comprobar(
    "con lista de resultados el hero vuelve arriba y el hueco automático vale 0",
    Number(datos.con_lista_hero_arriba) <= 10 && datos.con_lista_margen_hero === "0px",
    `hero a ${datos.con_lista_hero_arriba}px del topbar, margen ${datos.con_lista_margen_hero}`
  );
  comprobar(
    "con lista de resultados el #app recupera su aire de abajo y la página crece",
    datos.con_lista_relleno_app === "48px" && Number(datos.con_lista_alto_documento) > 844,
    `relleno=${datos.con_lista_relleno_app} documento=${datos.con_lista_alto_documento}px`
  );

  resumen("buscador en móvil");
})();
