#!/usr/bin/env node
/*
  ocultos: el servidor de pruebas imita a Caddy en lo que NO sirve.
    - la lista OCULTOS es exactamente la de producción (.git* *.md .env* privado scripts package.json package-lock.json node_modules);
    - /assets/muestra/ (la muestra interna de componentes, ahora en scripts/pruebas/muestra/) responde 404, y también
      la propia carpeta scripts/ y los README/LEEME;
    - la única excepción es la ruta SOLO DE PRUEBAS /_pruebas/muestra/ (ver lib/servidor.mjs), y no abre nada más de scripts/.
  Cada 404 debe llevar el estado 404 y las cabeceras de seguridad.
  Uso: node ocultos.mjs [--raiz DIR]   (por defecto la raíz del repo real)
*/
import { leerArgs, raizDe, salir, iniciarServidor } from "./lib/comun.mjs";
import { OCULTOS, CSP } from "./lib/servidor.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node ocultos.mjs [--raiz DIR]");
const raiz = raizDe(a);
const fallas = [];
const falla = (m) => fallas.push(m);

const CADDY = [".git*", "*.md", ".env*", "privado", "scripts", "package.json", "package-lock.json", "node_modules"];
if (JSON.stringify(OCULTOS) !== JSON.stringify(CADDY)) falla(`OCULTOS cambió respecto a producción: ${OCULTOS.join(" ")}`);

const s = await iniciarServidor({ raiz });
try {
  const pedir = (ruta) => fetch(s.url + ruta);
  for (const ruta of ["/assets/muestra/", "/assets/muestra/index.html", "/assets/muestra/muestra.css", "/assets/muestra/marcador.svg", "/scripts/pruebas/muestra/index.html", "/scripts/sitio.json", "/scripts/pruebas/package.json", "/README.md", "/assets/css/LEEME.md", "/.git/config", "/.env", "/privado/x", "/node_modules/x"]) {
    const r = await pedir(ruta);
    if (r.status !== 404) falla(`${ruta} debe responder 404 y responde ${r.status}`);
    else if (r.headers.get("content-security-policy") !== CSP) falla(`${ruta}: el 404 no lleva la CSP`);
  }
  const r = await pedir("/_pruebas/muestra/");
  if (r.status !== 200) falla(`/_pruebas/muestra/ (ruta solo de pruebas) debe responder 200 y responde ${r.status}`);
  for (const ruta of ["/_pruebas/muestra/../../sitio.json", "/_pruebas/muestra/%2e%2e/%2e%2e/sitio.json", "/_pruebas/otra/"]) {
    const x = await pedir(ruta);
    if (x.status !== 404) falla(`${ruta} debe responder 404 y responde ${x.status}`);
  }
} finally {
  await s.cerrar();
}
if (fallas.length) {
  for (const f of fallas) console.error(`FALLA [ocultos] ${f}`);
  process.exit(1);
}
console.log("OK [ocultos] /assets/muestra/ y scripts/ dan 404; OCULTOS igual que Caddy; /_pruebas/muestra/ solo de pruebas.");
