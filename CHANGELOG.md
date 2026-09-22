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

## Sin publicar

### Corregido

- **Un clic de ratón en una sugerencia del desplegable no elegía nada**:
  reportado por un usuario. Las opciones del desplegable no son focusables
  (se marcan con `aria-activedescendant`), así que un clic de verdad sobre
  una de ellas le quita el foco a `#search-input` **antes** de que llegue el
  `click` (el orden real de eventos es `mousedown` → `blur`/`focusout` →
  `mouseup` → `click`); el `focusout` ya cerraba el desplegable (arreglo de
  la versión que añadió "tabular fuera del campo también lo cierra"), así
  que la opción quedaba oculta justo antes de que el `click` pudiera
  elegirla. Ahora `#search-suggestions` cancela el `mousedown` por defecto
  (`preventDefault()`), así que el foco nunca se mueve y el `click`
  posterior sí llega. **jsdom no reproduce el `blur` automático de un
  navegador real al hacer clic en un elemento no enfocable**, así que este
  fallo llevaba tiempo sin test que lo detectara (`test-busqueda.js` sí
  cubría "Enter elige la sugerencia marcada", pero nunca un clic de ratón de
  verdad) y solo se reprodujo de forma fiable con un clic real vía CDP
  (`Input.dispatchMouseEvent`, en un perfil de Chrome limpio para evitar que
  el service worker sirviera una copia vieja de `app.js` — comprobado
  además que, con un `.click()` sintético, jsdom no hace hit-testing y el
  fallo tampoco se veía). Nueva comprobación en `test-busqueda.js`: el
  `mousedown` sobre el desplegable llega con su acción por defecto
  cancelada (el mecanismo del arreglo, ya que el efecto completo no se
  puede probar en jsdom). Toca `app.js` (cáscara), así que `VERSION` sube
  en `sw.js` (`v20` → `v21`).

## [0.8.0] - 2026-09-22

Octava entrega: se aprovechan más filtros reales de la API (medicamentos
equivalentes por principio activo/dosis/forma, y filtros combinables de
receta, comercialización y laboratorio), tras comprobar a fondo contra la API
real qué filtra de verdad y qué no (`forma farmacéutica` no tiene filtro real
en `/medicamentos`, pese a probar ~15 nombres de parámetro distintos). De
paso, el barrido de calidad del resumen rápido que sacó el fallo de la 0.7.0
deja de ser un script suelto y pasa a ser una suite permanente del repo, con
una muestra ampliada a 155 medicamentos reales. Todo sigue sin backend, sin
build, sin frameworks y sin dependencias en el sitio.

### Añadido

- **`test-barrido.js`**: versión permanente y más amplia del script de barrido
  de calidad del resumen rápido que antes vivía fuera del repo. Comprueba
  `extraerResumenRapido()` contra la API real sobre **155 medicamentos
  reales** (unos 35 principios activos de categorías terapéuticas distintas,
  con varios laboratorios de cada uno, frente a los 50 del script original),
  con cobertura mínima del 90% por campo y un techo amplio de "sospechas"
  heurísticas (palabras clave que el texto debería mencionar), pensado para
  avisar de un desplome general de calidad, no como comprobación estricta
  caso a caso (tiene falsos positivos conocidos: comprobado a mano que los 15
  casos que marca en la muestra actual son legítimos, solo que están escritos
  sin la palabra clave exacta que busca la heurística). Con este barrido se
  encontró de verdad, en su día, el fallo del subtítulo anidado que cubre
  `test-resumen.js` — comprobado además que revertir ese fallo lo detecta
  `test-resumen.js` (caso sintético y determinista) pero no el umbral amplio
  de `test-barrido.js` (19/155 sospechas, por debajo del 25% del techo): es a
  propósito, uno no sustituye al otro (ver AGENTS.md). Necesita red y tarda
  ~20s: no forma parte de `npm test`, tiene su propio `npm run test:barrido`.
- **Filtros combinables** (receta, comercialización, laboratorio): un botón
  "Filtros" junto al buscador abre un panel con los tres campos, que se
  combinan en AND con el término de búsqueda y entre sí (comprobado contra
  la API real: `nombre=paracetamol&laboratorio=cinfa&receta=0` → 0, ya que
  todo el paracetamol de Cinfa lleva receta). Solo afectan a la búsqueda
  completa por nombre, nunca al desplegable de sugerencias ni a una consulta
  por CN o nº de registro (ya apuntan a un envase o medicamento concreto).
  Se probaron y descartaron ~15 nombres de parámetro distintos para filtrar
  por **forma farmacéutica** (`forma`, `formaFarmaceutica`, `dosis`, `via`…,
  con el id de `/maestras?maestra=3` y con el simplificado): ninguno filtra
  de verdad en `/medicamentos`, así que se sustituyó por
  **"Comercialización"** (`comerc=1`/`comerc=0`), que sí filtra. También se
  confirmó que `receta`/`comerc` solo entienden `"1"`/`"0"` literales
  (`true`/`false`/`si`/`no` se ignoran) y que `laboratorio` filtra por
  coincidencia parcial sin distinguir mayúsculas (`cinfa` y
  `Laboratorios Cinfa S.A.` dan el mismo resultado). `test-busqueda.js`
  cubre abrir/cerrar el panel, que un filtro repite la búsqueda con el
  término ya escrito, que las sugerencias en vivo no llevan filtros, "Limpiar
  filtros" y el resaltado del botón; `test-api-real.js` fija `receta`,
  `comerc`, `laboratorio` y su combinación en AND contra la API real. Toca
  `index.html`, `app.js` y `styles.css` (cáscara), así que `VERSION` sube en
  `sw.js` (`v18` → `v19`). `ayuda.html` explica los tres campos en un commit
  aparte (`VERSION` `v19` → `v20`).
- **Medicamentos equivalentes**: al abrir un medicamento, si existen, sale
  una lista de otros con el mismo principio activo, la misma dosis y la
  misma forma farmacéutica (`GET /medicamentos?vmp=X`, que **sí filtra de
  verdad** — `vmp=17511000140104` → 62 medicamentos, todos "paracetamol 1 g
  comprimidos", de laboratorios distintos). El id (`vmp`) no llega en
  `/medicamentos` ni en `/medicamento?nregistro=`: sale de `dcp.id` en
  `/presentaciones` (comprobado que es el mismo valor exacto), la misma
  petición que ya se hacía para el CN — no hay petición nueva para eso, solo
  la de `?vmp=`. Tocar un equivalente abre su ficha en la misma ventana
  (reutiliza `selectMedicamento()`, la misma puerta de siempre). Si el
  medicamento tiene `nosustituible.id` distinto de 0 (medicamentos de margen
  terapéutico estrecho, como la levotiroxina, comprobado con nregistro
  `84484`), se avisa con el motivo oficial de la AEMPS encima de la lista en
  vez de sugerirlos sin más. `test-busqueda.js` cubre el caso con y sin
  equivalentes, el aviso de no sustituible, el clic para cambiar de
  medicamento y que no se repita la petición de `/presentaciones`;
  `test-api-real.js` fija `dcp.id`/`vmp` y `nosustituible` contra la API
  real. Toca `index.html`, `app.js` y `styles.css` (cáscara), así que
  `VERSION` sube en `sw.js` (`v17` → `v18`).

### Cambiado

- **`obtenerEquivalentes()` sustituida por `buscarPorVmp()`**: la versión
  anterior (`v0.6.0`) pedía `GET /vmpp?practiv1=X` (el principio activo, sin
  dosis ni forma) y solo daba descripciones y un contador (`presComerc`), sin
  los medicamentos de verdad. Para "medicamentos equivalentes" hacía falta
  algo más preciso (misma dosis y forma, con nombre y nregistro reales), y
  eso es exactamente lo que da `/medicamentos?vmp=X` a partir de `dcp.id`
  (ver "Añadido"). `/vmpp?practiv1=` sigue filtrando bien, pero ya no se usa
  para nada; se deja documentado en README/AGENTS.md por si hiciera falta
  más adelante (por ejemplo, para listar "otras dosis y formas" del mismo
  principio activo, no solo la misma).
- **`cacheCN` pasa a llamarse `cachePresentaciones`**: guarda la fila entera
  de `/presentaciones`, no solo el CN, para que `cnsDeMedicamento()` (mismo
  nombre y comportamiento de siempre) y la nueva `vmpDeMedicamento()`
  compartan una única petición por medicamento en vez de repetirla.

**Commits de esta versión:**
[`782cd02`](https://github.com/rzazo24/prospectoya/commit/782cd02) ·
[`13999c3`](https://github.com/rzazo24/prospectoya/commit/13999c3) ·
[`6a20db4`](https://github.com/rzazo24/prospectoya/commit/6a20db4) ·
[`6725b07`](https://github.com/rzazo24/prospectoya/commit/6725b07)

## [0.7.0] - 2026-09-22

Séptima entrega: se corrige un fallo real en el resumen rápido (no un simple
pulido) encontrado con un barrido de calidad contra la API real sobre 50
medicamentos variados — el mismo método que ya había sacado la tarjeta de
Alcohol en la versión anterior. Cuando el prospecto anida un subtítulo
general y uno más concreto justo después (por ejemplo "Embarazo y lactancia"
→ "Embarazo:"), la extracción se quedaba con una frase de relleno y perdía
el contenido de verdad. De paso se arregla que 9 de esos 50 medicamentos
mostraban contraindicaciones en minúscula. La extracción del resumen rápido
estrena, además, su primera suite de tests dedicada. Todo sigue sin backend,
sin build, sin frameworks y sin dependencias en el sitio.

### Corregido

- **El resumen rápido ya no se corta en un subtítulo del mismo tema**: cuando
  el prospecto anida un subtítulo general y uno más concreto justo después
  (comprobado con datos reales, nregistro `68477`, lorazepam: "Embarazo y
  lactancia" → una frase genérica → "Embarazo:" → el contenido de verdad
  sobre el riesgo en el embarazo), `recogerTexto()` paraba en el segundo
  subtítulo por creer que era un tema distinto, y la tarjeta se quedaba solo
  con la frase genérica de en medio ("Consulte a su médico o farmacéutico
  antes de utilizar cualquier medicamento."), perdiendo el contenido
  relevante. Ahora solo para si el subtítulo siguiente **no** encaja con los
  patrones del propio campo (`campo.subTitulos`); si encaja (como
  "Embarazo:" dentro de "embarazo"), sigue recogiendo texto como si fuera
  continuación del mismo tema. Encontrado con un barrido de calidad contra
  la API real sobre 50 medicamentos variados (el mismo tipo de comprobación
  que ya había sacado la tarjeta de Alcohol).
- **Las tarjetas del resumen rápido ya no empiezan en minúscula**: en las
  listas de contraindicaciones, CIMA suele escribir cada `<li>` en minúscula
  ("si es alérgico a…"), como continuación implícita de su subtítulo ("No
  tome X si…"); sin ese subtítulo delante, la tarjeta se leía como una frase
  a medias. Ahora una función `capitalizar()`, aplicada en las cuatro vías de
  salida de `buscarCampo()`, pone en mayúscula la primera letra del texto
  final. Detectado en el mismo barrido: 9 de 50 medicamentos lo tenían.
- Nueva suite **`test-resumen.js`** (Node + jsdom, sin red): fija los dos
  arreglos con un prospecto simulado, y comprueba que fallan sin ellos
  (verificado a mano). Hasta ahora la extracción del resumen rápido no tenía
  ningún test dedicado. `npm test` pasa a 10 suites y 347 comprobaciones.
  Toca `app.js` (cáscara), así que `VERSION` sube en `sw.js` (`v16` → `v17`).

**Commits de esta versión:**
[`8b87372`](https://github.com/rzazo24/prospectoya/commit/8b87372)

## [0.6.0] - 2026-09-22

Sexta entrega: se corrigen varios detalles de accesibilidad y de ajuste fino
en el móvil (el desplegable de sugerencias que no cerraba con `Tab`, el halo
de marca que quedaba huérfano encima del buscador, el hueco de arriba
desproporcionado, la ✕ del detalle que se encendía sola al abrirse), se
revisa el resumen rápido (fuera la tarjeta de Alcohol, la menos fiable de las
cinco) y se aprovechan por fin varios campos que la API de CIMA ya traía
gratis en cada búsqueda: dos badges nuevos (problema de suministro,
seguimiento adicional) y un enlace al documento oficial, sin ninguna petición
extra. De paso se corrigen dos asunciones equivocadas sobre la API
(`/psuministro` y `/vmpp` no filtran como parecía) y se confirma que `pagina`
sí pagina de verdad. Todo sigue sin backend, sin build, sin frameworks y sin
dependencias en el sitio.

### Añadido

- **Badge de "problema de suministro activo"**, **badge de "medicamento en
  seguimiento adicional"** (el triángulo negro de la UE) y **enlace al
  documento oficial** ("Ver en cima.aemps.es", junto a las pestañas
  Prospecto/Ficha técnica, sigue a la pestaña activa). Los tres usan campos
  que `/medicamentos` y `/presentaciones` ya traen en cada fila —`psum`,
  `triangulo`, `docs[]`— así que no hace falta ninguna petición aparte:
  `selectMedicamento()` los lee directamente del medicamento elegido.
  Verificado con datos reales (`AMOXICILINA/ACIDO CLAVULANICO SANDOZ`,
  nregistro `62800`, tiene `psum: true` de verdad ahora mismo). `ayuda.html`
  y `README.md` lo explican; `test-busqueda.js` fija que los tres badges/
  enlace salen cuando el medicamento los trae y se quedan ocultos cuando no
  (sin arrastrar los del medicamento anterior).
- **`obtenerEquivalentes()` corregida**: pedía `GET /vmpp?nregistro=X`, pero
  verificado contra la API real que `nregistro` **no filtra** (devuelve el
  catálogo VMPP entero, 7022 filas, sin relación con lo pedido). El filtro que
  sí funciona es `practiv1` (nombre del principio activo): ahora la función lo
  usa. Sigue sin llamarse desde `app.js` (Fase 2, sin UI de equivalentes).
- **`comprobarProblemaSuministro()` quitada de `api.js`**: llamaba a
  `GET /psuministro?cn=X`, y verificado contra la API real que **tampoco
  filtra** (con un CN real que tiene un problema de suministro activo,
  devuelve el listado nacional completo —862 filas— sin que ese CN aparezca
  entre los resultados). No hacía falta arreglarla: el campo `psum`, ya
  embebido en el medicamento (ver el badge, arriba), resuelve lo mismo sin
  necesidad de este endpoint. `test-api-real.js` fija que ninguno de los dos
  endpoints filtra, y que `practiv1` sí lo hace. Toca `index.html`, `app.js` y
  `styles.css` (cáscara), así que `VERSION` sube en `sw.js` (`v15` → `v16`).

### Corregido

- **Tabular fuera del buscador cierra el desplegable de sugerencias**: antes
  solo lo cerraban `Esc` y un clic fuera; si se salía con `Tab` (por ejemplo
  hacia el botón de enviar) el desplegable se quedaba abierto y
  `aria-expanded="true"` seguía puesto en el input aunque ya no tuviera el
  foco. Ahora un `focusout` en `#search-input` lo cierra salvo que el foco
  vaya a parar al propio input. Lo cubre `test-busqueda.js`.
- **El halo de marca ya no queda huérfano en el móvil**: `body::before` pinta
  un degradado radial fijo al viewport (`at 50% -8%`), pensado como un foco
  detrás del badge y el titular — en el escritorio funciona porque el hero
  está pegado arriba, pero desde que el bloque de arriba se centra en el móvil
  (`v0.5.0`) el halo se quedaba flotando solo en el hueco vacío de encima, sin
  tocar ni el badge ni el título (visible comparando capturas con Chrome
  headless a 390×844). Ahora, solo en el corte de móvil, el halo fijo se apaga
  y el hero lleva el suyo propio (`.hero::before`, con bleed hacia arriba): al
  ser parte de la caja del hero, viaja con él se centre donde se centre, sin
  tener que adivinar cuánto hueco sobra según el alto del teléfono o si los
  chips ocupan una o dos filas.
- **La ✕ del detalle ya no se queda "encendida" nada más abrir la ventana**:
  `showModal()` enfoca por su cuenta el primer elemento enfocable de dentro
  del `<dialog>`, y ese elemento es la propia ✕ (es lo primero en el
  marcado) — con la regla global `:focus-visible` (anillo de 2px del color de
  marca), eso se veía como un botón iluminado sin que nadie lo hubiera
  tocado (comprobado con Chrome: `document.activeElement` era `#detail-close`
  y `matches(":focus-visible")` daba `true` nada más llamar a
  `selectMedicamento()`). Ahora `abrirDetalle()` enfoca el propio `<dialog>`
  (`tabindex="-1"` en el HTML; ya tiene nombre accesible por
  `aria-labelledby="detail-name"`, así que un lector de pantalla anuncia el
  medicamento en vez de "botón cerrar") y se le quita su propio anillo de
  foco (`.dialogo-detalle:focus-visible { outline: none }`, no hace falta:
  el velo y el panel ya avisan de que hay algo modal). Lo fija
  `test-busqueda.js`.

### Cambiado

- **La ✕ del detalle y el botón de "volver arriba", más pequeños; los chips
  de ejemplo, un poco más grandes** (a petición directa, viendo capturas
  reales en el móvil). La ✕ pasa de 34px a 28px; "volver arriba", de 44px a
  38px (por debajo del mínimo táctil recomendado de 44px a propósito: es una
  acción secundaria y de baja frecuencia). Los chips suben de 0.86rem/0.32rem
  0.75rem a 0.92rem/0.4rem 0.9rem (letra y relleno). Sin más comportamiento
  que el tamaño; ningún test fijaba estas medidas. Junto con el arreglo del
  foco de la ✕, toca `index.html`, `app.js` y `styles.css` (cáscara), así que
  `VERSION` sube en `sw.js` (`v13` → `v14`).

- **En el móvil, el hueco de arriba del bloque superior queda topado en
  100px** (antes se repartía a partes iguales con el de abajo: medido a
  390×844, 213px arriba y 235px abajo — equilibrado, pero seguía pareciendo
  mucho blanco antes de llegar al buscador). Ahora, en el estado de partida
  (sin lista de resultados ni aviso), el `.hero` lleva un margen de arriba
  **fijo** (`4rem`) en vez de automático, y el margen automático del
  `.results-section` se lleva **todo** el hueco sobrante, no la mitad (medido:
  100px arriba —fijo, comprobado también a 667px de alto para probar que no
  depende de la pantalla— frente a 369,7px abajo a 844px). Con lista o aviso
  no cambia nada: el margen del `.hero` vuelve a su valor por defecto (0) y el
  bloque sigue volviendo pegado al topbar, como siempre. `test-movil.js`
  cambia su comprobación de "centrado ±1px" por cuatro nuevas: el hueco de
  arriba en 100px, que el de abajo es varias veces mayor, que el tope no
  cambia con el alto del móvil (comparado a 667px) y que toda la diferencia
  de alto (177px) la absorbe el hueco de abajo. Toca `styles.css` (cáscara),
  así que `VERSION` sube en `sw.js` (`v12` → `v13`).
- **El chip del código nacional lleva ahora el prefijo «CN» delante del
  número** (`CN 662025` en vez de `662025` a secas): visto junto a los demás
  chips (nombres de medicamento), un número suelto se leía como un resto de
  placeholder más que como un ejemplo de búsqueda. `data-ejemplo` se queda
  igual (solo los dígitos: es lo que de verdad se busca), así que el
  comportamiento no cambia, solo la etiqueta. Revisa la decisión de `v0.5.0`
  ("el chip... enseña sólo el número"). Se ha rehecho `social-preview.png`
  (usa el mismo chip) y `captura-inicio.png`. `test-html.js` se ajusta: compara
  el texto visible de los chips (no `data-ejemplo`, que ahora difiere a
  propósito para este chip) contra la maqueta del social preview. Junto con el
  arreglo del halo de arriba, `index.html` y `styles.css` (los dos, cáscara)
  cambian en esta tanda, así que `VERSION` sube en `sw.js` (`v11` → `v12`).
- **Corrección sobre la paginación real de CIMA** (README): se daba por hecho
  que `/medicamentos` y `/presentaciones` ignoraban `pagina` y `tamanioPagina`.
  Verificado hoy contra la API real: **`pagina` sí pagina de verdad**
  (`pagina=2` trae filas distintas de `pagina=1`); lo único que se ignora es
  `tamanioPagina` (siempre 200 filas por página). Además, **`totalFilas` es el
  total real del catálogo**, no un recorte a 200 (con "comprimidos":
  `totalFilas: 13995` con solo 200 `resultados`). De paso se confirmaron dos
  puntos que estaban en la lista de "sin confirmar": la búsqueda por `nombre`
  **no distingue mayúsculas ni acentos**, y el **orden de los resultados es
  estable** entre llamadas repetidas. No cambia ningún comportamiento del
  sitio (con `MAX_RESULTADOS` = 60 nunca se nota), pero deja la puerta abierta
  a paginar de verdad si algún día hiciera falta cubrir una búsqueda amplia
  más allá de las 200 primeras filas. `test-api-real.js` fija estos cuatro
  hechos contra la API real.

### Eliminado

- **La tarjeta "Alcohol" del resumen rápido**: probada la extracción real
  (no simulada) contra 9 medicamentos reales de la API de CIMA
  (paracetamol, ibuprofeno, esomeprazol, amoxicilina/clavulánico,
  metformina, diazepam, metronidazol, tramadol y amlodipino/atorvastatina),
  el campo `alcohol` fallaba de una forma que los otros cuatro (`posologia`,
  `contraindicaciones`, `embarazo`, `conduccion`) no: en amoxicilina/
  clavulánico extraía **texto incorrecto** ("contiene… alcohol bencílico…",
  un excipiente, no una interacción — el patrón `/alcohol/i` no distingue
  "bebe alcohol" de "alcohol bencílico"); en metronidazol —el medicamento
  con la interacción con alcohol más conocida y grave de la muestra—
  extraía un **puntero inútil** ("Consulte la sección…") en vez del aviso
  de verdad; y en metformina y amlodipino/atorvastatina el resultado era un
  fragmento de frase sin contexto ("Si bebe mucho alcohol."). Sólo 3 de los
  9 casos (paracetamol, diazepam, tramadol) daban un texto claro y completo.
  Los otros cuatro campos acertaban en los 9 casos. Revisa la decisión de
  `v0.5.0` de incluir esta quinta tarjeta. Se quita la entrada `alcohol` de
  `CAMPOS_RESUMEN` (`app.js`) y la regla `.quick-summary-card-alcohol::before`
  (`styles.css`, ya no se usa); ayuda.html y README dejan de mencionarla
  entre las alertas clave. Ningún test dependía del campo, así que no hace
  falta tocar ninguna suite. Sube `VERSION` en `sw.js` (`v14` → `v15`) por
  tocar `app.js`, `styles.css` y `ayuda.html` (cáscara).

**Commits de esta versión:**
[`0dcaba0`](https://github.com/rzazo24/prospectoya/commit/0dcaba0) ·
[`dd53902`](https://github.com/rzazo24/prospectoya/commit/dd53902) ·
[`de6a2e1`](https://github.com/rzazo24/prospectoya/commit/de6a2e1) ·
[`fe712c5`](https://github.com/rzazo24/prospectoya/commit/fe712c5) ·
[`7cbfccc`](https://github.com/rzazo24/prospectoya/commit/7cbfccc) ·
[`0c2472a`](https://github.com/rzazo24/prospectoya/commit/0c2472a) ·
[`2baed5f`](https://github.com/rzazo24/prospectoya/commit/2baed5f) ·
[`e140f5b`](https://github.com/rzazo24/prospectoya/commit/e140f5b)

## [0.5.0] - 2026-09-21

Quinta entrega: el detalle del medicamento **se abre en una ventana centrada** (un
`<dialog>` nativo, fuera del flujo de la página), la web **aprovecha las pantallas
grandes** con los resultados en varias columnas y la **interfaz se limpia** (sin
pie en el buscador, sin texto dentro del campo y con titular y ejemplos nuevos).
En el móvil, además, el bloque de arriba queda **centrado en la pantalla** y el
buscador baja un poco. Todo sigue sin backend, sin build, sin frameworks y **sin
dependencias en el sitio** (la única, `jsdom`, es de desarrollo y vive en
`tests/`).

### Cambiado

- **La web se adapta a las pantallas grandes**: hasta 1179px se ve como siempre
  (columna de 780px) y a partir de ahí el contenedor se ensancha (1060px; 1260px
  desde 1500px; 1400px desde 1900px) y los resultados pasan a una rejilla de
  varias columnas, que es en lo que se aprovecha el ancho. El renglón del
  prospecto se queda en 44rem —los mismos que ya se leían—: lo que crece son las
  columnas, no el texto. Lo mide `test-resoluciones.js` a 900, 1180, 1600 y
  2560px.
- **El prospecto se abre en una ventana centrada**, no dentro de la página: al
  elegir una sugerencia del desplegable **o** un resultado de la lista se abre un
  `<dialog>` nativo con `showModal()` — fondo oscurecido, lo de detrás inerte, el
  foco dentro y `Esc` para cerrar (además de la ✕ y de un clic en el fondo). En el
  móvil ocupa la pantalla entera; en el escritorio va centrada y mide
  `--medida-detalle` (`--medida-texto` + el relleno de la tarjeta: 742px), de
  forma que el texto del prospecto llena su tarjeta de lado a lado. Con esto
  **desaparece el maestro-detalle** que se había probado para pantallas grandes
  (ya no hay un documento al lado que justifique dejar la lista estrecha): los
  resultados usan el ancho entero en varias columnas aunque la ventana esté
  abierta. Lo comprueban `test-busqueda.js` (abrir desde los dos sitios, la ✕, el
  fondo, volver a abrir) y `test-resoluciones.js` (modal, centrado a ±0,5px,
  ancho ≤743px, el texto sin hueco, la ✕ a la vista y la lista sin encoger).
- **Titular y subtítulo del buscador**: ahora son *«El prospecto, pero legible.»*
  y *«Busca por nombre o principio activo y encuentra lo importante en segundos.»*
  (antes «Lee lo importante de cualquier medicamento sin pelearte con el prospecto.»
  y un texto que enumeraba dosis, contraindicaciones y alertas clave). La captura
  del README se ha regenerado con el titular nuevo.
- **Ejemplos de búsqueda del buscador**: ahora son `metformina`, `paracetamol`,
  `trajenta`, `crestor` y `662025` (antes paracetamol, ibuprofeno, omeprazol,
  amoxicilina y CN 662025). El chip del código nacional enseña **sólo el número**
  y la ayuda aclara que es un CN. Comprobado contra la API real: los cinco
  devuelven resultados (metformina 181, paracetamol 195, trajenta 1, crestor 18 y
  662025, un envase).
- **La tarjeta del social preview** (`social-preview.png`, 1280×640) se ha
  rehecho: seguía con el titular viejo, con el texto de dentro del buscador (el
  placeholder que se quitó) y con los chips antiguos (`paracetamol`, `ibuprofeno`
  y `CN 662025`). Ahora lleva el titular y la entradilla nuevos y los cinco chips
  actuales, y su maqueta vive en `tests/maqueta-social-preview.html` (con la
  tipografía Inter en un fichero local), para poder rehacerla cuando cambie la
  interfaz. `og:title`, `twitter:title` y `og:image:alt` se han puesto a juego
  con el titular nuevo. La tarjeta va **centrada** (la maqueta necesita el
  `* { box-sizing: border-box }` de `styles.css` y 21px de aire de más arriba) y
  `test-paginas.js` lo mide con Chrome en las dos direcciones: el lienzo a
  1280×640, los seis bloques a ±0,5 px del centro de la imagen y el aire de
  arriba y abajo equilibrado. El buscador de la tarjeta lleva el mismo aire a los
  dos lados (20px): con el de la web (28px a la izquierda y 13 a la derecha) la
  tinta de la tarjeta quedaba 8,5px a la derecha aunque la caja fuera centrada.
- **En el móvil, el bloque de arriba queda centrado en la pantalla**: antes el
  hero, el buscador y los chips se quedaban pegados al techo y debajo sobraba
  media pantalla vacía. Ahora el `body` es una columna del alto de la pantalla
  (`100dvh` y no `vh`: en el móvil la barra del navegador cuenta en `vh` y el
  bloque saldría por debajo del centro que se ve), `#app` se queda con el hueco
  libre y los **márgenes automáticos** del hero y de la sección de resultados
  reparten lo que sobra a partes iguales: medido a 390px, **234,9px de aire
  arriba y abajo** (desfase 0px; antes el bloque quedaba a 36px del topbar). Los
  márgenes automáticos valen 0 en cuanto el contenido no cabe, así que con una
  lista larga la página se ve como siempre (el hero a 8px del topbar) y nada
  queda fuera de la vista: por eso **no** se usa `justify-content: center`, que
  dejaría el principio del contenido por encima del borde sin poder desplazarlo
  hacia arriba. El centrado solo actúa en el estado de partida (sin resultados ni
  aviso), y en cuanto hay lista el `#app` recupera sus 3rem de aire de abajo. Lo
  mide `test-movil.js`, que además comprueba que la medición detecta el centrado
  deshecho (con el parche la medición se va a 36px y 424px) y que con 30
  resultados el hero vuelve arriba y el hueco automático es 0.
- **El buscador del móvil es un poco más bajo**: de 66px a **56,4px** (medido a
  390px), con el relleno del campo (0,7rem → 0,55rem) y el del propio compositor
  (0,45rem → 0,3rem) más ajustados, así que el alto lo marca el botón. El campo
  sigue con 44,8px de alto, por encima de los 40px que pide `test-movil.js`. El
  buscador del escritorio no se toca (ahí se ve bien).
- **La cáscara de la PWA sube a `v11`** en `sw.js` (por los cambios de los
  estilos: el centrado del móvil, el buscador más bajo y el badge): quien tenga
  la web abierta verá el aviso de "versión nueva" y el caché anterior se borra al
  activarse.

### Corregido

- **El badge «Problema de suministro activo» salía siempre**, aunque no hubiera
  ningún problema de suministro (y aunque la Fase 2 todavía no lo active): el
  `hidden` del HTML no podía con el `display: inline-block` de `.badge`, porque
  faltaba la regla `.badge[hidden] { display: none; }` que pide el propio
  AGENTS.md. Se ha visto con datos reales de CIMA (`metformina`) al mirar la
  captura del detalle. Ahora `test-resoluciones.js` mide el `display` del badge en
  Chrome y comprueba que es `none` (sin la regla falla, comprobado).
- **Las tarjetas del resumen rápido quedaban pegadas a la izquierda**: son 5
  apartados, así que en cualquier rejilla sobra una fila (3+2, 2+2+1…) y con
  `display: grid` la fila incompleta se alineaba al principio: medido con datos
  reales de CIMA, se iba **130px** (a 1920px) y **168px** (a 1366px) a la
  izquierda del centro, y el bloque entero se veía descentrado. Ahora las
  tarjetas se reparten con `flex` + `justify-content: center` (y un tope de ancho
  para que una fila de una sola tarjeta no se estire de lado a lado), así que
  todas miden lo mismo y las filas incompletas van centradas. Lo mide
  `test-resoluciones.js` en los cuatro anchos, y se ha comprobado que vuelve a
  fallar si se pone `grid`.
- **La cápsula del logotipo no estaba centrada** en el cuadrado de la barra de
  arriba (ni en el buscador ni en la ayuda): el dibujo estaba centrado en
  (10,5, 10,5) de un lienzo de 24×24, así que se iba **1,25 px** hacia arriba y a
  la izquierda. Se han trasladado las coordenadas +1,5 unidades en los dos ejes
  (solo se mueve, de tamaño queda igual) y `test-paginas.js` ahora lo mide con
  `getBBox` en las dos páginas. El `favicon.svg` ya estaba bien (se dibuja con un
  rectángulo centrado y se gira sobre su propio centro).
- **La tinta del badge del hero iba 1,2px a la izquierda**: «Datos oficiales de la
  AEMPS · CIMA» tenía el relleno asimétrico (0,65rem a la izquierda y 0,8rem a la
  derecha), así que el icono dejaba menos aire que el texto (11,4px frente a
  13,8px) aunque la caja estuviera centrada. Con el relleno simétrico deja
  **13,8px a cada lado** (medido). Lo comprueba `test-movil.js`, y con el relleno
  viejo la comprobación falla.

### Eliminado

- **El pie de la página del buscador**, entero (atribución a la AEMPS y aviso
  sanitario), para dejar la interfaz más limpia. El aviso («esta web no da
  consejo médico») sigue donde tiene que seguir: en la ayuda, que es la página
  donde se explica todo lo demás, y la atribución a la AEMPS ya la lleva el badge
  del hero («Datos oficiales de la AEMPS · CIMA»). El pie de la ayuda se queda
  como estaba.

- **El texto de dentro del buscador** (placeholder): el campo ya no lleva nada
  escrito y se explica con la lupa; la etiqueta accesible se queda, que es la que
  leen los lectores de pantalla. De paso, deja de cortarse a medias en el móvil.
- **El enlace «Cómo funciona y ayuda» del pie** del buscador: la ayuda sigue a un
  toque desde `Ayuda`, en la barra de arriba (hay un test que lo comprueba).

## [0.4.0] - 2026-09-20

Cuarta entrega: las dos páginas estrenan un **botón de "volver arriba"** para
volver de un toque al buscador o a la ayuda cuando se ha bajado leyendo un
prospecto. Todo sigue sin backend, sin build, sin frameworks y **sin
dependencias en el sitio** (la única, `jsdom`, es de desarrollo y vive en
`tests/`).

### Añadido

- **Botón de "volver arriba"** (`arriba.js`): aparece abajo a la derecha en
  cuanto se baja por la página y devuelve al principio de la web. Es un `<button>`
  (funciona con teclado y lectores de pantalla), no cambia la URL, se aparta
  cuando está el aviso de versión abajo para no taparlo y, si el sistema pide
  menos movimiento (`prefers-reduced-motion`), sube de golpe en vez de con
  animación. Mientras tiene el foco no se oculta, para no dejar tirado a quien
  navega con el teclado. Lo comparten el buscador y la ayuda.
- **Suite `tests/test-arriba.js`**: comprueba con Chrome real, en las dos
  páginas, que el botón aparece al bajar, que al pulsarlo se le pide a la ventana
  subir al principio (`window.scrollTo` con `top: 0`), que el foco no se pierde,
  que la URL no cambia, que respeta `prefers-reduced-motion` y que no se solapa
  con el aviso de versión.

### Cambiado

- **La cáscara de la PWA sube a `v2`** en `sw.js` (por `arriba.js`): quien tenga
  la web abierta verá el aviso de "versión nueva" y el caché anterior se borra
  al activarse.

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

[0.8.0]: https://github.com/rzazo24/prospectoya/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/rzazo24/prospectoya/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/rzazo24/prospectoya/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/rzazo24/prospectoya/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/rzazo24/prospectoya/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/rzazo24/prospectoya/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/rzazo24/prospectoya/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/rzazo24/prospectoya/releases/tag/v0.1.0
