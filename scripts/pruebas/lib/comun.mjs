/* Utilidades compartidas por las pruebas. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { RAIZ_REPO, iniciarServidor } from "./servidor.mjs";

export { RAIZ_REPO, iniciarServidor };
export const AQUI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CARPETA_SCRIPTS = path.resolve(AQUI, "..");
export const EXCLUIDOS = new Set([".git", "node_modules", "scripts", ".worktrees"]);

/** Parser mínimo: `--clave valor`, `--bandera`, `--clave=valor`. Lo demás va a `_`. */
export function leerArgs(argv = process.argv.slice(2)) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (!x.startsWith("--")) {
      a._.push(x);
      continue;
    }
    const [k, v] = x.slice(2).split(/=(.*)/s);
    if (v !== undefined) a[k] = v;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) a[k] = argv[++i];
    else a[k] = true;
  }
  return a;
}

export function salir(codigo, mensaje) {
  if (mensaje) (codigo ? console.error : console.log)(mensaje);
  process.exit(codigo);
}

/** Raíz del sitio: --raiz DIR o la del repo. */
export function raizDe(a) {
  const r = a.raiz && a.raiz !== true ? path.resolve(String(a.raiz)) : RAIZ_REPO;
  if (!fs.existsSync(r)) salir(2, `--raiz: no existe ${r}`);
  return r;
}

/** Todos los archivos de la raíz (rutas relativas con /), sin entrar a las carpetas excluidas. */
export function archivosDe(raiz, filtro = () => true) {
  const salida = [];
  const ir = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name))) {
      if (e.isDirectory()) {
        if (!EXCLUIDOS.has(e.name)) ir(path.join(dir, e.name), `${rel}${e.name}/`);
      } else if (filtro(e.name)) salida.push(`${rel}${e.name}`);
    }
  };
  ir(raiz, "");
  return salida;
}

/** Ruta de URL de un .html: index.html -> /, a/index.html -> /a/, x.html -> /x.html. */
export const rutaDe = (archivo) => (archivo === "index.html" ? "/" : archivo.endsWith("/index.html") ? `/${archivo.slice(0, -10)}` : `/${archivo}`);

/** Páginas del sitio: todos los .html de la raíz. */
export const descubrirPaginas = (raiz) => archivosDe(raiz, (n) => n.endsWith(".html")).map((archivo) => ({ archivo, ruta: rutaDe(archivo) }));

export const slug = (ruta) => (ruta === "/" ? "inicio" : ruta.replace(/^\/|\/$/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/-html$/, ""));

export function rutaChromium() {
  const candidatas = [process.env.CHROME_PATH, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"].filter(Boolean);
  return candidatas.find((c) => fs.existsSync(c));
}

export function lanzarChromium(extra = {}) {
  return chromium.launch({ executablePath: rutaChromium(), headless: true, args: ["--disable-dev-shm-usage"], ...extra });
}

/**
 * Plantilla de prueba con navegador: levanta el servidor sobre la raíz, descubre las páginas, corre `fn`
 * y cierra todo. Si no hay páginas, avisa y termina bien (no hay nada que probar).
 */
export async function conPaginas(nombre, a, fn, { navegador = true } = {}) {
  const raiz = raizDe(a);
  const paginas = descubrirPaginas(raiz);
  if (!paginas.length) salir(0, `OK [${nombre}] 0 páginas en ${raiz}: nada que probar`);
  const servidor = await iniciarServidor({ raiz });
  const nav = navegador ? await lanzarChromium() : null;
  const fallas = [];
  const falla = (donde, msg) => fallas.push(`${donde}: ${msg}`);
  try {
    await fn({ raiz, paginas, servidor, navegador: nav, falla });
  } finally {
    await nav?.close();
    await servidor.cerrar();
  }
  if (fallas.length) {
    for (const f of fallas) console.error(`FALLA [${nombre}] ${f}`);
    console.error(`\n${nombre}: ${fallas.length} falla(s) en ${paginas.length} página(s).`);
    process.exit(1);
  }
  console.log(`OK [${nombre}] ${paginas.length} página(s) sin fallas.`);
}

/*
  Funciones auxiliares que viven DENTRO de la página. Se inyectan como texto en una sola expresión (no con
  `eval`, que la CSP bloquearía): `enPagina(page, (arg) => {...})` deja disponibles `describir`,
  `opacidadEfectiva` y `esVisible` dentro de la función que se le pasa.
*/
const UTIL_PAGINA = `
  const describir = (el) => {
    const partes = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.body && partes.length < 4; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) { partes.unshift(s + "#" + n.id); break; }
      const clases = [...n.classList].slice(0, 2).join(".");
      if (clases) s += "." + clases;
      partes.unshift(s);
    }
    const texto = (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 30);
    return partes.join(" > ") + (texto ? " «" + texto + "»" : "");
  };
  const opacidadEfectiva = (el) => {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  };
  const esVisible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden" && opacidadEfectiva(el) > 0.01;
  };
`;
export function enPagina(page, fn, arg = null) {
  return page.evaluate(`(() => { ${UTIL_PAGINA}; return (${fn.toString()})(${JSON.stringify(arg)}); })()`);
}
