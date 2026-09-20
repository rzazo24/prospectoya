# Changelog

Todos los cambios relevantes de **ProspectoYa**. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y las fechas van en
`AAAA-MM-DD`.

El proyecto no publica versiones numeradas **hasta ahora**: a partir de aquí cada
versión va etiquetada siguiendo [versionado semántico](https://semver.org/lang/es/)
(`0.x` = desarrollo inicial, con la Fase 2 todavía abierta). La web se despliega
de forma continua desde `main` (Vercel), así que los cambios que aún no forman
parte de una versión etiquetada se listan arriba, bajo `## Sin publicar`.

Los apartados dentro de cada hito son: `Añadido`, `Cambiado`, `Corregido`
y `Eliminado` (solo los que apliquen).

## [0.3.0] - 2026-09-20

Tercera entrega: la web se puede **instalar como app** y se abre **sin conexión**,
y quien la tenga abierta recibe un **aviso cuando hay versión nueva**. Incluye
además el arreglo del zoom automático al escribir en el móvil. Todo sigue sin
backend, sin build, sin frameworks y **sin dependencias en el sitio** (la única,
`jsdom`, es de desarrollo y vive en `tests/`).

### Añadido

- **La web se puede instalar como app (PWA)** y se abre **sin conexión**:
  - `manifest.webmanifest` con el nombre, el arranque (`./`), `display:
    standalone` y los cuatro iconos (`icono-192.png`, `icono-512.png` y sus
    variantes *maskable*, generados desde `favicon.svg`). Las páginas añaden los
    `<meta name="theme-color">` de los dos temas y las etiquetas de iOS.
  - `sw.js`: guarda la "cáscara" (las dos páginas, los estilos, el JS, el
    manifest y los iconos) para que la web abra al instante y sin conexión. Las
    navegaciones van primero a la red y el resto de ficheros propios se
    actualizan en segundo plano. **La API de CIMA no se cachea nunca**: los
    datos van siempre directos a la AEMPS.
  - `pwa.js` (lo cargan las dos páginas): registra el service worker y gestiona
    los avisos.
  - Aviso de **"sin conexión"** cuando el navegador detecta que no hay red.
- **Aviso de versión nueva**: al publicar cambios (subiendo `VERSION` en
  `sw.js`), quien tenga la web abierta ve abajo *"Hay una versión nueva"* con un
  botón **Recargar**. No recarga sola y sólo avisa si la versión cambia de
  verdad (hay cambios de control que no son actualizaciones): `pwa.js` pregunta
  la versión al service worker en marcha. Además se busca actualización al abrir
  y al volver a la pestaña, porque el navegador sólo lo hace por su cuenta cada
  24 h.
- **Suite `tests/test-pwa.js`**: manifest, iconos (comprobando en un canvas que
  los *maskable* no tienen transparencia y que la marca cabe en la zona segura),
  `sw.js`, el aviso de versión con `pwa.js` en jsdom y dos pasadas por Chrome
  real, la segunda **con el servidor apagado**. El proyecto pasa a 207
  comprobaciones.
- La ayuda explica cómo **añadir la web a la pantalla de inicio** y qué hacer si
  aparece el aviso de versión nueva.

### Corregido

- **Al enfocar el buscador en el móvil, la página ya no se amplía sola**: los
  navegadores móviles (Safari en iOS, entre otros) amplían la página al enfocar
  un campo cuya letra mide menos de 16px, y al escribir resultaba muy molesto.
  El campo pasa a `max(16px, 1rem)` —nunca por debajo del mínimo, y sigue la
  proporción si algún día se sube el tamaño base— y en pantallas de hasta 640px
  se queda en 17px. En el compositor, `touch-action: manipulation` quita además
  el zoom por doble toque al pulsarlo o al tocar un chip; el pellizco para
  ampliar y el zoom del navegador siguen funcionando igual.

**Commits de esta versión:**
[`f53dfae`](https://github.com/rzazo24/prospectoya/commit/f53dfae) ·
[`a229cc1`](https://github.com/rzazo24/prospectoya/commit/a229cc1)

## [0.2.0] - 2026-09-20

Segunda entrega: la web se puede **compartir con tarjeta**, tiene **página de
ayuda** y el proyecto incorpora sus **suites de test** dentro del repo. Todo
sigue sin backend, sin build ni frameworks, y **sin dependencias en el sitio**
(la única, `jsdom`, es de desarrollo y vive en `tests/`).

### Añadido

- **Página de ayuda** (`ayuda.html`): explica de dónde salen los datos (AEMPS ·
  CIMA), cómo se busca por nombre, código nacional y nº de registro, cómo se lee
  el resumen rápido, atajos de teclado, privacidad, preguntas frecuentes, qué
  hacer si algo falla y un aviso sanitario. Termina con el enlace al repositorio.
  Se llega a ella desde el enlace *Ayuda* de la barra superior y desde el pie del
  buscador.
- **Vista previa al compartir el enlace de la web** (`index.html`): metaetiquetas
  Open Graph y Twitter Card (`og:title`, `og:description`, `og:url`, `og:image`
  con `social-preview.png`, `og:image:width/height` y `twitter:card` con
  `summary_large_image`).
- **Carpeta `tests/`** con las suites del proyecto, antes repartidas fuera del
  repo: estructura HTML, buscador completo en jsdom, las dos páginas en Chrome
  real servidas por HTTP (incluido que el tema se mantiene al pasar de una a
  otra), los favicons, la regresión del `z-index` del autocompletado y la
  comprobación de `api.js` contra la API real de CIMA (115 comprobaciones).
  Llevan un `README.md` propio y un `package.json` con `jsdom` como única
  dependencia de desarrollo (`npm test`).

### Cambiado

- **El tema claro/oscuro** sale de `app.js` a un fichero propio, `tema.js`, para
  que lo compartan el buscador y la ayuda: la elección se mantiene al pasar de
  una página a la otra.
- **La captura del README vive ya en el repositorio** (`captura-inicio.png`) y
  deja de ser un adjunto de GitHub: la página servía el adjunto con una URL
  firmada que caduca a los cinco minutos y el fichero no formaba parte del repo,
  así que un clon o un fork se quedaban sin imagen. Se guarda optimizada (322 KB
  → 255 KB) e idéntica píxel a píxel.

**Commits de esta versión:**
[`8391261`](https://github.com/rzazo24/prospectoya/commit/8391261) ·
[`3cbea2d`](https://github.com/rzazo24/prospectoya/commit/3cbea2d) ·
[`03e3383`](https://github.com/rzazo24/prospectoya/commit/03e3383) ·
[`b5ddba5`](https://github.com/rzazo24/prospectoya/commit/b5ddba5)

## [0.1.0] - 2026-09-20

Primera versión: la Fase 1 del MVP, con buscador, visor de prospectos y ficha
técnica, y resumen rápido. Sin backend, sin build y sin frameworks: HTML/CSS/JS
vanilla contra la API pública de CIMA (AEMPS).

### Añadido

- **Buscador de medicamentos** con autocompletado en tiempo real (`GET /medicamentos`,
  debounce de 300 ms, máximo 8 sugerencias) y búsqueda completa con Enter o con
  el botón, con la lista de resultados recortada en cliente (`MAX_RESULTADOS`).
- **Búsqueda por código en el mismo campo**: 6 dígitos se interpretan como
  Código Nacional (`GET /presentaciones?cn=`) y, si no hay coincidencia, como
  nº de registro; de 5 dígitos en adelante, como nº de registro (incluye los
  registros largos tipo EMA). Un código incompleto avisa sin consultar la API.
- **Código Nacional (CN) visible**: en cada resultado —llega en diferido, cuando
  la tarjeta entra en pantalla, con `IntersectionObserver` y caché por
  `nregistro`— y en la ficha del medicamento, que lista los CN de todos sus
  envases.
- **Visor del prospecto y de la ficha técnica** por secciones, con pestañas y
  acordeón (`/docSegmentado/secciones` + `/docSegmentado/contenido`).
- **Resumen rápido** en la cabecera de la ficha: dosis, contraindicaciones y
  alertas clave (embarazo, conducción, alcohol), sacadas del prospecto y, como
  respaldo, de la ficha técnica. Se configura añadiendo objetos a `CAMPOS_RESUMEN`.
- **Interfaz tipo asistente**: buscador con forma de *composer* (lupa, botón
  circular con flecha, apagado mientras no hay texto, y chips de ejemplo), tema
  claro/oscuro con persistencia en `localStorage` y sin destello al cargar, y
  hero de presentación.
- **Accesibilidad**: `role="combobox"` con lista `listbox`/`option` y
  `aria-activedescendant`, navegación con ↑/↓, Enter para abrir la sugerencia
  marcada, Escape y clic fuera para cerrar; acordeón con `role="button"` y
  `aria-expanded`.
- **Iconos y marca**: `favicon.svg` (fichero maestro), `favicon-32.png`,
  `favicon.ico` (16/32/48) y `apple-touch-icon.png` para iOS.
- **Imagen de social preview** (`social-preview.png`, 1280×640) para compartir
  el repositorio.
- **Licencia MIT** (`LICENSE`).

### Corregido

- `docSegmentado/contenido` devuelve un **array JSON** y no HTML plano: `api.js`
  une los fragmentos antes de pintarlos.
- El autocompletado ya no queda por debajo de las tarjetas de resultados ni de
  la ficha: la animación de entrada creaba un *stacking context* en
  `.search-section` que dejaba encerrado su `z-index`.
- Rutas de los assets: los ficheros viven en la **raíz** del proyecto (no hay
  `css/` ni `js/`), así que `index.html` los referencia con rutas planas.

### Documentación

- README con la referencia de la API de CIMA y una tabla de **formas de respuesta
  reales**: filtro `cn` de coincidencia exacta, `?nregistro` sin soporte de lotes,
  tope de 200 filas por respuesta, filtros con valor vacío que devuelven el
  catálogo entero (25.464 filas) y nº de registro de 8-10 dígitos.
- README con el detalle de cómo funcionan el buscador (búsqueda por código, CN en
  los resultados) y el resumen rápido.
- `.gitignore` para ficheros del sistema operativo, del editor y del entorno local.

**Commits de esta versión:**
[`e067228`](https://github.com/rzazo24/prospectoya/commit/e067228) ·
[`d3a43fa`](https://github.com/rzazo24/prospectoya/commit/d3a43fa) ·
[`2d3d401`](https://github.com/rzazo24/prospectoya/commit/2d3d401) ·
[`1619cc4`](https://github.com/rzazo24/prospectoya/commit/1619cc4) ·
[`3182ccc`](https://github.com/rzazo24/prospectoya/commit/3182ccc) ·
[`383b762`](https://github.com/rzazo24/prospectoya/commit/383b762) ·
[`4fba8a5`](https://github.com/rzazo24/prospectoya/commit/4fba8a5) ·
[`67c213d`](https://github.com/rzazo24/prospectoya/commit/67c213d) ·
[`4bd06e2`](https://github.com/rzazo24/prospectoya/commit/4bd06e2) ·
[`3396182`](https://github.com/rzazo24/prospectoya/commit/3396182) ·
[`7495276`](https://github.com/rzazo24/prospectoya/commit/7495276)

[Sin publicar]: https://github.com/rzazo24/prospectoya/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/rzazo24/prospectoya/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/rzazo24/prospectoya/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/rzazo24/prospectoya/releases/tag/v0.1.0
