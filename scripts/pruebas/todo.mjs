#!/usr/bin/env node
/*
  todo: UN solo comando que corre toda la suite, en orden y sin detenerse en la primera falla. Termina con
  un resumen OK/FALLA por paso y sale con 1 si cualquiera falla.

  Orden: registro, validar, sin-js, tactil, foco, accesibilidad, contraste, cls, animaciones, capturas, lighthouse, herramientas.

  Registro (guardia): falla si en esta carpeta (o en lib/) hay un `.mjs` o un `test_*.py` que ningún paso corre
  y que no está en EXCEPCIONES. Así una prueba nueva no queda fuera del «todo» sin que nadie lo note.

  Sin páginas (hoy el repo solo tiene herramientas): avisa «0 páginas del sitio» y, en lugar de romperse,
  corre los pasos de navegador contra fixtures/bueno (el mini sitio de referencia, que debe pasar todo) y revisa
  del repo real lo que sí existe: la CSP del README y dominio/versionado/contacto con --check. Cuando haya
  páginas, todo corre contra ellas.

  Uso: node todo.mjs [--raiz DIR] [--sin-lighthouse] [--corridas 3] [--estricto] [--solo-registro]
    --sin-lighthouse  omite Lighthouse (también en la prueba de las herramientas)
    --estricto        los marcadores 52XXXXXXXXXX / PENDIENTE fallan (úselo antes de publicar)
    --solo-registro   corre solo la guardia (rápido; sin navegador)
    --carpeta DIR     carpeta de pruebas que revisa la guardia (para probar la guardia misma)
*/
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { AQUI, descubrirPaginas, leerArgs, raizDe, salir } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, fs.readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace("#!/usr/bin/env node\n/*", "").trim());

const raizSitio = raizDe(a);
const hayPaginas = descubrirPaginas(raizSitio).length > 0;
const raiz = hayPaginas ? raizSitio : path.join(AQUI, "fixtures/bueno");
const node = process.execPath;
const sinLh = !!a["sin-lighthouse"];

const pasos = [
  ["validar", node, ["validar.mjs", "--raiz", raiz, ...(a.estricto ? ["--estricto"] : [])]],
  ["sin-js", node, ["sin-js.mjs", "--raiz", raiz]],
  ["tactil", node, ["tactil.mjs", "--raiz", raiz]],
  ["foco", node, ["foco.mjs", "--raiz", raiz]],
  ["accesibilidad", node, ["accesibilidad.mjs", "--raiz", raiz]],
  ["contraste", node, ["contraste.mjs", "--raiz", raiz]],
  ["cls", node, ["cls.mjs", "--raiz", raiz]],
  ["animaciones", node, ["animaciones.mjs", "--raiz", raiz]],
  ["capturas", node, ["capturas.mjs", "--raiz", raiz]],
  ...(sinLh ? [] : [["lighthouse", node, ["lighthouse.mjs", "--raiz", raiz, ...(a.corridas ? ["--corridas", String(a.corridas)] : [])]]]),
  // Las herramientas mismas: fixtures/bueno pasa todo y cada fixtures/malos falla por su regla.
  ["herramientas", "python3", ["-I", "test_herramientas.py", ...(sinLh ? ["--rapido"] : [])]],
];
if (!hayPaginas) {
  // Lo que sí se puede revisar del repo real sin páginas.
  pasos.unshift(["repo", node, ["validar.mjs", "--raiz", raizSitio, "--solo", "csp-readme,dominio,versionado,contacto"]]);
}

/* Guardia de registro. */
const EXCEPCIONES = {
  "todo.mjs": "este orquestador",
  "lib/comun.mjs": "librería compartida",
  "lib/servidor.mjs": "librería (servidor de pruebas; también `npm run servir`)",
};
function sinRegistrar(carpeta) {
  const candidatos = [];
  for (const e of fs.readdirSync(carpeta, { withFileTypes: true })) if (e.isFile() && (e.name.endsWith(".mjs") || /^test_.*\.py$/.test(e.name))) candidatos.push(e.name);
  const lib = path.join(carpeta, "lib");
  if (fs.existsSync(lib)) for (const e of fs.readdirSync(lib, { withFileTypes: true })) if (e.isFile() && e.name.endsWith(".mjs")) candidatos.push(`lib/${e.name}`);
  const registrados = new Set(pasos.flatMap(([, , args]) => args.filter((x) => /\.(mjs|py)$/.test(x))));
  // Lighthouse está registrado aunque esta corrida lo salte con --sin-lighthouse.
  if (sinLh) registrados.add("lighthouse.mjs");
  return candidatos.filter((c) => !registrados.has(c) && !(c in EXCEPCIONES));
}
const carpetaGuardia = a.carpeta && a.carpeta !== true ? path.resolve(String(a.carpeta)) : AQUI;
const huerfanas = sinRegistrar(carpetaGuardia);
const resumen = [];
console.log("== registro ==");
if (huerfanas.length) {
  console.error(`FALLA [registro] pruebas sin registrar en todo.mjs (agréguelas a «pasos» o a EXCEPCIONES con el porqué): ${huerfanas.join(", ")}`);
  resumen.push(["registro", false, 0]);
} else {
  console.log("OK [registro] toda prueba está registrada.");
  resumen.push(["registro", true, 0]);
}
if (a["solo-registro"]) {
  process.exit(huerfanas.length ? 1 : 0);
}

if (!hayPaginas) {
  console.log(`\nAVISO: 0 páginas del sitio en ${raizSitio}. Los pasos de navegador corren contra fixtures/bueno; "repo" revisa README, dominio, versionado y contacto del repo.`);
}
for (const [nombre, cmd, args] of pasos) {
  console.log(`\n== ${nombre} ==`);
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: AQUI, stdio: "inherit" });
  resumen.push([nombre, r.status === 0, (Date.now() - t0) / 1000]);
}

console.log("\n== resumen ==");
for (const [nombre, ok, s] of resumen) console.log(`${ok ? "OK   " : "FALLA"} ${nombre}${s ? ` (${s.toFixed(1)} s)` : ""}`);
if (!hayPaginas) console.log("AVISO: 0 páginas del sitio; los pasos de navegador se corrieron contra fixtures/bueno.");
const malos = resumen.filter(([, ok]) => !ok).map(([n]) => n);
console.log(malos.length ? `\ntodo: FALLAN ${malos.length} paso(s): ${malos.join(", ")}` : "\ntodo: todo en verde");
process.exit(malos.length ? 1 : 0);
