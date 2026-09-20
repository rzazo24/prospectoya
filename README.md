# ProspectoYa — Web mejorada para consultar medicamentos

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

1. Buscador con autocompletado en tiempo real (`GET /medicamentos`). ✅
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
- Teclado: ↑ / ↓ recorren las sugerencias (realce `.is-active`, equivalente al
  hover, que además actualiza `aria-activedescendant`), Enter abre la sugerencia
  marcada o lanza la búsqueda completa si no hay ninguna, y Escape cierra el
  desplegable. Un clic fuera del composer también lo cierra.
- Semántica ARIA: `#search-input` es `role="combobox"` y la lista es
  `role="listbox"` con cada `li` como `role="option"`, así que el autocompletado
  funciona con lectores de pantalla sin sacar el foco del input.
- Toda la interacción está cubierta por un test de humo en jsdom (fuera del
  repo) que carga `index.html` + `api.js` + `app.js` con `fetch` simulado.



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
| `GET /medicamentos?nombre=X` | Ignora `pagina` y `tamanioPagina` (devuelve `tamanioPagina: 200` y hasta 200 filas de golpe). El recorte de la lista se hace en cliente (`MAX_RESULTADOS`). Tampoco devuelve `cn`: para `/psuministro` habrá que pedir `obtenerMedicamento({ nregistro })` primero. |
| Prospecto (tipoDoc=2) | **No existe una sección "Contraindicaciones"**. Todo (contraindicaciones, embarazo, conducción, alcohol) vive dentro de la sección *"Qué necesita saber antes de empezar a tomar…"*, dividido en subtítulos. Además, CIMA alterna `<p><strong>…</strong></p>` y `<ul><li><strong>…</strong></li></ul>` para esos mismos subtítulos. |

## Estructura de archivos

```
index.html         → estructura de la página (buscador, resultados, detalle)
styles.css         → estilos
api.js             → funciones que llaman a la API de CIMA (fetch)
app.js             → lógica de UI: búsqueda, render de resultados, acordeón, resumen
README.md          → este documento
```

> Los ficheros están **en la raíz** del proyecto (no hay `css/` ni `js/`), y
> `index.html` los referencia con rutas planas. Mantener ambos sincronizados:
> si se mueven a subcarpetas, hay que actualizar las rutas.

## Cómo probarlo en local

No hay build ni dependencias; basta con servir la carpeta como sitio estático
(abrir `index.html` con `file://` también funciona, pero algunos navegadores
bloquean peticiones desde ese origen):

```bash
python3 -m http.server 8765
# http://127.0.0.1:8765/index.html
```

## Notas para quien continúe el desarrollo

- No añadir ninguna llamada a APIs de IA (OpenAI, Anthropic, etc.) — está
  descartado a propósito para esta fase.
- No añadir dependencias de build (webpack, vite...) ni frameworks. El
  proyecto se sirve tal cual desde Vercel como sitio estático.
- El HTML de `docSegmentado/contenido` viene formateado con tags como `<p>`,
  `<strong>` y `<ul>`; se puede inyectar con cuidado (ver comentarios en
  `api.js` sobre sanitización básica antes de usar `innerHTML`). Ese HTML va
  **dentro del JSON** de la respuesta, no en el cuerpo como texto plano.
