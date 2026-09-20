/**
 * util.js
 * Utilidades compartidas por las suites de test.
 *
 * Nada de esta carpeta forma parte del sitio: son scripts de desarrollo. Lo que
 * cargan las páginas es el JS de la raíz (api.js, app.js, tema.js).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { execFileSync, spawn } = require("child_process");

/** Raíz del proyecto (la carpeta que contiene index.html). */
const RAIZ = path.resolve(__dirname, "..");

let total = 0;
let fallos = 0;

/**
 * Registra el resultado de una comprobación.
 * @param {string} descripcion
 * @param {boolean} condicion
 * @param {string} [extra] detalle que se muestra cuando falla
 */
function comprobar(descripcion, condicion, extra = "") {
  total++;
  if (!condicion) fallos++;
  console.log(`${condicion ? "OK   " : "FALLA"} ${descripcion}${!condicion && extra ? "  (" + extra + ")" : ""}`);
}

/** Imprime el resumen y deja el código de salida a 0 solo si todo ha pasado. */
function resumen(nombre) {
  const texto = fallos === 0 ? "TODO OK" : `${fallos} de ${total} comprobaciones fallidas`;
  console.log(`\n${texto} (${nombre})`);
  process.exitCode = fallos === 0 ? 0 : 1;
}

/** Lee un fichero del proyecto (ruta relativa a la raíz). */
function leer(fichero) {
  return fs.readFileSync(path.join(RAIZ, fichero), "utf8");
}

/** Carpeta temporal propia de cada suite: nunca se escribe dentro del repo. */
function carpetaTemporal(prefijo) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `prospectoya-${prefijo}-`));
}

/** Copia ficheros del proyecto a otra carpeta (para servirlos por HTTP). */
function copiar(carpeta, ficheros) {
  for (const fichero of ficheros) {
    fs.copyFileSync(path.join(RAIZ, fichero), path.join(carpeta, fichero));
  }
}

/** Ruta del navegador; se puede forzar con la variable de entorno CHROME. */
function navegador() {
  const candidatos = [
    process.env.CHROME,
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);

  for (const candidato of candidatos) {
    if (candidato.includes("/")) {
      if (fs.existsSync(candidato)) return candidato;
      continue;
    }
    try {
      return execFileSync("which", [candidato], { encoding: "utf8" }).trim();
    } catch (err) {
      // Se prueba el siguiente candidato
    }
  }
  return null;
}

/**
 * Lanza Chrome en modo headless y devuelve el DOM final de la página.
 *
 * Es asíncrona a propósito: el servidor HTTP de las pruebas corre en este mismo
 * proceso, así que una espera bloqueante (spawnSync) impediría atender a Chrome
 * y las páginas se quedarían sin respuesta (deadlock). El DOM se vuelca además a
 * un fichero y hay un tiempo máximo, para que un cuelgue se vea como error en
 * lugar de dejar la suite parada.
 *
 * @param {string} url
 * @param {{alto?:number, ancho?:number, escala?:number, perfil?:string, presupuesto?:number, tiempoMaximo?:number}} [opciones]
 * @returns {Promise<string>} HTML final de la página
 */
function domConChrome(url, opciones = {}) {
  const chrome = navegador();
  if (!chrome) {
    return Promise.reject(new Error("No encuentro Chrome/Chromium; define la variable CHROME con la ruta al ejecutable"));
  }

  const args = ["--headless", "--disable-gpu", "--no-sandbox"];
  // OJO: Chrome en Linux no baja de ~500px de ancho de ventana, así que para
  // simular un móvil se pide una ventana grande con escala alta (p. ej. 1170x2532
  // con escala 3 = 390x844 de viewport CSS).
  if (opciones.escala) args.push(`--force-device-scale-factor=${opciones.escala}`);
  if (opciones.alto || opciones.ancho) {
    args.push(`--window-size=${opciones.ancho || 1100},${opciones.alto || 800}`);
  }
  if (opciones.perfil) args.push(`--user-data-dir=${opciones.perfil}`);
  args.push(`--virtual-time-budget=${opciones.presupuesto || 6000}`, "--dump-dom", url);

  const tiempoMaximo = opciones.tiempoMaximo || 60000;
  const salida = path.join(carpetaTemporal("dom"), "dom.html");
  const fd = fs.openSync(salida, "w");

  return new Promise((resolver, rechazar) => {
    const proceso = spawn(chrome, args, { stdio: ["ignore", fd, "ignore"] });
    let cerrado = false;
    const cerrarFichero = () => {
      if (!cerrado) {
        cerrado = true;
        fs.closeSync(fd);
      }
    };

    const alarma = setTimeout(() => {
      proceso.kill("SIGKILL");
      cerrarFichero();
      rechazar(new Error(`Chrome no ha terminado en ${tiempoMaximo} ms con ${url}`));
    }, tiempoMaximo);

    proceso.on("error", (err) => {
      clearTimeout(alarma);
      cerrarFichero();
      rechazar(err);
    });

    proceso.on("close", (codigo) => {
      clearTimeout(alarma);
      cerrarFichero();
      if (codigo !== 0) {
        rechazar(new Error(`Chrome ha terminado con código ${codigo} con ${url}`));
        return;
      }
      resolver(fs.readFileSync(salida, "utf8"));
    });
  });
}

/**
 * Extrae lo que las páginas de prueba vuelcan en `<pre id="diag">`.
 * @param {string} dom
 */
function leerDiag(dom) {
  const encontrado = dom.match(/<pre id="diag"[^>]*>([\s\S]*?)<\/pre>/);
  return (encontrado ? encontrado[1] : "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

/**
 * Convierte el diagnóstico "clave=valor" (una por línea) en un objeto.
 * @param {string} diag
 */
function campos(diag) {
  const datos = {};
  for (const linea of diag.split("\n")) {
    const corte = linea.indexOf("=");
    if (corte > 0) datos[linea.slice(0, corte).trim()] = linea.slice(corte + 1).trim();
  }
  return datos;
}

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/vnd.microsoft.icon",
};

/**
 * Servidor estático mínimo (Node, sin dependencias) sobre una carpeta.
 *
 * Hace falta servir por HTTP, y no abrir los ficheros con file://, porque el
 * tema se guarda en localStorage y ahí el origen cambia entre páginas.
 *
 * @param {string} carpeta
 * @param {number} [puerto] 0 = el que asigne el sistema
 * @returns {Promise<{servidor: import("http").Server, url: string, cerrar: () => void}>}
 */
function servirHttp(carpeta, puerto = 0) {
  const raizServida = path.resolve(carpeta);
  const servidor = http.createServer((peticion, respuesta) => {
    const ruta = decodeURIComponent((peticion.url || "/").split("?")[0]);
    const fichero = path.join(raizServida, ruta === "/" ? "index.html" : ruta);

    if (!path.resolve(fichero).startsWith(raizServida) || !fs.existsSync(fichero) || fs.statSync(fichero).isDirectory()) {
      respuesta.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      respuesta.end("404");
      return;
    }

    respuesta.writeHead(200, {
      "Content-Type": TIPOS[path.extname(fichero)] || "application/octet-stream",
      // Sin keep-alive: Chrome espera a que la red quede inactiva para avanzar
      // el tiempo virtual (--virtual-time-budget) y una conexión abierta lo
      // dejaría esperando para siempre.
      Connection: "close",
    });
    respuesta.end(fs.readFileSync(fichero));
  });

  return new Promise((resolver) => {
    servidor.listen(puerto, "127.0.0.1", () => {
      // cerrar() corta también las conexiones abiertas: si no, el proceso se
      // queda esperando y el test no termina nunca.
      const cerrar = () => {
        servidor.close();
        if (typeof servidor.closeAllConnections === "function") servidor.closeAllConnections();
      };
      resolver({ servidor, url: `http://127.0.0.1:${servidor.address().port}`, cerrar });
    });
  });
}

module.exports = {
  RAIZ,
  comprobar,
  resumen,
  leer,
  carpetaTemporal,
  copiar,
  navegador,
  domConChrome,
  leerDiag,
  campos,
  servirHttp,
};
