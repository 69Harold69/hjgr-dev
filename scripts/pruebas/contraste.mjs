#!/usr/bin/env node
/*
  contraste: contraste de TODO el texto visible, medido con píxeles reales (solo tema claro), en 1440 y 390 px.
  Para cada nodo de texto visible:
    1. el color del texto sale del estilo computado (con la opacidad efectiva);
    2. se pone el texto transparente (por CSSOM: la CSP no lo impide), se captura la página y se muestrean los
       píxeles de las cajas de las líneas de texto: ese es el fondo REAL (degradados, imágenes, tarjetas);
    3. se calcula la razón de contraste contra CADA píxel muestreado y se queda la peor.
  Falla por debajo de 4.5:1, o 3:1 si el texto es grande (≥ 24 px, o ≥ 18.66 px en negrita).
  Se omiten: texto con opacidad efectiva 0, fuera de pantalla, sin caja, o con color transparente.
  Límite: no mide texto generado con ::before/::after ni texto dentro de <img>/<svg>.
  Uso: node contraste.mjs [--raiz DIR] [--salida DIR]
*/
import path from "node:path";
import fs from "node:fs";
import { conPaginas, enPagina, leerArgs, salir, slug } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node contraste.mjs [--raiz DIR] [--salida DIR]");
const ANCHOS = [1440, 390];

/** Dentro de la página: junta los textos visibles y los deja transparentes. */
function prepararTextos() {
  document.documentElement.style.setProperty("scroll-behavior", "auto", "important");
  const items = [];
  const recorrer = (nodo) => {
    for (const h of nodo.childNodes) {
      if (h.nodeType === 1) {
        if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD"].includes(h.tagName)) continue;
        recorrer(h);
      } else if (h.nodeType === 3 && h.textContent.trim()) {
        const el = h.parentElement;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const op = opacidadEfectiva(el);
        if (op < 0.01) continue;
        const rango = document.createRange();
        rango.selectNodeContents(h);
        const cajas = [...rango.getClientRects()]
          .filter((r) => r.width > 1 && r.height > 1 && r.right > 0 && r.bottom > 0)
          .map((r) => ({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }));
        if (!cajas.length) continue;
        const m = cs.color.match(/rgba?\(([^)]+)\)/);
        const [r, g, b, al = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
        if (al * op < 0.01) continue;
        items.push({ nombre: describir(el), color: [r, g, b], alfa: al * op, tam: parseFloat(cs.fontSize), peso: Number(cs.fontWeight) || 400, cajas, texto: h.textContent.trim().replace(/\s+/g, " ").slice(0, 40) });
        window.__textos ??= new Set();
        window.__textos.add(el);
      }
    }
  };
  recorrer(document.body);
  for (const el of window.__textos ?? []) {
    for (const [k, v] of [["transition", "none"], ["color", "transparent"], ["-webkit-text-fill-color", "transparent"], ["text-shadow", "none"], ["caret-color", "transparent"]]) el.style.setProperty(k, v, "important");
  }
  return { items, alto: document.documentElement.scrollHeight };
}

/** En una página en blanco: decodifica la captura y calcula el peor contraste de cada texto. */
function medir({ png, items }) {
  return (async () => {
    const blob = await (await fetch(`data:image/png;base64,${png}`)).blob();
    const img = await createImageBitmap(blob);
    const lienzo = new OffscreenCanvas(img.width, img.height);
    const c = lienzo.getContext("2d", { willReadFrequently: true });
    c.drawImage(img, 0, 0);
    const lum = ([r, g, b]) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const razon = (p, q) => (Math.max(p, q) + 0.05) / (Math.min(p, q) + 0.05);
    return items.map((it) => {
      let peor = Infinity;
      let fondoPeor = null;
      for (const caja of it.cajas) {
        const x0 = Math.max(0, Math.floor(caja.x)), y0 = Math.max(0, Math.floor(caja.y));
        const x1 = Math.min(img.width, Math.ceil(caja.x + caja.w)), y1 = Math.min(img.height, Math.ceil(caja.y + caja.h));
        if (x1 <= x0 || y1 <= y0) continue;
        const datos = c.getImageData(x0, y0, x1 - x0, y1 - y0).data;
        const paso = Math.max(1, Math.floor(((x1 - x0) * (y1 - y0)) / 3000)) * 4;
        for (let i = 0; i < datos.length; i += paso) {
          const fondo = [datos[i], datos[i + 1], datos[i + 2]];
          const texto = it.color.map((v, k) => v * it.alfa + fondo[k] * (1 - it.alfa));
          const r = razon(lum(texto), lum(fondo));
          if (r < peor) {
            peor = r;
            fondoPeor = fondo;
          }
        }
      }
      return { ...it, razon: peor, fondo: fondoPeor };
    });
  })();
}

await conPaginas("contraste", a, async ({ paginas, servidor, navegador, falla }) => {
  const salida = a.salida && a.salida !== true ? path.resolve(String(a.salida)) : null;
  if (salida) fs.mkdirSync(salida, { recursive: true });
  const lienzo = await (await navegador.newContext()).newPage();
  await lienzo.goto("about:blank");
  for (const ancho of ANCHOS) {
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }); // la página ya armada: la entrada del hero (primera visita) no es lo que se mide
    const page = await ctx.newPage();
    for (const p of paginas) {
      await page.goto(servidor.url + p.ruta, { waitUntil: "load" });
      await page.evaluate(() => document.fonts?.ready);
      const { items } = await enPagina(page, prepararTextos);
      await page.waitForTimeout(100);
      const png = (await page.screenshot({ fullPage: true })).toString("base64");
      if (salida) fs.writeFileSync(path.join(salida, `fondo-${slug(p.ruta)}-${ancho}.png`), Buffer.from(png, "base64"));
      const medidos = await lienzo.evaluate(`(${medir.toString()})(${JSON.stringify({ png, items })})`);
      for (const m of medidos) {
        const grande = m.tam >= 24 || (m.tam >= 18.66 && m.peso >= 700);
        const minimo = grande ? 3 : 4.5;
        if (m.razon < minimo) falla(`${p.ruta} @${ancho}px`, `contraste ${m.razon.toFixed(2)}:1 < ${minimo}:1 (${m.tam}px, peso ${m.peso}, texto rgb(${m.color}) sobre fondo rgb(${m.fondo})) en ${m.nombre}`);
      }
      console.log(`  ${p.ruta} @${ancho}px: ${medidos.length} texto(s) medidos`);
    }
    await ctx.close();
  }
});
