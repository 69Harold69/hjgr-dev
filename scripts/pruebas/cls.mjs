#!/usr/bin/env node
/*
  cls: Layout Instability API en Chromium con red limitada (≈ 4G lento: 150 ms de latencia, 1.6 Mbps) y CPU ×4
  más lenta, en 360, 390 y 412 px. CLS = la mayor ventana de sesión (huecos < 1 s, máx. 5 s) de los saltos sin
  interacción reciente; se espera 2 s tras cargar y se recorre la página hasta el final.
  Falla si el CLS de alguna página y ancho pasa de --max (0 por defecto).
  Uso: node cls.mjs [--raiz DIR] [--max 0]
*/
import { conPaginas, leerArgs, salir } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node cls.mjs [--raiz DIR] [--max 0]");
const max = a.max && a.max !== true ? Number(a.max) : 0;
const ANCHOS = [360, 390, 412];

await conPaginas("cls", a, async ({ paginas, servidor, navegador, falla }) => {
  for (const ancho of ANCHOS) {
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: 800 }, hasTouch: true });
    for (const p of paginas) {
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        window.__saltos = [];
        new PerformanceObserver((lista) => {
          for (const e of lista.getEntries()) if (!e.hadRecentInput) window.__saltos.push({ t: e.startTime, v: e.value, fuentes: e.sources?.map((s) => s.node?.nodeName ?? "?") ?? [] });
        }).observe({ type: "layout-shift", buffered: true });
      });
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await page.goto(servidor.url + p.ruta, { waitUntil: "load" });
      await page.waitForTimeout(2000);
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 300) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 50));
        }
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 300));
      });
      const saltos = await page.evaluate(() => window.__saltos);
      let mejor = 0;
      let ventana = [];
      let suma = 0;
      for (const s of saltos) {
        if (ventana.length && (s.t - ventana.at(-1).t > 1000 || s.t - ventana[0].t > 5000)) {
          ventana = [];
          suma = 0;
        }
        ventana.push(s);
        suma += s.v;
        mejor = Math.max(mejor, suma);
      }
      console.log(`  ${p.ruta} @${ancho}px: CLS ${mejor.toFixed(4)}`);
      if (mejor > max + 1e-9) falla(`${p.ruta} @${ancho}px`, `CLS ${mejor.toFixed(4)} > ${max} (${saltos.map((s) => `${s.v.toFixed(4)} en ${Math.round(s.t)} ms [${s.fuentes.join(",")}]`).join("; ")})`);
      await page.close();
    }
    await ctx.close();
  }
});
