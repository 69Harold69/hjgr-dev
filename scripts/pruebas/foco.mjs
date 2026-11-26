#!/usr/bin/env node
/*
  foco: tabulando por la página, cada elemento enfocable debe mostrar un indicador de foco visible.
  Se compara una captura del área del elemento (con 8 px alrededor) CON el foco y SIN él (tras blur()):
  si son idénticas, no hay indicador. Se informa además el outline y box-shadow computados con foco.
  Uso: node foco.mjs [--raiz DIR]
*/
import { conPaginas, enPagina, leerArgs, salir } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node foco.mjs [--raiz DIR]");
const MAX_TABS = 300;

await conPaginas("foco", a, async ({ paginas, servidor, navegador, falla }) => {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  for (const p of paginas) {
    await page.goto(servidor.url + p.ruta, { waitUntil: "load" });
    await page.evaluate(() => document.activeElement?.blur());
    let enfocados = 0;
    for (let i = 0; i < MAX_TABS; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(60);
      const info = await enPagina(page, () => {
        const el = document.activeElement;
        if (!el || el === document.body || el === document.documentElement) return null;
        window.__vistos ??= new WeakSet();
        const repetido = window.__vistos.has(el);
        window.__vistos.add(el);
        window.__enfocado = el;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { repetido, nombre: describir(el), caja: { x: r.x, y: r.y, width: r.width, height: r.height }, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, sombra: cs.boxShadow };
      });
      if (!info || info.repetido) break;
      enfocados++;
      const { x, y, width, height } = info.caja;
      if (width <= 0 || height <= 0) {
        falla(p.ruta, `${info.nombre} recibe el foco pero no tiene caja visible`);
        continue;
      }
      const margen = 8;
      const clip = { x: Math.max(0, x - margen), y: Math.max(0, y - margen), width: 0, height: 0 };
      clip.width = Math.min(1280 - clip.x, width + 2 * margen);
      clip.height = Math.min(800 - clip.y, height + 2 * margen);
      await page.waitForTimeout(120);
      const con = await page.screenshot({ clip });
      await page.evaluate(() => window.__enfocado.blur());
      await page.waitForTimeout(120);
      const sin = await page.screenshot({ clip });
      if (con.equals(sin)) falla(p.ruta, `sin indicador de foco visible: ${info.nombre} (outline: ${info.outline}; box-shadow: ${info.sombra})`);
      // Devuelve el foco al elemento (la modalidad de teclado se conserva) para que el siguiente Tab continúe desde él.
      await page.evaluate(() => window.__enfocado.focus({ preventScroll: true }));
    }
    if (!enfocados) console.log(`  ${p.ruta}: sin elementos enfocables`);
  }
  await ctx.close();
});
