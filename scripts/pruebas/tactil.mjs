#!/usr/bin/env node
/*
  tactil: en 390 px, todo a, button y summary visible mide al menos 44×44 px de área táctil (cuenta el
  padding). Reporta el selector y el tamaño de cada infractor. Excepción documentada: un elemento (o un
  ancestro suyo) con el atributo data-tactil-excepcion, p. ej. un enlace dentro de un párrafo (WCAG 2.5.8).
  Los elementos fuera de pantalla (enlaces de salto) se omiten.
  Uso: node tactil.mjs [--raiz DIR] [--minimo 44]
*/
import { conPaginas, enPagina, leerArgs, salir } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node tactil.mjs [--raiz DIR] [--minimo 44]");
const minimo = a.minimo && a.minimo !== true ? Number(a.minimo) : 44;

await conPaginas("tactil", a, async ({ paginas, servidor, navegador, falla }) => {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  for (const p of paginas) {
    await page.goto(servidor.url + p.ruta, { waitUntil: "load" });
    const r = await enPagina(
      page,
      (min) => {
        const f = [];
        for (const el of document.querySelectorAll("a, button, summary")) {
          if (!esVisible(el) || el.closest("[data-tactil-excepcion]")) continue;
          const r = el.getBoundingClientRect();
          if (r.right <= 0 || r.left >= window.innerWidth) continue;
          if (r.width < min - 0.01 || r.height < min - 0.01) f.push(`${describir(el)} mide ${r.width.toFixed(1)}×${r.height.toFixed(1)} px (mínimo ${min}×${min})`);
        }
        return f;
      },
      minimo,
    );
    for (const m of r) falla(`${p.ruta} @390px`, m);
  }
  await ctx.close();
});
