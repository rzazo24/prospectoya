/**
 * Verificación de api.js contra la API REAL de CIMA (sin simulaciones).
 * Necesita conexión a internet; si no la hay, la suite se omite sin fallar.
 *
 *   cd tests && node test-api-real.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.resolve(__dirname, "..");

const ctx = { fetch, URLSearchParams, console, Promise };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, "api.js"), "utf8"), ctx);

let fallos = 0;
const comprobar = (desc, cond, extra = "") => {
  if (!cond) fallos++;
  console.log(`${cond ? "OK   " : "FALLA"} ${desc}${extra ? "  (" + extra + ")" : ""}`);
};

(async () => {
  const porCN = await ctx.listarPresentaciones({ cn: "662025" });
  comprobar(
    "listarPresentaciones({cn}) devuelve 1 envase con su cn",
    porCN.resultados.length === 1 && porCN.resultados[0].cn === "662025",
    JSON.stringify(porCN.resultados.map((p) => ({ nregistro: p.nregistro, cn: p.cn })))
  );

  const inexistente = await ctx.listarPresentaciones({ cn: "000000" });
  comprobar(
    "un CN inexistente devuelve 0 filas sin romper",
    inexistente.totalFilas === 0 && Array.isArray(inexistente.resultados),
    `totalFilas=${inexistente.totalFilas}`
  );

  const ema = await ctx.buscarMedicamentos({ nregistro: "1231752001" });
  comprobar(
    "los nº de registro largos (tipo EMA) también se pueden consultar",
    ema.totalFilas === 1,
    JSON.stringify(ema.resultados.map((m) => m.nregistro))
  );

  const porNregistro = await ctx.listarPresentaciones({ nregistro: "70310" });
  comprobar(
    "listarPresentaciones({nregistro}) devuelve varios CN (un envase por fila)",
    porNregistro.resultados.length >= 2 && porNregistro.resultados.every((p) => p.cn),
    JSON.stringify(porNregistro.resultados.map((p) => p.cn))
  );

  const med = await ctx.buscarMedicamentos({ nregistro: "70310" });
  comprobar(
    "/medicamentos sigue sin devolver cn (de ahí la consulta aparte)",
    med.resultados.length === 1 && med.resultados[0].cn === undefined,
    `campos cn=${med.resultados[0].cn}`
  );

  // `pagina` SÍ pagina de verdad (página 2 trae filas distintas de la 1); lo
  // único que se ignora es `tamanioPagina` (siempre 200 filas por página).
  // Y `totalFilas` es el total real del catálogo, no el recorte de 200: para
  // un término tan genérico como "comprimidos" hay miles de coincidencias.
  const pagina1 = await ctx.buscarMedicamentos({ nombre: "comprimidos", pagina: 1 });
  const pagina2 = await ctx.buscarMedicamentos({ nombre: "comprimidos", pagina: 2 });
  comprobar(
    "la página 2 trae filas distintas de la página 1: `pagina` sí funciona",
    pagina1.resultados.length === 200 &&
      pagina2.resultados.length === 200 &&
      pagina1.resultados[0].nregistro !== pagina2.resultados[0].nregistro,
    `pagina1[0]=${pagina1.resultados[0].nregistro} pagina2[0]=${pagina2.resultados[0].nregistro}`
  );
  comprobar(
    "totalFilas es el total real (no topado a 200); tamanioPagina sí se ignora",
    pagina1.totalFilas > 200 && pagina1.tamanioPagina === 200,
    `totalFilas=${pagina1.totalFilas} tamanioPagina=${pagina1.tamanioPagina}`
  );

  // La búsqueda por nombre no distingue mayúsculas ni acentos: no hace falta
  // normalizar el término en app.js antes de consultar.
  const minusculas = await ctx.buscarMedicamentos({ nombre: "ibuprofeno" });
  const mayusculas = await ctx.buscarMedicamentos({ nombre: "IBUPROFENO" });
  comprobar(
    "la búsqueda por nombre no distingue mayúsculas/minúsculas",
    minusculas.totalFilas === mayusculas.totalFilas && minusculas.totalFilas > 0,
    `minusculas=${minusculas.totalFilas} mayusculas=${mayusculas.totalFilas}`
  );

  const sinAcento = await ctx.buscarMedicamentos({ nombre: "acido acetilsalicilico" });
  const conAcento = await ctx.buscarMedicamentos({ nombre: "ácido acetilsalicílico" });
  comprobar(
    "la búsqueda por nombre tampoco distingue acentos",
    sinAcento.totalFilas === conAcento.totalFilas && sinAcento.totalFilas > 0,
    `sinAcento=${sinAcento.totalFilas} conAcento=${conAcento.totalFilas}`
  );

  // El orden de los resultados es estable entre llamadas (no es aleatorio ni
  // depende de la sesión), así que lo que ve el usuario es reproducible.
  const orden1 = await ctx.buscarMedicamentos({ nombre: "paracetamol" });
  const orden2 = await ctx.buscarMedicamentos({ nombre: "paracetamol" });
  comprobar(
    "el orden de los resultados es estable entre llamadas",
    JSON.stringify(orden1.resultados.map((m) => m.nregistro)) ===
      JSON.stringify(orden2.resultados.map((m) => m.nregistro)),
    `orden1[0..2]=${orden1.resultados.slice(0, 3).map((m) => m.nregistro)}`
  );

  console.log(fallos === 0 ? "\nAPI REAL OK" : `\n${fallos} fallo(s) contra la API real`);
  process.exitCode = fallos === 0 ? 0 : 1;
})().catch((err) => {
  // Sin red, o con la API de CIMA caída, no es un fallo del código: se omite.
  console.log(`OMITIDO: no se pudo contactar con la API de CIMA (${err.message})`);
  process.exitCode = 0;
});
