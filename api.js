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
 * Lista las secciones disponibles de un documento segmentado.
 * Doc: GET /docSegmentado/secciones/{tipoDoc}?nregistro=X
 * @param {number} tipoDoc - 1 = ficha técnica, 2 = prospecto
 * @param {string} nregistro
 * @returns {Promise<Array>} lista de secciones (cada una con su id/título)
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
 */
async function obtenerContenidoSeccion(tipoDoc, nregistro, seccion) {
  const params = new URLSearchParams({ nregistro, seccion });
  const res = await fetch(
    `${CIMA_BASE_URL}/docSegmentado/contenido/${tipoDoc}?${params}`
  );
  if (!res.ok) throw new Error(`Error obteniendo contenido: ${res.status}`);
  // CIMA devuelve el HTML como texto plano en el cuerpo de la respuesta
  return res.text();
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
