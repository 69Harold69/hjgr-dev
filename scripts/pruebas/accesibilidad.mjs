#!/usr/bin/env node
/*
  accesibilidad: lo que Lighthouse no mide, con el árbol de accesibilidad real de Chromium, en 1280×800 y 390×844.
    - títulos sin saltos de nivel (h2 -> h4) y exactamente un <main>;
    - nombre accesible = texto visible en todo <a>, <button> y <summary> con texto (sin agregados: un «+» o una flecha
      puestos con ::after se anuncian como «más» o «flecha» y el nombre deja de ser el texto que se ve);
    - tabulando, ningún elemento enfocado queda tapado por la barra fija (sticky) ni fuera de la pantalla;
    - el enlace «Saltar al contenido» lleva el foco al <main>: el siguiente Tab cae dentro de él.
  Uso: node accesibilidad.mjs [--raiz DIR]
*/
import { conPaginas, leerArgs, salir } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node accesibilidad.mjs [--raiz DIR]");
const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
];
const MAX_TABS = 200;
const normal = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

await conPaginas("accesibilidad", a, async ({ paginas, servidor, navegador, falla }) => {
  for (const vp of VIEWPORTS) {
    const ctx = await navegador.newContext({ viewport: vp, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    for (const p of paginas) {
      const en = `${p.ruta} @${vp.width}px`;
      await page.goto(servidor.url + p.ruta, { waitUntil: "load" });

      /* Estructura: títulos y main. */
      const estructura = await page.evaluate(() => {
        const f = [];
        let anterior = 0;
        for (const h of document.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
          const n = Number(h.tagName[1]);
          if (anterior && n > anterior + 1) f.push(`salto de título: h${anterior} -> h${n} («${h.textContent.trim().slice(0, 40)}»)`);
          anterior = n;
        }
        const mains = document.querySelectorAll("main, [role=main]").length;
        if (mains !== 1) f.push(`debe haber exactamente un <main> (hay ${mains})`);
        return f;
      });
      for (const m of estructura) falla(en, m);

      /* Nombre accesible = texto visible. */
      const n = await page.evaluate(() => {
        let i = 0;
        for (const el of document.querySelectorAll("a[href], button, summary")) {
          const t = el.innerText.replace(/\s+/g, " ").trim();
          if (!t || el.closest("[aria-hidden=true]")) continue;
          el.setAttribute("data-prueba-a11y", String(i++));
          el.setAttribute("data-prueba-texto", t);
        }
        return i;
      });
      if (n) {
        const { nodes } = await cdp.send("Accessibility.getFullAXTree");
        const nombrePorNodo = new Map(nodes.filter((x) => x.backendDOMNodeId).map((x) => [x.backendDOMNodeId, normal(x.name?.value)]));
        const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
        const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "[data-prueba-a11y]" });
        for (const id of nodeIds) {
          const { node } = await cdp.send("DOM.describeNode", { nodeId: id });
          const atr = Object.fromEntries((node.attributes ?? []).reduce((acc, v, k, arr) => (k % 2 ? acc : [...acc, [v, arr[k + 1]]]), []));
          const visible = normal(atr["data-prueba-texto"]);
          const nombre = nombrePorNodo.get(node.backendNodeId);
          if (nombre !== undefined && nombre.toLowerCase() !== visible.toLowerCase()) falla(en, `<${node.localName}> se ve «${visible}» y se anuncia «${nombre}»`);
        }
      }

      /* Foco: nada tapado por la barra fija ni fuera de pantalla. */
      await page.evaluate(() => {
        document.activeElement?.blur();
        scrollTo(0, 0);
      });
      for (let i = 0; i < MAX_TABS; i++) {
        await page.keyboard.press("Tab");
        const info = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          window.__vistosA11y ??= new WeakSet();
          if (window.__vistosA11y.has(el)) return { repetido: true };
          window.__vistosA11y.add(el);
          const r = el.getBoundingClientRect();
          // La barra fija: el <header> de primer nivel si es sticky o fixed.
          const barra = [...document.querySelectorAll("body > header")].find((h) => ["sticky", "fixed"].includes(getComputedStyle(h).position));
          const b = barra ? barra.getBoundingClientRect().bottom : 0;
          const enBarra = barra && barra.contains(el);
          const t = (el.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 40);
          const f = [];
          if (r.bottom <= 0 || r.top >= innerHeight) f.push(`«${t}» recibe el foco fuera de la pantalla`);
          else if (!enBarra && r.top < b - 0.5 && getComputedStyle(el).position !== "absolute") f.push(`«${t}» queda tapado por la barra fija (arriba ${Math.round(r.top)} px, barra hasta ${Math.round(b)} px)`);
          return { repetido: false, f };
        });
        if (!info || info.repetido) break;
        for (const m of info.f) falla(`${en} foco`, m);
      }

      /* Enlace de salto. */
      const salto = await page.$('a[href="#contenido"], a.salto');
      if (salto) {
        await page.evaluate(() => {
          document.activeElement?.blur();
          scrollTo(0, 0);
        });
        await page.keyboard.press("Tab");
        const primero = await page.evaluate(() => document.activeElement?.getAttribute("href"));
        if (primero === "#contenido") {
          await page.keyboard.press("Enter");
          await page.keyboard.press("Tab");
          const dentro = await page.evaluate(() => !!document.activeElement?.closest("main"));
          if (!dentro) falla(en, "tras «Saltar al contenido», el siguiente Tab no cae dentro de <main>");
        }
      }
    }
    await ctx.close();
  }
});
