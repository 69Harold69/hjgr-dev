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

/* Un solo botón «Saltar animación (Esc)» para toda la visita: sale con el hero y con cada sección que se arma, y se queda 1.5 s después.
   Va como PRIMER hijo de <body>: es lo primero que alcanza el Tab mientras exista (el enlace «Saltar al contenido» queda justo
   después, como segundo Tab). Su sitio es una esquina fija (abajo a la derecha) con margen seguro; no cambia de lugar durante la visita. */
let saltarEl = null;
let saltarReloj = 0;

function saltarMostrar() {
  clearTimeout(saltarReloj);
  if (saltarEl || apagado) return saltarEl;
  saltarEl = document.createElement("button");
  saltarEl.type = "button";
  saltarEl.className = "entrada__saltar";
  saltarEl.textContent = "Saltar animación (Esc)";
  saltarEl.addEventListener("click", () => apagar());
  document.body.prepend(saltarEl);
  return saltarEl;
}
function saltarQuitar() {
  if (!saltarEl) return;
  // Si tenía el foco, el siguiente Tab debe empezar en el inicio del documento (el enlace «Saltar al contenido»), no en un lugar raro.
  const teniaFoco = document.activeElement === saltarEl;
  saltarEl.remove();
  saltarEl = null;
  if (teniaFoco) {
    document.body.setAttribute("tabindex", "-1");
    document.body.focus({ preventScroll: true });
    document.body.removeAttribute("tabindex");
  }
}
function saltarOcultar(ms = 0) {
  clearTimeout(saltarReloj);
  const quitar = () => {
    if (html.classList.contains("js-entrada") || sesiones.size) return;
    saltarQuitar();
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
    if (e && e.type === "keydown" && e.key === "Tab") return; // Tab solo mueve el foco (primero a «Saltar»): no termina la entrada
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
   2. Secciones: las arman los cursores al entrar en pantalla (#31, #35)
   ---------------------------------------------------------------------------------------------
   Una sola definición de PASOS por sección. Cada paso dice: qué cursor lo hace (c), cuándo puede empezar (t), cuánto dura (dur), el
   recorrido del cursor (ruta: [ms desde el inicio del paso, x, y]) y las piezas que aparecen mientras tanto (partes: dt y dur dentro del paso).
   De ahí salen, con los MISMOS tiempos y el mismo easing lineal, tanto el recorrido del cursor como la animación de cada pieza:
   la línea crece justo donde va la punta; la marca se pega cuando el cursor llega a la esquina. Nada se anima por separado. */
const OFF = 120; // ms: lo que tarda el primer cursor en llegar
const SALIDA = 160; // ms: el cursor se desvanece al final
const TOPE = 1400; // ms por sección en escritorio (el encargo fija 1500, con la salida del cursor incluida)
const TOPE_CEL = 940; // ms en celular (el encargo fija 1000)
const BARRA = 88; // px: la barra fija (72) y el aire que las anclas le dejan (scroll-padding-top): lo que queda detrás de ella cuenta como «atrás»
const DISPARO = 0.9; // la sección arranca cuando su borde superior ya entró ~10 % de la altura de la pantalla
const viaje = (d) => Math.min(130, Math.max(35, d * 0.45)); // ms que tarda un cursor en llegar al inicio del siguiente paso, según la distancia

const paso = (c, t, dur, ruta, partes) => ({ c, t, dur, ruta, partes });
const linea = (c, host, pseudo, t, dur, x0, x1, y, eje = "scaleX") => paso(c, t, dur, [[0, x0, y], [dur, x1, y]], [{ host, pseudo, kf: { transform: [`${eje}(0)`, `${eje}(1)`] } }]);

/* Tarjeta u hoja de una sola pasada: el cursor recorre el borde (cuatro lados, cada uno se dibuja detrás de la punta), después aparece la sombra
   (capa con opacidad) y, si la tarjeta lleva marcas de corte, el cursor pasa por cada esquina y la marca se pega ahí. */
function tarjeta(h, c, t, el, marcas = []) {
  const q = h.r(el);
  const T = 85; // ms por lado
  const S = 110; // ms de la sombra
  const M = 70; // ms por marca
  const lado = (clase, l, tp, w, hg, kf, dt) => ({ host: h.capa(clase, l, tp, w, hg), kf, dt, dur: T });
  const partes = [
    lado("", q.l - 1, q.t - 1, q.w + 2, 1, { transform: ["scaleX(0)", "scaleX(1)"] }, 0),
    lado("arma-capa--v", q.r, q.t - 1, 1, q.h + 2, { transform: ["scaleY(0)", "scaleY(1)"] }, T),
    lado("arma-capa--der", q.l - 1, q.b, q.w + 2, 1, { transform: ["scaleX(0)", "scaleX(1)"] }, 2 * T),
    lado("arma-capa--v arma-capa--abajo", q.l - 1, q.t - 1, 1, q.h + 2, { transform: ["scaleY(0)", "scaleY(1)"] }, 3 * T),
  ];
  const ruta = [[0, q.l, q.t], [T, q.r, q.t], [2 * T, q.r, q.b], [3 * T, q.l, q.b], [4 * T, q.l, q.t]];
  partes.push({ host: h.capa("arma-capa--sombra", q.l, q.t, q.w, q.h), kf: { opacity: [0, 1] }, dt: 4 * T, dur: S });
  let fin = 4 * T + S;
  if (marcas.length) {
    const sitios = [[q.l, q.t], [q.r, q.t], [q.l, q.b], [q.r, q.b]]; // nw, ne, sw, se (el orden del HTML)
    [0, 1, 3, 2].forEach((k) => {
      const [x, y] = sitios[k];
      ruta.push([fin, x, y]);
      partes.push({ host: marcas[k], kf: { opacity: [0, 1], transform: ["scale(2.2)", "scale(1)"] }, dt: fin, dur: M * 0.8 });
      fin += M;
    });
    ruta.push([fin, q.l, q.t]);
  } else ruta.push([fin, q.l, q.t]);
  return paso(c, t, fin, ruta, partes);
}

const PLANES = [
  {
    // 3. Problemas: el filete de arriba y la línea bajo cada problema
    busca: ".problemas",
    plan(s, h) {
      const ol = s.querySelector(".problemas");
      const o = h.r(ol);
      const v = [linea(0, ol, "::before", 0, 420, o.l, o.r, o.t)];
      [...ol.querySelectorAll(".problemas__fila")].forEach((f, i) => {
        const q = h.r(f);
        v.push(linea(1 + (i % 2), f, "::after", 60 + i * 60, 330, q.l, q.r, q.b));
      });
      return v;
    },
  },
  {
    // 4. Sistemas: la línea de las seis etapas con sus marcas y las filas
    busca: ".proceso",
    plan(s, h) {
      const proceso = s.querySelector(".proceso");
      const raya = proceso.querySelector(".proceso__linea");
      const marcas = [...proceso.querySelectorAll(".proceso__marca")];
      const horizontal = matchMedia("(min-width: 768px)").matches; // de 768 px en adelante la línea es horizontal
      const eje = horizontal ? "scaleX" : "scaleY";
      const m = marcas.map(h.r);
      const pos = (q) => (horizontal ? q.cx : q.cy);
      const largo = Math.max(1, pos(m[m.length - 1]) - pos(m[0]));
      const dur = 800;
      const fr = m.map((q) => Math.min(1, Math.max(0, (pos(q) - pos(m[0])) / largo)));
      const partes = [{ host: raya, kf: { transform: [`${eje}(0)`, `${eje}(1)`] } }];
      marcas.forEach((el, i) => partes.push({ host: el, kf: { opacity: [0, 1] }, dt: fr[i] * dur, dur: 200 }));
      const v = [paso(0, 0, dur, m.map((q, i) => [fr[i] * dur, q.cx, q.cy]), partes)];
      const filas = [...s.querySelectorAll(".fila")];
      filas.forEach((f, i) => {
        const q = h.r(f);
        v.push(linea(1 + (i % 2), f, "::before", 60 + i * 70, 260, q.l, q.r, q.t));
        if (i === filas.length - 1) v.push(linea(1 + (i % 2), f, "::after", 60 + i * 70 + 90, 260, q.l, q.r, q.b));
      });
      return v;
    },
  },
  {
    // 6. Trabajo: cada tarjeta (borde, sombra y marcas de corte con su cursor) y su captura revelada en diagonal
    busca: ".trabajo",
    plan(s, h) {
      const v = [];
      [...s.querySelectorAll(".trabajo")].forEach((card, i) => {
        v.push(tarjeta(h, i % 2, 0, card, [...card.querySelectorAll(".marcas__esq")]));
        const img = card.querySelector(".captura__img");
        const marco = h.r(card.querySelector(".captura__marco"));
        // Frente en diagonal: la punta recorre la diagonal del marco y el clip-path (un triángulo que crece) la sigue.
        v.push(paso(2, i * 20, 300, [[0, marco.l, marco.t], [300, marco.r, marco.b]], [{ host: img, kf: { clipPath: ["polygon(0 0, 0 0, 0 0)", "polygon(0 0, 200% 0, 0 200%)"] } }]));
      });
      [...s.querySelectorAll(".trabajo .captura__cuerpo")].forEach((cuerpo, i) => {
        const c = h.r(cuerpo);
        v.push(linea(2, cuerpo, "::before", 60 + i * 20, 160, c.l, c.r, c.t));
      });
      return v;
    },
  },
  {
    // 7. Cómo trabajo: borde y sombra de cada hoja, y la línea naranja bajo cada número
    busca: ".pasos",
    plan(s, h) {
      const v = [];
      [...s.querySelectorAll(".paso")].forEach((p, i) => {
        v.push(tarjeta(h, i % 2, 0, p));
        const q = h.r(p);
        const cs = getComputedStyle(p);
        const y = q.t + parseFloat(cs.paddingTop) + parseFloat(getComputedStyle(p, "::before").height) + parseFloat(getComputedStyle(p, "::before").paddingBottom);
        v.push(linea(2, p, "::after", 40 + i * 20, 200, q.l + parseFloat(cs.paddingLeft), q.r - parseFloat(cs.paddingRight), y));
      });
      return v;
    },
  },
  {
    // 8. Precios: un cursor traza las líneas de la tabla de arriba abajo; otro barre el resaltado del diagnóstico
    busca: ".tabla__destacada",
    plan(s, h) {
      const v = [];
      const tabla = s.querySelector(".tabla");
      const tq = h.r(tabla);
      const lineas = [[tq.t, "arma-capa--ink"]];
      [...tabla.querySelectorAll("tr")].forEach((tr) => {
        const q = h.r(tr);
        if (q.h > 0) lineas.push([q.b - 1, ""]);
      });
      lineas.sort((a, b) => a[0] - b[0]); // de arriba abajo, sea cual sea el orden del DOM
      // Serpentina: una línea de izquierda a derecha y la siguiente de derecha a izquierda; el cursor casi no viaja.
      lineas.forEach(([y, clase], i) => {
        const atras = i % 2 === 1;
        const host = h.capa(`${clase} ${atras ? "arma-capa--der" : ""}`.trim(), tq.l, y, tq.w, 1);
        v.push(paso(0, 0, 70, atras ? [[0, tq.r, y], [70, tq.l, y]] : [[0, tq.l, y], [70, tq.r, y]], [{ host, kf: { transform: ["scaleX(0)", "scaleX(1)"] } }]));
      });
      const fila = s.querySelector(".tabla__destacada");
      const f = h.r(fila);
      const dur = 420;
      if (matchMedia("(max-width: 639.98px)").matches) {
        v.push(paso(1, 0, dur, [[0, f.l, f.cy], [dur, f.r, f.cy]], [
          { host: fila, pseudo: "::before", kf: { clipPath: ["inset(0 100% 0 0)", "inset(0 0 0 0)"] }, dt: 0, dur: dur / 2 },
          { host: fila, pseudo: "::after", kf: { clipPath: ["inset(0 100% 0 0)", "inset(0 0 0 0)"] }, dt: dur / 2, dur: dur / 2 },
        ]));
      } else {
        const partes = [...fila.children].map((celda) => {
          const q = h.r(celda);
          return { host: celda, pseudo: "::after", kf: { clipPath: ["inset(0 100% 0 0)", "inset(0 0 0 0)"] }, dt: ((q.l - f.l) / f.w) * dur, dur: (q.w / f.w) * dur };
        });
        v.push(paso(1, 0, dur, [[0, f.l, f.cy], [dur, f.r, f.cy]], partes));
      }
      return v;
    },
  },
  {
    // 9. Quién: marcas de corte de la foto y líneas de las preguntas
    busca: ".faq",
    plan(s, h) {
      const v = [];
      const foto = s.querySelector(".foto");
      if (foto) {
        const q = h.r(foto);
        const esq = [...foto.querySelectorAll(".marcas__esq")];
        const sitios = [[q.l, q.t], [q.r, q.t], [q.l, q.b], [q.r, q.b]];
        const orden = [0, 1, 3, 2];
        v.push(paso(0, 0, 70 * 4, orden.map((k, n) => [n * 70, sitios[k][0], sitios[k][1]]), orden.map((k, n) => ({ host: esq[k], kf: { opacity: [0, 1], transform: ["scale(2.2)", "scale(1)"] }, dt: n * 70, dur: 60 }))));
      }
      const faq = s.querySelector(".faq");
      const f = h.r(faq);
      v.push(linea(1, faq, "::before", 0, 380, f.l, f.r, f.t));
      [...faq.querySelectorAll(".faq__item")].forEach((it, i) => {
        const q = h.r(it);
        v.push(linea(1 + (i % 2), it, "::after", 60 + i * 60, 280, q.l, q.r, q.b));
      });
      return v;
    },
  },
  {
    // 10. Cierre: la línea naranja del título y el filete de arriba
    busca: ".cierre__titulo",
    plan(s, h) {
      const t = s.querySelector(".cierre__titulo");
      const q = h.r(t);
      const c = h.r(s);
      return [linea(0, t, "::after", 0, 480, q.l, q.r, q.b), linea(1, s, "::before", 60, 560, c.l, c.r, c.t)];
    },
  },
];

function secciones() {
  if (!html.classList.contains("js-secciones")) return;
  const chico = matchMedia("(max-width: 767.98px)").matches; // mismo corte que usa el sitio para las etapas
  const tope = chico ? TOPE_CEL : TOPE;
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
    const relojes = new Set();
    const capa = document.createElement("div");
    capa.className = "cursores-seccion";
    capa.setAttribute("aria-hidden", "true");
    let hecho = false;
    const terminar = () => {
      if (hecho) return;
      hecho = true;
      relojes.forEach(clearTimeout);
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
      const rel = (q) => ({ l: q.left - caja.left, r: q.right - caja.left, t: q.top - caja.top, b: q.bottom - caja.top, w: q.width, h: q.height, cx: q.left - caja.left + q.width / 2, cy: q.top - caja.top + q.height / 2 });
      const h = {
        r: (el) => rel(el.getBoundingClientRect()),
        capa: (clase, l, t, w, hg) => {
          const d = document.createElement("div");
          d.className = `arma-capa ${clase}`.trim();
          d.style.left = `${l}px`;
          d.style.top = `${t}px`;
          d.style.width = `${w}px`;
          d.style.height = `${hg}px`;
          capa.append(d);
          return d;
        },
      };
      s.append(capa);
      const pasos = p.plan(s, h);
      const cursor = (c) => (c < 0 ? -1 : chico ? c % 2 : c);
      // Títulos de la sección: las etiquetas de los cursores no pasan por encima de ellos.
      const titulos = [...s.querySelectorAll("h2, h3, .nombre")].map(h.r).filter((q) => q.w > 0 && q.h > 0);

      // --- Ritmo base: si todos los pasos, en orden y con sus viajes, no caben en el tope, se comprimen parejo (K). ---
      const fin0 = [null, null, null];
      let maxFin = 0;
      pasos.forEach((st) => {
        st.n = cursor(st.c);
        let ini = OFF + st.t;
        if (st.n >= 0) {
          const [, x0, y0] = st.ruta[0];
          const ant = fin0[st.n];
          ini = Math.max(ini, ant ? ant.t + viaje(Math.hypot(x0 - ant.x, y0 - ant.y)) : 90);
          const u = st.ruta[st.ruta.length - 1];
          fin0[st.n] = { t: ini + st.dur, x: u[1], y: u[2] };
        }
        maxFin = Math.max(maxFin, ini + st.dur);
      });
      const LIM = tope - SALIDA - 40; // ms: todo paso termina antes de esto
      const K = Math.min(1, LIM / maxFin);
      const T0 = performance.now();
      const ahora = () => performance.now() - T0;

      // --- Cursores (se crean con el primer paso que de verdad se ve) ---
      const cur = [null, null, null];
      // Un paso sale con cursor si su punto de partida ya está a la vista (con margen para que se vean la flecha y la etiqueta). Si más adelante el
      // recorrido pasa de la pantalla, el cursor simplemente sale de ella siguiendo la pieza; nunca se pega al borde.
      const dentro = (puntos) => {
        const q = s.getBoundingClientRect();
        const [, x, y] = puntos[0];
        return q.top + y >= BARRA + 8 && q.top + y <= innerHeight - 60 && q.left + x >= -30 && q.left + x <= innerWidth + 30; // la punta se acerca al borde pero no se pega (ver enX)
      };
      const anim = (el, kf, op, pseudo) => {
        const a = el.animate(kf, { fill: "both", easing: "linear", ...op, ...(pseudo ? { pseudoElement: pseudo } : {}) });
        animaciones.push(a);
        return a;
      };
      const CANDIDATAS = (w, hg) => [[0, 0], [-(w + 19), 0], [0, -(hg + 26)], [-(w + 19), -(hg + 26)], [0, 38], [-(w + 19), 38]];
      // La etiqueta no pasa sobre un título (con 16 px de aire) ni se sale de la pantalla por los lados.
      const choca = (l, t, w, hg) => caja.left + l < 4 || caja.left + l + w > innerWidth - 4 || titulos.some((q) => l < q.r + 16 && l + w > q.l - 16 && t < q.b + 16 && t + hg > q.t - 16);
      function crear(n, x, y) {
        const c = crearCursor(ROLES[n]);
        capa.append(c.el);
        const q = c.etiqueta.getBoundingClientRect();
        cur[n] = { c, x, y, w: q.width, hg: q.height, cand: 0, nuevo: true };
        return cur[n];
      }

      let finDe = 0; // ms (reloj de la sección) en que termina el último paso que ya salió

      /* Hace un paso: las piezas y, si va con cursor, su recorrido, todo desde los mismos tiempos (ms de la sección, escalados por kk). */
      function hacer(st, kk, conCursor, vj) {
        const durK = Math.max(1, st.dur * kk);
        const viajeK = conCursor ? vj * kk : 0; // las piezas esperan a que el cursor llegue
        finDe = Math.max(finDe, ahora() + viajeK + durK);
        st.partes.forEach((pt) => {
          const d = pt.dur === undefined ? st.dur - (pt.dt || 0) : pt.dur;
          anim(pt.host, pt.kf, { delay: viajeK + (pt.dt || 0) * kk, duration: Math.max(1, d * kk), easing: pt.easing || "linear" }, pt.pseudo);
        });
        if (!conCursor) return;
        let k = cur[st.n];
        const [, x0, y0] = st.ruta[0];
        if (!k) {
          const q = s.getBoundingClientRect();
          k = crear(st.n, Math.min(Math.max(x0 + 90, 8), innerWidth - q.left - 40), y0 + (q.top + y0 - 40 >= BARRA ? -40 : 40));
        }
        const D = viajeK + durK;
        const pts = [[0, k.x, k.y]];
        // La punta nunca se pega al borde de la pantalla (la línea sí llega hasta el final): se queda a 22 px.
        const qx = s.getBoundingClientRect().left;
        const enX = (x) => Math.min(Math.max(x, 10 - qx), innerWidth - 22 - qx);
        st.ruta.forEach(([dt, x, y], i) => pts.push([viajeK + (i === 0 ? 0 : dt * kk), enX(x), y]));
        const ult = pts[pts.length - 1];
        if (ult[0] < D) pts.push([D, ult[1], ult[2]]);
        anim(k.c.el, pts.map(([t, x, y]) => ({ transform: `translate(${Math.round(x)}px, ${Math.round(y)}px)`, offset: Math.min(1, t / D) })), { duration: D, fill: "forwards" });
        if (k.nuevo) {
          k.nuevo = false;
          anim(k.c.el, { opacity: [0, 1] }, { duration: Math.min(90, D), fill: "both" });
        }
        // Etiqueta: cambia de lado (o se oculta) en saltos para no pasar sobre un título; se decide por muestras cada ~10 ms.
        const cand = CANDIDATAS(k.w, k.hg);
        const marcos = [];
        const nm = Math.max(1, Math.ceil(D / 10));
        const en = (t) => {
          for (let i = 1; i < pts.length; i++) {
            if (t <= pts[i][0] || i === pts.length - 1) {
              const a = pts[i - 1];
              const b = pts[i];
              const f = b[0] === a[0] ? 1 : Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
              return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
            }
          }
          return [pts[0][1], pts[0][2]];
        };
        let ci = k.cand;
        for (let j = 0; j <= nm; j++) {
          const [x, y] = en((D * j) / nm);
          const [x2, y2] = en(Math.min(D, (D * (j + 1)) / nm));
          const libre = (idx) => [[x, y], [x2, y2]].every(([px, py]) => !choca(px + 15 + cand[idx][0], py + 20 + cand[idx][1], k.w, k.hg));
          const el = libre(ci) ? ci : cand.findIndex((_, idx) => libre(idx));
          if (el >= 0) ci = el;
          marcos.push({ offset: j / nm, transform: `translate(${cand[ci][0]}px, ${cand[ci][1]}px)`, opacity: el >= 0 ? 1 : 0, easing: "steps(1, jump-end)" });
        }
        k.cand = ci;
        anim(k.c.etiqueta, marcos, { duration: D, fill: "forwards" });
        k.x = ult[1];
        k.y = ult[2];
      }

      const colas = [[], [], []];
      const aparte = [];
      pasos.forEach((st) => (st.n >= 0 ? colas[st.n] : aparte).push(st));
      colas.forEach((q) => q.sort((a, b) => a.t - b.t));
      let forzado = false;
      let cerrando = false;
      const pendiente = () => colas.some((q) => q.length) || aparte.length;
      function cerrar() {
        if (cerrando || pendiente()) return;
        cerrando = true;
        const espera = Math.max(0, finDe - ahora());
        relojes.add(setTimeout(() => cur.forEach((k) => k && anim(k.c.el, { opacity: [1, 0] }, { duration: SALIDA, fill: "forwards" })), espera));
        relojes.add(setTimeout(terminar, espera + SALIDA + 40));
      }
      /* Cada cursor toma, en orden, el primer paso suyo que YA está a la vista; si no hay ninguno espera a que el scroll lo traiga. */
      function impulsar(n) {
        if (hecho || apagado || forzado) return;
        const cola = colas[n];
        if (!cola.length) return cerrar();
        const t = ahora();
        const st = cola.find((x) => OFF + x.t <= t + 1 && dentro(x.ruta));
        if (!st) {
          relojes.add(setTimeout(() => impulsar(n), 30));
          return;
        }
        cola.splice(cola.indexOf(st), 1);
        const k = cur[n];
        const [, x0, y0] = st.ruta[0];
        const vj = k ? viaje(Math.hypot(x0 - k.x, y0 - k.y)) : 90;
        const kk = Math.min(K, (LIM - t) / (vj + st.dur));
        if (kk < 0.3) {
          hacer(st, Math.max(0.05, (LIM - t) / st.dur), false, 0); // ya no cabe con cursor: se arma sola, rápido
          return impulsar(n);
        }
        hacer(st, kk, true, vj);
        relojes.add(setTimeout(() => impulsar(n), (vj + st.dur) * kk));
      }
      sesiones.add(s);
      saltarMostrar();
      colas.forEach((_, n) => relojes.add(setTimeout(() => impulsar(n), OFF)));
      aparte.forEach((st) => relojes.add(setTimeout(() => (aparte.splice(aparte.indexOf(st), 1), hacer(st, K, false, 0), cerrar()), OFF + st.t)));
      // Lo que a ese punto siga sin hacerse (no entró en pantalla a tiempo) se arma solo, de golpe y rápido: nada queda a medias ni con un cursor pegado a un borde.
      relojes.add(
        setTimeout(() => {
          forzado = true;
          const quedan = [...colas.flat(), ...aparte];
          colas.forEach((q) => (q.length = 0));
          aparte.length = 0;
          quedan.forEach((st) => hacer(st, Math.max(0.05, Math.min(K, (LIM - ahora()) / st.dur)), false, 0));
          cerrar();
        }, LIM - 70),
      );
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
      // Dispara cuando el borde superior de la sección ya entró ~10 % de la altura de la pantalla; al llegar al final de la página, lo que se vea aunque sea menos.
      const visible = Math.min(q.bottom, alto) - Math.max(q.top, BARRA);
      if (visible > 0 && (q.top <= alto * DISPARO || alFinal)) animar(x);
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
  // El borde inferior del área observada sube 10 %: el aviso llega justo cuando el borde superior de la sección cruza esa línea.
  ojo = new IntersectionObserver(revisar, { threshold: umbrales, rootMargin: "0px 0px -10% 0px" });
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
