#!/usr/bin/env node
/*
  lighthouse: móvil y escritorio, las cuatro categorías (rendimiento, accesibilidad, buenas prácticas, SEO),
  mediana de N corridas por página y forma. Falla si alguna mediana queda por debajo de --minimo (95).
  Solo páginas indexables: una página con noindex (la 404) no puede sacar 100 en SEO por diseño.
  Uso: node lighthouse.mjs [--raiz DIR] [--corridas 3] [--minimo 95] [--salida DIR]
*/
import fs from "node:fs";
import path from "node:path";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import { launch } from "chrome-launcher";
import { AQUI, conPaginas, leerArgs, rutaChromium, salir, slug } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node lighthouse.mjs [--raiz DIR] [--corridas 3] [--minimo 95] [--salida DIR]");
const corridas = a.corridas && a.corridas !== true ? Number(a.corridas) : 3;
const minimo = a.minimo && a.minimo !== true ? Number(a.minimo) : 95;
const salida = path.resolve(a.salida && a.salida !== true ? String(a.salida) : path.join(AQUI, "salida/lighthouse"));
const CATEGORIAS = ["performance", "accessibility", "best-practices", "seo"];
const ETIQ = { performance: "rendimiento", accessibility: "accesibilidad", "best-practices": "buenas prácticas", seo: "SEO" };
const mediana = (xs) => {
  const s = [...xs].sort((p, q) => p - q);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

await conPaginas(
  "lighthouse",
  a,
  async ({ raiz, paginas, servidor, falla }) => {
    fs.mkdirSync(salida, { recursive: true });
    const indexables = paginas.filter((p) => !/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(fs.readFileSync(path.join(raiz, p.archivo), "utf8")));
    for (const p of indexables) {
      for (const forma of ["mobile", "desktop"]) {
        const filas = [];
        for (let i = 0; i < corridas; i++) {
          const chrome = await launch({ chromePath: rutaChromium(), chromeFlags: ["--headless=new", "--disable-gpu"] });
          try {
            const r = await lighthouse(servidor.url + p.ruta, { port: chrome.port, output: "json", logLevel: "error", onlyCategories: CATEGORIAS }, forma === "desktop" ? desktopConfig : undefined);
            if (r.lhr.runtimeError) throw new Error(`${r.lhr.runtimeError.code}: ${r.lhr.runtimeError.message}`);
            filas.push(Object.fromEntries(CATEGORIAS.map((c) => [c, Math.round((r.lhr.categories[c].score ?? 0) * 100)])));
            if (i === 0) fs.writeFileSync(path.join(salida, `${slug(p.ruta)}-${forma}.json`), r.report);
          } finally {
            await chrome.kill();
          }
        }
        const med = Object.fromEntries(CATEGORIAS.map((c) => [c, mediana(filas.map((f) => f[c]))]));
        console.log(`  ${p.ruta} ${forma === "mobile" ? "móvil" : "escritorio"}: ${CATEGORIAS.map((c) => `${ETIQ[c]} ${med[c]}`).join(", ")} (mediana de ${corridas})`);
        for (const c of CATEGORIAS) if (med[c] < minimo) falla(`${p.ruta} ${forma}`, `${ETIQ[c]} ${med[c]} < ${minimo}`);
      }
    }
  },
  { navegador: false },
);
