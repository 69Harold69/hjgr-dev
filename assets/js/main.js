/*
 * main.js: las animaciones del sitio, sin librerías y solo con transform, opacity y clip-path. Los cursores (Procesos, Backend, Soporte) arman:
 *   1. El hero, en cada carga, en la primera pantalla (lo decide inicio.js, que pone js-entrada en <html>). El titular y su
 *      párrafo NO participan: se ven desde el primer pintado (el LCP es el H1). Arman solo la hoja, los botones y la línea
 *      naranja. Dura 3.9 s; scroll, toque o tecla (menos Tab, salvo que el foco entre al hero) la terminan al instante.
 *   2. Cada sección, una sola vez por carga, cuando entra en pantalla (#31): líneas, bordes, marcas de corte, la línea de las
 *      etapas, el resaltado de la fila del diagnóstico y las capturas dentro de su marco. El texto nunca se esconde.
 *      Hasta 4 s de animación por sección en escritorio y 2.5 s en celular (TOPE, TOPE_CEL), con 3 cursores en total en pantalla (2 en celular).
 *      Cada pieza arranca cuando ELLA está a la vista (IntersectionObserver por pieza); las que quedaron arriba se arman al instante; nada se arma por tiempo.
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
  const eventos = ["scroll", "wheel", "touchstart", "pointerdown", "keydown", "resize", "focusin"];
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
    // ...salvo que el foco llegue a algo que la entrada aún oculta (los botones y la hoja del hero): ahí termina al instante.
    if (e && e.type === "focusin" && !(e.target instanceof Element && e.target.closest(".hero"))) return;
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
const SALIDA = 160; // ms: el cursor se desvanece al final
const TOPE = 4000; // ms de animación por sección en escritorio (decisión del dueño: se lee como un dibujo, no como un barrido), con la salida del cursor incluida
const TOPE_CEL = 2500; // ms en celular
const KMAX = 3; // una sección con pocos pasos no se estira más de 3 veces su ritmo base
const PAUSA = 110; // ms: pausa breve del cursor entre una pieza y la siguiente (a ritmo 1)
const PASO_MAX = 700; // ms: ningún paso dura más que esto (así un cursor cede su lugar a otra pieza a la vista en menos de ~1 s)
const GRACIA = 450; // ms: un cursor sin pieza a la vista espera esto antes de irse
const VIAJE_K = 1.6; // el viaje del cursor entre piezas no se estira más que esto
const MAX_CURSORES = (chico) => (chico ? 2 : 3); // cursores a la vez en TODA la pantalla (cola global)
const BARRA = 88; // px: la barra fija (72) y el aire que las anclas le dejan (scroll-padding-top): lo que queda detrás de ella cuenta como «atrás»
const DISPARO = 0.9; // la sección queda «activa» cuando su borde superior ya entró ~10 % de la altura de la pantalla; cada pieza arranca cuando ELLA está a la vista
const AIRE_ABAJO = 60; // px: una pieza cuenta como «a la vista» si entra en la pantalla sin tocar los últimos 40 px ni la barra
const viaje = (d) => Math.min(130, Math.max(35, d * 0.45)); // ms que tarda un cursor en llegar al inicio del siguiente paso, según la distancia

const paso = (c, t, dur, ruta, partes) => ({ c, t, dur, ruta, partes });
const linea = (c, host, pseudo, t, dur, x0, x1, y, eje = "scaleX") => paso(c, t, dur, [[0, x0, y], [dur, x1, y]], [{ host, pseudo, kf: { transform: [`${eje}(0)`, `${eje}(1)`] } }]);

/* Une dos pasos en uno (el cursor termina el primero, viaja un momento y sigue con el segundo): menos pausas y menos entradas y salidas de cursor. */
function unir(a, b, gap = 70) {
  const off = a.dur + gap;
  const partes = a.partes.map((x) => ({ ...x, dur: x.dur === undefined ? a.dur - (x.dt || 0) : x.dur }));
  b.partes.forEach((x) => partes.push({ ...x, dt: (x.dt || 0) + off, dur: x.dur === undefined ? b.dur - (x.dt || 0) : x.dur }));
  return paso(a.c, a.t, off + b.dur, [...a.ruta, ...b.ruta.map(([t, x, y, e]) => [t + off, x, y, e])], partes);
}
/* Agrupa pasos de dos en dos (cada par con el cursor que le toque: de dos en dos y alternando). */
const pares = (lista, c0 = 0, alterna = 2) => {
  const r = [];
  for (let i = 0; i < lista.length; i += 2) {
    const u = lista[i + 1] ? unir(lista[i], lista[i + 1]) : lista[i];
    u.c = (c0 + (i / 2) % alterna) % 3;
    r.push(u);
  }
  return r;
};

/* Tarjeta u hoja de una sola pasada: el cursor recorre el borde (cuatro lados, cada uno se dibuja detrás de la punta), después aparece la sombra
   (capa con opacidad) y, si la tarjeta lleva marcas de corte, el cursor pasa por cada esquina y la marca se pega ahí. */
function tarjeta(h, c, t, el, marcas = []) {
  const q = h.r(el);
  const T = 85; // ms por lado
  const S = 110; // ms de la sombra
  const M = 70; // ms por marca
  // El borde se dibuja con el MISMO anillo final (caja de la tarjeta, mismo radio, box-shadow de 1 px) recortado con clip-path por una banda por lado:
  // al terminar coincide con el anillo real, esquinas redondeadas incluidas.
  const w = q.w;
  const hg = q.h;
  const anillo = (kf, dt) => ({ host: h.capa("arma-capa--anillo", q.l, q.t, w, hg), kf: { clipPath: kf }, dt, dur: T });
  const partes = [
    anillo([`inset(-2px ${w + 2}px ${hg - 4}px -2px)`, `inset(-2px -2px ${hg - 4}px -2px)`], 0),
    anillo([`inset(-2px -2px ${hg + 2}px ${w - 4}px)`, `inset(-2px -2px -2px ${w - 4}px)`], T),
    anillo([`inset(${hg - 4}px -2px -2px ${w + 2}px)`, `inset(${hg - 4}px -2px -2px -2px)`], 2 * T),
    anillo([`inset(${hg + 2}px ${w - 4}px -2px -2px)`, `inset(-2px ${w - 4}px -2px -2px)`], 3 * T),
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
      const filas = [...ol.querySelectorAll(".problemas__fila")].map((f, i) => {
        const q = h.r(f);
        return linea(1, f, "::after", 60 + i * 60, 330, q.l, q.r, q.b);
      });
      return v.concat(pares(filas, 1));
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
      const lineas = [];
      filas.forEach((f, i) => {
        const q = h.r(f);
        lineas.push(linea(1, f, "::before", 60 + i * 70, 260, q.l, q.r, q.t));
        if (i === filas.length - 1) lineas.push(linea(1, f, "::after", 60 + i * 70 + 90, 260, q.l, q.r, q.b));
      });
      return v.concat(pares(lineas, 1));
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
        const diag = paso(2, i * 20, 300, [[0, marco.l, marco.t], [300, marco.r, marco.b]], [{ host: img, kf: { clipPath: ["polygon(0 0, 0 0, 0 0)", "polygon(0 0, 200% 0, 0 200%)"] } }]);
        const cuerpo = card.querySelector(".captura__cuerpo");
        if (cuerpo) {
          const c = h.r(cuerpo);
          v.push(unir(diag, linea(2, cuerpo, "::before", 60 + i * 20, 160, c.l, c.r, c.t), 50));
        } else v.push(diag);
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
        const tj = tarjeta(h, i % 2, 0, p);
        const q = h.r(p);
        const cs = getComputedStyle(p);
        const y = q.t + parseFloat(cs.paddingTop) + parseFloat(getComputedStyle(p, "::before").height) + parseFloat(getComputedStyle(p, "::before").paddingBottom);
        v.push(unir(tj, linea(2, p, "::after", 40 + i * 20, 200, q.l + parseFloat(cs.paddingLeft), q.r - parseFloat(cs.paddingRight), y), 60));
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
      // Las líneas se trazan de dos en dos, en serpentina (una de izquierda a derecha y la siguiente de derecha a izquierda); los pares se reparten entre dos cursores.
      const trazos = lineas.map(([y, clase], i) => {
        const atras = i % 2 === 1;
        const host = h.capa(`${clase} ${atras ? "arma-capa--der" : ""}`.trim(), tq.l, y, tq.w, 1);
        return paso(0, 0, 200, atras ? [[0, tq.r, y], [200, tq.l, y]] : [[0, tq.l, y], [200, tq.r, y]], [{ host, kf: { transform: ["scaleX(0)", "scaleX(1)"] } }]);
      });
      pares(trazos, 0).forEach((u) => v.push(u));
      const fila = s.querySelector(".tabla__destacada");
      const f = h.r(fila);
      const dur = 420;
      if (matchMedia("(max-width: 639.98px)").matches) {
        v.push(paso(2, 0, dur, [[0, f.l, f.cy], [dur, f.r, f.cy]], [
          { host: fila, pseudo: "::before", kf: { clipPath: ["inset(0 100% 0 0)", "inset(0 0 0 0)"] }, dt: 0, dur: dur / 2 },
          { host: fila, pseudo: "::after", kf: { clipPath: ["inset(0 100% 0 0)", "inset(0 0 0 0)"] }, dt: dur / 2, dur: dur / 2 },
        ]));
      } else {
        const partes = [...fila.children].map((celda) => {
          const q = h.r(celda);
          return { host: celda, pseudo: "::after", kf: { clipPath: ["inset(0 100% 0 0)", "inset(0 0 0 0)"] }, dt: ((q.l - f.l) / f.w) * dur, dur: (q.w / f.w) * dur };
        });
        v.push(paso(2, 0, dur, [[0, f.l, f.cy], [dur, f.r, f.cy]], partes));
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
      const items = [...faq.querySelectorAll(".faq__item")].map((it, i) => {
        const q = h.r(it);
        return linea(1, it, "::after", 60 + i * 60, 280, q.l, q.r, q.b);
      });
      return v.concat(pares(items, 1));
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
  const esChico = () => matchMedia("(max-width: 767.98px)").matches; // mismo corte que usa el sitio para las etapas; se reevalúa en cada sección y al cambiar el tamaño
  const lista = [];
  document.querySelectorAll("main > section:not(.hero)").forEach((s) => {
    const p = PLANES.find((x) => s.querySelector(x.busca) || s.matches(x.busca));
    if (p) lista.push({ s, p });
  });
  if (!lista.length) return;
  html.classList.add("secciones-activa"); // avisa a inicio.js: su respaldo de 4 s ya no corre

  const pendientes = new Map(lista.map((x) => [x.s, x]));
  const vivas = new Map(); // sección activa -> { terminar, empujar, final }
  let ojo = null;
  let ocupados = 0; // cursores con lugar ocupado en TODA la página (cola global: celular 2, escritorio 3)
  // Cola global: los cursores que ya tienen lugar siguen con lo suyo (o lo ceden si otra pieza espera hace más tiempo) y los lugares libres
  // se reparten por orden de llegada de la pieza (la que lleva más esperando a la vista va primero), sea de la sección que sea.
  const despertar = () => {
    const todas = [...vivas.values()];
    todas.forEach((v) => v.empujar());
    while (ocupados < MAX_CURSORES(esChico())) {
      const c = todas.flatMap((v) => v.espera()).sort((a, b) => a.st.tLista - b.st.tLista)[0];
      if (!c) break;
      c.v.arrancar(c.n);
    }
  };

  const armadaYa = (s) => {
    const v = vivas.get(s);
    if (v) v.terminar();
    pendientes.delete(s);
    if (ojo) ojo.unobserve(s);
    s.classList.add("armada");
  };

  /* Una sección ACTIVA (su borde superior pasó del ~10 %) no arma nada por tiempo: cada PASO (pieza o grupo de piezas) tiene un centinela
     que observa un IntersectionObserver propio y espera a que SU pieza esté a la vista. Entonces pide cursor a la cola global y se arma con él.
     Si la pieza ya quedó arriba de la pantalla se arma al instante, sin cursor. Una pieza que sigue abajo espera sin armar. */
  function animar({ s, p }) {
    pendientes.delete(s);
    if (ojo) ojo.unobserve(s);
    const chico = esChico();
    const tope = chico ? TOPE_CEL : TOPE;
    const animaciones = [];
    const relojes = new Set();
    const observadores = [];
    const capa = document.createElement("div");
    capa.className = "cursores-seccion";
    capa.setAttribute("aria-hidden", "true");
    const cur = [null, null, null];
    const tiene = [false, false, false]; // el cursor n tiene un lugar en la cola global
    const ocupado = [false, false, false]; // el cursor n está en un paso (o en su pausa)
    const saliendo = [false, false, false];
    const gracia = [0, 0, 0]; // temporizador: un cursor sin pieza a la vista espera un momento antes de irse (si llega otra, sigue sin salir y volver a entrar)
    let hecho = false;
    let cerrando = false;
    let pasos = [];
    const terminar = () => {
      if (hecho) return;
      hecho = true;
      relojes.forEach(clearTimeout);
      observadores.forEach((o) => o.disconnect());
      tiene.forEach((t, n) => {
        if (t) ocupados--;
        tiene[n] = false;
      });
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
      despertar();
    };
    const sesion = { terminar, empujar: () => {}, espera: () => [], arrancar: () => {}, final: () => {}, limpiar: () => {}, arriba: () => {} };
    vivas.set(s, sesion);
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
      pasos = p.plan(s, h);
      pasos.forEach((st) => (st.n = st.c < 0 ? -1 : chico ? st.c % 2 : st.c));
      pasos.sort((a, b) => a.t - b.t);
      // Títulos de la sección: las etiquetas de los cursores no pasan por encima de ellos.
      const titulos = [...s.querySelectorAll("h2, h3, .nombre")].map(h.r).filter((q) => q.w > 0 && q.h > 0);

      // --- Ritmo: la suma de lo que dura cada paso (viaje + dibujo) cabe en el tope de la sección.
      // Si los pasos base caben con holgura, se estiran (hasta KMAX) para que se lea como un dibujo; si no caben, se comprimen parejo. ---
      const escala = (st, K) => Math.min(K, PASO_MAX / st.dur); // escala de un paso: el ritmo de la sección, sin pasar de PASO_MAX ms
      const duracion = (K) => {
        // La suma del tiempo de animación de la sección: el viaje del cursor a cada pieza más lo que tarda en dibujarla (los cursores se reparten las piezas,
        // pero con piezas que llegan una a una o con la cola global llena corren una tras otra, así que se cuenta todo como si fuera en fila).
        const fin = [null, null, null];
        let suma = 0;
        pasos.forEach((st) => {
          const ant = st.n >= 0 ? fin[st.n] : null;
          const [, x0, y0] = st.ruta[0];
          const vj = (ant ? viaje(Math.hypot(x0 - ant.x, y0 - ant.y)) : 60) * Math.min(K, VIAJE_K);
          suma += vj + st.dur * escala(st, K);
          if (st.n >= 0) fin[st.n] = { x: st.ruta[st.ruta.length - 1][1], y: st.ruta[st.ruta.length - 1][2] };
        });
        return suma;
      };
      const LIM = (tope - SALIDA - 40) * 0.88; // el resto del tope: la salida de los cursores (entre piezas muy espaciadas cada cursor sale y vuelve a entrar) // ms: con todo a la vista el último paso termina antes de esto; el resto del tope se lo llevan los viajes a una pieza nueva y la salida de cada cursor
      let K = KMAX;
      if (duracion(K) > LIM) {
        let lo = 0.1;
        let hi = KMAX;
        for (let i = 0; i < 14; i++) {
          const mid = (lo + hi) / 2;
          if (duracion(mid) > LIM) hi = mid;
          else lo = mid;
        }
        K = lo;
      }
      const pausa = PAUSA * Math.min(K, 1.5);

      let actual = null; // paso que está creando sus animaciones (para poder terminarlas de golpe)
      const anim = (el, kf, op, pseudo) => {
        const a = el.animate(kf, { fill: "both", easing: "linear", ...op, ...(pseudo ? { pseudoElement: pseudo } : {}) });
        animaciones.push(a);
        if (actual) actual.anims.push(a);
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

      /* Hace un paso: las piezas y, si va con cursor, su recorrido, todo desde los mismos tiempos (ms del paso, escalados por kk; viajeK es lo que
         tarda el cursor en llegar y las piezas esperan a que llegue). */
      function hacer(st, kk, viajeK, conCursor) {
        const durK = Math.max(1, st.dur * kk);
        st.partes.forEach((pt) => {
          const d = pt.dur === undefined ? st.dur - (pt.dt || 0) : pt.dur;
          anim(pt.host, pt.kf, { delay: viajeK + (pt.dt || 0) * kk, duration: Math.max(1, d * kk), easing: pt.easing || "linear" }, pt.pseudo);
        });
        if (!conCursor) return;
        let k = cur[st.n];
        const [, x0, y0] = st.ruta[0];
        if (!k) {
          const q = s.getBoundingClientRect();
          k = crear(st.n, Math.min(Math.max(x0 + 60, 8), innerWidth - q.left - 40), y0 + (q.top + y0 - 40 >= BARRA ? -40 : 40));
        }
        const D = viajeK + durK;
        const pts = [[0, k.x, k.y]];
        // La punta nunca se pega al borde de la pantalla (la línea sí llega hasta el final): se queda a 22 px.
        const qx = s.getBoundingClientRect().left;
        const enX = (x) => Math.min(Math.max(x, 10 - qx), innerWidth - 22 - qx);
        const qy = s.getBoundingClientRect().top;
        const enY = (y) => Math.min(Math.max(y, BARRA - 8 - qy), innerHeight - 24 - qy); // tampoco se pega al borde de arriba ni al de abajo (el trazo de una pieza alta sigue fuera de la pantalla)
        let tPrev = 0;
        st.ruta.forEach(([dt, x, y], i) => {
          tPrev = Math.max(tPrev, viajeK + (i === 0 ? 0 : dt * kk)); // los tiempos nunca retroceden (las marcas de etapas pueden ir fuera de orden)
          pts.push([tPrev, enX(x), enY(y)]);
        });
        const ult = pts[pts.length - 1];
        if (ult[0] < D) pts.push([D, ult[1], ult[2]]);
        const Dm = Math.max(D, ult[0]);
        anim(k.c.el, pts.map(([t, x, y]) => ({ transform: `translate(${Math.round(x)}px, ${Math.round(y)}px)`, offset: Math.min(1, t / Dm) })), { duration: D, fill: "forwards" });
        if (k.nuevo) {
          k.nuevo = false;
          anim(k.c.el, { opacity: [0, 1] }, { duration: Math.min(90, D), fill: "both" });
        }
        // Etiqueta: cambia de lado (o se oculta) en saltos para no pasar sobre un título; se decide por muestras cada ~10 ms.
        const cand = CANDIDATAS(k.w, k.hg);
        const marcos = [];
        const nm = Math.max(1, Math.ceil(D / 8));
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
          const [xm, ym] = en((D * (j + 0.5)) / nm);
          const libre = (idx) => [[x, y], [xm, ym], [x2, y2]].every(([px, py]) => !choca(px + 15 + cand[idx][0], py + 20 + cand[idx][1], k.w, k.hg));
          const el = libre(ci) ? ci : cand.findIndex((_, idx) => libre(idx));
          if (el >= 0) ci = el;
          marcos.push({ offset: j / nm, transform: `translate(${cand[ci][0]}px, ${cand[ci][1]}px)`, opacity: el >= 0 ? 1 : 0, easing: "steps(1, jump-end)" });
        }
        k.cand = ci;
        anim(k.c.etiqueta, marcos, { duration: D, fill: "forwards" });
        k.x = ult[1];
        k.y = ult[2];
      }

      const marcar = (st, estado) => {
        st.estado = estado;
        st.cent.dataset.estado = estado; // solo para las pruebas (el centinela es aria-hidden y no pinta)
      };
      const todos = () => pasos.every((st) => st.estado === "hecha" || st.estado === "arriba");
      function cerrar() {
        if (cerrando || !todos()) return;
        cerrando = true;
        [0, 1, 2].forEach(retirar);
        relojes.add(setTimeout(terminar, SALIDA + 60));
      }
      /* El cursor n se desvanece y deja su lugar en la cola global. */
      function retirar(n, rapido = false) {
        const k = cur[n];
        if (!k) return;
        cur[n] = null;
        saliendo[n] = true;
        anim(k.c.el, { opacity: [1, 0] }, { duration: rapido ? 1 : SALIDA, fill: "forwards" });
        relojes.add(
          setTimeout(() => {
            k.c.el.remove();
            saliendo[n] = false;
            if (tiene[n]) {
              tiene[n] = false;
              ocupados--;
            }
            despertar();
          }, SALIDA + 10),
        );
      }
      function ejecutar(st, n) {
        marcar(st, "corre");
        st.io.disconnect();
        const k = cur[n];
        const [, x0, y0] = st.ruta[0];
        // Si varias piezas a la vista esperan a este cursor, sus pasos se aprietan (hasta un 40 %) para que la última no espere más de ~1 s.
        const cola = pasos.filter((x) => x.n === n && x.estado === "lista" && x !== st);
        const espera = cola.reduce((t, x) => t + x.dur * escala(x, K) + pausa + 60, 0);
        const ks0 = escala(st, K);
        const ks = Math.max(Math.min(ks0, 220 / st.dur), ks0 * Math.min(1, Math.max(0.4, 1000 / Math.max(1, espera + st.dur * ks0)))); // nunca por debajo de ~220 ms de dibujo
        const vj = (k ? viaje(Math.hypot(x0 - k.x, y0 - k.y)) : 60) * Math.min(K, VIAJE_K);
        st.anims = [];
        actual = st;
        hacer(st, ks, vj, true);
        actual = null;
        ocupado[n] = true;
        const alFinal = () => {
          marcar(st, "hecha");
          if (todos()) return cerrar();
          relojes.add(
            setTimeout(() => {
              ocupado[n] = false;
              despertar(); // este cursor sigue o cede su lugar, y otra sección pudo quedar esperando
            }, pausa * Math.min(1, ks / ks0)), // con piezas esperando la pausa también se acorta
          );
        };
        st.reloj = setTimeout(alFinal, vj + st.dur * ks);
        relojes.add(st.reloj);
        // El lector dejó de bajar y esta pieza quedó fuera de la pantalla a medio dibujar: se termina de golpe (sin cursor visible apuntando a un lugar que no se ve).
        st.apurar = () => {
          clearTimeout(st.reloj);
          st.anims.forEach((a) => {
            try {
              a.finish();
            } catch (e) {
              /* nada */
            }
          });
          marcar(st, "hecha");
          ocupado[n] = false;
          if (todos()) return cerrar();
          retirar(n, true);
        };
      }
      /* Pieza que quedó arriba de la pantalla (o fuera de la cola): se arma al instante, sin cursor. */
      function instante(st) {
        marcar(st, "arriba");
        hacer(st, 0, 0, false);
        if (todos()) relojes.add(setTimeout(cerrar, 60));
      }
      const siguiente = (n) => pasos.find((x) => x.n === n && x.estado === "lista");
      /* Cursores que ya tienen lugar: toman, en orden, el primer paso suyo cuya pieza ya está a la vista; si no hay ninguno se retiran, y si otra
         pieza lleva más tiempo esperando un lugar, ceden el suyo. */
      sesion.empujar = () => {
        if (hecho || apagado || cerrando) return;
        for (let n = 0; n < 3; n++) {
          if (!tiene[n] || ocupado[n] || saliendo[n]) continue;
          const st = siguiente(n);
          if (st && ![...vivas.values()].some((v) => v.espera().some((c) => c.st.tLista < st.tLista))) {
            clearTimeout(gracia[n]);
            gracia[n] = 0;
            ejecutar(st, n);
            continue;
          }
          const otraEspera = [...vivas.values()].some((v) => v.espera().length);
          const q = cur[n] && cur[n].c.el.getBoundingClientRect();
          const enPantalla = q && q.top > BARRA && q.bottom < innerHeight && q.right > 0 && q.left < innerWidth;
          if (st || otraEspera || !enPantalla) {
            retirar(n); // cede su lugar, o se quedó fuera de la pantalla
          } else if (!gracia[n]) {
            gracia[n] = setTimeout(() => {
              gracia[n] = 0;
              if (!hecho && !ocupado[n] && !siguiente(n)) retirar(n);
            }, GRACIA);
            relojes.add(gracia[n]);
          }
        }
        pasos.filter((x) => x.n < 0 && x.estado === "lista").forEach((st) => {
          marcar(st, "corre");
          hacer(st, K, 0, false);
          relojes.add(setTimeout(() => (marcar(st, "hecha"), cerrar()), st.dur * K));
        });
      };
      /* Pasos que esperan un lugar de la cola global (su pieza ya está a la vista y su cursor está libre). */
      sesion.espera = () => {
        if (hecho || apagado || cerrando) return [];
        const r = [];
        for (let n = 0; n < 3; n++) {
          if (tiene[n] || ocupado[n] || saliendo[n]) continue;
          const st = siguiente(n);
          if (st) r.push({ v: sesion, n, st });
        }
        return r;
      };
      // Un cursor ocioso que quedó fuera de la pantalla (el lector siguió bajando) se va.
      sesion.limpiar = () => {
        if (hecho || cerrando) return;
        for (let n = 0; n < 3; n++) {
          if (tiene[n] && ocupado[n] && cur[n]) {
            const st = pasos.find((x) => x.n === n && x.estado === "corre");
            const q = cur[n].c.el.getBoundingClientRect();
            if (st && st.apurar && (q.top < BARRA - 14 || q.top > innerHeight - 12 || q.left < -2 || q.left > innerWidth - 10)) st.apurar();
            continue;
          }
          if (!tiene[n] || ocupado[n] || saliendo[n] || !cur[n] || siguiente(n)) continue;
          const q = cur[n].c.el.getBoundingClientRect();
          if (!(q.top > BARRA && q.bottom < innerHeight && q.right > 0 && q.left < innerWidth)) retirar(n, true); // en el borde de la pantalla: se va sin desvanecerse
        }
      };
      // Un salto de scroll (ancla, fin, un gesto rápido) puede llevar una pieza de abajo a arriba sin pasar por la zona que ve el IntersectionObserver
      // y entonces no avisa: al detenerse el scroll se revisan las piezas que siguen esperando.
      sesion.arriba = () => {
        if (hecho) return;
        pasos.forEach((st) => {
          if (st.estado !== "espera" && st.estado !== "lista") return;
          const q = st.cent.getBoundingClientRect();
          if (q.bottom <= BARRA + 8) {
            st.io.disconnect();
            instante(st);
          }
        });
      };
      sesion.arrancar = (n) => {
        const st = siguiente(n);
        if (!st) return;
        tiene[n] = true;
        ocupados++;
        ejecutar(st, n);
      };

      /* Un centinela por paso: una caja sobre el recorrido de la pieza. «A la vista» = la pieza (o, si es muy alta, sus primeros ~140 px) entra en la
         pantalla sin la barra fija de arriba ni los últimos 60 px. */
      const listoPaso = (st) => {
        if (st.estado !== "espera") return;
        marcar(st, "lista");
        st.tLista = performance.now(); // el IO sigue observando: si antes de su turno la pieza sale de la pantalla, se arma al instante o vuelve a esperar
        despertar();
      };
      pasos.forEach((st) => {
        st.estado = "espera";
        const xs = st.ruta.map((r) => r[1]);
        const ys = st.ruta.map((r) => r[2]);
        const l = Math.min(...xs);
        const t = Math.min(...ys);
        const w = Math.max(4, Math.max(...xs) - l);
        const hg = Math.max(4, Math.max(...ys) - t);
        const c = document.createElement("div");
        c.className = "arma-centinela";
        c.style.left = `${l}px`;
        c.style.top = `${t - (hg - (Math.max(...ys) - t)) / 2}px`;
        c.style.width = `${w}px`;
        c.style.height = `${hg}px`;
        c.dataset.estado = "espera";
        capa.append(c);
        st.cent = c;
        const T = Math.min(0.98, Math.min(hg, 140) / hg);
        st.io = new IntersectionObserver(
          (es) => {
            const e = es[es.length - 1];
            if (st.estado !== "espera" && st.estado !== "lista") return;
            if (e.isIntersecting && e.intersectionRatio >= T - 0.02) return listoPaso(st);
            const raiz = e.rootBounds;
            if (raiz && e.boundingClientRect.top < raiz.top && e.boundingClientRect.bottom <= raiz.top + Math.min(hg, 140)) {
              // Quedó arriba de la pantalla (aunque ya hubiera estado a la vista esperando su turno): se arma al instante.
              st.io.disconnect();
              instante(st);
            } else if (st.estado === "lista") marcar(st, "espera"); // volvió a salir por abajo: vuelve a esperar a que la vean
          },
          { rootMargin: `-${BARRA + 8}px 0px -${AIRE_ABAJO}px 0px`, threshold: [0, T] },
        );
        observadores.push(st.io);
        st.io.observe(c);
      });
      // Al final de la página lo que ya no puede subir más se arma donde está, con su cursor (un scroll que se detiene revisa una sola vez).
      sesion.final = () => {
        if (hecho) return;
        pasos.forEach((st) => {
          if (st.estado !== "espera") return;
          const q = st.cent.getBoundingClientRect();
          if (q.bottom <= BARRA + 8) {
            st.io.disconnect();
            instante(st);
          } else if (q.top < innerHeight - 8) listoPaso(st);
        });
      };
      sesiones.add(s);
      saltarMostrar();
    } catch (e) {
      terminar();
    }
  }

  const alFinal = () => scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
  const revisarFinal = () => {
    if (apagado) return;
    [...vivas.values()].forEach((v) => (v.limpiar(), v.arriba()));
    revisar(); // también por si un salto de scroll pasó de largo una sección sin que su IntersectionObserver avisara
    if (alFinal()) [...vivas.values()].forEach((v) => v.final());
  };
  const revisar = () => {
    if (apagado) return;
    const alto = innerHeight;
    const final = alFinal();
    for (const x of [...pendientes.values()]) {
      const q = x.s.getBoundingClientRect();
      if (q.bottom <= BARRA + 2) {
        armadaYa(x.s); // quedó atrás: se completa al instante
        continue;
      }
      if (html.classList.contains("js-entrada")) continue; // el hero va primero
      // La sección queda activa cuando su borde superior ya entró ~10 % de la altura de la pantalla; al llegar al final de la página, lo que se vea aunque sea menos.
      const visible = Math.min(q.bottom, alto) - Math.max(q.top, BARRA);
      if (visible > 0 && (q.top <= alto * DISPARO || final)) animar(x);
    }
    if (final) [...vivas.values()].forEach((v) => v.final());
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
  // Foco de teclado en una sección sin armar (o armándose): se arma al instante.
  addEventListener(
    "focusin",
    (e) => {
      const s = e.target instanceof Element && e.target.closest("main > section");
      if (s && (pendientes.has(s) || vivas.has(s))) armadaYa(s);
    },
    true,
  );
  // Rotar o redimensionar a mitad: las capas quedarían en coordenadas viejas, así que lo que está en curso se completa al instante
  // (lo que aún no se activó se calcula con el tamaño nuevo y el criterio celular/escritorio se reevalúa al activarse).
  let ancho0 = innerWidth;
  let alto0 = innerHeight;
  addEventListener("resize", () => {
    if (apagado || (innerWidth === ancho0 && Math.abs(innerHeight - alto0) < 150)) return; // la barra de direcciones del celular no cuenta
    ancho0 = innerWidth;
    alto0 = innerHeight;
    [...vivas.values()].forEach((v) => v.terminar());
    revisar();
  });
  // Volver desde la caché de «atrás/adelante»: lo que quedó a medias se completa.
  addEventListener("pageshow", (e) => e.persisted && [...vivas.values()].forEach((v) => v.terminar()));
  // Un scroll que se detiene (una sola revisión, sin lecturas por cuadro): al final de la página arma lo que ya no puede subir más.
  let espera = 0;
  addEventListener(
    "scroll",
    () => {
      clearTimeout(espera);
      espera = setTimeout(revisarFinal, 90);
    },
    { passive: true },
  );

  const umbrales = Array.from({ length: 21 }, (_, i) => i / 20);
  // El borde inferior del área observada sube 10 %: el aviso llega justo cuando el borde superior de la sección cruza esa línea.
  ojo = new IntersectionObserver(revisar, { threshold: umbrales, rootMargin: "0px 0px -10% 0px" });
  lista.forEach((x) => ojo.observe(x.s));
  const pie = document.querySelector("body > footer");
  if (pie) ojo.observe(pie); // llegar al final de la página también revisa lo pendiente
  if (html.classList.contains("js-entrada")) {
    // Mientras corre el hero no se arma nada; al terminar se revisa lo que ya está a la vista.
    const esperaHero = new MutationObserver(() => {
      if (html.classList.contains("js-entrada")) return;
      esperaHero.disconnect();
      revisar();
    });
    esperaHero.observe(html, { attributes: true, attributeFilter: ["class"] });
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
