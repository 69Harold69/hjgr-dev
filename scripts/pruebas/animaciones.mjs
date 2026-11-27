#!/usr/bin/env node
/*
  animaciones: las dos animaciones de la home y de las páginas de giro (issues #7 y #8; comparten hero), contra el servidor de pruebas (con la CSP de producción).
    1. Entrada del hero, «un equipo de cursores»: en cada carga (sin memoria de visitas), 3 cursores (Procesos, Backend, Soporte: arman la hoja, los botones y la línea naranja) y el botón «Saltar»,
       termina sola en 4 s como máximo y deja todo visible y sin residuos.
    2. Secciones (#31, #38): los mismos cursores arman cada sección una sola vez por carga: la sección queda activa al entrar ~10 % en pantalla y cada pieza se arma, con su cursor, cuando ELLA está a la vista (líneas, bordes, marcas de corte,
       la línea de las seis etapas, el resaltado de la fila del diagnóstico y las capturas dentro de su marco); el texto nunca se esconde;
       «Saltar» (o Escape) los apaga en toda la página durante esa visita; sin JS, con movimiento reducido o al imprimir, todo armado.
  Secciones, en 1280×800 y 390×844: cada una se arma una sola vez, con 4 s de animación como máximo (2.5 s en celular; sin contar esperas a que su pieza esté a la vista) y pasos de 180 ms o más (no es un barrido), con 1 a 3 cursores (2 en celular, aria-hidden,
    pointer-events:none, sin scroll horizontal); a mitad de la animación todo su texto está a opacidad 1; solo se animan transform y opacity; scroll rápido
    hasta el final: lo que quedó atrás se arma al instante y nada queda desarmado; «Saltar» y Escape; movimiento reducido, sin JS e impresión: todo armado;
    carga con ancla a una sección intermedia: lo de arriba está armado; foco de teclado en una sección sin armar: se arma al instante; el JS falla: todo armado;
    umbral (#35): con el borde superior ~5 % adentro de la pantalla no se arma y con ~15 % sí; impresión a mitad de las etapas y a mitad de trabajo (capturas y marcas);
    «reducir movimiento» activado a mitad de una sección: se apaga todo al instante, sin cursores sueltos ni cambio de alto.
  Lector tranquilo (#38, sin `irA`): rueda a 333 px/s, pasos con pausas de 1 a 2 s, 1000 y 4000 px/s, en home y /vidrierias/: nada se arma fuera de pantalla por abajo, toda pieza que se dibuja a la vista
    tiene un cursor cerca, nunca más de 3 cursores en pantalla (2 en celular), la espera de una pieza visible se mide y reporta, y al final todo queda armado. Lector quieto, redimensionar/rotar a mitad,
    esquinas del trazo (mismo radio y anillo que el estado final). `--mutacion` demuestra que la prueba falla si se vuelve al armado forzado por tiempo; `--solo-lector` corre solo el lector tranquilo.
  El H1 y su párrafo se revisan cuadro a cuadro desde el primer pintado (no solo a mitad de la entrada).
  Comprueba, en 1280×800 y 390×844 (cada caso en un contexto nuevo):
    - primera visita: el H1 y su párrafo visibles desde el primer pintado (opacidad 1, sin recorte, sin transform) mientras corren los cursores,
      y el elemento LCP es el H1 (decisión del dueño: el mensaje se lee al instante); 3 cursores aria-hidden con pointer-events:none, botón «Saltar» (<button>, 44 px o más),
      los botones reales del hero no quedan tapados, y a los 4.5 s ya no queda nada de la animación (ni la clase en <html>)
      y el H1, la hoja, sus marcas y los dos botones están a opacidad 1, sin transformaciones ni recortes residuales;
      la clase duró 4 s como máximo;
    - segunda carga (mismo contexto): la entrada vuelve a salir (no se guarda nada en el navegador: localStorage vacío);
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
  propio contexto limpio. Si el sitio no tiene hero (p. ej. fixtures/bueno), no hay nada que probar.
  Uso: node animaciones.mjs [--raiz DIR]
*/
import fs from "node:fs";
import path from "node:path";
import { AQUI, RAIZ_REPO, conPaginas, leerArgs, salir, slug } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node animaciones.mjs [--raiz DIR] [--solo-secciones] [--solo-saltar]");
if (a.mutacion || a["solo-lector"]) a["solo-secciones"] = true; // para iterar / demostrar la mutación: solo el lector tranquilo
const soloPrimero = !!a["solo-primer-cuadro"]; // para iterar: solo 8j (primer cuadro sin armar)
const soloSaltar = !!a["solo-saltar"]; // para iterar: solo «Saltar animación (Esc)»
const soloSecciones = !!a["solo-secciones"] || !!a.mutacion || !!a["solo-lector"] || soloSaltar || soloPrimero; // para iterar: salta el hero y las fallas simuladas

const SALIDA_ANIM = path.join(AQUI, "salida/animaciones");
fs.mkdirSync(SALIDA_ANIM, { recursive: true });
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
  // El H1 y su párrafo, cuadro a cuadro desde el primer pintado (no solo a mitad de la entrada): opacidad efectiva 1, visibles y sin recorte.
  window.__textoOculto = [];
  const t0 = performance.now();
  const cuadro = () => {
    for (const [nombre, sel] of [["h1", "h1"], ["párrafo del hero", ".hero__texto > p:not(.hero__firma)"]]) {
      const el = document.querySelector(sel);
      if (!el) continue;
      let o = 1;
      let oculto = false;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const cs = getComputedStyle(n);
        o *= Number(cs.opacity);
        if (cs.visibility !== "visible" || cs.clipPath !== "none" || cs.display === "none") oculto = true;
      }
      if ((o < 0.999 || oculto) && window.__textoOculto.length < 5) window.__textoOculto.push(`${nombre} a los ${Math.round(performance.now() - t0)} ms (opacidad ${o.toFixed(2)}${oculto ? ", oculto o recortado" : ""})`);
    }
    if (performance.now() - t0 < 2500) requestAnimationFrame(cuadro);
  };
  requestAnimationFrame(cuadro);
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
  limpio("párrafo del hero", document.querySelector(".hero__texto > p:not(.hero__firma)"));
  limpio("hoja", document.querySelector(".hero .pedido"));
  document.querySelectorAll(".hero .pedido .marcas__esq").forEach((el, i) => limpio(`marca de corte ${i + 1}`, el));
  const botones = document.querySelectorAll(".hero__acciones .boton");
  if (botones.length !== 2) f.push(`el hero debe tener 2 botones y tiene ${botones.length}`);
  botones.forEach((el, i) => limpio(`botón ${i + 1}`, el));
  document.querySelectorAll(".hero .etapas__item:not(:last-child)").forEach((el, i) => limpio(`línea de la hoja ${i + 1}`, el, "::after"));
  // Con el umbral al 10 % (#35) la primera sección ya puede estar armándose cuando termina el hero: sus cursores y el botón «Saltar» que la acompaña no son restos del hero.
  const armandoSeccion = !!document.querySelector(".cursores-seccion");
  if (document.querySelector(".entrada, .entrada .cursor") || (!armandoSeccion && document.querySelector(".cursor, .entrada__saltar, .cursores-seccion"))) f.push("quedan elementos de la animación en el DOM");
  const clases = [...document.documentElement.classList].filter((c) => /^(js-entrada|entrada)/.test(c));
  if (clases.length) f.push(`quedan clases en <html>: ${clases.join(" ")}`);
  return f;
};

/* El titular y su párrafo no se animan: siempre a opacidad 1, sin recorte ni transform, aunque corra la entrada. */
const ESTADO_TEXTO = () => {
  const f = [];
  for (const [nombre, el] of [["h1", document.querySelector("h1")], ["párrafo del hero", document.querySelector(".hero__texto > p:not(.hero__firma)")], ...[...document.querySelectorAll(".hero__frase")].map((x, i) => [`frase ${i + 1}`, x])]) {
    if (!el) { f.push(`falta ${nombre}`); continue; }
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (Number(cs.opacity) !== 1) f.push(`${nombre}: opacidad ${cs.opacity}`);
      if (cs.clipPath !== "none") f.push(`${nombre}: recorte ${cs.clipPath}`);
      if (cs.transform !== "none") f.push(`${nombre}: transform ${cs.transform}`);
      if (n.getAnimations().length) f.push(`${nombre}: tiene animaciones activas`);
    }
  }
  return f;
};

/* Estado de la línea de etapas: escala del eje y opacidad de las seis marcas. */
const ESTADO_LINEA = () => {
  const l = document.querySelector(".proceso__linea");
  const m = new DOMMatrix(getComputedStyle(l).transform === "none" ? undefined : getComputedStyle(l).transform);
  return { a: m.a, d: m.d, marcas: [...document.querySelectorAll(".proceso__marca")].map((x) => Number(getComputedStyle(x).opacity)), clase: document.documentElement.className };
};


/* Todo armado: sin pseudo-capas de líneas, bordes reales visibles, nada con opacidad 0 ni transformaciones residuales, sin cursores de sección. */
const ESTADO_ARMADO = () => {
  const f = [];
  const transp = (c) => c === "rgba(0, 0, 0, 0)" || c === "transparent";
  const ident = (t) => t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)";
  const bordes = [
    [".problemas", "borderTopColor"], [".problemas__fila", "borderBottomColor"], [".fila", "borderTopColor"], [".captura__cuerpo", "borderTopColor"],
    [".faq", "borderTopColor"], [".faq__item", "borderBottomColor"], [".cierre__titulo", "borderBottomColor"], [".cierre", "borderTopColor"],
  ];
  for (const [sel, prop] of bordes) for (const el of document.querySelectorAll(`main ${sel}, main${sel}, main > ${sel}`)) if (transp(getComputedStyle(el)[prop])) f.push(`${sel}: ${prop} transparente`);
  for (const el of document.querySelectorAll(".paso")) if (transp(getComputedStyle(el, "::before").borderBottomColor)) f.push(".paso::before: borde transparente");
  const pseudos = [[".problemas", "::before"], [".problemas__fila", "::after"], [".fila", "::before"], [".fila:last-child", "::after"], [".captura__cuerpo", "::before"], [".paso", "::after"], [".faq", "::before"], [".faq__item", "::after"], [".cierre__titulo", "::after"], [".cierre", "::before"]];
  for (const [sel, ps] of pseudos) for (const el of document.querySelectorAll(sel)) if (getComputedStyle(el, ps).content !== "none" && getComputedStyle(el, ps).content !== "normal") f.push(`${sel}${ps}: capa de línea sin armar`);
  for (const sel of [".proceso__marca", ".trabajo .marcas__esq", ".foto .marcas__esq", ".captura__img", ".hero .pedido .marcas__esq"]) for (const el of document.querySelectorAll(sel)) if (Number(getComputedStyle(el).opacity) !== 1) f.push(`${sel}: opacidad ${getComputedStyle(el).opacity}`);
  for (const sel of [".proceso__linea", ".captura__img"]) for (const el of document.querySelectorAll(sel)) if (!ident(getComputedStyle(el).transform)) f.push(`${sel}: transform ${getComputedStyle(el).transform}`);
  const fila = document.querySelector("tr.tabla__destacada");
  if (fila) {
    const movil = getComputedStyle(fila).display === "block";
    const sin = movil ? [fila] : [...fila.children];
    for (const el of sin) if (transp(getComputedStyle(el).backgroundColor)) f.push("fila del diagnóstico sin resaltado");
  }
  // Bordes y sombras reales de tarjetas y hojas, recorte de las capturas, líneas de la tabla.
  // También la hoja del hero: el estado «sin armar» de las secciones no debe alcanzarla (el hero no se arma con cursores de sección).
  for (const el of document.querySelectorAll("main .captura, main .hoja")) if (getComputedStyle(el).boxShadow === "none") f.push(`${el.className}: sin sombra/borde`);
  for (const el of document.querySelectorAll(".captura__img")) if (getComputedStyle(el).clipPath !== "none") f.push(`captura__img: recorte ${getComputedStyle(el).clipPath}`);
  for (const el of document.querySelectorAll(".tabla, .tabla th, .tabla td")) {
    const cs = getComputedStyle(el);
    if (transp(el.matches(".tabla") ? cs.borderTopColor : cs.borderBottomColor)) f.push("tabla: línea transparente");
  }
  if (document.querySelector(".cursores-seccion")) f.push("quedan capas de cursores de sección");
  return f;
};

/* Sonda de secciones: por cada <section> de <main>, cuándo se creó su capa de cursores y cuándo se armó, cuántos cursores tuvo a la vez,
   si algo de su texto estuvo escondido mientras se armaba y qué propiedades se animaron. */
const SONDA_SECCIONES = () => {
  const S = (window.__sec = { s: {}, props: [], muestras: 0, capas: 0, cursoresVistos: 0, scrollH: false });
  const idx = (el) => [...document.querySelectorAll("main > section")].indexOf(el);
  const reg = (el) => (S.s[idx(el)] ??= { creada: null, armada: null, armadas: 0, capas: 0, max: 0, cursoresOk: true, texto: [], activo: 0, pasos: [] });
  const vistosPasos = new WeakSet();
  let tAnt = performance.now();
  const SEG = new Set(["offset", "computedOffset", "easing", "composite", "transform", "opacity", "clipPath"]); // solo transform, opacity y clip-path
  const propiedades = new Set();
  const mirar = () => {
    const secs = document.querySelectorAll("main > section");
    const dt = performance.now() - tAnt;
    tAnt = performance.now();
    secs.forEach((el) => {
      // Tiempo de animación de la sección = cuadros en que algo suyo se está animando (sin contar las esperas a que su pieza esté a la vista ni las pausas).
      if (el.querySelector(".cursores-seccion") && el.getAnimations({ subtree: true }).some((a) => a.playState === "running")) reg(el).activo += dt;
      if (el.classList.contains("armada")) {
        const r = reg(el);
        if (r.armada === null) {
          r.armada = performance.now();
          r.armadas++;
        }
      }
    });
    for (const capa of document.querySelectorAll(".cursores-seccion")) {
      const el = capa.parentElement;
      const r = reg(el);
      if (r.creada === null) r.creada = performance.now();
      const cs = [...capa.querySelectorAll(".cursor")];
      r.max = Math.max(r.max, cs.length);
      if (!capa.matches("[aria-hidden='true']") || getComputedStyle(capa).pointerEvents !== "none" || cs.some((c) => getComputedStyle(c).pointerEvents !== "none")) r.cursoresOk = false;
      S.cursoresVistos = Math.max(S.cursoresVistos, cs.length);
      // Texto de la sección a mitad de la animación: opacidad efectiva 1 y visible.
      for (const t of el.querySelectorAll("*")) {
        if (t.closest(".cursores-seccion, .solo-lectores, caption") || ![...t.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        let o = 1;
        for (let n = t; n && n !== document.documentElement; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
        const cs2 = getComputedStyle(t);
        if (o < 0.999 || cs2.visibility !== "visible" || cs2.clipPath !== "none") {
          const m = `${t.tagName.toLowerCase()}.${t.className}: opacidad ${o.toFixed(2)} ${cs2.visibility}`;
          if (!r.texto.includes(m)) r.texto.push(m);
        }
      }
      S.muestras++;
    }
    if (document.documentElement.scrollWidth > innerWidth) S.scrollH = true;
    for (const a of document.getAnimations()) {
      const kfs = a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : [];
      // Un paso = una animación de transform del cursor (viaje + dibujo): se guarda su duración por sección.
      const tg = a.effect && a.effect.target;
      if (tg && tg.classList && tg.classList.contains("cursor") && !a.effect.pseudoElement && kfs.some((k) => k.transform) && !vistosPasos.has(a)) {
        vistosPasos.add(a);
        const sec = tg.closest("main > section");
        if (sec) reg(sec).pasos.push(Math.round(a.effect.getTiming().duration));
      }
      for (const k of kfs) for (const p of Object.keys(k)) if (!SEG.has(p) && !propiedades.has(p)) propiedades.add(p);
    }
    S.props = [...propiedades];
    requestAnimationFrame(mirar);
  };
  new MutationObserver((ms) => {
    for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains("cursores-seccion")) reg(m.target).capas++;
  }).observe(document, { subtree: true, childList: true });
  const arrancar = () => requestAnimationFrame(mirar);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
};


/* Estado «sin armar» de una sección (índice dentro de main > section) en un instante: cuenta las piezas visuales que reconoce y lista las que ya se ven armadas. */
const ESTADO_SIN_ARMAR = (n) => {
  const sec = document.querySelectorAll("main > section")[n];
  const piezas = { n: 0 };
  const visibles = [];
  const transp = (c) => c === "rgba(0, 0, 0, 0)" || c === "transparent";
  const escala = (t) => {
    if (t === "none") return 1;
    const m = new DOMMatrix(t);
    return Math.min(Math.abs(m.a), Math.abs(m.d)); // la línea escala un solo eje: el otro queda en 1
  };
  const cada = (sel, fn, nombre) => sec.querySelectorAll(sel).forEach((el) => { piezas.n++; const m = fn(el); if (m) visibles.push(`${nombre || sel}: ${m}`); });
  cada(".captura, .hoja", (e) => getComputedStyle(e).boxShadow !== "none" && `sombra/borde ${getComputedStyle(e).boxShadow.slice(0, 30)}`, "tarjeta o hoja");
  cada(".captura__img", (e) => getComputedStyle(e).clipPath === "none" && "sin recorte (captura ya revelada)", "captura");
  cada(".marcas__esq", (e) => Number(getComputedStyle(e).opacity) > 0 && `opacidad ${getComputedStyle(e).opacity}`, "marca de corte");
  cada(".tabla", (e) => !transp(getComputedStyle(e).borderTopColor) && "borde superior visible", "tabla");
  cada(".tabla tbody th, .tabla tbody td", (e) => !transp(getComputedStyle(e).borderBottomColor) && "línea de fila visible", "fila de la tabla");
  cada(".tabla__destacada th, .tabla__destacada td", (e) => { const t = getComputedStyle(e); return getComputedStyle(e, "::after").clipPath === "none" && !transp(t.backgroundColor) && "resaltado del diagnóstico ya visible"; }, "resaltado");
  cada(".problemas, .faq", (e) => !transp(getComputedStyle(e).borderTopColor) && "filete superior visible", "filete");
  cada(".problemas__fila, .faq__item, .cierre__titulo", (e) => !transp(getComputedStyle(e).borderBottomColor) && "línea inferior visible", "línea");
  cada(".fila", (e) => !transp(getComputedStyle(e).borderTopColor) && "línea de fila visible", "fila de sistemas");
  cada(".captura__cuerpo", (e) => !transp(getComputedStyle(e).borderTopColor) && "filete visible", "filete de captura");
  cada(".paso", (e) => !transp(getComputedStyle(e, "::before").borderBottomColor) && "línea naranja visible", "paso");
  cada(".proceso__linea", (e) => escala(getComputedStyle(e).transform) > 0.001 && "línea de etapas dibujada", "línea de etapas");
  cada(".proceso__marca", (e) => Number(getComputedStyle(e).opacity) > 0 && "marca visible", "marca de etapa");
  if (sec.matches(".cierre")) { piezas.n++; if (!transp(getComputedStyle(sec).borderTopColor)) visibles.push("cierre: filete superior visible"); }
  return { piezas: piezas.n, visibles };
};

/* Sonda de cursores y capas del armado, cuadro a cuadro: etiquetas contra títulos, cursores visibles con el objetivo fuera de pantalla,
   piezas dibujándose a la vista sin un cursor cerca y cuándo empieza a verse cada capa (secuencia). */
const SONDA_CURSORES = () => {
  const S = (window.__cur = { muestras: 0, sinCursor: [], etiquetas: [], fuera: [], inicios: {}, abajo: [], maxVis: 0, sobre: [], desalineadas: [], armadoAbajo: [], esperas: [], estados: {} });
  const tLista = new WeakMap();
  const t00 = performance.now();
  new MutationObserver((ms) => {
    for (const m of ms) {
      const el = m.target;
      if (!el.classList || !el.classList.contains("arma-centinela")) continue;
      const e = el.dataset.estado;
      const t = performance.now() - t00;
      S.estados[e] = (S.estados[e] || 0) + 1;
      const r = el.getBoundingClientRect();
      if (e === "lista") tLista.set(el, t);
      if (e === "corre" && tLista.has(el)) S.esperas.push(Math.round(t - tLista.get(el)));
      // Una pieza que se arma estando ABAJO de la pantalla (corre), o una «arriba» que en realidad no lo está.
      if (e === "corre" && r.top > innerHeight && S.armadoAbajo.length < 6) S.armadoAbajo.push(`pieza armándose por abajo de la pantalla (top ${Math.round(r.top)} > ${innerHeight}) a ${Math.round(t)} ms`);
      if (e === "arriba" && r.top > 100 && S.armadoAbajo.length < 6) S.armadoAbajo.push(`pieza armada «al instante» sin estar arriba (top ${Math.round(r.top)}) a ${Math.round(t)} ms`);
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-estado"] });
  const vistas = new WeakMap();
  const opac = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
  const escala = (el) => { const t = getComputedStyle(el).transform; if (t === "none") return 1; const m = new DOMMatrix(t); return Math.min(Math.abs(m.a), Math.abs(m.d)); };
  const dist = (px, py, r) => Math.hypot(Math.max(r.left - px, 0, px - r.right), Math.max(r.top - py, 0, py - r.bottom));
  const t0 = performance.now();
  let yAnt = 0;
  let tScroll = 0;
  const cuadro = () => {
    const ahora = performance.now() - t0;
    if (scrollY !== yAnt) { yAnt = scrollY; tScroll = ahora; }
    const quieto = ahora - tScroll > 150; // con scroll en curso el cursor se mueve con la página: no se juzga
    const cursores = [...document.querySelectorAll(".cursores-seccion .cursor")].filter((el) => opac(el) > 0.05);
    const enPantalla = cursores.filter((el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; });
    if (enPantalla.length > S.maxVis) S.maxVis = enPantalla.length;
    if (enPantalla.length > (innerWidth <= 767 ? 2 : 3) && S.sobre.length < 6) S.sobre.push(`${enPantalla.length} cursores a la vez a ${Math.round(ahora)} ms`);
    const puntas = cursores.map((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, r }; });
    if (cursores.length) S.muestras++;
    const antes = S.puntasAntes || [];
    S.puntasAntes = puntas;
    for (const el of cursores) {
      const sec = el.closest("main > section");
      const r = el.getBoundingClientRect();
      const rol = el.querySelector(".cursor__rol");
      const rr = rol.getBoundingClientRect();
      if (rol && opac(rol) > 0.05) for (const t of sec.querySelectorAll("h2, h3, .nombre")) {
        const q = t.getBoundingClientRect();
        if (q.width > 0 && Math.min(rr.right, q.right) - Math.max(rr.left, q.left) > 1 && Math.min(rr.bottom, q.bottom) - Math.max(rr.top, q.top) > 1 && S.etiquetas.length < 6) S.etiquetas.push(`«${rol.textContent}» sobre «${t.textContent.trim().slice(0, 30)}» a ${Math.round(ahora)} ms`);
      }
      // Objetivo fuera: la punta fuera de la pantalla (o tapada por la barra de 72 px) mientras la flecha todavía se ve.
      const alto = r.bottom > 72 && r.top < innerHeight;
      if (quieto && alto && (r.top < 72 - 2 || r.top > innerHeight - 8 || r.left < -2 || r.left > innerWidth - 8) && S.fuera.length < 6) S.fuera.push(`cursor ${el.className} con la punta en (${Math.round(r.left)}, ${Math.round(r.top)}) a ${Math.round(ahora)} ms`);
    }
    for (const el of document.querySelectorAll(".cursores-seccion .arma-capa")) {
      const sec = el.closest("main > section");
      const nombre = sec.id || sec.className.split(" ")[0];
      const esSombra = el.classList.contains("arma-capa--sombra");
      const esAnillo = el.classList.contains("arma-capa--anillo");
      // El anillo se dibuja con clip-path: «0» mientras no recorta nada visible y «0.5» desde que se ve algo (su avance lo cubren las demás capas del paso).
      const prog = esSombra ? Number(getComputedStyle(el).opacity) : esAnillo ? ((m) => (m && el.offsetWidth - Number(m[2]) - Number(m[4]) > 0.5 && el.offsetHeight - Number(m[1]) - Number(m[3]) > 0.5 ? 0.5 : 0))(getComputedStyle(el).clipPath.match(/inset\((-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px/)) : escala(el);
      const r = el.getBoundingClientRect();
      if (prog > 0.02 && !vistas.has(el)) {
        vistas.set(el, ahora);
        if (r.top > innerHeight && S.abajo.length < 6) S.abajo.push(`${nombre} ${el.className.replace("arma-capa", "capa")} empezó a dibujarse por abajo de la pantalla (top ${Math.round(r.top)}) a ${Math.round(ahora)} ms`);
        (S.inicios[nombre] ??= []).push(ahora - (S.base?.[nombre] ?? 0));
        S.base ??= {};
        S.base[nombre] ??= ahora;
        S.inicios[nombre][S.inicios[nombre].length - 1] = ahora - S.base[nombre];
      }
      if (el.classList.contains("arma-capa--anillo") && S.desalineadas.length < 6) {
        const ok = [...sec.querySelectorAll(".captura, .hoja")].some((c) => { const q = c.getBoundingClientRect(); return Math.abs(q.left - r.left) < 1.5 && Math.abs(q.top - r.top) < 1.5 && Math.abs(q.width - r.width) < 1.5 && Math.abs(q.height - r.height) < 1.5; });
        if (!ok) S.desalineadas.push(`${nombre}: anillo en (${Math.round(r.left)}, ${Math.round(r.top)}) ${Math.round(r.width)}×${Math.round(r.height)} sin tarjeta debajo`);
      }
      const aVista = r.bottom > 90 && r.top < innerHeight - 60 && r.right > 0 && r.left < innerWidth;
      if (!esSombra && !esAnillo && prog > 0.04 && prog < 0.96 && aVista && r.width * r.height > 0) {
        // El cursor y la línea se muestrean en el mismo cuadro, pero una línea rápida cruza hasta 350 px por cuadro: vale la punta de este cuadro o la del anterior.
        const largo = Math.max(el.offsetWidth, el.offsetHeight); // en 45 ms una línea de 400 px avanza 140 px por cuadro: la tolerancia crece con la velocidad
        const cerca = [...puntas, ...antes].some((p) => dist(p.x, p.y, r) < 90 + 0.35 * largo);
        if (!cerca && S.sinCursor.length < 6) S.sinCursor.push(`${nombre} ${el.className.replace("arma-capa", "capa")} al ${Math.round(prog * 100)} % a ${Math.round(ahora)} ms (cursores: ${puntas.length})`);
      }
    }
    requestAnimationFrame(cuadro);
  };
  addEventListener("DOMContentLoaded", () => requestAnimationFrame(cuadro));
};

/* Sonda de «Saltar»: cuadro a cuadro mientras el botón existe, cuánto texto visible tapa (intersección con cada línea de texto), en qué esquina está y qué hay en la pantalla. */
const SONDA_SALTAR = () => {
  const S = (window.__saltar = { cuadros: 0, choques: [], esquinas: {}, textos: new Set() });
  const cajas = () => {
    const f = [];
    const paseo = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const rango = document.createRange();
    for (let n = paseo.nextNode(); n; n = paseo.nextNode()) {
      const p = n.parentElement;
      if (!n.nodeValue.trim() || !p || p.closest(".entrada, .cursores-seccion, .entrada__saltar, .solo-lectores, .salto, script, style, noscript")) continue;
      rango.selectNodeContents(n);
      for (const r of rango.getClientRects()) if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) f.push({ r, t: n.nodeValue.trim().slice(0, 28) });
    }
    return f;
  };
  const cuadro = () => {
    const b = document.querySelector(".entrada__saltar");
    if (b) {
      S.cuadros++;
      const q = b.getBoundingClientRect();
      const sitio = `${Math.round(q.left)},${Math.round(q.top)}`;
      S.esquinas[sitio] = (S.esquinas[sitio] || 0) + 1; // debe ser un solo sitio: el botón no salta de lugar
      for (const { r, t } of cajas()) {
        const w = Math.min(q.right, r.right) - Math.max(q.left, r.left);
        const h = Math.min(q.bottom, r.bottom) - Math.max(q.top, r.top);
        if (w > 1 && h > 1 && S.choques.length < 6) S.choques.push(`«${t}» (${Math.round(w)}×${Math.round(h)} px) con el botón en ${sitio} a scrollY ${Math.round(scrollY)}`);
      }
    }
    requestAnimationFrame(cuadro);
  };
  addEventListener("DOMContentLoaded", () => requestAnimationFrame(cuadro));
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
  const sinAnimacion = (page) => page.waitForFunction(() => !document.querySelector(".entrada") && !document.documentElement.classList.contains("js-entrada"), null, { polling: "raf", timeout: 6000 });
  const revisarFinal = async (page, donde) => {
    for (const m of await page.evaluate(ESTADO_FINAL)) falla(donde, m);
  };

  for (const ruta of rutas) {
    falla = (donde, msg) => fallaBase(`${ruta} ${donde}`, msg);
    for (const vp of soloSecciones ? [] : VIEWPORTS) {
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
        // A mitad de la entrada el titular y su párrafo ya estaban a la vista, estáticos.
        for (const m of await page.evaluate(ESTADO_TEXTO)) falla(`primera visita ${en} a mitad de la entrada`, m);
        for (const m of await page.evaluate(() => window.__textoOculto)) falla(`primera visita ${en} desde el primer pintado`, `texto del hero no visible: ${m}`);
        const dentro = await page.evaluate(() => {
          const cursores = [...document.querySelectorAll(".cursor")];
          const saltar = document.querySelector("button.entrada__saltar");
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
        if (dentro.n !== 3) falla(`primera visita ${en}`, `se esperaban 3 cursores y hay ${dentro.n}`);
        if (dentro.n === 3 && ["Procesos", "Backend", "Soporte"].some((r) => !dentro.roles.includes(r))) falla(`primera visita ${en}`, `roles inesperados: ${dentro.roles.join(", ")}`);
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
        // Segunda carga: mismo contexto. La entrada vuelve a salir y no se guardó nada en localStorage.
        const p2 = await c.ctx.newPage();
        await p2.goto(servidor.url + ruta, { waitUntil: "domcontentloaded" });
        try {
          await p2.waitForSelector(".entrada .cursor", { timeout: 2000 });
        } catch {
          falla(`segunda carga ${en}`, "la entrada no volvió a salir");
        }
        const guardado = await p2.evaluate(() => localStorage.length + sessionStorage.length + document.cookie.length);
        if (guardado) falla(`segunda carga ${en}`, "el sitio guardó algo en el navegador (localStorage, sessionStorage o cookies)");
        await sinAnimacion(p2);
        await revisarFinal(p2, `segunda carga ${en}`);
        await cerrar(c, `consola ${en} (cargas)`);
      }

      /* 2b. El elemento LCP es el H1 (el titular se ve desde el primer pintado; la entrada no lo retrasa). */
      {
        const c = await abrir({ viewport: vp });
        const page = await c.ctx.newPage();
        await page.addInitScript(() => {
          window.__lcp = [];
          new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp.push({ tag: e.element ? e.element.tagName : null, enH1: !!(e.element && e.element.closest("h1")), t: e.startTime }); }).observe({ type: "largest-contentful-paint", buffered: true });
        });
        await page.goto(servidor.url + ruta, { waitUntil: "load" });
        await page.waitForTimeout(1200);
        const lcp = await page.evaluate(() => window.__lcp);
        const ultimo = lcp[lcp.length - 1];
        if (!ultimo) falla(`LCP ${en}`, "el navegador no reportó ningún elemento LCP");
        // El texto del H1 vive en <span class="hero__frase">: el navegador reporta ese span (descendiente del H1).
        else if (!ultimo.enH1) falla(`LCP ${en}`, `el elemento LCP debe ser el H1 (o un hijo suyo) y es ${ultimo.tag}`);
        else console.log(`  LCP ${en}: ${ultimo.tag} dentro del H1 a ${ultimo.t.toFixed(0)} ms`);
        await cerrar(c, `consola LCP ${en}`);
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
            await page.mouse.move(1, vp.height / 2); // margen lateral: sin nada debajo (un hover dejaría un translateY(-1px) legítimo en un botón)
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
          if (l.a !== 1 || l.d !== 1 || l.marcas.some((o) => o !== 1) || /js-secciones/.test(l.clase)) falla(`movimiento reducido ${en} (${paso})`, `la línea debe verse completa: ${JSON.stringify(l)}`);
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
        await page.waitForTimeout(450);
        const medio = await page.evaluate(ESTADO_LINEA);
        if (!(medio[eje] > 0 && medio[eje] < 1) && medio[eje] !== 1) falla(`línea de etapas ${en}`, `debería estar dibujándose: ${JSON.stringify(medio)}`);
        await page.waitForTimeout(2000);
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
          for (const el of document.querySelectorAll(".hero .pedido, .hero__acciones .boton")) {
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


    /* 8. Secciones (#31): se arman una sola vez al entrar en pantalla, con 2 o 3 cursores. */
    for (const vp of soloSaltar ? [] : VIEWPORTS) {
      const en = `@${vp.width}px`;
      const chico = vp.width < 768;
      const maxMs = chico ? 2500 : 4000; // tiempo de animación por sección (decisión del dueño): 4 s en escritorio, 2.5 s en celular
      const minActivo = chico ? 1900 : 2000; // ms: leída de a una, una sección con 3 o más pasos anima, al menos, esto (el objetivo del dueño es 4 s / 2.5 s, no solo el tope)
      const minPaso = 180; // ms: un paso (el cursor llega, dibuja) nunca dura menos: se lee como un dibujo, no como un barrido
      const abrirSec = async (opciones = {}, destino = ruta) => {
        const c = await abrir({ viewport: vp, ...opciones });
        await c.ctx.addInitScript(SONDA_SECCIONES);
        const page = await c.ctx.newPage();
        await page.goto(servidor.url + destino, { waitUntil: "load" });
        return { c, page };
      };
      const secciones = (page) => page.evaluate(() => [...document.querySelectorAll("main > section:not(.hero)")].map((s, i) => ({ i: [...document.querySelectorAll("main > section")].indexOf(s), nombre: s.id || s.className.split(" ")[0], tinta: s.classList.contains("banda--tinta") })));
      // Un lector sube hasta ver lo importante: la sección arriba (90 px), o, si no cabe, hasta dejar a la vista la fila del diagnóstico (precios) o las filas de sistemas.
      const irA = (page, i, nombre = "") => page.evaluate(([n, nom]) => {
        const s = document.querySelectorAll("main > section")[n];
        let meta = s.getBoundingClientRect().top - 90;
        const ref = nom === "precios" ? s.querySelector(".tabla__destacada") : nom === "sistemas" ? s.querySelector(".fila:last-child") : null;
        if (ref) meta = Math.max(meta, ref.getBoundingClientRect().bottom + 30 - innerHeight);
        if (nom === "sistemas") meta = Math.min(meta, s.querySelector(".proceso").getBoundingClientRect().top - 110);
        window.scrollTo(0, window.scrollY + meta);
      }, [i, nombre]);

      // Lector tranquilo: baja por la sección a pasos de ~15 % de la pantalla (≈250 px/s) con pausas de medio segundo (sin saltar a «lo importante»)
      // hasta que la sección queda armada (o se acaba la página). Devuelve si quedó armada.
      const leerSeccion = async (page, i, tope = 40000) => {
        const t0 = Date.now();
        for (;;) {
          const r = await page.evaluate((n) => {
            const s = document.querySelectorAll("main > section")[n];
            if (s.classList.contains("armada")) return "armada";
            const q = s.getBoundingClientRect();
            const alFinal = scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
            if (q.top > innerHeight * 0.85) scrollTo(0, scrollY + q.top - innerHeight * 0.8);
            else if (!alFinal && q.bottom > innerHeight * 0.5) scrollBy(0, innerHeight * 0.15);
            return "sigue";
          }, i);
          if (r === "armada") return true;
          if (Date.now() - t0 > tope) return false;
          await page.waitForTimeout(450);
        }
      };

      const lectorTranquilo = async () => {
      /* 8m. LECTOR TRANQUILO (sin `irA`: la página se recorre entera a la velocidad de un lector, nunca se sube hasta «lo importante»):
             rueda a ~333 px/s, pasos con pausas de 1 a 2 s, ~1000 px/s y ~4000 px/s.
             (a) ninguna pieza pasa de «sin armar» a «armada» estando FUERA de pantalla por abajo (ni una «arriba» que no lo está);
             (b) toda pieza que se dibuja a la vista tiene un cursor a distancia razonable (y ningún cursor con su objetivo fuera);
             (c) al final del recorrido todo queda armado;
             y, en cada cuadro, no hay más cursores en pantalla que el máximo (2 en celular, 3 en escritorio). */
      for (const modo of a.mutacion ? ["rueda 333 px/s"] : ["rueda 333 px/s", "pasos con pausas de 1 a 2 s", "rueda 1000 px/s", "rueda 4000 px/s"]) {
        const c = await abrir({ viewport: vp });
        if (a["mutacion"]) {
          // Mutación: el armado forzado por tiempo de antes (lo que no está a la vista se arma solo al llegar a un límite).
          const fuente = fs.readFileSync(path.join(servidor.raiz || RAIZ_REPO, "assets/js/main.js"), "utf8");
          const ancla = "      sesiones.add(s);\n      saltarMostrar();";
          if (!fuente.includes(ancla)) throw new Error("la mutación no encontró su ancla en main.js");
          const mutado = fuente.replace(ancla, "      relojes.add(setTimeout(() => pasos.forEach((st) => { if (st.estado === 'espera') { st.io.disconnect(); instante(st); } }), LIM - 70));\n" + ancla);
          await c.ctx.route(/\/assets\/js\/main\.js/, (r) => r.fulfill({ ...JS, body: mutado }));
        }
        await c.ctx.addInitScript(SONDA_SECCIONES);
        await c.ctx.addInitScript(SONDA_CURSORES);
        const page = await c.ctx.newPage();
        await page.goto(servidor.url + ruta, { waitUntil: "load" });
        await sinAnimacion(page);
        const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
        if (modo.startsWith("pasos")) {
          let n = 0;
          for (let y = 0; y < total + vp.height; y += Math.round(vp.height * 0.55)) {
            await page.evaluate((yy) => scrollTo(0, yy), Math.min(y, total));
            await page.waitForTimeout(n++ % 2 ? 2000 : 1000);
          }
        } else {
          const vel = Number(modo.match(/\d+/)[0]);
          await page.evaluate(([vel, total]) => new Promise((fin) => {
            let t0 = null;
            const paso = (t) => { t0 ??= t; const y = Math.min(total, ((t - t0) / 1000) * vel); scrollTo(0, y); if (y < total) requestAnimationFrame(paso); else fin(); };
            requestAnimationFrame(paso);
          }), [vel, total]);
        }
        // Al final del recorrido todo queda armado (lo último a la vista tarda hasta 4 s en armarse con su cursor).
        const quedo = await page.waitForFunction(() => [...document.querySelectorAll("main > section:not(.hero)")].every((s) => s.classList.contains("armada") || !s.querySelector(".tabla, .problemas, .proceso, .trabajo, .pasos, .faq, .cierre__titulo")), null, { timeout: 9000, polling: 200 }).then(() => true).catch(() => false);
        await page.waitForTimeout(400);
        const R = await page.evaluate(() => window.__cur);
        const nombre = `lector tranquilo (${modo}) ${en}`;
        if (!quedo) falla(nombre, `al final del recorrido quedaron secciones sin armar: ${await page.evaluate(() => [...document.querySelectorAll("main > section:not(.hero)")].filter((s) => !s.classList.contains("armada") && s.querySelector(".tabla, .problemas, .proceso, .trabajo, .pasos, .faq, .cierre__titulo")).map((s) => s.id || s.className.split(" ")[0]).join(", "))}`);
        for (const m of await page.evaluate(ESTADO_ARMADO)) falla(nombre, `al final: ${m}`);
        for (const m of R.armadoAbajo) falla(nombre, `(a) ${m}`);
        for (const m of R.abajo) falla(nombre, `(a) ${m}`);
        for (const m of R.sinCursor) falla(nombre, `(b) pieza dibujándose a la vista sin cursor cerca: ${m}`);
        for (const m of R.fuera) falla(nombre, `(b) cursor con objetivo fuera de la pantalla: ${m}`);
        for (const m of R.etiquetas) falla(nombre, `etiqueta sobre un título: ${m}`);
        for (const m of R.sobre) falla(nombre, `demasiados cursores en pantalla: ${m}`);
        for (const m of R.desalineadas) falla(nombre, `capa desalineada: ${m}`);
        if (R.muestras < 20 && !a["mutacion"]) falla(nombre, `casi no hubo cursores (${R.muestras} cuadros): la prueba no vio nada`);
        // Tiempo de animación por sección y duración de cada paso, también con este lector.
        const SEC = await page.evaluate(() => window.__sec.s);
        const nombres = await page.evaluate(() => [...document.querySelectorAll("main > section")].map((s) => s.id || s.className.split(" ")[0]));
        // Con scroll continuo dos secciones se arman a la vez y comparten la cola global de cursores, así que aquí solo se mira que ningún paso sea un barrido;
        // el tope de tiempo por sección se mide una sección a la vez (8a) y en este mismo recorrido si el lector es tranquilo (la sección rara vez comparte cursores).
        for (const [i, r] of Object.entries(SEC)) {
          const cortos = r.pasos.filter((d) => d < minPaso);
          if (cortos.length && modo.startsWith("rueda 333")) falla(nombre, `sección «${nombres[i]}»: pasos de ${cortos.join(", ")} ms (mínimo ${minPaso}); pasos ${r.pasos.join(" ")}`);
          if (r.activo > maxMs * 1.35) falla(nombre, `sección «${nombres[i]}»: ${r.activo.toFixed(0)} ms de animación (máximo ${maxMs}, con 35 % de tolerancia por compartir la cola de cursores con otra sección)`);
        }
        const peor = R.esperas.length ? Math.max(...R.esperas) : 0;
        if (peor > 2000) falla(nombre, `una pieza a la vista esperó ${peor} ms a empezar (objetivo ~1000-1500, máximo tolerado 2000)`);
        console.log(`  ${nombre}: ${R.muestras} cuadros con cursores, máx ${R.maxVis} a la vez, ${R.esperas.length} pasos con espera (peor ${peor} ms, mediana ${R.esperas.length ? [...R.esperas].sort((x, y) => x - y)[Math.floor(R.esperas.length / 2)] : 0} ms), estados ${JSON.stringify(R.estados)}`);
        await cerrar(c, `consola lector tranquilo ${en}`);
      }
      };

      if (a.mutacion || a["solo-lector"]) {
        await lectorTranquilo();
        continue;
      }

      /* 8j. (#35) En el PRIMER cuadro en que cada sección entra en pantalla sus piezas visuales están SIN armar (estilos computados) y al final están armadas.
             Guarda un PNG por sección en salida/animaciones/ (primer cuadro, a mitad y armado). */
      {
        const { c: c0, page: p0 } = await abrirSec();
        await sinAnimacion(p0);
        const lista = (await secciones(p0)).filter((x) => !x.tinta);
        await cerrar(c0, `consola secciones ${en}`);
        for (const x of lista) {
          // Cada sección en una página nueva: así ninguna llega ya a medio armar por haber leído la anterior.
          const { c, page } = await abrirSec();
          await sinAnimacion(page);
          // La sección está justo debajo de la pantalla (sin entrar) y de golpe asoma 2 px: se lee el primer cuadro.
          await page.evaluate((n) => { const s = document.querySelectorAll("main > section")[n]; window.scrollTo(0, window.scrollY + s.getBoundingClientRect().top - innerHeight - 4); }, x.i);
          await page.waitForTimeout(120);
          const r = await page.evaluate(ESTADO_SIN_ARMAR, x.i);
          const base = path.join(SALIDA_ANIM, `${slug(ruta)}-${x.nombre}-${vp.width}`);
          const minimo = x.nombre === "contacto" ? 2 : 3; // el cierre solo lleva la línea del título y el filete
          if (r.piezas < minimo) falla(`sin armar ${x.nombre} ${en}`, `la prueba solo reconoció ${r.piezas} piezas visuales (debían ser ${minimo} o más)`);
          for (const m of r.visibles) falla(`sin armar ${x.nombre} ${en}`, `en el primer cuadro ya se ve armado: ${m}`);
          await page.evaluate((n) => { const s = document.querySelectorAll("main > section")[n]; window.scrollTo(0, window.scrollY + s.getBoundingClientRect().top - (innerHeight * 0.45)); }, x.i);
          await page.screenshot({ path: `${base}-1-primer-cuadro.png` });
          if (/^(trabajo|precios)$/.test(x.nombre)) {
            await page.waitForTimeout(chico ? 350 : 550);
            await page.screenshot({ path: `${base}-2-a-mitad.png` });
          }
          await leerSeccion(page, x.i);
          await page.waitForTimeout(chico ? 900 : 1200);
          await page.screenshot({ path: `${base}-3-armado.png` });
          const fin = await page.evaluate((n) => { const s = document.querySelectorAll("main > section")[n]; return { armada: s.classList.contains("armada"), anims: s.getAnimations({ subtree: true }).length, capas: s.querySelectorAll(".cursores-seccion").length }; }, x.i);
          if (!fin.armada || fin.anims || fin.capas) falla(`armado al final ${x.nombre} ${en}`, `armada ${fin.armada}, animaciones activas ${fin.anims}, capas ${fin.capas}`);
          await cerrar(c, `consola primer cuadro ${x.nombre} ${en}`);
        }
      }

      /* 8k. (#35) Cursor y pieza sincronizados, en secuencia, etiquetas fuera de los títulos y ningún cursor visible con su objetivo fuera de la pantalla. */
      {
        const c = await abrir({ viewport: vp });
        await c.ctx.addInitScript(SONDA_CURSORES);
        const page = await c.ctx.newPage();
        await page.goto(servidor.url + ruta, { waitUntil: "load" });
        await sinAnimacion(page);
        const lista = (await secciones(page)).filter((x) => !x.tinta);
        for (const x of lista) {
          // Se acerca la sección como lo hace un lector: llega al ~10 % y sigue subiendo hasta dejar visible su parte útil (precios: hasta la fila del diagnóstico).
          await page.evaluate((n) => { const s = document.querySelectorAll("main > section")[n]; window.scrollTo(0, window.scrollY + s.getBoundingClientRect().top - innerHeight * 0.88); }, x.i);
          await page.waitForTimeout(90);
          await page.evaluate(([n, nom]) => {
            const s = document.querySelectorAll("main > section")[n];
            const meta = nom === "precios" && s.querySelector(".tabla__destacada") ? s.querySelector(".tabla__destacada").getBoundingClientRect().bottom + 24 - innerHeight * 0.9 : s.getBoundingClientRect().top - 96;
            const y0 = scrollY;
            const t0 = performance.now();
            const paso = () => { const k = Math.min(1, (performance.now() - t0) / 350); scrollTo(0, y0 + meta * k); if (k < 1) requestAnimationFrame(paso); };
            paso();
          }, [x.i, x.nombre]);
          await page.waitForTimeout(chico ? 1300 : 1700);
        }
        const R = await page.evaluate(() => window.__cur);
        if (R.muestras < 30) falla(`sincronía ${en}`, `la prueba casi no muestreó (${R.muestras} cuadros)`);
        for (const m of R.sinCursor) falla(`sincronía ${en}`, `pieza dibujándose a la vista sin cursor cerca: ${m}`);
        for (const m of R.etiquetas) falla(`etiqueta sobre un título ${en}`, m);
        for (const m of R.fuera) falla(`cursor con objetivo fuera de la pantalla ${en}`, m);
        for (const [sec, ts] of Object.entries(R.inicios)) {
          const cubos = new Set(ts.map((t) => Math.round(t / 25)));
          if (ts.length >= 4 && cubos.size < 3) falla(`secuencia ${en}`, `sección ${sec}: ${ts.length} piezas y solo ${cubos.size} momentos distintos (no deben aparecer todas a la vez)`);
        }
        console.log(`  sincronía ${en}: ${R.muestras} cuadros, piezas por sección ${JSON.stringify(Object.fromEntries(Object.entries(R.inicios).map(([k, v]) => [k, v.length])))}`);
        await cerrar(c, `consola sincronía ${en}`);
      }

      /* 8l. Lector que se detiene justo al cruzar el umbral (borde superior ~12 % adentro) y no se mueve: ningún cursor puede salir con su
             objetivo fuera de la pantalla (en 8k el scroll sigue subiendo y lo esconde). */
      {
        const c = await abrir({ viewport: vp });
        await c.ctx.addInitScript(SONDA_CURSORES);
        const page = await c.ctx.newPage();
        await page.goto(servidor.url + ruta, { waitUntil: "load" });
        await sinAnimacion(page);
        const lista = (await secciones(page)).filter((x) => !x.tinta);
        for (const x of lista) {
          await page.evaluate((n) => { const s = document.querySelectorAll("main > section")[n]; window.scrollTo(0, window.scrollY + s.getBoundingClientRect().top - innerHeight * 0.88); }, x.i);
          await page.waitForTimeout(chico ? 1200 : 1600);
        }
        const R = await page.evaluate(() => window.__cur);
        for (const m of R.fuera) falla(`cursor con objetivo fuera de la pantalla (lector quieto) ${en}`, m);
        await cerrar(c, `consola lector quieto ${en}`);
      }

      if (soloPrimero) continue;

      await lectorTranquilo();

      /* 8n. LECTOR QUIETO: se detiene con cada sección apenas pasada del 10 %: nada se arma fuera de pantalla, lo que está a la vista se arma con
             cursor (ya lo cubre 8l) y las secciones altas (trabajo, precios) NO terminan de armarse solas; al seguir bajando el resto se arma al entrar. */
      if (!a["mutacion"]) {
        const c = await abrir({ viewport: vp });
        await c.ctx.addInitScript(SONDA_CURSORES);
        const page = await c.ctx.newPage();
        await page.goto(servidor.url + ruta, { waitUntil: "load" });
        await sinAnimacion(page);
        const lista = (await secciones(page)).filter((x) => !x.tinta);
        for (const x of lista) {
          await page.evaluate((n) => { const s = document.querySelectorAll("main > section")[n]; window.scrollTo(0, window.scrollY + s.getBoundingClientRect().top - innerHeight * 0.88); }, x.i);
          await page.waitForTimeout(chico ? 2600 : 4600); // más que el tope de animación: si algo se armara por tiempo ya habría pasado
          if (/^(trabajo|precios)$/.test(x.nombre)) {
            const armada = await page.evaluate((n) => document.querySelectorAll("main > section")[n].classList.contains("armada"), x.i);
            if (armada) falla(`lector quieto ${en}`, `«${x.nombre}» se terminó de armar sola con el lector quieto (sus piezas de abajo debían esperar a entrar en pantalla)`);
          }
        }
        const R = await page.evaluate(() => window.__cur);
        for (const m of [...R.armadoAbajo, ...R.abajo]) falla(`lector quieto ${en}`, `(a) ${m}`);
        for (const m of R.sinCursor) falla(`lector quieto ${en}`, `(b) ${m}`);
        for (const m of R.fuera) falla(`lector quieto ${en}`, `(b) ${m}`);
        for (const m of R.sobre) falla(`lector quieto ${en}`, m);
        // Sigue bajando poco a poco: todo lo que quedaba abajo se arma al entrar.
        for (const x of lista) if (!(await leerSeccion(page, x.i))) falla(`lector quieto ${en}`, `«${x.nombre}» no se armó al seguir bajando`);
        for (const m of await page.evaluate(ESTADO_ARMADO)) falla(`lector quieto ${en} al seguir bajando`, m);
        await cerrar(c, `consola lector quieto 2 ${en}`);
      }

      /* 8o. Redimensionar o rotar a mitad del armado: lo que está en curso se completa al instante (sin capas en coordenadas viejas) y el criterio
             celular/escritorio se reevalúa para lo que sigue (nunca más de 2 cursores a la vez en celular). */
      if (!a["mutacion"]) {
        for (const [ancho2, alto2] of chico ? [[844, 390], [1280, 800]] : [[800, 1280], [390, 844]]) {
          const c = await abrir({ viewport: vp });
          await c.ctx.addInitScript(SONDA_CURSORES);
          const page = await c.ctx.newPage();
          await page.goto(servidor.url + ruta, { waitUntil: "load" });
          await sinAnimacion(page);
          const lista = (await secciones(page)).filter((x) => !x.tinta);
          const x = lista.find((y) => y.nombre === "trabajo") || lista[1];
          await irA(page, x.i);
          await page.waitForTimeout(450);
          if (!(await page.evaluate(() => !!document.querySelector(".cursores-seccion .arma-capa")))) falla(`redimensionar ${en}→${ancho2}`, "no había capas a mitad del armado");
          await page.setViewportSize({ width: ancho2, height: alto2 });
          await page.waitForTimeout(250);
          const r = await page.evaluate((n) => ({ capas: document.querySelectorAll("main > section")[n].querySelectorAll(".arma-capa, .cursor").length, armada: document.querySelectorAll("main > section")[n].classList.contains("armada") }), x.i);
          if (r.capas || !r.armada) falla(`redimensionar ${en}→${ancho2}`, `lo que estaba en curso debía completarse al instante (capas/cursores ${r.capas}, armada ${r.armada})`);
          // Lo que sigue se calcula con el tamaño nuevo y se arma bien.
          const resto = lista.filter((y) => y.i > x.i);
          for (const y of resto) if (!(await leerSeccion(page, y.i))) falla(`redimensionar ${en}→${ancho2}`, `«${y.nombre}» no terminó de armarse después de redimensionar`);
          const R = await page.evaluate(() => window.__cur);
          for (const m of R.desalineadas) falla(`redimensionar ${en}→${ancho2}`, `capa desalineada: ${m}`);
          for (const m of R.sobre) falla(`redimensionar ${en}→${ancho2}`, m);
          for (const m of await page.evaluate(ESTADO_ARMADO)) falla(`redimensionar ${en}→${ancho2} al final`, m);
          await cerrar(c, `consola redimensionar ${en}→${ancho2}`);
        }
      }

      /* 8p. Esquinas: el borde que dibujan las capas es el MISMO anillo del estado final (mismo radio, mismo anillo de 1 px, misma caja), sin salto al terminar. */
      if (!a["mutacion"]) {
        const c = await abrir({ viewport: vp });
        const page = await c.ctx.newPage();
        await page.goto(servidor.url + ruta, { waitUntil: "load" });
        await sinAnimacion(page);
        const lista = (await secciones(page)).filter((x) => !x.tinta);
        const x = lista.find((y) => y.nombre === "trabajo");
        if (x) {
          await irA(page, x.i);
          await page.waitForTimeout(chico ? 250 : 350);
          const r = await page.evaluate(() => {
            const s = document.querySelector("main > section:has(.trabajo)");
            const caja = s.querySelector(".captura, .hoja");
            const ring = s.querySelector(".arma-capa--anillo");
            if (!ring) return { sinAnillo: true };
            // El estado final de la tarjeta se lee con la sección armada (mientras no lo está, su borde real está oculto): se arma un instante y se desarma.
            s.classList.add("armada");
            const finalCaja = { borderTopLeftRadius: getComputedStyle(caja).borderTopLeftRadius, boxShadow: getComputedStyle(caja).boxShadow };
            s.classList.remove("armada");
            const cr = getComputedStyle(ring);
            const anillo = (bs) => (bs.match(/rgba?\([^)]*\) 0px 0px 0px 1px/) || [""])[0];
            return { radioCaja: finalCaja.borderTopLeftRadius, radioAnillo: cr.borderTopLeftRadius, anilloCaja: anillo(finalCaja.boxShadow), anilloCapa: anillo(cr.boxShadow) };
          });
          if (r.sinAnillo) falla(`esquinas ${en}`, "no había anillo dibujándose en la tarjeta");
          else {
            if (r.radioCaja !== r.radioAnillo || parseFloat(r.radioAnillo) === 0) falla(`esquinas ${en}`, `radio de la capa ${r.radioAnillo} ≠ radio de la tarjeta ${r.radioCaja}`);
            if (!r.anilloCaja || r.anilloCaja !== r.anilloCapa) falla(`esquinas ${en}`, `anillo de la capa «${r.anilloCapa}» ≠ anillo final «${r.anilloCaja}»`);
          }
          await leerSeccion(page, x.i);
          await page.waitForTimeout(300);
        }
        await cerrar(c, `consola esquinas ${en}`);
      }

      /* 8a. Lectura normal: sección por sección. */
      {
        const { c, page } = await abrirSec();
        await sinAnimacion(page);
        const lista = (await secciones(page)).filter((x) => !x.tinta);
        for (const x of lista) {
          const ok = await leerSeccion(page, x.i);
          if (!ok) falla(`secciones sección «${x.nombre}» ${en}`, "leída con calma, nunca terminó de armarse");
        }
        const S = await page.evaluate(() => window.__sec);
        for (const x of lista) {
          const r = S.s[x.i];
          const nombre = `sección «${x.nombre}» ${en}`;
          if (!r || r.armada === null) { falla(`secciones ${nombre}`, "nunca se armó"); continue; }
          if (r.armadas !== 1 || r.capas > 1) falla(`secciones ${nombre}`, `debe armarse una sola vez (armadas ${r.armadas}, capas ${r.capas})`);
          if (r.creada !== null) {
            const dur = r.activo;
            if (dur > maxMs) falla(`secciones ${nombre}`, `${dur.toFixed(0)} ms de animación (máximo ${maxMs}, sin contar esperas a que la pieza esté a la vista)`);
            if (r.max < 1 || r.max > (chico ? 2 : 3)) falla(`secciones ${nombre}`, `${r.max} cursores a la vez (se esperan 1 a ${chico ? 2 : 3})`);
            const cortos = r.pasos.filter((d) => d < minPaso);
            if (cortos.length) falla(`secciones ${nombre}`, `pasos demasiado cortos (${cortos.join(", ")} ms; mínimo ${minPaso} ms): se leería como un barrido`);
            if (r.pasos.some((d) => d > 2000)) falla(`secciones ${nombre}`, `un paso dura ${Math.max(...r.pasos)} ms (máximo 2000: los demás cursores esperarían demasiado)`);
            if (r.pasos.length >= 3 && dur < minActivo) falla(`secciones ${nombre}`, `solo ${dur.toFixed(0)} ms de animación con ${r.pasos.length} pasos (mínimo ${minActivo}: debe acercarse al objetivo de ${maxMs} ms)`);
            if (!r.cursoresOk) falla(`secciones ${nombre}`, "los cursores o su capa no son aria-hidden con pointer-events:none");
            for (const m of r.texto) falla(`secciones ${nombre} a mitad de la animación`, `texto escondido: ${m}`);
            console.log(`  ${nombre}: ${r.max} cursores, ${dur.toFixed(0)} ms de animación, ${r.pasos.length} pasos de ${Math.min(...r.pasos)} a ${Math.max(...r.pasos)} ms`);
          } else falla(`secciones ${nombre}`, "se armó sin cursores (debía animarse al leerla con calma)");
        }
        if (S.muestras < 20) falla(`secciones ${en}`, `la prueba casi no muestreó la animación (${S.muestras} cuadros)`);
        if (S.props.length) falla(`secciones ${en}`, `se animan propiedades que no son transform ni opacity: ${S.props.join(", ")}`);
        if (S.scrollH) falla(`secciones ${en}`, "los cursores provocan scroll horizontal");
        // Segunda pasada: ya armadas, no vuelven a animar.
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(150);
        for (const x of lista) { await irA(page, x.i); await page.waitForTimeout(120); }
        const S2 = await page.evaluate(() => window.__sec);
        for (const x of lista) if (S2.s[x.i].capas > 1 || S2.s[x.i].armadas !== 1) falla(`secciones sección «${x.nombre}» ${en}`, "volvió a animarse al regresar");
        await cerrar(c, `consola secciones ${en}`);
      }

      /* 8b. Scroll rápido hasta el final: lo que quedó atrás se arma al instante y nada queda desarmado. */
      {
        const { c, page } = await abrirSec();
        await sinAnimacion(page);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(250);
        const atras = await page.evaluate(() => [...document.querySelectorAll("main > section:not(.hero):not(.banda--tinta)")].filter((s) => s.getBoundingClientRect().bottom <= 0).map((s) => ({ nombre: s.id || s.className, armada: s.classList.contains("armada"), capa: !!s.querySelector(".cursores-seccion") })));
        if (!atras.length) falla(`scroll rápido ${en}`, "la prueba no dejó secciones atrás");
        for (const x of atras) if (!x.armada || x.capa) falla(`scroll rápido ${en}`, `«${x.nombre}» quedó atrás sin armar (armada ${x.armada}, con cursores ${x.capa})`);
        // Lo que quedó a la vista al final se arma con su cursor (hasta 4 s); lo de atrás ya estaba armado.
        await page.waitForFunction(() => [...document.querySelectorAll("main > section:not(.hero)")].every((s) => s.classList.contains("armada") || !s.querySelector(".tabla, .problemas, .proceso, .trabajo, .pasos, .faq, .cierre__titulo")), null, { timeout: 8000, polling: 200 }).catch(() => {});
        await page.waitForTimeout(300);
        for (const m of await page.evaluate(ESTADO_ARMADO)) falla(`scroll rápido ${en} al final`, m);
        const S = await page.evaluate(() => window.__sec);
        for (const [i, r] of Object.entries(S.s)) if (r.armadas > 1) falla(`scroll rápido ${en}`, `sección ${i} armada ${r.armadas} veces`);
        await cerrar(c, `consola scroll rápido ${en}`);
      }

      /* 8c. «Saltar» en el hero apaga los cursores en toda la página durante la visita (y vuelven en la siguiente carga). */
      {
        const { c, page } = await abrirSec();
        await page.waitForSelector(".entrada .cursor", { timeout: 2000 });
        await page.waitForTimeout(500);
        await page.getByRole("button", { name: "Saltar" }).click();
        await sinAnimacion(page);
        const lista = (await secciones(page)).filter((x) => !x.tinta);
        for (const x of lista) { await irA(page, x.i); await page.waitForTimeout(350); }
        const S = await page.evaluate(() => window.__sec);
        if (S.cursoresVistos || Object.values(S.s).some((r) => r.creada !== null || r.capas)) falla(`«Saltar» en el hero ${en}`, "aparecieron cursores de sección después de saltar");
        if (await page.evaluate(() => !!document.querySelector(".cursor, .entrada__saltar") || document.documentElement.classList.contains("js-secciones"))) falla(`«Saltar» en el hero ${en}`, "quedaron cursores, el botón o la clase js-secciones");
        for (const m of await page.evaluate(ESTADO_ARMADO)) falla(`«Saltar» en el hero ${en}`, m);
        // Siguiente carga: vuelven (sin memoria).
        const p2 = await c.ctx.newPage();
        await p2.goto(servidor.url + ruta, { waitUntil: "domcontentloaded" });
        try { await p2.waitForSelector(".entrada .cursor", { timeout: 2000 }); } catch { falla(`«Saltar» en el hero ${en}`, "en la siguiente carga no volvieron los cursores"); }
        await cerrar(c, `consola «Saltar» hero ${en}`);
      }

      /* 8d. «Saltar» y Escape a mitad de una sección: terminan al instante y apagan lo que falta; el botón está mientras se arma. */
      for (const via of ["Saltar", "Escape"]) {
        const { c, page } = await abrirSec();
        await sinAnimacion(page);
        const lista = (await secciones(page)).filter((x) => !x.tinta);
        const x = lista.find((y) => y.nombre === "trabajo") || lista[1];
        await irA(page, x.i);
        await page.waitForTimeout(450);
        if (!(await page.evaluate(() => !!document.querySelector(".cursores-seccion .cursor")))) falla(`${via} en una sección ${en}`, "no había cursores que apagar");
        if (via === "Saltar") {
          const b = await page.getByRole("button", { name: "Saltar" }).boundingBox();
          if (!b || b.width < 44 || b.height < 44) falla(`«Saltar» en una sección ${en}`, `el botón debe estar y medir 44 px o más (${JSON.stringify(b)})`);
          await page.getByRole("button", { name: "Saltar" }).click();
        } else await page.keyboard.press("Escape");
        await page.waitForTimeout(250);
        if (await page.evaluate(() => !!document.querySelector(".cursor, .cursores-seccion, .entrada__saltar"))) falla(`${via} en una sección ${en}`, "quedaron cursores o el botón a los 250 ms");
        const lejos = lista[lista.length - 1];
        await irA(page, lejos.i);
        await page.waitForTimeout(300);
        if (await page.evaluate(() => !!document.querySelector(".cursor, .cursores-seccion"))) falla(`${via} en una sección ${en}`, "aparecieron cursores después");
        for (const m of await page.evaluate(ESTADO_ARMADO)) falla(`${via} en una sección ${en}`, m);
        await cerrar(c, `consola ${via} sección ${en}`);
      }

      /* 8e. Movimiento reducido, sin JavaScript e impresión (a mitad de una animación): todo armado y sin cursores. */
      for (const modo of ["reducido", "sin JS", "impresión"]) {
        const opciones = modo === "reducido" ? { reducedMotion: "reduce" } : modo === "sin JS" ? { javaScriptEnabled: false } : {};
        const { c, page } = await abrirSec(opciones);
        if (modo === "impresión") {
          await sinAnimacion(page);
          const lista = (await secciones(page)).filter((x) => !x.tinta);
          // A mitad de dos secciones distintas: la de las etapas (línea y marcas) y la de trabajo (capturas y marcas de corte, que se animan con opacity/transform).
          const objetivos = [lista[1], lista.find((y) => y.nombre === "trabajo")].filter(Boolean);
          for (const [k, x] of objetivos.entries()) {
            const pagina = k === 0 ? page : await c.ctx.newPage();
            if (k > 0) {
              await pagina.goto(servidor.url + ruta, { waitUntil: "load" });
              await sinAnimacion(pagina);
            }
            await irA(pagina, x.i);
            await pagina.waitForTimeout(k === 0 ? 400 : 250);
            if (!(await pagina.evaluate(() => !!document.querySelector(".cursores-seccion")))) falla(`impresión ${en} («${x.nombre}»)`, "la prueba no alcanzó a imprimir a mitad de la animación");
            await pagina.emulateMedia({ media: "print" });
            if (await pagina.evaluate(() => [...document.querySelectorAll(".cursores-seccion, .entrada__saltar")].some((e) => getComputedStyle(e).display !== "none"))) falla(`impresión ${en}`, "los cursores o «Saltar» se imprimen");
            const f = (await pagina.evaluate(ESTADO_ARMADO)).filter((m) => !/capas de cursores/.test(m));
            for (const m of f) falla(`impresión ${en} a mitad de la sección «${x.nombre}»`, m);
          }
        } else {
          await page.waitForTimeout(500);
          const lista = await secciones(page);
          for (const x of lista) { await irA(page, x.i).catch(() => {}); }
          await page.waitForTimeout(300);
          for (const m of await page.evaluate(ESTADO_ARMADO)) falla(`${modo} ${en}`, m);
          if (await page.evaluate(() => !!document.querySelector(".cursor, .cursores-seccion, .entrada__saltar") || document.documentElement.classList.contains("js-secciones"))) falla(`${modo} ${en}`, "hay cursores o la clase js-secciones");
        }
        await cerrar(c, `consola ${modo} ${en}`);
      }

      /* 8f. Carga con ancla a una sección intermedia: lo de arriba está armado al instante, sin cursores. */
      {
        const { c, page } = await abrirSec({}, `${ruta}#precios`);
        await page.waitForTimeout(500);
        const r = await page.evaluate(() => {
          const todas = [...document.querySelectorAll("main > section:not(.hero):not(.banda--tinta)")];
          const meta = document.querySelector("#precios");
          const arriba = todas.filter((s) => s.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING).map((s) => ({ nombre: s.id || s.className, armada: s.classList.contains("armada"), capa: !!s.querySelector(".cursores-seccion"), animado: window.__sec.s[[...document.querySelectorAll("main > section")].indexOf(s)]?.creada != null }));
          return { arriba, y: scrollY };
        });
        if (r.y < 100) falla(`ancla #precios ${en}`, "la página no bajó a #precios");
        if (!r.arriba.length) falla(`ancla #precios ${en}`, "no hay secciones arriba de #precios");
        for (const x of r.arriba) if (!x.armada || x.capa) falla(`ancla #precios ${en}`, `«${x.nombre}» (arriba) no está armada al instante (armada ${x.armada}, cursores ${x.capa})`);
        await cerrar(c, `consola ancla ${en}`);
      }

      /* 8g. Foco de teclado en una sección sin armar: se arma al instante. */
      {
        const { c, page } = await abrirSec();
        await sinAnimacion(page);
        const r = await page.evaluate(() => {
          const el = document.querySelector(".faq__item summary");
          const s = el.closest("main > section");
          const antes = s.classList.contains("armada");
          el.focus({ preventScroll: true });
          return { antes, despues: s.classList.contains("armada"), capa: !!s.querySelector(".cursores-seccion") };
        });
        if (r.antes) falla(`foco ${en}`, "la sección de las preguntas ya estaba armada antes de enfocar");
        if (!r.despues || r.capa) falla(`foco ${en}`, `enfocar dentro de una sección sin armar debe armarla al instante (${JSON.stringify(r)})`);
        await cerrar(c, `consola foco ${en}`);
      }

      /* 8i. Umbral ~10 % de la altura de la pantalla (#35): con el borde superior de la sección apenas 5 % adentro no se arma; con 15 % adentro sí. */
      {
        const { c, page } = await abrirSec();
        await sinAnimacion(page);
        const lista = (await secciones(page)).filter((x) => !x.tinta);
        const x = lista.find((y) => y.nombre === "como-trabajo") || lista[2];
        const asomar = (fr) =>
          page.evaluate(
            ([n, f]) => {
              const s = document.querySelectorAll("main > section")[n];
              window.scrollTo(0, window.scrollY + s.getBoundingClientRect().top - innerHeight * (1 - f));
              const q = s.getBoundingClientRect();
              return { visible: Math.round(((innerHeight - q.top) / innerHeight) * 100), tocada: s.classList.contains("armada") || !!s.querySelector(".cursores-seccion") };
            },
            [x.i, fr],
          );
        const poco = await asomar(0.05);
        await page.waitForTimeout(350);
        const tras = await page.evaluate((n) => { const s = document.querySelectorAll("main > section")[n]; return s.classList.contains("armada") || !!s.querySelector(".cursores-seccion"); }, x.i);
        if (poco.tocada || tras) falla(`umbral ${en}`, `«${x.nombre}» se armó con solo ~${poco.visible} % de la pantalla (debe esperar a que su borde superior entre ~10 %)`);
        const bastante = await asomar(0.15);
        await page.waitForTimeout(250);
        const ya = await page.evaluate((n) => { const s = document.querySelectorAll("main > section")[n]; return s.classList.contains("armada") || !!s.querySelector(".cursores-seccion"); }, x.i);
        if (!ya) falla(`umbral ${en}`, `«${x.nombre}» no se armó con ~${bastante.visible} % de la pantalla`);
        await cerrar(c, `consola umbral ${en}`);
      }

      /* 8h. El visitante activa «reducir movimiento» a mitad de una sección: se apaga todo al instante, sin cursores sueltos ni salto de layout. */
      {
        const { c, page } = await abrirSec();
        await sinAnimacion(page);
        const lista = (await secciones(page)).filter((x) => !x.tinta);
        const x = lista.find((y) => y.nombre === "trabajo") || lista[1];
        await irA(page, x.i);
        await page.waitForTimeout(250);
        const alto0 = await page.evaluate(() => document.documentElement.scrollHeight);
        if (!(await page.evaluate(() => !!document.querySelector(".cursores-seccion .cursor")))) falla(`reducir movimiento a mitad ${en}`, "no había cursores que apagar");
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.waitForTimeout(100);
        const r = await page.evaluate(() => ({ alto: document.documentElement.scrollHeight, restos: document.querySelectorAll(".cursor, .cursores-seccion, .entrada__saltar").length }));
        if (r.restos) falla(`reducir movimiento a mitad ${en}`, `quedan ${r.restos} cursores, capas o «Saltar» a los 100 ms`);
        if (r.alto !== alto0) falla(`reducir movimiento a mitad ${en}`, `la página cambió de alto (${alto0} -> ${r.alto})`);
        for (const m of await page.evaluate(ESTADO_ARMADO)) falla(`reducir movimiento a mitad ${en}`, m);
        await cerrar(c, `consola reducir movimiento a mitad ${en}`);
      }
    }


    /* 9. «Saltar animación (Esc)»: texto, aspecto, primer Tab, foco al desaparecer y que no tape texto (320, 390, 768, 1280 y 1920 px). */
    if (!a["solo-secciones"] && !soloPrimero) {
      const c0 = await abrir({ viewport: { width: 1280, height: 800 } });
      const page = await c0.ctx.newPage();
      await page.goto(servidor.url + ruta, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".entrada__saltar", { timeout: 2000 });
      const b = await page.evaluate(() => {
        const e = document.querySelector(".entrada__saltar");
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        // La parte pintada es el padding box (background-clip: padding-box); el borde transparente es solo área táctil.
        const bw = parseFloat(cs.borderTopWidth);
        return { tag: e.tagName, texto: e.textContent.trim(), fondo: cs.backgroundColor, clip: cs.backgroundClip, caja: [r.width, r.height], visual: [r.width - 2 * bw, r.height - 2 * bw], pos: cs.position, primero: document.body.firstElementChild === e, borde: cs.borderTopColor };
      });
      if (b.texto !== "Saltar animación (Esc)") falla("«Saltar»", `el texto visible debe ser «Saltar animación (Esc)» y es «${b.texto}»`);
      if (b.tag !== "BUTTON" || b.pos !== "fixed") falla("«Saltar»", `debe ser un <button> fijo (${b.tag}, ${b.pos})`);
      if (/rgba\(.*, 0\)|transparent/.test(b.fondo)) falla("«Saltar»", `el fondo debe ser sólido y es ${b.fondo}`);
      if (b.caja[0] < 44 || b.caja[1] < 44) falla("«Saltar»", `el área táctil (caja del botón) debe medir 44×44 o más y mide ${b.caja.map((x) => x.toFixed(1)).join("×")}`);
      if (b.visual[1] >= 44) falla("«Saltar»", `visualmente debe ser más chico que 44 px de alto y es ${b.visual[1].toFixed(1)}`);
      if (!b.primero) falla("«Saltar»", "debe ser el primer elemento del <body> (primero en el orden de foco)");
      // El primer Tab lo alcanza; el segundo llega al enlace «Saltar al contenido» (no se rompe).
      await page.keyboard.press("Tab");
      const t1 = await page.evaluate(() => document.activeElement?.className + "|" + document.activeElement?.textContent.trim());
      if (!/entrada__saltar\|Saltar animación \(Esc\)/.test(t1)) falla("«Saltar» orden de foco", `el primer Tab debe llegar a «Saltar animación (Esc)» y llegó a ${t1}`);
      await page.keyboard.press("Tab");
      const t2 = await page.evaluate(() => document.activeElement?.className + "|" + document.activeElement?.textContent.trim());
      if (!/salto\|Saltar al contenido/.test(t2)) falla("«Saltar» orden de foco", `el segundo Tab debe llegar al enlace «Saltar al contenido» y llegó a ${t2}`);
      await page.keyboard.press("Shift+Tab");
      // Foco en «Saltar» y el botón desaparece (Enter): el siguiente Tab empieza en el inicio del documento (el enlace «Saltar al contenido»).
      await page.keyboard.press("Enter");
      await page.waitForTimeout(150);
      if (await page.evaluate(() => !!document.querySelector(".entrada__saltar"))) falla("«Saltar» foco", "Enter en el botón no lo quitó");
      await page.keyboard.press("Tab");
      const t3 = await page.evaluate(() => document.activeElement?.className + "|" + document.activeElement?.textContent.trim());
      if (!/salto\|Saltar al contenido/.test(t3)) falla("«Saltar» foco", `al desaparecer con el foco encima, el siguiente Tab debe empezar en el inicio del documento («Saltar al contenido») y llegó a ${t3}`);
      await cerrar(c0, "consola «Saltar» foco");

      // Tab durante el hero: nada que reciba el foco puede estar oculto (los botones del hero empiezan con opacidad 0).
      {
        const cT = await abrir({ viewport: { width: 1280, height: 800 } });
        const pT = await cT.ctx.newPage();
        await pT.goto(servidor.url + ruta, { waitUntil: "domcontentloaded" });
        await pT.waitForSelector(".entrada__saltar", { timeout: 2000 });
        for (let i = 0; i < 12; i++) {
          await pT.keyboard.press("Tab");
          const r = await pT.evaluate(() => {
            const e = document.activeElement;
            let o = 1;
            for (let n = e; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
            return { o, t: (e?.textContent || "").trim().slice(0, 30), hero: !!e?.closest(".hero") };
          });
          if (r.o < 0.99) { falla("«Saltar» foco en el hero", `Tab llevó el foco a «${r.t}» con opacidad ${r.o.toFixed(2)} (invisible)`); break; }
          if (r.hero) break;
        }
        await cerrar(cT, "consola Tab en el hero");
      }

      // Desaparece solo (sin clic) estando enfocado: mismo resultado.
      const c1 = await abrir({ viewport: { width: 1280, height: 800 } });
      const p1 = await c1.ctx.newPage();
      await p1.goto(servidor.url + ruta, { waitUntil: "domcontentloaded" });
      await p1.waitForSelector(".entrada__saltar", { timeout: 2000 });
      await p1.keyboard.press("Tab");
      await p1.waitForFunction(() => !document.querySelector(".entrada__saltar"), null, { timeout: 9000, polling: 100 });
      await p1.keyboard.press("Tab");
      const t4 = await p1.evaluate(() => document.activeElement?.className + "|" + document.activeElement?.textContent.trim());
      if (!/salto\|Saltar al contenido/.test(t4)) falla("«Saltar» foco", `al desaparecer solo con el foco encima, el siguiente Tab debe empezar en el inicio del documento y llegó a ${t4}`);
      await cerrar(c1, "consola «Saltar» desaparece");
    }

    for (const ancho of a["solo-secciones"] || soloPrimero ? [] : [320, 390, 768, 1280, 1920]) {
      // Intersección del botón con las líneas de texto visibles, cuadro a cuadro: durante el hero y durante una lectura pausada de toda la página.
      const c = await abrir({ viewport: { width: ancho, height: ancho < 700 ? 800 : 900 } });
      await c.ctx.addInitScript(SONDA_SALTAR);
      const page = await c.ctx.newPage();
      await page.goto(servidor.url + ruta, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !document.querySelector(".entrada") && !document.documentElement.classList.contains("js-entrada"), null, { polling: "raf", timeout: 7000 });
      await page.evaluate(async () => {
        const espera = (ms) => new Promise((r) => setTimeout(r, ms));
        for (let y = 0; y < document.documentElement.scrollHeight; y += 20) {
          window.scrollTo(0, y);
          await espera(30);
        }
        await espera(1800);
      });
      const S = await page.evaluate(() => ({ cuadros: window.__saltar.cuadros, choques: window.__saltar.choques, esquinas: window.__saltar.esquinas }));
      if (S.cuadros < 60) falla(`«Saltar» sin tapar texto @${ancho}px`, `la prueba casi no vio el botón (${S.cuadros} cuadros)`);
      if (Object.keys(S.esquinas).length !== 1) falla(`«Saltar» fijo @${ancho}px`, `el botón cambió de sitio: ${JSON.stringify(S.esquinas)}`);
      // Un botón fijo pasa por encima del texto que se desplaza debajo en pantallas angostas (el texto ocupa todo el ancho): ahí solo se informa.
      // Con ancho suficiente (≥ 1920) queda en el margen lateral y no debe tapar nada.
      if (ancho >= 1920) for (const m of S.choques) falla(`«Saltar» sin tapar texto @${ancho}px`, m);
      console.log(`  «Saltar» @${ancho}px: ${S.cuadros} cuadros, esquinas ${JSON.stringify(S.esquinas)}, ${S.choques.length} choques`);
      await cerrar(c, `consola «Saltar» texto @${ancho}px`);
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
    for (const vp of soloSecciones ? [] : VIEWPORTS) {
      for (const [nombre, preparar] of fallos) {
        const c = await abrir({ viewport: vp }, { esperados: true });
        await preparar(c.ctx);
        const page = await c.ctx.newPage();
        const t0 = Date.now();
        await page.goto(servidor.url + ruta, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(Math.max(0, 5500 - (Date.now() - t0)));
        // Con inicio.js también roto, nadie quita la clase: basta con que el CSS deje todo visible (salida a los 5 s).
        for (const m of (await page.evaluate(ESTADO_FINAL)).filter((m) => !(nombre.startsWith("inicio.js") && /^quedan clases/.test(m)))) falla(`falla simulada «${nombre}» @${vp.width}px a los 5.5 s`, m);
        for (const m of await page.evaluate(ESTADO_ARMADO)) falla(`falla simulada «${nombre}» @${vp.width}px a los 5.5 s (secciones)`, m);
        await c.ctx.close();
      }
    }
  }
});
