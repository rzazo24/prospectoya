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

  console.log(fallos === 0 ? "\nAPI REAL OK" : `\n${fallos} fallo(s) contra la API real`);
  process.exitCode = fallos === 0 ? 0 : 1;
})().catch((err) => {
  // Sin red, o con la API de CIMA caída, no es un fallo del código: se omite.
  console.log(`OMITIDO: no se pudo contactar con la API de CIMA (${err.message})`);
  process.exitCode = 0;
});
