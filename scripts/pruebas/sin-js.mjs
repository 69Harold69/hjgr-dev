#!/usr/bin/env node
/*
  sin-js: mejora progresiva. Abre cada página con JavaScript APAGADO en 1440, 768, 390 y 320 px y verifica:
    - el <h1> y todo <a data-contacto> son visibles (sin opacity:0, display:none ni visibility:hidden, con caja > 0);
    - no hay scroll horizontal;
    - ningún elemento con texto tiene opacidad efectiva 0.
  Uso: node sin-js.mjs [--raiz DIR]
*/
import { conPaginas, enPagina, leerArgs, salir } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node sin-js.mjs [--raiz DIR]");
const ANCHOS = [1440, 768, 390, 320];

await conPaginas("sin-js", a, async ({ paginas, servidor, navegador, falla }) => {
  for (const ancho of ANCHOS) {
    const ctx = await navegador.newContext({ javaScriptEnabled: false, viewport: { width: ancho, height: 900 } });
    const page = await ctx.newPage();
    for (const p of paginas) {
      await page.goto(servidor.url + p.ruta, { waitUntil: "load" });
      const r = await enPagina(page, () => {
        const f = [];
        const h1s = [...document.querySelectorAll("h1")];
        if (!h1s.length) f.push("no hay <h1>");
        for (const el of [...h1s, ...document.querySelectorAll("a[data-contacto]")]) if (!esVisible(el)) f.push(`no es visible: ${describir(el)}`);
        if (document.documentElement.scrollWidth > window.innerWidth) f.push(`scroll horizontal (${document.documentElement.scrollWidth} > ${window.innerWidth} px)`);
        const vistos = new Set();
        for (const nodo of document.body.querySelectorAll("*")) {
          const el = nodo;
          if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(el.tagName)) continue;
          const tieneTexto = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          if (!tieneTexto || getComputedStyle(el).display === "none") continue;
          if (opacidadEfectiva(el) === 0 && !vistos.has(el)) {
            vistos.add(el);
            f.push(`texto con opacidad 0: ${describir(el)}`);
          }
        }
        return f;
      });
      for (const m of r) falla(`${p.ruta} @${ancho}px`, m);
    }
    await ctx.close();
  }
});
