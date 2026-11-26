/*
 * main.js: las animaciones del sitio, sin librerías y solo con transform y opacity. Los cursores (Procesos, Backend, Soporte) arman:
 *   1. El hero, en cada carga, en la primera pantalla (lo decide inicio.js, que pone js-entrada en <html>). El titular y su
 *      párrafo NO participan: se ven desde el primer pintado (el LCP es el H1). Arman solo la hoja, los botones y la línea
 *      naranja. Dura 3.9 s; scroll, toque o tecla la terminan al instante.
 *   2. Cada sección, una sola vez por carga, cuando entra en pantalla (#31): líneas, bordes, marcas de corte, la línea de las
 *      etapas, el resaltado de la fila del diagnóstico y las capturas dentro de su marco. El texto nunca se esconde.
 *      Máximo 1.3 s por sección, 3 cursores (2 en celular, más cortas). Lo que queda atrás al hacer scroll rápido se arma al instante.
 *   «Saltar» (o Escape) apaga los cursores en TODA la página durante esa visita; en la siguiente carga vuelven (sin memoria).
 * Los estados «desarmados» viven en home.css bajo .js-entrada y .js-secciones. Si algo falla, se quitan las clases y todo queda visible.
 */
const html = document.documentElement;
const reducido = matchMedia("(prefers-reduced-motion: reduce)");

/* ---------------------------------------------------------------------------------------------
   Piezas comunes: cursores, «Saltar» y el estado de la visita (todo en memoria; nada se guarda)
   --------------------------------------------------------------------------------------------- */
const NS = "http://www.w3.org/2000/svg";
const SUAVE = "cubic-bezier(0.2, 0, 0, 1)";
const ROLES = [
  { clase: "procesos", texto: "Procesos" },
  { clase: "backend", texto: "Backend" },
  { clase: "soporte", texto: "Soporte" },
];
let apagado = false; // «Saltar» o Escape: sin cursores en toda la página durante esta visita
let apagar = () => {
  apagado = true;
  if (heroFin) heroFin();
  saltarOcultar(0);
};
let heroFin = null; // termina el hero al instante (lo usa «Saltar»)
const sesiones = new Set(); // secciones que se están armando ahora

function crearCursor(rol) {
  const el = document.createElement("div");
  el.className = `cursor cursor--${rol.clase}`;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 14 20");
  svg.setAttribute("width", "17");
  svg.setAttribute("height", "24");
  const forma = document.createElementNS(NS, "path");
  forma.setAttribute("d", "M1 1v16.2l4.3-3.9 3 6.3 2.7-1.3-3-6.1h6z");
  svg.append(forma);
  const etiqueta = document.createElement("span");
  etiqueta.className = "cursor__rol";
  etiqueta.textContent = rol.texto;
  el.append(svg, etiqueta);
  return { el, svg, etiqueta, clase: rol.clase };
}

/* Un solo botón «Saltar» para toda la visita: sale con el hero y con cada sección que se arma, y se queda 1.5 s después. */
let saltarEl = null;
let saltarReloj = 0;
function saltarMostrar() {
  clearTimeout(saltarReloj);
  if (saltarEl || apagado) return saltarEl;
  saltarEl = document.createElement("button");
  saltarEl.type = "button";
  saltarEl.className = "entrada__saltar";
  saltarEl.textContent = "Saltar";
  saltarEl.addEventListener("click", () => apagar());
  document.body.append(saltarEl);
  return saltarEl;
}
function saltarOcultar(ms = 0) {
  clearTimeout(saltarReloj);
  const quitar = () => {
    if (html.classList.contains("js-entrada") || sesiones.size) return;
    if (saltarEl) saltarEl.remove();
    saltarEl = null;
  };
  if (ms) saltarReloj = setTimeout(quitar, ms);
  else quitar();
}

/* ---------------------------------------------------------------------------------------------
   1. Entrada del hero
   --------------------------------------------------------------------------------------------- */
const TOTAL = 3900; // ms; el encargo fija 4000 como máximo
const SUBE = 12; // px: lo que el CSS desplaza hacia abajo la hoja y los botones mientras están ocultos

function entrada() {
  const hero = document.querySelector(".hero");
  const hoja = hero && hero.querySelector(".pedido");
  const botones = hero ? [...hero.querySelectorAll(".hero__acciones .boton")] : [];
  const esquinas = hoja ? [...hoja.querySelectorAll(".marcas__esq")] : [];
  const tramos = hoja ? [...hoja.querySelectorAll(".etapas__item:not(:last-child)")] : [];
  const inicio = Number(html.getAttribute("data-entrada"));
  const tarde = performance.now() - inicio > 800; // si el JS llegó muy tarde, no se anima
  if (tarde || !hoja || botones.length < 2 || esquinas.length < 4 || !tramos.length) {
    return abandonar();
  }
  html.classList.add("entrada-activa"); // avisa a inicio.js y al CSS: su respaldo de 2.5 s ya no corre

  const chico = innerWidth < 600;
  const ancho = innerWidth;
  const alto = innerHeight;
  const animaciones = [];
  const eventos = ["scroll", "wheel", "touchstart", "pointerdown", "keydown", "resize"];
  let hecho = false;
  let reloj = 0;

  /* --- DOM decorativo: se crea aquí, así sin JS no existe --- */
  const contenedor = document.createElement("div");
  contenedor.className = "entrada";
  contenedor.setAttribute("aria-hidden", "true");
  const cursores = ROLES.slice(0, 3).map((rol) => {
    const c = crearCursor(rol);
    contenedor.append(c.el);
    return c;
  });
  const todos = document.createElement("p");
  todos.className = "entrada__todos";
  todos.textContent = "Todos son Harold";
  contenedor.append(todos);
  document.body.append(contenedor);
  const saltar = saltarMostrar();

  /* --- Cierre: todo vuelve a su estado normal, al instante --- */
  function fin(e) {
    if (e && saltar && e.target === saltar) return; // el clic de «Saltar» lo atiende su propio manejador (apagar)
    if (hecho) return;
    hecho = true;
    clearTimeout(reloj);
    eventos.forEach((n) => removeEventListener(n, fin, true));
    html.classList.add("entrada-fin"); // sin transiciones durante el cambio
    animaciones.forEach((a) => {
      try {
        a.cancel();
      } catch (e) {
        /* nada */
      }
    });
    contenedor.remove();
    void html.offsetWidth;
    html.classList.remove("js-entrada", "entrada-activa");
    html.removeAttribute("data-entrada");
    void html.offsetWidth;
    html.classList.remove("entrada-fin");
    heroFin = null;
    saltarOcultar(0);
  }

  try {
    heroFin = fin;
    eventos.forEach((n) => addEventListener(n, fin, { capture: true, passive: true }));
    reloj = setTimeout(fin, TOTAL);
    if (scrollY > 0) return fin();

    /* --- Utilidades de tiempo y movimiento (todo en ms desde el inicio) --- */
    const anim = (el, keyframes, opciones, pseudo) => {
      const a = el.animate(keyframes, { fill: "both", easing: SUAVE, ...opciones, ...(pseudo ? { pseudoElement: pseudo } : {}) });
      animaciones.push(a);
      return a;
    };
    // pts: [t, x, y, easing?]; el cursor se mueve de un punto al siguiente con el easing del primero.
    const mover = (c, pts) => {
      const fin_ = pts[pts.length - 1][0];
      anim(c.el, pts.map(([t, x, y, e]) => ({ transform: `translate(${Math.round(x)}px, ${Math.round(y)}px)`, offset: t / fin_, easing: e || SUAVE })), { duration: fin_, easing: "linear" });
    };
    const rect = (el, sube = 0) => {
      const r = el.getBoundingClientRect();
      return { l: r.left, r: r.right, t: r.top - sube, b: r.bottom - sube, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top - sube + r.height / 2 };
    };
    const enPantalla = (y) => Math.min(Math.max(y, 72 + 24), alto - 56);
    const fuera = { izq: -90, der: ancho + 90, abajo: alto + 90, arriba: -90 };

    const [procesos, backend, soporte] = cursores;

    /* --- Backend: dibuja la hoja y sus marcas de corte --- */
    {
      const h = rect(hoja, SUBE);
      const x = Math.min(Math.max(h.l, 8), ancho - 40);
      const y0 = enPantalla(h.t);
      const y1 = enPantalla(h.b);
      const llegada = 450;
      anim(hoja, { opacity: [0, 1], transform: [`translateY(${SUBE}px)`, "translateY(0px)"] }, { delay: llegada, duration: 350 });
      const orden = [0, 1, 3, 2]; // nw, ne, se, sw
      const ruta = [[0, fuera.der, y0], [llegada, x, y0]];
      const sitios = [[x, y0], [Math.min(h.r, ancho - 40), y0], [Math.min(h.r, ancho - 40), y1], [x, y1]];
      orden.forEach((q, i) => {
        const t = llegada + 250 + i * (chico ? 110 : 150);
        anim(esquinas[q], { opacity: [0, 1] }, { delay: t - 60, duration: 160 });
        if (!chico || i % 2 === 1 || i === 0) ruta.push([t, sitios[q][0], sitios[q][1]]);
      });
      backend.ruta = ruta;
    }

    /* --- Soporte: coloca los botones --- */
    {
      const b = botones.map((el) => rect(el, SUBE));
      const llegada = chico ? 600 : 800;
      const ruta = [[0, b[0].cx, fuera.abajo]];
      let t = llegada;
      botones.forEach((el, i) => {
        const y = enPantalla(b[i].cy);
        ruta.push([t, Math.min(b[i].l + 24, ancho - 60), y]);
        anim(el, { opacity: [0, 1], transform: [`translateY(${SUBE}px)`, "translateY(0px)"] }, { delay: t - 40, duration: 300 });
        t += 320;
      });
      soporte.ruta = ruta;
    }

    /* --- Procesos: traza la línea naranja de la hoja --- */
    {
      const q = tramos.map((el) => rect(el, SUBE));
      const cuadro = 13;
      const x = Math.min(Math.max(q[0].l + cuadro / 2, 8), ancho - 40);
      const yIni = q[0].t + 3 + cuadro / 2;
      const yFin = q[q.length - 1].b + 4;
      const llegada = 1050;
      const dur = 750;
      const ruta = [[0, ancho + 90, -40], [llegada, x, enPantalla(yIni), "linear"], [llegada + dur, x, enPantalla(yFin)]];
      const total = Math.max(1, yFin - yIni);
      tramos.forEach((el, i) => {
        const desde = Math.max(0, (q[i].t + 3 + cuadro - yIni) / total);
        const hasta = Math.min(1, (q[i].b + 4 - yIni) / total);
        anim(el, { transform: ["scaleY(0)", "scaleY(1)"] }, { delay: llegada + desde * dur, duration: Math.max(60, (hasta - desde) * dur), easing: "linear" }, "::after");
      });
      procesos.ruta = ruta;
    }

    /* --- Todos juntos: las etiquetas se unen y aparece «Todos son Harold» --- */
    {
      const salen = 1950;
      const llegan = 2450;
      // Punto de encuentro: justo debajo de la firma del hero, centrado en la columna de texto.
      const pill = todos.getBoundingClientRect();
      const col = rect(hero.querySelector(".hero__texto"));
      const firma = rect(hero.querySelector(".hero__firma"));
      const cx = chico ? ancho / 2 : col.cx;
      const cy = Math.min(firma.b + 20 + pill.height / 2, alto - 100);
      const orden = [procesos, backend, soporte];
      const anchos = orden.map((c) => c.etiqueta.getBoundingClientRect().width);
      const hueco = 2;
      const suma = anchos.reduce((s, v) => s + v, 0) + hueco * 3;
      let x = cx - suma / 2;
      orden.forEach((c, i) => {
        const hacia = [x - 15, cy - c.etiqueta.getBoundingClientRect().height / 2 - 20];
        x += anchos[i] + hueco;
        const ruta = c.ruta;
        const ultimo = ruta[ruta.length - 1];
        ruta.push([salen, ultimo[1], ultimo[2], SUAVE], [llegan, hacia[0], hacia[1]]);
        mover(c, ruta);
        anim(c.svg, { opacity: [1, 0] }, { delay: llegan - 300, duration: 300, easing: "linear" });
        anim(c.etiqueta, { opacity: [1, 0] }, { delay: llegan + 50, duration: 150, easing: "linear" });
      });
      // «Todos son Harold»: visible a opacidad completa 1 s (de 2650 a 3650 ms) y se va antes de TOTAL.
      const lugar = `translate(${Math.round(cx - pill.width / 2)}px, ${Math.round(cy - pill.height / 2)}px)`;
      anim(todos, { opacity: [0, 1, 1, 0], transform: [lugar, lugar, lugar, lugar], offset: [0, 0.111, 0.852, 1] }, { delay: llegan + 50, duration: 1350, easing: "linear" });
    }
  } catch (e) {
    fin();
  }
}

function abandonar() {
  heroFin = null;
  html.classList.remove("js-entrada", "entrada-activa");
  html.removeAttribute("data-entrada");
  saltarOcultar(0);
}

/* ---------------------------------------------------------------------------------------------
   2. Secciones: las arman los cursores al entrar en pantalla (#31)
   --------------------------------------------------------------------------------------------- */
const OFF = 150; // ms: lo que tardan los cursores en llegar al primer punto
const FIN_VISUAL = 1100; // ms: todo lo visual termina antes de esto
const TOTAL_SECCION = 1300; // ms: máximo por sección (el encargo fija 1500); en celular se escala por CORTO
const CORTO = 0.7;
const BARRA = 88; // px: la barra fija (72) y el aire que las anclas le dejan (scroll-padding-top): lo que queda detrás de ella cuenta como «atrás»

/* Cada plan devuelve los «visuales» de su sección: { c (cursor 0 a 2, o -1 si no lleva), host, pseudo, kf, t, dur, ruta }.
   Las posiciones son relativas a la sección; ruta = [[ms desde el inicio del visual, x, y], ...]. */
const linea = (c, host, pseudo, t, dur, x0, x1, y, eje = "scaleX") => ({ c, host, pseudo, kf: { transform: [`${eje}(0)`, `${eje}(1)`] }, t, dur, ruta: [[0, x0, y], [dur, x1, y]] });
const aparece = (c, host, pseudo, t, dur, x, y) => ({ c, host, pseudo, kf: { opacity: [0, 1] }, t, dur, ruta: [[0, x, y]] });

const PLANES = [
  {
    // 3. Problemas: el filete de arriba y la línea bajo cada problema
    busca: ".problemas",
    plan(s, r) {
      const ol = s.querySelector(".problemas");
      const o = r(ol);
      const v = [linea(0, ol, "::before", 0, 450, o.l, o.r, o.t)];
      [...ol.querySelectorAll(".problemas__fila")].forEach((f, i) => {
        const q = r(f);
        v.push(linea(1 + (i % 2), f, "::after", 250 + i * 200, 400, q.l, q.r, q.b));
      });
      return v;
    },
  },
  {
    // 4. Sistemas: la línea de las seis etapas con sus marcas (antes era un mecanismo aparte) y las filas
    busca: ".proceso",
    plan(s, r) {
      const proceso = s.querySelector(".proceso");
      const raya = proceso.querySelector(".proceso__linea");
      const marcas = [...proceso.querySelectorAll(".proceso__marca")];
      const horizontal = matchMedia("(min-width: 768px)").matches; // de 768 px en adelante la línea es horizontal
      const eje = horizontal ? "scaleX" : "scaleY";
      const m = marcas.map(r);
      const pos = (q) => (horizontal ? q.cx : q.cy);
      const largo = Math.max(1, pos(m[m.length - 1]) - pos(m[0]));
      const dur = 800;
      const fr = m.map((q) => Math.min(1, Math.max(0, (pos(q) - pos(m[0])) / largo)));
      const v = [{ c: 0, host: raya, kf: { transform: [`${eje}(0)`, `${eje}(1)`] }, t: 0, dur, easing: "linear", ruta: m.map((q, i) => [fr[i] * dur, q.cx, q.cy]) }];
      marcas.forEach((el, i) => v.push({ c: -1, host: el, kf: { opacity: [0, 1] }, t: fr[i] * dur, dur: 220, easing: "ease-out" }));
      const filas = [...s.querySelectorAll(".fila")];
      filas.forEach((f, i) => {
        const q = r(f);
        v.push(linea(1 + (i % 2), f, "::before", 250 + i * 90, 280, q.l, q.r, q.t));
        if (i === filas.length - 1) v.push(linea(1 + (i % 2), f, "::after", 250 + i * 90 + 100, 280, q.l, q.r, q.b));
      });
      return v;
    },
  },
  {
    // 6. Trabajo: marcas de corte, filete de cada tarjeta y la captura dentro de su marco
    busca: ".trabajo",
    plan(s, r) {
      const v = [];
      [...s.querySelectorAll(".trabajo")].forEach((card, i) => {
        const b = i * 260;
        const q = r(card);
        const sitios = [[q.l, q.t], [q.r, q.t], [q.l, q.b], [q.r, q.b]]; // nw, ne, sw, se (el orden del HTML)
        [0, 1, 3, 2].forEach((k, n) => v.push(aparece(0, card.querySelectorAll(".marcas__esq")[k], null, b + n * 60, 150, sitios[k][0], sitios[k][1])));
        const marco = r(card.querySelector(".captura__marco"));
        v.push({ c: 1, host: card.querySelector(".captura__img"), kf: { opacity: [0, 1], transform: ["scale(1.04)", "scale(1)"] }, t: b + 200, dur: 450, ruta: [[0, marco.cx, marco.cy]] });
        const cuerpo = card.querySelector(".captura__cuerpo");
        const c = r(cuerpo);
        v.push(linea(2, cuerpo, "::before", b + 300, 330, c.l, c.r, c.t));
      });
      return v;
    },
  },
  {
    // 7. Cómo trabajo: la línea naranja bajo cada número
    busca: ".pasos",
    plan(s, r) {
      return [...s.querySelectorAll(".paso")].map((p, i) => {
        const q = r(p);
        const cs = getComputedStyle(p);
        const y = q.t + parseFloat(cs.paddingTop) + parseFloat(getComputedStyle(p, "::before").height) + parseFloat(getComputedStyle(p, "::before").paddingBottom);
        return linea(i % 2, p, "::after", i * 180, 380, q.l + parseFloat(cs.paddingLeft), q.r - parseFloat(cs.paddingRight), y);
      });
    },
  },
  {
    // 8. Precios: el resaltado de la fila del diagnóstico
    busca: ".tabla__destacada",
    plan(s, r) {
      const fila = s.querySelector(".tabla__destacada");
      if (matchMedia("(max-width: 639.98px)").matches) {
        const q = r(fila);
        return [aparece(0, fila, "::before", 250, 300, q.l + q.w * 0.25, q.cy), aparece(1, fila, "::after", 390, 300, q.l + q.w * 0.75, q.cy)];
      }
      return [...fila.children].map((celda, j) => {
        const q = r(celda);
        return aparece(j < 2 ? 0 : 1, celda, "::after", 250 + j * 140, 260, q.cx, q.cy);
      });
    },
  },
  {
    // 9. Quién: marcas de corte de la foto y líneas de las preguntas
    busca: ".faq",
    plan(s, r) {
      const v = [];
      const foto = s.querySelector(".foto");
      if (foto) {
        const q = r(foto);
        const sitios = [[q.l, q.t], [q.r, q.t], [q.l, q.b], [q.r, q.b]]; // nw, ne, sw, se (el orden del HTML)
        [0, 1, 3, 2].forEach((k, n) => v.push(aparece(0, foto.querySelectorAll(".marcas__esq")[k], null, n * 90, 150, sitios[k][0], sitios[k][1])));
      }
      const faq = s.querySelector(".faq");
      const f = r(faq);
      v.push(linea(1, faq, "::before", 100, 400, f.l, f.r, f.t));
      [...faq.querySelectorAll(".faq__item")].forEach((it, i) => {
        const q = r(it);
        v.push(linea(1 + (i % 2), it, "::after", 250 + i * 90, 300, q.l, q.r, q.b));
      });
      return v;
    },
  },
  {
    // 10. Cierre: la línea naranja del título y el filete de arriba
    busca: ".cierre__titulo",
    plan(s, r) {
      const t = s.querySelector(".cierre__titulo");
      const q = r(t);
      const c = r(s);
      return [linea(0, t, "::after", 0, 500, q.l, q.r, q.b), linea(1, s, "::before", 100, 600, c.l, c.r, c.t)];
    },
  },
];

function secciones() {
  if (!html.classList.contains("js-secciones")) return;
  const chico = matchMedia("(max-width: 767.98px)").matches; // mismo corte que usa el sitio para las etapas
  const k = chico ? CORTO : 1;
  const lista = [];
  document.querySelectorAll("main > section:not(.hero)").forEach((s) => {
    const p = PLANES.find((x) => s.querySelector(x.busca) || s.matches(x.busca));
    if (p) lista.push({ s, p });
  });
  if (!lista.length) return;
  html.classList.add("secciones-activa"); // avisa a inicio.js: su respaldo de 4 s ya no corre

  const pendientes = new Map(lista.map((x) => [x.s, x]));
  const vivas = new Map(); // sección -> { terminar }
  let ojo = null;

  const armadaYa = (s) => {
    const v = vivas.get(s);
    if (v) v.terminar();
    pendientes.delete(s);
    if (ojo) ojo.unobserve(s);
    s.classList.add("armada");
  };

  function animar({ s, p }) {
    pendientes.delete(s);
    if (ojo) ojo.unobserve(s);
    const animaciones = [];
    const capa = document.createElement("div");
    capa.className = "cursores-seccion";
    capa.setAttribute("aria-hidden", "true");
    let hecho = false;
    let reloj = 0;
    const terminar = () => {
      if (hecho) return;
      hecho = true;
      clearTimeout(reloj);
      s.classList.add("armada");
      animaciones.forEach((a) => {
        try {
          a.cancel();
        } catch (e) {
          /* nada */
        }
      });
      capa.remove();
      vivas.delete(s);
      sesiones.delete(s);
      if (!sesiones.size) saltarOcultar(1500);
    };
    vivas.set(s, { terminar });
    try {
      const caja = s.getBoundingClientRect();
      const r = (el) => {
        const q = el.getBoundingClientRect();
        return { l: q.left - caja.left, r: q.right - caja.left, t: q.top - caja.top, b: q.bottom - caja.top, w: q.width, h: q.height, cx: q.left - caja.left + q.width / 2, cy: q.top - caja.top + q.height / 2 };
      };
      const visuales = p.plan(s, r);
      const cursor = (c) => (chico ? c % 2 : c);
      const total = TOTAL_SECCION * k;
      const arriba = Math.max(0, 72 + 16 - caja.top); // la barra fija tapa los primeros píxeles
      const abajo = Math.min(caja.height, innerHeight - caja.top - 56);
      const enY = (y) => Math.min(Math.max(y, arriba), Math.max(arriba, abajo));
      const enX = (x) => Math.min(Math.max(x, 8), Math.max(8, caja.width - 40));
      const anim = (el, kf, op, pseudo) => {
        const a = el.animate(kf, { fill: "both", easing: SUAVE, ...op, ...(pseudo ? { pseudoElement: pseudo } : {}) });
        animaciones.push(a);
        return a;
      };
      sesiones.add(s);
      saltarMostrar();
      s.append(capa);
      visuales.forEach((v) => anim(v.host, v.kf, { delay: (OFF + v.t) * k, duration: v.dur * k, easing: v.easing || SUAVE }, v.pseudo));
      // Un cursor por grupo de visuales (3 en escritorio, 2 en celular), con su etiqueta y su recorrido.
      const grupos = [[], [], []];
      visuales.filter((v) => v.c >= 0 && v.ruta).forEach((v) => grupos[cursor(v.c)].push(v));
      grupos.forEach((g, n) => {
        if (!g.length) return;
        g.sort((a, b) => a.t - b.t);
        const c = crearCursor(ROLES[n]);
        capa.append(c.el);
        const [, x0, y0] = g[0].ruta[0];
        const pts = [[0, enX(x0 + 140), enY(y0 - 30)]];
        let prev = 0;
        g.forEach((v) =>
          v.ruta.forEach(([dt, x, y], i) => {
            let t = (OFF + v.t + dt) * k;
            t = i === 0 ? Math.max(prev + 40 * k, t - 120 * k) : Math.max(prev + 10, t);
            t = Math.min(t, (FIN_VISUAL + 100) * k);
            pts.push([t, enX(x), enY(y)]);
            prev = t;
          }),
        );
        const ult = pts[pts.length - 1];
        pts.push([total, ult[1], ult[2]]);
        anim(c.el, pts.map(([t, x, y]) => ({ transform: `translate(${Math.round(x)}px, ${Math.round(y)}px)`, offset: Math.min(1, t / total) })), { duration: total, easing: "linear" });
        anim(c.el, { opacity: [0, 1, 1, 0], offset: [0, 0.08, (FIN_VISUAL * k) / total, 1] }, { duration: total, easing: "linear" });
      });
      reloj = setTimeout(terminar, total + 40);
    } catch (e) {
      terminar();
    }
  }

  const revisar = () => {
    if (apagado) return;
    const alto = innerHeight;
    const alFinal = scrollY + alto >= document.documentElement.scrollHeight - 2;
    for (const x of [...pendientes.values()]) {
      const q = x.s.getBoundingClientRect();
      if (q.bottom <= BARRA + 2) {
        armadaYa(x.s); // quedó atrás: se completa al instante
        continue;
      }
      if (html.classList.contains("js-entrada")) continue; // el hero va primero
      const visible = Math.min(q.bottom, alto) - Math.max(q.top, BARRA);
      // ~30 % de la sección (o de la pantalla, si es más alta); al llegar al final de la página, lo que se vea aunque sea menos.
      if (visible > 0 && (visible >= Math.min(0.3 * q.height, 0.3 * (alto - BARRA)) || alFinal)) animar(x);
    }
  };

  apagar = () => {
    if (apagado) return;
    apagado = true;
    html.classList.remove("js-secciones"); // todo armado al instante
    [...vivas.values()].forEach((v) => v.terminar());
    pendientes.clear();
    if (ojo) ojo.disconnect();
    if (heroFin) heroFin();
    saltarOcultar(0);
  };
  addEventListener("keydown", (e) => e.key === "Escape" && apagar());
  // Foco de teclado en una sección sin armar: se arma al instante.
  addEventListener(
    "focusin",
    (e) => {
      const s = e.target instanceof Element && e.target.closest("main > section");
      if (s && pendientes.has(s)) armadaYa(s);
    },
    true,
  );

  const umbrales = Array.from({ length: 21 }, (_, i) => i / 20);
  ojo = new IntersectionObserver(revisar, { threshold: umbrales });
  lista.forEach((x) => ojo.observe(x.s));
  const pie = document.querySelector("body > footer");
  if (pie) ojo.observe(pie); // llegar al final de la página también revisa lo pendiente
  if (html.classList.contains("js-entrada")) {
    // Mientras corre el hero no se arma nada; al terminar se revisa lo que ya está a la vista.
    const espera = new MutationObserver(() => {
      if (html.classList.contains("js-entrada")) return;
      espera.disconnect();
      revisar();
    });
    espera.observe(html, { attributes: true, attributeFilter: ["class"] });
  }
  revisar();
}

if (html.classList.contains("js-entrada")) {
  try {
    entrada();
  } catch (e) {
    abandonar();
  }
}
try {
  secciones();
} catch (e) {
  html.classList.remove("js-secciones");
}
// Si el visitante activa «reducir movimiento» a mitad de la visita, se apaga todo como con «Saltar»: los estilos de los
// cursores solo existen sin movimiento reducido, así que una animación en curso dejaría cursores sin estilo y un salto de layout.
try {
  reducido.addEventListener("change", (e) => e.matches && apagar());
} catch (e) {
  /* navegador sin addEventListener en MediaQueryList: nada que hacer */
}
