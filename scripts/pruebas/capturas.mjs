#!/usr/bin/env node
/*
  capturas: capturas de página completa en 1440, 768, 390 y 320 px, para revisarlas a ojo.
  Uso: node capturas.mjs [--raiz DIR] [--salida DIR]   (por defecto scripts/pruebas/salida/capturas/)
*/
import path from "node:path";
import fs from "node:fs";
import { AQUI, conPaginas, leerArgs, salir, slug } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node capturas.mjs [--raiz DIR] [--salida DIR]");
const salida = path.resolve(a.salida && a.salida !== true ? String(a.salida) : path.join(AQUI, "salida/capturas"));
const ANCHOS = [1440, 768, 390, 320];

await conPaginas("capturas", a, async ({ paginas, servidor, navegador, falla }) => {
  fs.mkdirSync(salida, { recursive: true });
  for (const ancho of ANCHOS) {
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: 900 }, reducedMotion: "reduce" }); // página ya armada, sin la entrada del hero
    const page = await ctx.newPage();
    for (const p of paginas) {
      try {
        await page.goto(servidor.url + p.ruta, { waitUntil: "load" });
        await page.evaluate(() => document.fonts?.ready);
        const archivo = path.join(salida, `${slug(p.ruta)}-${ancho}.png`);
        await page.screenshot({ path: archivo, fullPage: true });
      } catch (e) {
        falla(`${p.ruta} @${ancho}px`, e.message);
      }
    }
    await ctx.close();
  }
  console.log(`  ${paginas.length * ANCHOS.length} captura(s) en ${salida}`);
});
