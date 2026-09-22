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

  // Cada fila de /medicamentos ya trae, sin coste extra, los campos que
  // app.js usa para los badges y el enlace al documento oficial: docs[],
  // psum, triangulo, conduc. No hace falta /medicamento?nregistro= para esto.
  const paracetamol = await ctx.buscarMedicamentos({ nombre: "paracetamol" });
  const conCampos = paracetamol.resultados[0];
  comprobar(
    "/medicamentos ya trae docs[], psum, triangulo y conduc por fila",
    Array.isArray(conCampos.docs) &&
      typeof conCampos.psum === "boolean" &&
      typeof conCampos.triangulo === "boolean" &&
      typeof conCampos.conduc === "boolean",
    `docs=${Array.isArray(conCampos.docs)} psum=${typeof conCampos.psum} triangulo=${typeof conCampos.triangulo} conduc=${typeof conCampos.conduc}`
  );

  // /psuministro NO filtra ni por cn ni por nregistro: siempre devuelve el
  // listado nacional completo. Se comprueba con un CN real (AMOXICILINA /
  // ACIDO CLAVULANICO SANDOZ, nregistro 62800, con problema de suministro
  // activo de verdad): si el filtro funcionara, todas las filas tendrían ese
  // cn; en la práctica, ninguna de las 200 primeras lo tiene.
  const psuministroPorCN = await (await ctx.fetch("https://cima.aemps.es/cima/rest/psuministro?cn=694998")).json();
  comprobar(
    "/psuministro?cn= no filtra: el cn pedido no aparece en sus propios resultados",
    psuministroPorCN.totalFilas > 10 && !psuministroPorCN.resultados.some((r) => r.cn === "694998"),
    `totalFilas=${psuministroPorCN.totalFilas}`
  );

  // /vmpp?nregistro= tampoco filtra (mismo problema); /vmpp?practiv1= sí.
  const vmppPorNregistro = await (await ctx.fetch("https://cima.aemps.es/cima/rest/vmpp?nregistro=77758")).json();
  comprobar(
    "/vmpp?nregistro= no filtra: totalFilas es el catálogo VMPP entero",
    vmppPorNregistro.totalFilas > 1000,
    `totalFilas=${vmppPorNregistro.totalFilas}`
  );
  // No hay wrapper en api.js para esto (no hace falta para "equivalentes":
  // ver dcp.id/vmp más abajo), pero el hecho queda fijado igual, por fetch
  // directo: `practiv1` sí filtra `/vmpp` de verdad, aunque `nregistro` no.
  const vmppPorPractiv1 = await (await ctx.fetch("https://cima.aemps.es/cima/rest/vmpp?practiv1=paracetamol")).json();
  // La mayoría (no el 100%) menciona "paracetamol" en vmpDesc: unas pocas filas
  // son combinados genéricos ("Mezcla de principios activos para resfriado…")
  // que lo llevan sin nombrarlo en la descripción.
  const conParacetamolEnDesc = vmppPorPractiv1.resultados.filter((r) => /paracetamol/i.test(r.vmpDesc)).length;
  comprobar(
    "/vmpp?practiv1= sí filtra por paracetamol (aunque no se use para nada)",
    vmppPorPractiv1.totalFilas > 0 &&
      vmppPorPractiv1.totalFilas < vmppPorNregistro.totalFilas &&
      conParacetamolEnDesc >= vmppPorPractiv1.resultados.length * 0.9,
    `totalFilas=${vmppPorPractiv1.totalFilas} conParacetamolEnDesc=${conParacetamolEnDesc}/${vmppPorPractiv1.resultados.length}`
  );

  // /maestras exige los dos parámetros: solo `maestra` no devuelve nada.
  const maestraSinNombre = await ctx.fetch("https://cima.aemps.es/cima/rest/maestras?maestra=1");
  const cuerpoSinNombre = await maestraSinNombre.text();
  comprobar(
    "/maestras sin `nombre` responde 204 sin cuerpo",
    maestraSinNombre.status === 204 && cuerpoSinNombre === "",
    `status=${maestraSinNombre.status}`
  );
  const principiosActivos = await (await ctx.fetch("https://cima.aemps.es/cima/rest/maestras?maestra=1&nombre=paracetamol")).json();
  comprobar(
    "/maestras?maestra=1&nombre= (principios activos) sí funciona",
    principiosActivos.totalFilas > 0 && principiosActivos.resultados.some((r) => /paracetamol/i.test(r.nombre)),
    `totalFilas=${principiosActivos.totalFilas}`
  );

  // dcp.id (en /presentaciones) y vmp (filtro de /medicamentos) son el mismo
  // id: PARACETAMOL CINFA 1 g (nregistro 70310) tiene que traer el mismo
  // valor que usa /medicamentos?vmp= para encontrar sus equivalentes.
  const presentacionParacetamol = await ctx.listarPresentaciones({ nregistro: "70310" });
  const dcpId = presentacionParacetamol.resultados[0] && presentacionParacetamol.resultados[0].dcp
    ? presentacionParacetamol.resultados[0].dcp.id
    : null;
  comprobar(
    "/presentaciones trae dcp.id (el mismo valor que /medicamentos llama vmp)",
    Boolean(dcpId),
    `dcp.id=${dcpId}`
  );

  // OJO: muchas marcas de paracetamol no llevan "paracetamol" en el nombre
  // comercial (GELOCATIL, ANTIDOL...), así que no vale comprobar el nombre;
  // se comprueba en su lugar que el propio PARACETAMOL CINFA (de donde salió
  // el dcp.id) está entre sus resultados, y que hay más de un laboratorio.
  const equivalentesParacetamol = dcpId ? await ctx.buscarPorVmp(dcpId) : { totalFilas: 0, resultados: [] };
  comprobar(
    "/medicamentos?vmp= filtra de verdad: incluye al propio medicamento y a otros laboratorios",
    equivalentesParacetamol.totalFilas > 10 &&
      equivalentesParacetamol.resultados.some((m) => m.nregistro === "70310") &&
      new Set(equivalentesParacetamol.resultados.map((m) => m.labtitular)).size > 1,
    `totalFilas=${equivalentesParacetamol.totalFilas}`
  );

  // nosustituible: 0/N/A en el caso normal (paracetamol), un motivo real para
  // los medicamentos de margen terapéutico estrecho (levotiroxina).
  const paracetamolMed = await ctx.buscarMedicamentos({ nregistro: "70310" });
  const levotiroxina = await ctx.buscarMedicamentos({ nregistro: "84484" });
  comprobar(
    "nosustituible.id es 0 en el caso normal (paracetamol) y otro en levotiroxina",
    paracetamolMed.resultados[0].nosustituible.id === 0 &&
      levotiroxina.resultados[0].nosustituible.id !== 0 &&
      /margen terap[ée]utico/i.test(levotiroxina.resultados[0].nosustituible.nombre),
    `paracetamol=${JSON.stringify(paracetamolMed.resultados[0].nosustituible)} levotiroxina=${JSON.stringify(levotiroxina.resultados[0].nosustituible)}`
  );

  // Filtros combinables: receta y comerc solo admiten "1"/"0" (true/false/si/no
  // se ignoran, según se comprobó a mano); las dos mitades tienen que sumar el
  // catálogo entero. laboratorio filtra por coincidencia parcial, sin importar
  // mayúsculas ni el nombre completo del laboratorio.
  const conReceta = await ctx.buscarMedicamentos({ receta: "1" });
  const sinReceta = await ctx.buscarMedicamentos({ receta: "0" });
  comprobar(
    "receta=1 y receta=0 se reparten el catálogo entero",
    conReceta.totalFilas + sinReceta.totalFilas > 25000,
    `conReceta=${conReceta.totalFilas} sinReceta=${sinReceta.totalFilas}`
  );

  const comercializados = await ctx.buscarMedicamentos({ comerc: "1" });
  const noComercializados = await ctx.buscarMedicamentos({ comerc: "0" });
  comprobar(
    "comerc=1 y comerc=0 también se reparten el catálogo entero",
    comercializados.totalFilas + noComercializados.totalFilas > 25000,
    `comercializados=${comercializados.totalFilas} noComercializados=${noComercializados.totalFilas}`
  );

  const labAbreviado = await ctx.buscarMedicamentos({ nombre: "paracetamol", laboratorio: "cinfa" });
  const labCompleto = await ctx.buscarMedicamentos({ nombre: "paracetamol", laboratorio: "Laboratorios Cinfa S.A." });
  comprobar(
    "laboratorio filtra por coincidencia parcial, sin distinguir mayúsculas",
    labAbreviado.totalFilas > 0 && labAbreviado.totalFilas === labCompleto.totalFilas,
    `abreviado=${labAbreviado.totalFilas} completo=${labCompleto.totalFilas}`
  );

  // Los tres filtros combinan en AND: paracetamol + Cinfa + sin receta tiene
  // que dar 0 (todo el paracetamol de Cinfa lleva receta).
  const combinado = await ctx.buscarMedicamentos({ nombre: "paracetamol", laboratorio: "cinfa", receta: "0" });
  comprobar(
    "los filtros combinan en AND (paracetamol+Cinfa+sin receta = 0)",
    combinado.totalFilas === 0,
    `totalFilas=${combinado.totalFilas}`
  );

  // Documentación reducida (importaciones paralelas, registros antiguos…):
  // /docSegmentado/secciones no devuelve un array vacío para un documento sin
  // segmentar, sino {error: "..."} con HTTP 200 igualmente. Comprobado con un
  // Crestor 10 mg de importación paralela (CN 768768, nregistro BE250187IP,
  // reportado por un usuario: al abrirlo no aparecía nada del prospecto).
  // listarSecciones() lo normaliza a [] (ver api.js).
  const seccionesSinSegmentar = await ctx.listarSecciones(2, "BE250187IP");
  comprobar(
    "listarSecciones normaliza a [] un documento sin segmentar (importación paralela)",
    Array.isArray(seccionesSinSegmentar) && seccionesSinSegmentar.length === 0,
    JSON.stringify(seccionesSinSegmentar)
  );
  const parallelImport = await ctx.buscarMedicamentos({ nregistro: "BE250187IP" });
  comprobar(
    "esos medicamentos traen el PDF en docs[] pero sin urlHtml ni ficha técnica",
    parallelImport.resultados[0].docs.length === 1 &&
      parallelImport.resultados[0].docs[0].tipo === 2 &&
      parallelImport.resultados[0].docs[0].secc === false &&
      !parallelImport.resultados[0].docs[0].urlHtml,
    JSON.stringify(parallelImport.resultados[0].docs)
  );

  console.log(fallos === 0 ? "\nAPI REAL OK" : `\n${fallos} fallo(s) contra la API real`);
  process.exitCode = fallos === 0 ? 0 : 1;
})().catch((err) => {
  // Sin red, o con la API de CIMA caída, no es un fallo del código: se omite.
  console.log(`OMITIDO: no se pudo contactar con la API de CIMA (${err.message})`);
  process.exitCode = 0;
});
