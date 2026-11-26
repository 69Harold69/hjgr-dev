/*
  Servidor estático que emula lo relevante de producción:
    - try_files {path} {path}/index.html {path}.html;
    - 404 con 404.html (y estado 404);
    - oculta .git*, *.md, .env*, privado, scripts, package.json, package-lock.json y node_modules;
    - compresión gzip/zstd de texto;
    - las MISMAS cabeceras de seguridad (CSP incluida), también en los 404.
  Si algo viola la CSP aquí, también la violará en producción.

  La CSP vive aquí y en el README: la regla `csp-readme` de validar.mjs las compara.

  Uso: node lib/servidor.mjs [--raiz DIR] [--puerto N] [--host 127.0.0.1]
  Sin --puerto elige uno libre y lo imprime (línea «Sirviendo ... en http://...»).
*/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

export const RAIZ_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const CSP =
  "default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export const CABECERAS = {
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=(), interest-cohort=()",
  "Content-Security-Policy": CSP,
};

/* Nombres que no se sirven en ninguna profundidad (archivo o carpeta), con comodines. */
// `*.md` cubre README.md y las notas LEEME.md que viven junto a los assets; `.env*` y `privado` nunca se sirven.
export const OCULTOS = [".git*", "*.md", ".env*", "privado", "scripts", "package.json", "package-lock.json", "node_modules"];
const aRegex = (patron) => new RegExp(`^${patron.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
const REGEX_OCULTOS = OCULTOS.map(aRegex);
export const estaOculto = (ruta) => ruta.split("/").filter(Boolean).some((seg) => REGEX_OCULTOS.some((r) => r.test(seg)));

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/vnd.microsoft.icon",
  ".woff2": "font/woff2",
};

/* Solo texto y cuerpos de más de 512 bytes, como `encode gzip zstd`. A igual q, gzip antes que zstd. */
const COMPRIMIBLES = new Set([".html", ".css", ".js", ".mjs", ".json", ".xml", ".txt", ".svg", ".ico"]);
const MINIMO = 512;
const cacheCompresion = new Map();
function elegirCodificacion(aceptadas) {
  const q = new Map();
  for (const parte of String(aceptadas || "").split(",")) {
    const [nombre, ...params] = parte.split(";").map((x) => x.trim());
    if (!nombre) continue;
    const pq = params.find((x) => /^q=/i.test(x));
    const valor = pq ? Number(pq.slice(2)) : 1;
    q.set(nombre.toLowerCase(), Number.isFinite(valor) && valor >= 0 && valor <= 1 ? valor : 1);
  }
  const candidatas = ["gzip", "zstd"].filter((c) => (q.get(c) ?? 0) > 0 && (c !== "zstd" || typeof zlib.zstdCompressSync === "function"));
  candidatas.sort((x, y) => q.get(y) - q.get(x));
  return candidatas[0] ?? null;
}
function comprimir(cuerpo, codificacion, clave) {
  const k = `${codificacion}:${clave}`;
  let c = cacheCompresion.get(k);
  if (!c) {
    c = codificacion === "zstd" ? zlib.zstdCompressSync(cuerpo) : zlib.gzipSync(cuerpo, { level: 5 });
    cacheCompresion.set(k, c);
  }
  return c;
}

/** Archivo que serviría producción para una ruta de URL, o null. */
export function archivoDe(raiz, rutaUrl) {
  let decodificada;
  try {
    decodificada = decodeURIComponent(rutaUrl);
  } catch {
    return null;
  }
  if (decodificada.includes("\0")) return null;
  const partes = decodificada.split("/").filter(Boolean);
  if (partes.some((p) => p === ".." || estaOculto(p))) return null;
  const base = path.join(raiz, ...partes);
  if (!base.startsWith(raiz)) return null;
  // try_files {path} {path}/index.html {path}.html
  for (const c of [base, path.join(base, "index.html"), `${base}.html`]) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {
      /* siguiente */
    }
  }
  return null;
}

/** Inicia el servidor. `puerto` 0 = uno libre. Devuelve { url, puerto, cerrar }. */
export function iniciarServidor({ raiz = RAIZ_REPO, puerto = 0, host = "127.0.0.1" } = {}) {
  raiz = path.resolve(raiz);
  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const cabeceras = { ...CABECERAS };
    let archivo = archivoDe(raiz, url.pathname);
    let estado = 200;
    if (!archivo) {
      archivo = path.join(raiz, "404.html");
      estado = 404;
    }
    cabeceras["Content-Type"] = TIPOS[path.extname(archivo)] ?? "application/octet-stream";
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { ...cabeceras, Allow: "GET, HEAD" }).end();
      return;
    }
    let cuerpo;
    try {
      cuerpo = fs.readFileSync(archivo);
    } catch {
      // Sin 404.html: cuerpo mínimo, pero con las mismas cabeceras.
      cuerpo = Buffer.from("No encontrado\n");
      cabeceras["Content-Type"] = "text/plain; charset=utf-8";
      estado = 404;
    }
    const ext = path.extname(archivo);
    if (COMPRIMIBLES.has(ext)) {
      cabeceras.Vary = "Accept-Encoding";
      const cod = cuerpo.length > MINIMO ? elegirCodificacion(req.headers["accept-encoding"]) : null;
      if (cod) {
        cuerpo = comprimir(cuerpo, cod, `${archivo}:${fs.statSync(archivo).mtimeMs}`);
        cabeceras["Content-Encoding"] = cod;
      }
    }
    cabeceras["Content-Length"] = cuerpo.length;
    res.writeHead(estado, cabeceras);
    res.end(req.method === "HEAD" ? undefined : cuerpo);
  });
  return new Promise((resolver, rechazar) => {
    servidor.once("error", rechazar);
    servidor.listen(puerto, host, () => {
      const { port } = servidor.address();
      resolver({ puerto: port, url: `http://${host}:${port}`, cerrar: () => new Promise((r) => { servidor.closeAllConnections?.(); servidor.close(() => r()); }) });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n, d) => {
    const i = process.argv.indexOf(n);
    return i > 0 ? process.argv[i + 1] : d;
  };
  const raiz = path.resolve(arg("--raiz", RAIZ_REPO));
  const s = await iniciarServidor({ raiz, puerto: Number(arg("--puerto", 0)), host: arg("--host", "127.0.0.1") });
  console.log(`Sirviendo ${raiz} en ${s.url} (Ctrl+C para salir)`);
}
