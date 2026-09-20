# ProspectoYa — Web mejorada para consultar medicamentos

<!-- Captura del sitio real (1200x798). Va en la raíz del repo, con ruta
     relativa, para que se vea también al clonar o hacer fork. -->
<img width="1200" height="798" alt="Pantalla de inicio de ProspectoYa: el buscador con el titular «Lee lo importante de cualquier medicamento sin pelearte con el prospecto», los chips de ejemplo (paracetamol, ibuprofeno, omeprazol, amoxicilina, CN 662025) y el pie con la fuente de datos" src="captura-inicio.png">

Web estática (HTML/CSS/JS vanilla, sin frameworks, sin build) que consulta
la API pública de CIMA (AEMPS) para mejorar la experiencia de buscar y leer
fichas técnicas y prospectos de medicamentos autorizados en España.

## Contexto técnico

- **Sin backend.** La API de CIMA responde con `Access-Control-Allow-Origin: *`,
  así que todas las llamadas se hacen directamente desde el navegador con `fetch`.
- **Sin IA integrada.** Se decidió NO incluir un chat con IA dentro de la app
  (evita coste de tokens y complejidad de backend). En su lugar, se ofrece un
  botón para copiar el texto del prospecto/sección en formato limpio, para que
  el usuario lo pegue en la IA que prefiera.
- **Deploy:** Vercel, hosting estático, sin build step.
- **Sin autenticación ni base de datos.** Todo el estado del usuario
  (búsquedas recientes, "mi botiquín") vive en `localStorage`.

## API de CIMA — referencia rápida

Base: `https://cima.aemps.es/cima/rest/`

| Endpoint | Uso |
|---|---|
| `GET /medicamentos?nombre=X` | Búsqueda de medicamentos (también admite `practiv1`, `laboratorio`, `atc`, `cn`, `nregistro`, etc.) |
| `GET /presentaciones?{filtros}` | Presentaciones (envases) **con su `cn`** (Código Nacional); acepta los mismos filtros que `/medicamentos` (`nombre`, `cn`, `nregistro`, `pactivos`…) |
| `GET /medicamento?nregistro=X` | Ficha completa de un medicamento (incluye `docs[]` con enlaces a PDF de ficha técnica y prospecto) |
| `GET /docSegmentado/secciones/2?nregistro=X` | Lista de secciones disponibles del PROSPECTO (tipoDoc=2) |
| `GET /docSegmentado/contenido/2?nregistro=X&seccion=X` | Contenido HTML de una sección del prospecto |
| `GET /docSegmentado/secciones/1?nregistro=X` | Lista de secciones de la FICHA TÉCNICA (tipoDoc=1) |
| `GET /docSegmentado/contenido/1?nregistro=X&seccion=X` | Contenido HTML de una sección de la ficha técnica |
| `GET /psuministro?cn=X` | Problemas de suministro activos para un Código Nacional |
| `GET /vmpp?nregistro=X` | Equivalentes clínicos (para "medicamentos equivalentes") |
| `GET /maestras?maestra=X` | Catálogos: ATC, principios activos, laboratorios, formas farmacéuticas |

Documentación oficial completa (PDF): `CIMA-REST-API_1_19.pdf` (AEMPS).

## Prioridades del MVP (Fase 1)

1. Buscador con autocompletado en tiempo real (`GET /medicamentos`), también por
   código nacional (CN) y nº de registro (`GET /presentaciones`). ✅
2. Visor del prospecto/ficha técnica por secciones, tipo acordeón/tabs
   (usando `docSegmentado/secciones` + `docSegmentado/contenido`). ✅
3. Resumen rápido arriba de la ficha: dosis, contraindicaciones, alertas
   clave (embarazo, conducción, alcohol) extraídas de las secciones
   correspondientes del prospecto. ✅

### Cómo funciona el buscador (`app.js`)

- El buscador es un *composer* de una línea inspirado en ChatGPT/DeepSeek: lupa
  a la izquierda, botón circular con flecha ↑ a la derecha (`#search-submit`) y
  chips de ejemplo ("Prueba con…") debajo. El botón queda `disabled` mientras el
  input esté vacío y se activa en cuanto hay texto.
- Al escribir 3 letras o más se consulta `GET /medicamentos` con un *debounce*
  de 300 ms y se pinta el desplegable `#search-suggestions` (máx.
  `MAX_SUGERENCIAS` = 8). Con menos de 3 letras el desplegable se oculta.
- **Búsqueda por código**: si lo escrito son sólo dígitos, `consultarSegunTermino()`
  espera a tener al menos 5 dígitos antes de consultar (por debajo avisa, porque la
  API ignora los filtros vacíos y devolvería el catálogo completo). Con 6 dígitos
  busca por **código nacional** en `GET /presentaciones?cn=…` (coincidencia
  exacta) y, si no hay nada, reintenta como nº de registro; con el resto de
  longitudes (5 o 8-10 dígitos) va directo a `GET /medicamentos?nregistro=…`.
- **El CN sale en cada resultado** (`.result-cn`): las respuestas de
  `/presentaciones` ya lo traen (búsquedas por CN, con el nombre del envase); en
  las búsquedas por nombre se pide en diferido, medicamento a medicamento,
  cuando el resultado entra en pantalla (`IntersectionObserver`, con
  `MAX_CNS_SIN_OBSERVADOR` como respaldo si el navegador no lo soporta) y queda
  en caché (`cacheCN`, `nregistro → CN[]`). La ficha del medicamento lista todos
  los CN de sus envases (`#detail-cn`) reutilizando esa misma caché, así que
  abrir un resultado ya visto no gasta peticiones.
- Teclado: ↑ / ↓ recorren las sugerencias (realce `.is-active`, equivalente al
  hover, que además actualiza `aria-activedescendant`), Enter abre la sugerencia
  marcada o lanza la búsqueda completa si no hay ninguna, y Escape cierra el
  desplegable. Un clic fuera del composer también lo cierra.
- Semántica ARIA: `#search-input` es `role="combobox"` y la lista es
  `role="listbox"` con cada `li` como `role="option"`, así que el autocompletado
  funciona con lectores de pantalla sin sacar el foco del input.
- Toda la interacción está cubierta por un test de humo en jsdom que carga
  `index.html` + `tema.js` + `api.js` + `app.js` con `fetch` simulado; vive en
  [`tests/`](tests/README.md) (ver [Tests](#tests)).



### Cómo funciona el resumen rápido (`app.js`)

- La configuración vive en `CAMPOS_RESUMEN`: un array con un objeto por tarjeta
  (`etiqueta`, patrones de `secciones`, `subTitulos`, `frases`, límite de
  longitud…). Añadir un campo nuevo = añadir un objeto ahí, sin tocar el resto.
- Para cada campo, `buscarCampo()` prueba por orden: **subtítulo** del prospecto
  → **frase** que mencione la palabra clave (`extraerPorFrases`) → **sección
  completa** (`seccionCompleta`, solo si la sección es específica del tema, p.ej.
  "4.3 Contraindicaciones" de la ficha técnica) → **primeros bloques** de la
  sección (caso de la posología).
- El prospecto se consulta primero (lenguaje para el paciente) y, solo si queda
  algún campo vacío, se usa la **ficha técnica** como respaldo. Cada tarjeta
  indica de qué documento y sección salió el texto.
- El HTML se trocea con `DOMParser` + `extraerBloques()`, que detecta como
  subtítulo cualquier párrafo cuyo contenido vaya entero en negrita/subrayado
  (cubre las dos variantes de CIMA). El texto de las tarjetas se pinta siempre
  con `textContent`, nunca con `innerHTML`.

### Páginas, tema y ayuda (`ayuda.html`, `tema.js`)

- El sitio tiene **dos páginas**: el buscador (`index.html`) y la **ayuda**
  (`ayuda.html`), que explica de dónde salen los datos, cómo se busca (nombre,
  CN, nº de registro), cómo se lee el resumen rápido, atajos de teclado, FAQ y
  aviso sanitario, y termina con el enlace al repositorio. Se llega a ella desde
  el enlace *Ayuda* de la barra superior y desde el pie de la página del buscador
  (y vuelve con *← Volver al buscador*).
- `ayuda.html` **no carga `api.js` ni `app.js`**: son solo texto y estilos. Lo
  único de comportamiento que necesita es el botón de tema, que vive en
  `tema.js`.
- **`tema.js` es el único sitio donde se decide el tema** (clave `prospectoya-tema`
  en `localStorage` + atributo `data-tema` en `<html>`): lo cargan las dos páginas,
  así que el tema elegido en una se mantiene al pasar a la otra. El script en línea
  del `<head>` de cada página (el que evita el destello al cargar) lee esa **misma**
  clave: si se cambia en un sitio, hay que cambiarla en los tres.
- Los estilos de la ayuda (`.ayuda`, `.ayuda-tabla`, `.kbd`, `.nota`, `.aviso`) y
  los enlaces de la barra (`.topbar-nav`, `.topbar-link`) están al final de
  `styles.css`, reutilizando los mismos tokens de color que el resto.
- **Metaetiquetas para compartir** (`index.html`): `og:title`, `og:description`,
  `og:url`, `og:image` —la misma imagen que el *Social preview* del
  repositorio—, `og:image:width/height` y el bloque `twitter:card`. `og:image`
  exige **URL absoluta**, así que apunta a `https://prospectoya.vercel.app/…`: si
  el dominio cambia, hay que actualizarlo ahí.

## Fase 2 (después del MVP)

4. Badge de "problema de suministro activo" (`GET /psuministro`).
5. "Mi botiquín": guardar medicamentos frecuentes en `localStorage`.
6. Comparador de dos medicamentos lado a lado.
7. Botón "copiar para IA": vuelca el texto de una sección o del prospecto
   completo en un formato limpio (markdown plano) al portapapeles.

## Formas de respuesta REALES de la API (verificado el 20/09/2026)

Antes de tocar estas llamadas conviene saber que la API **no coincide con lo que
sugiere el PDF de documentación** en varios puntos:

| Punto | Realidad comprobada |
|---|---|
| CORS | `Access-Control-Allow-Origin: *` presente en todas las llamadas (sin proxy). |
| `GET /docSegmentado/secciones/{tipoDoc}` | Array de `{ seccion, titulo, orden }`. La clave del id es **`seccion`** (string, p.ej. `"4.2"`) y el título viene en **`titulo`**. |
| `GET /docSegmentado/contenido/{tipoDoc}` | **No devuelve HTML plano**: devuelve un array JSON `[{ seccion, titulo, contenido, orden }]` con el HTML dentro de `contenido`. `api.js` ya lo parsea y une los fragmentos. |
| Orden de las secciones | El array ya llega en el orden del documento. **No ordenar por `orden`**: en la ficha técnica ese campo no es monótono (las secciones 4, 4.1, 4.2… comparten valores bajos). |
| `GET /medicamentos?nombre=X` | Ignora `pagina` y `tamanioPagina` (devuelve `tamanioPagina: 200` y hasta 200 filas de golpe). El recorte de la lista se hace en cliente (`MAX_RESULTADOS`). **No devuelve `cn`.** |
| `GET /presentaciones?…` | Es el único endpoint que trae el **`cn`**, además del `nombre` del envase ("… , 20 comprimidos"). El filtro `cn` es de **coincidencia exacta** (`?cn=662025` → 1 fila; `?cn=6620` o `?cn=66202500` → 0) y `nregistro` sólo admite **un** valor (`?nregistro=a,b` ni parámetros repetidos → 0 filas). También ignora `pagina`/`tamanioPagina` y tope de 200 filas: para una búsqueda por nombre amplia NO cubre todos los medicamentos (p.ej. "paracetamol": 195 medicamentos vs 84 nregistros en la respuesta de presentaciones). Por eso `app.js` pide el CN medicamento a medicamento, cacheado y cuando el resultado entra en pantalla. |
| Filtros con valor **vacío** | Se ignoran y se devuelve el catálogo entero: `GET /medicamentos?nregistro=` responde con las **25.464** filas de medicamentos. Nunca llamar con el término vacío (de ahí los avisos de `app.js` para códigos incompletos). |
| Formato de los nº de registro | 5 dígitos en la mayoría de medicamentos, pero también los hay de 8-10 (registros tipo EMA, p.ej. `07428001`, `1231752001`), así que la búsqueda numérica no se limita a 5-6 dígitos. |
| Prospecto (tipoDoc=2) | **No existe una sección "Contraindicaciones"**. Todo (contraindicaciones, embarazo, conducción, alcohol) vive dentro de la sección *"Qué necesita saber antes de empezar a tomar…"*, dividido en subtítulos. Además, CIMA alterna `<p><strong>…</strong></p>` y `<ul><li><strong>…</strong></li></ul>` para esos mismos subtítulos. |

## Estructura de archivos

```
index.html         → estructura de la página (buscador, resultados, detalle)
ayuda.html         → página de ayuda: cómo funciona, FAQ y enlace al repositorio
styles.css         → estilos (buscador, detalle y ayuda)
api.js             → funciones que llaman a la API de CIMA (fetch)
app.js             → lógica de UI: búsqueda, render de resultados, acordeón, resumen
tema.js            → tema claro/oscuro (lo comparten index.html y ayuda.html)
favicon.svg        → icono maestro (cápsula de marca); de aquí salen los demás
favicon-32.png     → respaldo del icono para navegadores sin soporte de SVG
favicon.ico        → respaldo multi-tamaño (16/32/48) para navegadores antiguos
apple-touch-icon.png → icono para iOS/iPadOS (180×180, opaco)
social-preview.png → imagen 1280×640: Social preview del repo y `og:image` de la web
captura-inicio.png → captura del buscador que se muestra al principio del README
LICENSE            → licencia MIT
CHANGELOG.md       → historial de cambios
README.md          → este documento
tests/             → suites de test (jsdom y Chrome real); no forman parte del sitio
```

> Los ficheros del **sitio** están **en la raíz** del proyecto (no hay `css/` ni
> `js/`), y `index.html` los referencia con rutas planas. Mantener ambos
> sincronizados: si se mueven a subcarpetas, hay que actualizar las rutas.
> `tests/` es la única subcarpeta y es la excepción: no la carga la web, así que
> no está enlazada desde ninguna página.

### Iconos

`favicon.svg` es el **fichero maestro**: la cápsula del logo en blanco sobre el
azul de marca, en un cuadrado redondeado. Los PNG y el ICO se generan
rasterizándolo, no se editan a mano:

```bash
# 1) Renderizar el SVG a 512 px con fondo transparente
sed 's/width="64" height="64"/width="512" height="512"/' favicon.svg > /tmp/icono-512.svg
google-chrome --headless --window-size=512,512 \
  --default-background-color=00000000 --screenshot=/tmp/icono-512.png \
  file:///tmp/icono-512.svg
```

Después se reduce a 32×32 (`favicon-32.png`) y a 180×180 (`apple-touch-icon.png`,
esta vez **sin** esquinas redondeadas y opaco, porque iOS aplica su propia
máscara), y se empaquetan los tamaños 16/32/48 en `favicon.ico`.

Dos avisos si editas el SVG: el color va literal (no puede usar las variables de
`styles.css`, porque el favicono se carga como documento suelto) y en un
comentario XML **no** puede aparecer un doble guion seguido, o el navegador
pintará una página de error en lugar del icono.

### Social preview

`social-preview.png` (1280×640) es la imagen que aparece al compartir el
repositorio en X, WhatsApp, Slack, etc. Se genera renderizando una maqueta con la
identidad de la web (marca, titular, buscador y chips) y la tipografía **Inter**
incrustada, para que no dependa de las fuentes instaladas:

```bash
# Maqueta -> PNG 1280x640
google-chrome --headless --window-size=1280,640 --hide-scrollbars \
  --screenshot=social-preview.png file:///ruta/a/la/maqueta.html
```

GitHub no permite fijarla por API ni con `gh`: hay que subirla a mano en
*Settings → General → Social preview*. La misma imagen es la `og:image` que
`index.html` declara, así que al compartir **el enlace de la web** también
aparece esta tarjeta (con `twitter:card: summary_large_image`).

## Cómo probarlo en local

No hay build ni dependencias; basta con servir la carpeta como sitio estático
(abrir `index.html` con `file://` también funciona, pero algunos navegadores
bloquean peticiones desde ese origen):

```bash
python3 -m http.server 8765
# http://127.0.0.1:8765/index.html
# http://127.0.0.1:8765/ayuda.html
```

## Tests

Las suites viven en [`tests/`](tests/README.md) y **no forman parte del sitio**:
nada de la web las carga. Necesitan Node, y las que usan navegador real un
Chrome/Chromium (Node las demás no necesitan nada instalado):

```bash
cd tests
npm install          # jsdom (única dependencia, sólo de desarrollo)
npm test             # 122 comprobaciones: estructura, buscador, móvil, páginas, iconos y z-index
npm run test:api-real   # contra la API real de CIMA (necesita red)
```

Resumen: `test-html.js` (estructura de las dos páginas y metaetiquetas),
`test-busqueda.js` (buscador completo en jsdom con `fetch` simulado),
`test-movil.js` (el buscador en un viewport de móvil, sin zoom al escribir),
`test-paginas.js` (las dos páginas en Chrome real, servidas por HTTP),
`test-iconos.js` (los favicons cargan y miden lo que deben), `test-solape.js`
(regresión del z-index del desplegable) y `test-api-real.js` (la API de verdad).
En [`tests/README.md`](tests/README.md) está el detalle de cada una.

## Notas para quien continúe el desarrollo

- No añadir ninguna llamada a APIs de IA (OpenAI, Anthropic, etc.) — está
  descartado a propósito para esta fase.
- No añadir dependencias de build (webpack, vite...) ni frameworks. El
  proyecto se sirve tal cual desde Vercel como sitio estático.
- **El sitio no lleva ninguna dependencia.** La única de desarrollo (`jsdom`,
  para los tests) está en `tests/package.json` y nunca se instala al desplegar:
  no añadir un `package.json` en la raíz ni dependencias de ejecución.
- El HTML de `docSegmentado/contenido` viene formateado con tags como `<p>`,
  `<strong>` y `<ul>`; se puede inyectar con cuidado (ver comentarios en
  `api.js` sobre sanitización básica antes de usar `innerHTML`). Ese HTML va
  **dentro del JSON** de la respuesta, no en el cuerpo como texto plano.
- Mantener el [CHANGELOG](CHANGELOG.md) al día: cada cambio con cierta entidad
  añade una entrada (y, si aún no está en una versión etiquetada, va bajo
  `## Sin publicar`).
- **Al cerrar una fase**: subir la versión en el CHANGELOG (`## [0.x.0] - fecha`),
  crear la etiqueta anotada (`git tag -a v0.x.0 -m "…" && git push origin v0.x.0`)
  y, si se quiere, publicar la release con esas notas
  (`gh release create v0.x.0 --notes-from-tag`).

## Licencia

El **código** de este proyecto se publica bajo la licencia [MIT](LICENSE): puedes
usarlo, modificarlo y redistribuirlo citando la autoría.

Los **datos** (prospectos, fichas técnicas, presentaciones y códigos nacionales)
los sirve la [AEMPS](https://cima.aemps.es) a través de su API pública de CIMA y
son suyos; aquí solo se muestran tal cual, sin modificarlos.

Esta web es un visor y **no sustituye el consejo de un profesional sanitario**:
para cualquier duda sobre un tratamiento, consulta a tu médico o farmacéutico.

