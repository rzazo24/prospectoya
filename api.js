/**
 * api.js
 * Funciones de acceso a la API pública de CIMA (AEMPS).
 * Base: https://cima.aemps.es/cima/rest/
 * CORS: la API responde con Access-Control-Allow-Origin: * — se puede
 * llamar directamente desde el navegador, sin proxy.
 *
 * Todas las funciones devuelven Promesas con el JSON ya parseado.
 */

const CIMA_BASE_URL = "https://cima.aemps.es/cima/rest";

/**
 * Busca medicamentos por nombre, principio activo, laboratorio, etc.
 * Doc: GET /medicamentos?{condiciones}
 * @param {Object} params - p.ej. { nombre: "paracetamol" }
 * @returns {Promise<Object>} resultado paginado de CIMA (con .resultados[])
 */
async function buscarMedicamentos(params) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${CIMA_BASE_URL}/medicamentos?${query}`);
  if (!res.ok) throw new Error(`Error buscando medicamentos: ${res.status}`);
  return res.json();
}

/**
 * Obtiene la ficha completa de un medicamento por número de registro o CN.
 * Doc: GET /medicamento?nregistro=X  (o ?cn=X)
 * Incluye el array `docs[]` con enlaces directos a PDF de ficha técnica/prospecto.
 * @param {Object} params - { nregistro } o { cn }
 */
async function obtenerMedicamento(params) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${CIMA_BASE_URL}/medicamento?${query}`);
  if (!res.ok) throw new Error(`Error obteniendo medicamento: ${res.status}`);
  return res.json();
}

/**
 * Lista presentaciones (envases) de medicamentos, cada una con su Código
 * Nacional (`cn`).
 * Doc: GET /presentaciones?{condiciones}
 *
 * Acepta los mismos filtros que `/medicamentos` (nombre, cn, nregistro,
 * pactivos, laboratorio…), así que sirve tanto para resolver el CN de un
 * medicamento concreto como para buscar directamente por código nacional.
 *
 * VERIFICADO CONTRA LA API REAL (20/09/2026):
 * - Devuelve `{ totalFilas, pagina, tamanioPagina, resultados[] }` y cada fila
 *   trae `cn` + `nregistro` además de los campos del medicamento
 *   (nombre, labtitular, receta, generico, comerc, docs…). El `nombre` es el de
 *   la presentación, con el envase incluido ("… , 20 comprimidos").
 * - El filtro `cn` es de coincidencia EXACTA: `?cn=662025` devuelve 1 fila,
 *   pero `?cn=6620` o `?cn=66202500` devuelven 0.
 * - NO admite lotes (`?nregistro=70310,77758` ni parámetros repetidos → 0).
 *   Por eso el CN de una lista de resultados se pide medicamento a medicamento
 *   (ver `cnsDeMedicamento()` en `app.js`).
 * - También ignora `pagina`/`tamanioPagina` y devuelve como mucho 200 filas, de
 *   modo que NO cubre todos los medicamentos de una búsqueda por nombre amplia.
 *
 * @param {Object} params - p.ej. { cn: "662025" } o { nregistro: "70310" }
 * @returns {Promise<Object>} resultado paginado de CIMA (con .resultados[])
 */
async function listarPresentaciones(params) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${CIMA_BASE_URL}/presentaciones?${query}`);
  if (!res.ok) throw new Error(`Error listando presentaciones: ${res.status}`);
  return res.json();
}

/**
 * Lista las secciones disponibles de un documento segmentado.
 * Doc: GET /docSegmentado/secciones/{tipoDoc}?nregistro=X
 * @param {number} tipoDoc - 1 = ficha técnica, 2 = prospecto
 * @param {string} nregistro
 * @returns {Promise<Array<{seccion: string, titulo: string, orden: number}>>}
 *   lista de secciones (VERIFICADO contra la API real: la clave del id es
 *   `seccion` y el título viene en `titulo`; el array ya llega en el orden
 *   del documento, que NO coincide con `orden` en la ficha técnica)
 *
 * VERIFICADO CONTRA LA API REAL (24/09/2026, nregistro BE250187IP, un Crestor
 * de importación paralela): cuando el documento no está segmentado, la API
 * no devuelve un array vacío, sino `{ error: "No existen secciones..." }`
 * con HTTP 200 igualmente. Pasa con medicamentos de documentación reducida
 * (importaciones paralelas, registros antiguos…), que solo traen un PDF sin
 * segmentar en `docs[]` (`secc: false`, sin `urlHtml`). Se normaliza a `[]`
 * para que el resto del código no tenga que distinguir las dos formas.
 */
async function listarSecciones(tipoDoc, nregistro) {
  const res = await fetch(
    `${CIMA_BASE_URL}/docSegmentado/secciones/${tipoDoc}?nregistro=${encodeURIComponent(nregistro)}`
  );
  if (!res.ok) throw new Error(`Error listando secciones: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Obtiene el contenido HTML de una sección concreta de un documento.
 * Doc: GET /docSegmentado/contenido/{tipoDoc}?nregistro=X&seccion=X
 * @param {number} tipoDoc - 1 = ficha técnica, 2 = prospecto
 * @param {string} nregistro
 * @param {string} seccion - id de sección devuelto por listarSecciones()
 * @returns {Promise<string>} HTML de la sección, listo para insertar (ver
 *   nota de sanitización más abajo antes de usar innerHTML)
 *
 * VERIFICADO CONTRA LA API REAL (20/09/2026, nregistro=77758 y otros):
 * este endpoint NO devuelve el HTML en texto plano, sino un array JSON del
 * tipo [{ seccion, titulo, contenido, orden }], donde `contenido` es el HTML.
 * Normalmente hay un solo elemento, pero puede haber varios (subsecciones),
 * por eso se concatenan todos los fragmentos.
 */
async function obtenerContenidoSeccion(tipoDoc, nregistro, seccion) {
  const params = new URLSearchParams({ nregistro, seccion });
  const res = await fetch(
    `${CIMA_BASE_URL}/docSegmentado/contenido/${tipoDoc}?${params}`
  );
  if (!res.ok) throw new Error(`Error obteniendo contenido: ${res.status}`);

  const cuerpo = await res.text();

  try {
    const data = JSON.parse(cuerpo);
    const fragmentos = Array.isArray(data) ? data : [data];
    return fragmentos
      .map((fragmento) =>
        typeof fragmento === "string" ? fragmento : fragmento && fragmento.contenido
      )
      .filter(Boolean)
      .join("\n");
  } catch (err) {
    // Salvaguarda: si algún registro devolviese HTML plano, se usa tal cual.
    return cuerpo;
  }
}

/**
 * Medicamentos equivalentes: mismo principio activo, misma dosis y misma
 * forma farmacéutica (aunque sea de otro laboratorio o de otro tamaño de
 * envase). Doc: GET /medicamentos?vmp=X
 *
 * VERIFICADO CONTRA LA API REAL (22/09/2026): `vmp` identifica de forma
 * exacta la combinación principio activo + dosis + forma (ej. "Paracetamol
 * 1.000 mg comprimido"), y SÍ filtra de verdad (`vmp=17511000140104` → 62
 * medicamentos, todos paracetamol 1 g en comprimidos, de distintos
 * laboratorios). El id que hace falta no llega en `/medicamentos` ni en
 * `/medicamento?nregistro=`: hay que sacarlo de `/presentaciones`, donde cada
 * fila trae `dcp.id` — comprobado que es el MISMO id que aquí se llama `vmp`
 * (mismo valor exacto para el mismo medicamento). Por contraste, `vmpp` (que
 * además exige el tamaño de envase) está roto como filtro de
 * `/medicamentos`: `?vmpp=X` ignora el valor y devuelve el catálogo entero.
 * @param {string} vmp - el id de `presentacion.dcp.id` (ver `listarPresentaciones()`)
 */
async function buscarPorVmp(vmp) {
  const res = await fetch(`${CIMA_BASE_URL}/medicamentos?vmp=${encodeURIComponent(vmp)}`);
  if (!res.ok) throw new Error(`Error buscando equivalentes: ${res.status}`);
  return res.json();
}

// NOTA DE SEGURIDAD:
// El HTML de docSegmentado/contenido viene de una fuente oficial y fiable
// (AEMPS), pero antes de inyectarlo con innerHTML es buena práctica pasarlo
// por una sanitización básica (p.ej. DOMPurify) si en algún momento se
// combina con otras fuentes de datos menos fiables.
