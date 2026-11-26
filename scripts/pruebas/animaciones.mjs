#!/usr/bin/env node
/*
  animaciones: las dos animaciones de la home y de las páginas de giro (issues #7 y #8; comparten hero), contra el servidor de pruebas (con la CSP de producción).
    1. Entrada del hero, «un equipo de cursores»: solo en la primera visita, 4 cursores y el botón «Saltar»,
       termina sola en 4 s como máximo y deja todo visible y sin residuos.
    2. Línea de las seis etapas: se dibuja una vez al entrar la sección; sin JS o con movimiento reducido, completa.
  Comprueba, en 1280×800 y 390×844 (cada caso en un contexto nuevo, o sea primera visita):
    - primera visita: 4 cursores aria-hidden con pointer-events:none, botón «Saltar» (<button>, 44 px o más),
      los botones reales del hero no quedan tapados, y a los 4.5 s ya no queda nada de la animación (ni la clase en <html>)
      y el H1, la hoja, sus marcas y los dos botones están a opacidad 1, sin transformaciones ni recortes residuales;
      la clase duró 4 s como máximo;
    - segunda visita (mismo contexto): ningún cursor ni clase;
    - «Saltar», scroll (rueda) y tecla terminan la animación en menos de 300 ms;
    - movimiento reducido: ningún cursor y la línea de etapas completa;
    - sin JavaScript: todo visible y sin cursores;
    - línea de etapas: antes de entrar en pantalla en escala 0 (scaleX en escritorio, scaleY en celular), y tras llegar
      a la sección termina en escala 1 con las seis marcas visibles;
    - al imprimir (media print) sin haber bajado a las etapas y a mitad de la entrada: nada oculto ni cursores;
    - si el JS falla a mitad (main.js que pone la clase y revienta; también inicio.js y main.js a la vez; también main.js
      que no carga), a los 5.5 s todo es visible;
    - cero mensajes de error o de CSP en la consola (salvo los que provocan a propósito los casos de falla simulada).
  Prueba la home («/») y toda página con el mismo hero (las páginas de giro, p. ej. /vidrierias/); cada una con su
  propio contexto limpio, o sea primera visita. La clave de localStorage es una sola para todo el sitio: quien ya vio
  la entrada en una página no la vuelve a ver en otra. Si el sitio no tiene hero (p. ej. fixtures/bueno), no hay nada que probar.
  Uso: node animaciones.mjs [--raiz DIR]
*/
import { conPaginas, leerArgs, salir } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node animaciones.mjs [--raiz DIR]");

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
];
const JS = { contentType: "text/javascript; charset=utf-8" };

/* Registra, dentro de la página, cuándo se puso y se quitó la clase js-entrada de <html>. */
const SONDA = () => {
  window.__entrada = { puesta: null, quitada: null };
  const mirar = () => {
    const html = document.documentElement;
    if (!html) return;
    const hay = html.classList.contains("js-entrada");
    if (hay && window.__entrada.puesta === null) window.__entrada.puesta = performance.now();
    if (!hay && window.__entrada.puesta !== null && window.__entrada.quitada === null) window.__entrada.quitada = performance.now();
  };
  new MutationObserver(mirar).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  mirar();
};

/* Estado final esperado: todo visible, sin transformaciones ni recortes residuales y sin restos de la animación. */
const ESTADO_FINAL = () => {
  const f = [];
  const efectiva = (el) => {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  };
  const limpio = (nombre, el, pseudo) => {
    if (!el) return f.push(`falta ${nombre}`);
    const cs = getComputedStyle(el, pseudo);
    if (!pseudo && Math.abs(efectiva(el) - 1) > 0.001) f.push(`${nombre}: opacidad efectiva ${efectiva(el)}`);
    if (pseudo && Number(cs.opacity) !== 1) f.push(`${nombre}${pseudo}: opacidad ${cs.opacity}`);
    if (cs.transform !== "none" && cs.transform !== "matrix(1, 0, 0, 1, 0, 0)") f.push(`${nombre}${pseudo ?? ""}: transform residual ${cs.transform}`);
    if (cs.clipPath !== "none") f.push(`${nombre}: clip-path residual ${cs.clipPath}`);
    const r = el.getBoundingClientRect();
    if (!pseudo && !el.matches(".marcas__esq") && (r.width <= 0 || r.height <= 0)) f.push(`${nombre}: sin caja`);
  };
  limpio("h1", document.querySelector("h1"));
  document.querySelectorAll(".hero__frase").forEach((el, i) => limpio(`frase ${i + 1}`, el));
  limpio("hoja", document.querySelector(".hero .pedido"));
  document.querySelectorAll(".hero .pedido .marcas__esq").forEach((el, i) => limpio(`marca de corte ${i + 1}`, el));
  const botones = document.querySelectorAll(".hero__acciones .boton");
  if (botones.length !== 2) f.push(`el hero debe tener 2 botones y tiene ${botones.length}`);
  botones.forEach((el, i) => limpio(`botón ${i + 1}`, el));
  document.querySelectorAll(".hero .etapas__item:not(:last-child)").forEach((el, i) => limpio(`línea de la hoja ${i + 1}`, el, "::after"));
  if (document.querySelector(".entrada, .cursor, .entrada__saltar")) f.push("quedan elementos de la animación en el DOM");
  const clases = [...document.documentElement.classList].filter((c) => /^(js-entrada|entrada)/.test(c));
  if (clases.length) f.push(`quedan clases en <html>: ${clases.join(" ")}`);
  return f;
};

/* Estado de la línea de etapas: escala del eje y opacidad de las seis marcas. */
const ESTADO_LINEA = () => {
  const l = document.querySelector(".proceso__linea");
  const m = new DOMMatrix(getComputedStyle(l).transform === "none" ? undefined : getComputedStyle(l).transform);
  return { a: m.a, d: m.d, marcas: [...document.querySelectorAll(".proceso__marca")].map((x) => Number(getComputedStyle(x).opacity)), clase: document.documentElement.className };
};

await conPaginas("animaciones", a, async ({ paginas, servidor, navegador, falla: fallaBase }) => {
  let falla = fallaBase;
  // Páginas con el hero de la home: la home y las de giro.
  const rutas = [];
  for (const p of paginas) {
    const ctx = await navegador.newContext();
    const page = await ctx.newPage();
    await page.goto(servidor.url + p.ruta, { waitUntil: "domcontentloaded" });
    if ((await page.locator(".hero__acciones").count()) > 0) rutas.push(p.ruta);
    await ctx.close();
  }
  if (!rutas.length) {
    console.log("  ninguna página tiene hero: nada que probar");
    return;
  }
  console.log(`  páginas con hero: ${rutas.join(", ")}`);

  const abrir = async (opciones = {}, { esperados = false } = {}) => {
    const ctx = await navegador.newContext({ hasTouch: false, ...opciones });
    const consola = [];
    const registrar = (page) => {
      page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && consola.push(`${m.type()}: ${m.text()}`));
      page.on("pageerror", (e) => consola.push(`pageerror: ${e.message}`));
    };
    ctx.on("page", registrar);
    await ctx.addInitScript(SONDA);
    return { ctx, consola, esperados };
  };
  const cerrar = async (c, donde) => {
    if (!c.esperados && c.consola.length) falla(donde, `mensajes en la consola: ${c.consola.join(" | ")}`);
    await c.ctx.close();
  };
  const sinAnimacion = (page) => page.waitForFunction(() => !document.querySelector(".entrada, .cursor, .entrada__saltar") && !document.documentElement.classList.contains("js-entrada"), null, { polling: "raf", timeout: 6000 });
  const revisarFinal = async (page, donde) => {
    for (const m of await page.evaluate(ESTADO_FINAL)) falla(donde, m);
  };

  for (const ruta of rutas) {
    falla = (donde, msg) => fallaBase(`${ruta} ${donde}`, msg);
    for (const vp of VIEWPORTS) {
      const en = `@${vp.width}px`;

      /* 1 y 2. Primera visita y segunda visita. */
      {
        const c = await abrir({ viewport: vp });
        const page = await c.ctx.newPage();
        const t0 = Date.now();
        await page.goto(servidor.url + ruta, { waitUntil: "domcontentloaded" });
        try {
          await page.waitForSelector(".entrada .cursor", { timeout: 2000 });
        } catch {
          falla(`primera visita ${en}`, "no aparecieron cursores");
        }
        await page.waitForTimeout(1500);
        const dentro = await page.evaluate(() => {
          const cursores = [...document.querySelectorAll(".cursor")];
          const saltar = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Saltar");
          const r = saltar?.getBoundingClientRect();
          const tapados = [...document.querySelectorAll(".hero__acciones .boton")]
            .map((b) => {
              const q = b.getBoundingClientRect();
              const x = q.left + q.width / 2;
              const y = q.top + q.height / 2;
              if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return null;
              const el = document.elementFromPoint(x, y);
              return el && el.closest(".boton") === b ? null : b.textContent.trim();
            })
            .filter(Boolean);
          return {
            n: cursores.length,
            roles: cursores.map((x) => x.textContent.trim()),
            ariaOculto: cursores.every((x) => x.closest("[aria-hidden='true']")),
            sinPuntero: cursores.every((x) => getComputedStyle(x).pointerEvents === "none") && (!document.querySelector(".entrada") || getComputedStyle(document.querySelector(".entrada")).pointerEvents === "none"),
            saltar: saltar ? { tag: saltar.tagName, w: r.width, h: r.height, visible: r.width > 0 && getComputedStyle(saltar).visibility === "visible" } : null,
            tapados,
            scrollH: document.documentElement.scrollWidth > innerWidth,
          };
        });
        if (dentro.n !== 4) falla(`primera visita ${en}`, `se esperaban 4 cursores y hay ${dentro.n}`);
        if (dentro.n === 4 && ["Procesos", "Diseño", "Backend", "Soporte"].some((r) => !dentro.roles.includes(r))) falla(`primera visita ${en}`, `roles inesperados: ${dentro.roles.join(", ")}`);
        if (!dentro.ariaOculto) falla(`primera visita ${en}`, "los cursores no están en aria-hidden=true");
        if (!dentro.sinPuntero) falla(`primera visita ${en}`, "los cursores o su contenedor no tienen pointer-events:none");
        if (!dentro.saltar) falla(`primera visita ${en}`, "no hay botón «Saltar»");
        else if (dentro.saltar.tag !== "BUTTON" || dentro.saltar.w < 44 || dentro.saltar.h < 44 || !dentro.saltar.visible) falla(`primera visita ${en}`, `«Saltar» debe ser un <button> visible de 44 px o más (es ${dentro.saltar.tag} ${dentro.saltar.w.toFixed(0)}×${dentro.saltar.h.toFixed(0)})`);
        if (dentro.tapados.length) falla(`primera visita ${en}`, `la animación tapa o intercepta los botones reales: ${dentro.tapados.join(", ")}`);
        if (dentro.scrollH) falla(`primera visita ${en}`, "provoca scroll horizontal");
        await page.waitForTimeout(Math.max(0, 4500 - (Date.now() - t0)));
        await revisarFinal(page, `primera visita ${en} a los 4.5 s`);
        const t = await page.evaluate(() => window.__entrada);
        if (t.puesta === null) falla(`primera visita ${en}`, "la clase js-entrada nunca se puso en <html>");
        else if (t.quitada === null) falla(`primera visita ${en}`, "la clase js-entrada nunca se quitó");
        else if (t.quitada - t.puesta > 4050) falla(`primera visita ${en}`, `la animación duró ${(t.quitada - t.puesta).toFixed(0)} ms (máximo 4000)`);
        else console.log(`  primera visita ${en}: duró ${(t.quitada - t.puesta).toFixed(0)} ms`);
        // Segunda visita: mismo contexto (mismo localStorage).
        const p2 = await c.ctx.newPage();
        await p2.goto(servidor.url + ruta, { waitUntil: "load" });
        await p2.waitForTimeout(1200);
        const n2 = await p2.evaluate(() => ({ cursores: document.querySelectorAll(".cursor").length, saltar: !!document.querySelector(".entrada__saltar"), clase: window.__entrada.puesta }));
        if (n2.cursores || n2.saltar || n2.clase !== null) falla(`segunda visita ${en}`, `no debe haber animación y hay ${JSON.stringify(n2)}`);
        await revisarFinal(p2, `segunda visita ${en}`);
        await cerrar(c, `consola ${en} (visitas)`);
      }

      /* 3. «Saltar», scroll y tecla terminan en menos de 300 ms. */
      for (const via of ["Saltar", "scroll", "tecla"]) {
        const c = await abrir({ viewport: vp, hasTouch: false });
        const page = await c.ctx.newPage();
        await page.goto(servidor.url + ruta, { waitUntil: "domcontentloaded" });
        try {
          await page.waitForSelector(".entrada .cursor", { timeout: 2000 });
          await page.waitForTimeout(700);
          const t = Date.now();
          if (via === "Saltar") await page.getByRole("button", { name: "Saltar" }).click();
          else if (via === "scroll") {
            await page.mouse.move(vp.width / 2, vp.height / 2);
            await page.mouse.wheel(0, 120);
          } else await page.keyboard.press("x");
          await sinAnimacion(page);
          const dt = Date.now() - t;
          if (dt >= 300) falla(`${via} ${en}`, `terminó en ${dt} ms (máximo 300)`);
          else console.log(`  ${via} ${en}: terminó en ${dt} ms`);
          await page.waitForTimeout(350);
          if (via !== "scroll") await revisarFinal(page, `${via} ${en}`);
          else {
            // Con scroll, el estado final se revisa igual (el scroll no debe dejar restos).
            const f = (await page.evaluate(ESTADO_FINAL)).filter((m) => !/sin caja/.test(m));
            for (const m of f) falla(`${via} ${en}`, m);
          }
        } catch (e) {
          falla(`${via} ${en}`, `no se pudo ejecutar: ${String(e.message).split("\n")[0]}`);
        }
        await cerrar(c, `consola ${via} ${en}`);
      }

      /* 4. Movimiento reducido: sin cursores y la línea completa. */
      {
        const c = await abrir({ viewport: vp, reducedMotion: "reduce" });
        const page = await c.ctx.newPage();
        await page.goto(servidor.url + ruta, { waitUntil: "load" });
        await page.waitForTimeout(1200);
        const r = await page.evaluate(() => ({ cursores: document.querySelectorAll(".cursor, .entrada, .entrada__saltar").length, puesta: window.__entrada.puesta }));
        if (r.cursores || r.puesta !== null) falla(`movimiento reducido ${en}`, `no debe haber animación y hay ${JSON.stringify(r)}`);
        await revisarFinal(page, `movimiento reducido ${en}`);
        for (const paso of ["antes de bajar", "tras bajar"]) {
          if (paso === "tras bajar") {
            await page.locator(".proceso").scrollIntoViewIfNeeded();
            await page.waitForTimeout(2200);
          }
          const l = await page.evaluate(ESTADO_LINEA);
          if (l.a !== 1 || l.d !== 1 || l.marcas.some((o) => o !== 1) || /js-etapas/.test(l.clase)) falla(`movimiento reducido ${en} (${paso})`, `la línea debe verse completa: ${JSON.stringify(l)}`);
        }
        await cerrar(c, `consola movimiento reducido ${en}`);
      }

      /* 5. Línea de etapas, con animación. */
      {
        const c = await abrir({ viewport: vp });
        const page = await c.ctx.newPage();
        await page.goto(servidor.url + ruta, { waitUntil: "load" });
        await sinAnimacion(page);
        const antes = await page.evaluate(ESTADO_LINEA);
        const eje = vp.width >= 1100 ? "a" : "d";
        const otro = eje === "a" ? "d" : "a";
        if (antes[eje] !== 0 || antes[otro] !== 1) falla(`línea de etapas ${en}`, `antes de entrar debe estar en ${eje === "a" ? "scaleX" : "scaleY"}(0): ${JSON.stringify(antes)}`);
        if (antes.marcas.some((o) => o !== 0)) falla(`línea de etapas ${en}`, `las marcas deben estar ocultas antes de entrar: ${JSON.stringify(antes.marcas)}`);
        await page.locator(".proceso").scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        const medio = await page.evaluate(ESTADO_LINEA);
        if (!(medio[eje] > 0 && medio[eje] < 1) && medio[eje] !== 1) falla(`línea de etapas ${en}`, `debería estar dibujándose: ${JSON.stringify(medio)}`);
        await page.waitForTimeout(2300);
        const despues = await page.evaluate(ESTADO_LINEA);
        if (despues.a !== 1 || despues.d !== 1 || despues.marcas.length !== 6 || despues.marcas.some((o) => o !== 1)) falla(`línea de etapas ${en}`, `tras entrar debe estar completa con 6 marcas: ${JSON.stringify(despues)}`);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(200);
        await page.locator(".proceso").scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        const otra = await page.evaluate(ESTADO_LINEA);
        if (otra.a !== 1 || otra.d !== 1) falla(`línea de etapas ${en}`, `solo debe dibujarse una vez: ${JSON.stringify(otra)}`);
        await cerrar(c, `consola línea ${en}`);
      }

      /* 6. Sin JavaScript. */
      {
        const c = await abrir({ viewport: vp, javaScriptEnabled: false });
        const page = await c.ctx.newPage();
        await page.goto(servidor.url + ruta, { waitUntil: "load" });
        await page.waitForTimeout(500);
        const l = await page.evaluate(ESTADO_LINEA);
        const f = (await page.evaluate(ESTADO_FINAL)).concat(l.a === 1 && l.d === 1 && l.marcas.every((o) => o === 1) ? [] : [`línea incompleta ${JSON.stringify(l)}`]);
        for (const m of f) falla(`sin JavaScript ${en}`, m);
        await cerrar(c, `consola sin JavaScript ${en}`);
      }

      /* 6b. Al imprimir (o guardar como PDF) sin haber bajado a las etapas, y a mitad de la entrada: nada oculto. */
      {
        const c = await abrir({ viewport: vp });
        const page = await c.ctx.newPage();
        await page.goto(servidor.url + ruta, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(600); // a mitad de la entrada
        await page.emulateMedia({ media: "print" });
        const l = await page.evaluate(ESTADO_LINEA);
        const hoja = await page.evaluate(() => {
          const f = [];
          for (const el of document.querySelectorAll(".hero__frase, .hero .pedido, .hero__acciones .boton")) {
            const cs = getComputedStyle(el);
            if (Number(cs.opacity) < 1) f.push(`${el.className}: opacidad ${cs.opacity}`);
            if (cs.clipPath !== "none" && /100%/.test(cs.clipPath)) f.push(`${el.className}: recortado ${cs.clipPath}`);
          }
          for (const el of document.querySelectorAll(".entrada, .entrada__saltar")) if (getComputedStyle(el).display !== "none") f.push(`${el.className} se imprime`);
          return f;
        });
        if (l.a !== 1 || l.d !== 1 || l.marcas.some((o) => o !== 1)) falla(`al imprimir ${en}`, `la línea de etapas debe imprimirse completa: ${JSON.stringify(l)}`);
        for (const m of hoja) falla(`al imprimir a mitad de la entrada ${en}`, m);
        await cerrar(c, `consola al imprimir ${en}`);
      }
    }

    /* 7. El JS falla a mitad: a los 5.5 s todo es visible. */
    const fallos = [
      ["main.js pone la clase y revienta", (ctx) => ctx.route(/\/assets\/js\/main\.js/, (r) => r.fulfill({ ...JS, body: "document.documentElement.classList.add('js-entrada'); throw new Error('falla simulada');" }))],
      ["inicio.js y main.js ponen la clase y revientan", async (ctx) => {
        await ctx.route(/\/assets\/js\/inicio\.js/, (r) => r.fulfill({ ...JS, body: "document.documentElement.classList.add('js-entrada'); throw new Error('falla simulada');" }));
        await ctx.route(/\/assets\/js\/main\.js/, (r) => r.fulfill({ ...JS, body: "throw new Error('falla simulada');" }));
      }],
      ["main.js no carga", (ctx) => ctx.route(/\/assets\/js\/main\.js/, (r) => r.abort())],
    ];
    for (const vp of VIEWPORTS) {
      for (const [nombre, preparar] of fallos) {
        const c = await abrir({ viewport: vp }, { esperados: true });
        await preparar(c.ctx);
        const page = await c.ctx.newPage();
        const t0 = Date.now();
        await page.goto(servidor.url + ruta, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(Math.max(0, 5500 - (Date.now() - t0)));
        // Con inicio.js también roto, nadie quita la clase: basta con que el CSS deje todo visible (salida a los 5 s).
        for (const m of (await page.evaluate(ESTADO_FINAL)).filter((m) => !(nombre.startsWith("inicio.js") && /^quedan clases/.test(m)))) falla(`falla simulada «${nombre}» @${vp.width}px a los 5.5 s`, m);
        await c.ctx.close();
      }
    }
  }
});
