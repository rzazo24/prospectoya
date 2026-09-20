# Tests de ProspectoYa

Suites de test del proyecto. **Nada de esta carpeta forma parte del sitio**: el
navegador sólo carga los ficheros de la raíz (`api.js`, `app.js`, `tema.js`,
`pwa.js`, `styles.css`), y estos scripts leen el proyecto desde fuera.

## Requisitos

- **Node** (probado con v24; sin `npm install` no hay nada instalado).
- **Chrome o Chromium** para las cinco suites que usan navegador real
  (`test-movil.js`, `test-paginas.js`, `test-pwa.js`, `test-iconos.js` y
  `test-solape.js`). Si no está en el `PATH`, se le puede indicar la ruta:
  `CHROME=/ruta/a/chrome npm test`.
- **Red** para `test-api-real.js` (consulta la API de CIMA de verdad).

## Instalación

```bash
cd tests
npm install          # jsdom: la única dependencia, y sólo de desarrollo
```

## Ejecución

```bash
npm test                 # todas las que no necesitan red
npm run test:busqueda    # una en concreto
npm run test:api-real    # contra la API real de CIMA
```

También se pueden lanzar directamente, que es útil al depurar:
`node test-busqueda.js`.

## Qué comprueba cada suite

| Fichero | Qué comprueba | Necesita |
|---|---|---|
| `test-html.js` | Estructura de las dos páginas: cabeceras, `meta description`, los 4 iconos, `styles.css`, `tema.js`, que todos los `<script src>` existen, las metaetiquetas `og:`/`twitter:` y el contenido y los enlaces de la ayuda (incluido que el repositorio es el último enlace). | Node + jsdom |
| `test-busqueda.js` | El buscador completo en jsdom con `fetch` simulado: autocompletado con *debounce*, teclado (↑ ↓ Enter Esc), búsqueda por CN y por nº de registro, aviso con códigos incompletos, CN en diferido (una sola petición por `nregistro`, caché reutilizada) y CN de todos los envases en la ficha. | Node + jsdom |
| `test-paginas.js` | Las dos páginas en Chrome real, servidas por HTTP (como en Vercel): sin errores de JS, `og:image` absoluta y con el fichero presente, enlace a la ayuda con HTTP 200, el tema se guarda y **se mantiene al pasar de una página a otra** (mismo perfil de Chrome), y la ayuda se lee como se espera. | Chrome/Chromium |
| `test-pwa.js` | Que la web se pueda **instalar como app** y funcione **sin conexión**: el manifest (JSON válido, `standalone`, colores que coinciden con `styles.css` y los iconos de 192 y 512 px), los iconos de verdad (los `maskable` opacos y con la marca dentro del 80% central que recortan los lanzadores), `sw.js` (cáscara completa, nada de la API de CIMA), el aviso de **versión nueva** con el `pwa.js` real en jsdom (avisa si la versión cambia, y **no** avisa si sólo cambia el control), y en Chrome real: registro, `clients.claim`, precache de la cáscara y una pasada **con el servidor apagado** en la que la página se sigue abriendo. | Node + jsdom + Chrome/Chromium |
| `test-movil.js` | El buscador en un viewport de móvil (390×844): el campo mide 16px o más —por debajo, los móviles amplían la página al enfocarlo y molesta al escribir—, el viewport no prohíbe el zoom, el compositor no amplía al doble toque y la página no desborda a lo ancho. | Chrome/Chromium |
| `test-iconos.js` | Los iconos declarados en `index.html` se cargan de verdad y los PNG tienen su tamaño exacto (`favicon-32.png` 32×32, `apple-touch-icon.png` 180×180). | Chrome/Chromium |
| `test-solape.js` | Regresión del `z-index` del autocompletado: con `styles.css` ningún punto del desplegable queda tapado por los resultados y la barra superior sigue ganando al hacer scroll; y con el mismo CSS **sin el arreglo** debe detectarse el solape (si no lo detecta, el test avisa de que ya no sirve). | Chrome/Chromium |
| `test-api-real.js` | `api.js` contra la API real de CIMA: `?cn=` exacto, CN inexistente, nº de registro largo (tipo EMA), varios envases por `nregistro` y que `/medicamentos` sigue sin devolver `cn`. | Red |

## Detalles

- Cada suite trabaja en una **carpeta temporal** propia (`os.tmpdir()`):
  el repo no se modifica en ningún caso.
- El ancho de móvil de `test-movil.js` se consigue con un **iframe de 390px**,
  porque Chrome en Linux no baja de ~500px de ancho de ventana: así las media
  queries se evalúan como en un teléfono de verdad.
- Las páginas de prueba añaden un `<pre id="diag">` oculto donde vuelcan el
  diagnóstico como líneas `clave=valor`; `util.js` lo lee del DOM final de
  Chrome y lo convierte en objeto.
- El servidor HTTP de las pruebas lo levanta Node (`util.js`, sin dependencias),
  en un puerto libre, y sirve las copias temporales del sitio.
- `test-api-real.js` se **omite** (sin fallar) si no hay conexión.
- `test-pwa.js` tiene dos partes que conviene entender:
  - **El aviso de versión nueva se prueba en jsdom**, no en Chrome: el navegador
    no activa un service worker nuevo mientras la página no ha terminado de
    cargar, y para que el volcado del DOM no llegue antes de tiempo hay que
    retener justo eso, o sea que en Chrome esa parte no se puede medir. En jsdom
    se simula el service worker (incluido el cambio de versión) y se comprueba
    que avisa cuando toca y **no** avisa cuando sólo cambia el control.
  - Las dos pasadas por Chrome van **sin `--virtual-time-budget`** (el service
    worker tarda en tiempo real y con el reloj virtual no llega a activarse) y
    la página se mantiene cargando con la **compuerta**: una imagen que apunta a
    un segundo servidor que no contesta hasta que la propia página pide
    soltarla. Esa imagen va **en otro puerto** a propósito, para que el service
    worker no la intercepte (si la interceptara, en la pasada sin conexión
    fallaría al instante y el volcado llegaría antes de tiempo).
- La versión de `jsdom` está fijada en `package.json` para que las suites den el
  mismo resultado en cualquier máquina.
- El sitio se despliega desde el repositorio **tal cual**, así que estos
  ficheros también se sirven en `https://prospectoya.vercel.app/tests/`. No hay
  nada secreto en ellos, pero si alguna vez se prefiere ocultarlos basta con
  añadirlos a un `.vercelignore`.
