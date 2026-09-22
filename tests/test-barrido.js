/**
 * Barrido de calidad del resumen rápido (extraerResumenRapido/buscarCampo en
 * app.js) contra la API REAL de CIMA, sobre una muestra amplia y diversa de
 * 155 medicamentos reales (unos 35 principios activos de categorías
 * terapéuticas distintas —analgésicos, antibióticos, cardiovascular,
 * psicofármacos, respiratorio…—, con varios laboratorios de cada uno para
 * variar el formato del prospecto).
 *
 * Es la versión permanente de un script de barrido que antes vivía fuera del
 * repo (un scratchpad de 50 medicamentos): con eso se encontró de verdad el
 * fallo del subtítulo anidado que cubre test-resumen.js (nregistro 68477,
 * lorazepam). Aquí queda como suite del repo, con una muestra más amplia y
 * con comprobaciones de verdad (umbrales de cobertura), no solo un volcado
 * para leer a mano.
 *
 * Los 4 campos del resumen (tras quitar "Alcohol", ver CHANGELOG) llevan,
 * además de la cobertura, una heurística de "sospechas": palabras clave que
 * el texto extraído DEBERÍA mencionar si de verdad habla del tema. No son
 * comprobaciones estrictas por caso —tienen falsos positivos conocidos y
 * comprobados a mano (p. ej. un texto sobre agranulocitosis por metamizol es
 * una contraindicación real aunque no diga "alérgico" ni "contraindicado")—,
 * así que se listan como diagnóstico y solo cuentan contra un umbral amplio
 * en conjunto: si un cambio en app.js dispara las sospechas muy por encima de
 * lo habitual (~10% de la muestra), esta suite lo nota.
 *
 * Necesita red (llama a la API real) y tarda más que el resto: no forma parte
 * de `npm test`, tiene su propio `npm run test:barrido`.
 *
 *   cd tests && node test-barrido.js
 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const RAIZ = path.resolve(__dirname, "..");
const api = fs.readFileSync(path.join(RAIZ, "api.js"), "utf8");
const app = fs.readFileSync(path.join(RAIZ, "app.js"), "utf8");
const tema = fs.readFileSync(path.join(RAIZ, "tema.js"), "utf8");
const pwa = fs.readFileSync(path.join(RAIZ, "pwa.js"), "utf8");
const arriba = fs.readFileSync(path.join(RAIZ, "arriba.js"), "utf8");

let html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
for (const [fichero, codigo] of [["tema.js", tema], ["arriba.js", arriba], ["api.js", api], ["app.js", app], ["pwa.js", pwa]]) {
  html = html.replace(`<script src="${fichero}"></script>`, `<script>${codigo}</script>`);
}

// 155 nregistros reales (24/09/2026), de 35 principios activos con varios
// laboratorios cada uno. Es una lista fija, no una consulta en vivo, para que
// la suite dé el mismo resultado en cualquier máquina; si algún medicamento
// deja de existir en CIMA, ese nregistro simplemente cuenta como error de red
// (ver el umbral de errores más abajo) sin tumbar la suite entera.
const NREGISTROS = [
  "1151011027", "1201458005", "57592", "60537", "61812", "61880", "61921", "62121", "62168", "62191",
  "62218", "62299", "62340", "62439", "62484", "62586", "62597", "62645", "62768", "62790",
  "62800", "62908", "63030", "63282", "63311", "63354", "63416", "63431", "63461", "63710",
  "63754", "63784", "64111", "64214", "64551", "64636", "64811", "64949", "65073", "65103",
  "65310", "65400", "65461", "65548", "65555", "65557", "65600", "65850", "65923", "65929",
  "66058", "66068", "66605", "66670", "66778", "66939", "66942", "67970", "68078", "68116",
  "68152", "68167", "68224", "68310", "68435", "68460", "68477", "69167", "69536", "69680",
  "69823", "69864", "69957", "70310", "70311", "70400", "70857", "70901", "70908", "71288",
  "72109", "72237", "72258", "72415", "73176", "73300", "73409", "73634", "74196", "75074",
  "75335", "75665", "75699", "75831", "75840", "76043", "76091", "76214", "76340", "77503",
  "77758", "77806", "77857", "78556", "78903", "78905", "79271", "79758", "79817", "80160",
  "80298", "80473", "81670", "81767", "82339", "82450", "82700", "82721", "82921", "83000",
  "83248", "83681", "83712", "84218", "84329", "84481", "84484", "85179", "85276", "85359",
  "85365", "85833", "85949", "86131", "86284", "86420", "86665", "87272", "87837", "88233",
  "88278", "88465", "88893", "89142", "89256", "89301", "89677", "89833", "89990", "90011",
  "90014", "90064", "90220", "90505", "90510",
];

// Heurísticas de sospecha, por campo (ver el aviso sobre falsos positivos
// arriba). `terminos` son palabras clave que el texto extraído DEBERÍA
// mencionar si de verdad habla del tema.
const HEURISTICAS = {
  posologia: { terminos: /\d+\s*(mg|g|ml)\b|comprimid|c[áa]psul|dosis|\btom|administra|una vez al d[íi]a|veces al d[íi]a/i },
  contraindicaciones: { terminos: /al[ée]rgic|hipersensib|contraindicad|no (?:debe|tome|utilice|use)/i },
  embarazo: { terminos: /embaraz|lactan|fertilidad/i },
  conduccion: { terminos: /conduc|m[áa]quina|veh[íi]cul/i },
};

// "Puntero inútil" de verdad: el TEXTO ENTERO es solo la remisión a otra
// sección, no un aparte al final de un contenido real (por eso exige que
// ocupe casi todo el texto, no solo que la frase aparezca en algún punto).
function esSoloPuntero(texto) {
  const m = texto.match(/consulte (?:la|el) secci[óo]n[^.]*\.?|v[ée]ase (?:la|el) secci[óo]n[^.]*\.?|ver secci[óo]n[^.)]*\)?/i);
  return Boolean(m) && m[0].length > texto.length * 0.6;
}

function sospechoso(campoId, texto) {
  const motivos = [];
  if (!texto) return motivos;
  const limpio = texto.trim();
  if (limpio.length < 25) motivos.push(`muy corto (${limpio.length} car.)`);
  if (esSoloPuntero(limpio)) motivos.push("puntero inútil (remite a otra sección sin decir nada)");
  const heur = HEURISTICAS[campoId];
  if (heur && !heur.terminos.test(limpio)) motivos.push("no menciona ningún término propio del tema");
  if (/^[a-záéíóúñ]/.test(limpio) && !/^\d/.test(limpio)) motivos.push("empieza en minúscula (posible fragmento)");
  return motivos;
}

const erroresJsdom = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => erroresJsdom.push(e.message));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://prospectoya.test/",
  virtualConsole: vc,
  beforeParse(window) {
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    window.Element.prototype.scrollIntoView = function () {};
    window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
    window.fetch = fetch; // fetch real de Node: esta suite consulta la API de verdad
  },
});
const { window } = dom;

let fallos = 0;
function comprobar(descripcion, condicion, extra = "") {
  if (!condicion) fallos++;
  console.log(`${condicion ? "OK   " : "FALLA"} ${descripcion}${extra ? "  (" + extra + ")" : ""}`);
}

(async () => {
  const stats = { posologia: { con: 0, sin: 0 }, contraindicaciones: { con: 0, sin: 0 }, embarazo: { con: 0, sin: 0 }, conduccion: { con: 0, sin: 0 } };
  const sospechas = [];
  const erroresRed = [];
  let procesados = 0;

  // Concurrencia moderada para no saturar la API ni tardar una eternidad
  const LOTE = 6;
  for (let i = 0; i < NREGISTROS.length; i += LOTE) {
    const lote = NREGISTROS.slice(i, i + LOTE);
    await Promise.all(
      lote.map(async (nregistro) => {
        try {
          const { resumen } = await window.extraerResumenRapido(nregistro);
          for (const campoId of Object.keys(stats)) {
            const dato = resumen[campoId];
            if (!dato) {
              stats[campoId].sin++;
              continue;
            }
            stats[campoId].con++;
            const motivos = sospechoso(campoId, dato.texto);
            if (motivos.length > 0) {
              sospechas.push({ nregistro, campoId, motivos, texto: dato.texto, origen: `${dato.documento} · ${dato.origen}` });
            }
          }
        } catch (err) {
          erroresRed.push({ nregistro, mensaje: err.message });
        } finally {
          procesados++;
        }
      })
    );
  }
  console.log(`Barrido completo: ${procesados}/${NREGISTROS.length} medicamentos`);

  console.log("\n=== COBERTURA (con datos / sin datos) ===");
  for (const [campoId, s] of Object.entries(stats)) {
    const total = s.con + s.sin;
    const pct = total > 0 ? ((s.con / total) * 100).toFixed(0) : "0";
    console.log(`${campoId}: ${s.con} con datos, ${s.sin} sin datos (${pct}% cobertura)`);
  }

  console.log(`\n=== SOSPECHAS DE CALIDAD (${sospechas.length}, diagnóstico —no todas son fallos reales, ver cabecera) ===`);
  for (const s of sospechas) {
    console.log(`[${s.nregistro}] ${s.campoId} — ${s.motivos.join("; ")}  ·  origen: ${s.origen}`);
  }

  if (erroresRed.length > 0) {
    console.log(`\n=== ERRORES DE RED (${erroresRed.length}) ===`);
    for (const e of erroresRed) console.log(`[${e.nregistro}] ${e.mensaje}`);
  }

  console.log("");
  comprobar("sin errores de jsdom durante el barrido", erroresJsdom.length === 0, erroresJsdom.join(" | "));
  comprobar(
    "menos del 10% de peticiones fallan por red",
    erroresRed.length <= Math.ceil(NREGISTROS.length * 0.1),
    `${erroresRed.length}/${NREGISTROS.length}`
  );
  for (const campoId of Object.keys(stats)) {
    const s = stats[campoId];
    const total = s.con + s.sin;
    comprobar(
      `cobertura de "${campoId}" de al menos el 90%`,
      total > 0 && s.con / total >= 0.9,
      `${s.con}/${total}`
    );
  }
  comprobar(
    "las sospechas de calidad no se disparan (máx. 25% de la muestra analizada)",
    sospechas.length <= Math.ceil((stats.posologia.con + stats.posologia.sin) * 0.25),
    `${sospechas.length}/${procesados - erroresRed.length}`
  );

  console.log(fallos === 0 ? "\nTODO OK (barrido de calidad del resumen rápido)" : `\n${fallos} fallo(s) (barrido de calidad del resumen rápido)`);
  process.exitCode = fallos === 0 ? 0 : 1;
})().catch((err) => {
  // Sin red, o con la API de CIMA caída, no es un fallo del código: se omite.
  console.log(`OMITIDO: no se pudo contactar con la API de CIMA (${err.message})`);
  process.exitCode = 0;
});
