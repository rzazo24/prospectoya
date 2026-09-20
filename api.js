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
 */
async function listarSecciones(tipoDoc, nregistro) {
  const res = await fetch(
    `${CIMA_BASE_URL}/docSegmentado/secciones/${tipoDoc}?nregistro=${encodeURIComponent(nregistro)}`
  );
  if (!res.ok) throw new Error(`Error listando secciones: ${res.status}`);
  return res.json();
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
 * (Fase 2) Comprueba si un medicamento tiene un problema de suministro activo.
 * Doc: GET /psuministro?cn=X
 */
async function comprobarProblemaSuministro(cn) {
  const res = await fetch(`${CIMA_BASE_URL}/psuministro?cn=${encodeURIComponent(cn)}`);
  if (!res.ok) throw new Error(`Error comprobando suministro: ${res.status}`);
  return res.json();
}

/**
 * (Fase 2) Obtiene equivalentes clínicos (VMP/VMPP) de un medicamento.
 * Doc: GET /vmpp?nregistro=X
 */
async function obtenerEquivalentes(nregistro) {
  const res = await fetch(`${CIMA_BASE_URL}/vmpp?nregistro=${encodeURIComponent(nregistro)}`);
  if (!res.ok) throw new Error(`Error obteniendo equivalentes: ${res.status}`);
  return res.json();
}

// NOTA DE SEGURIDAD:
// El HTML de docSegmentado/contenido viene de una fuente oficial y fiable
// (AEMPS), pero antes de inyectarlo con innerHTML es buena práctica pasarlo
// por una sanitización básica (p.ej. DOMPurify) si en algún momento se
// combina con otras fuentes de datos menos fiables.
