/*
 * main.js: las dos únicas animaciones del sitio, sin librerías y solo con transform y opacity
 * (más un recorte, clip-path, para «escribir» el titular).
 *   1. Entrada del hero, «un equipo de cursores»: solo primera visita y primera pantalla (lo decide inicio.js,
 *      que pone js-entrada en <html>). Dura 3.9 s; «Saltar», scroll, toque o tecla la terminan al instante.
 *   2. Línea de las seis etapas: se dibuja una vez, cuando #sistemas entra en pantalla.
 * Los estados «ocultos para animar» viven en home.css bajo .js-entrada y .js-etapas. Si algo falla, se quitan
 * las clases y todo queda visible.
 */
const html = document.documentElement;
const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------------------------------------------------------------------------------------
   2. Línea de las seis etapas
   --------------------------------------------------------------------------------------------- */
function etapas() {
  const proceso = document.querySelector(".proceso");
  const linea = proceso && proceso.querySelector(".proceso__linea");
  if (reducido || !linea || !linea.animate || !("IntersectionObserver" in window)) return;
  const marcas = [...proceso.querySelectorAll(".proceso__marca")];
  html.classList.add("js-etapas");

  const dibujar = () => {
    const animaciones = [];
    const terminar = () => {
      animaciones.forEach((a) => a.cancel());
      html.classList.remove("js-etapas");
    };
    try {
      const horizontal = matchMedia("(min-width: 1100px)").matches;
      const eje = horizontal ? "scaleX" : "scaleY";
      const centro = (el) => {
        const r = el.getBoundingClientRect();
        return horizontal ? r.left + r.width / 2 : r.top + r.height / 2;
      };
      const c = marcas.map(centro);
      const largo = Math.max(1, c[c.length - 1] - c[0]);
      const duracion = 1500;
      const raya = linea.animate({ transform: [`${eje}(0)`, `${eje}(1)`] }, { duration: duracion, easing: "linear", fill: "both" });
      animaciones.push(raya);
      marcas.forEach((m, i) => {
        const atraso = Math.min(1, Math.max(0, (c[i] - c[0]) / largo)) * duracion;
        animaciones.push(m.animate({ opacity: [0, 1] }, { duration: 220, delay: atraso, easing: "ease-out", fill: "both" }));
      });
      raya.finished.then(terminar, terminar);
      setTimeout(terminar, duracion + 600); // por si la animación nunca avisa
    } catch (e) {
      terminar();
    }
  };

  const ojo = new IntersectionObserver(
    (entradas) => {
      if (!entradas.some((e) => e.isIntersecting)) return;
      ojo.disconnect();
      dibujar();
    },
    { rootMargin: "0px 0px -20% 0px" },
  );
  ojo.observe(proceso);
}

/* ---------------------------------------------------------------------------------------------
   1. Entrada del hero
   --------------------------------------------------------------------------------------------- */
const TOTAL = 3900; // ms; el encargo fija 4000 como máximo
const SUBE = 12; // px: lo que el CSS desplaza hacia abajo la hoja y los botones mientras están ocultos
const SUAVE = "cubic-bezier(0.2, 0, 0, 1)";
const ROLES = [
  { clase: "procesos", texto: "Procesos" },
  { clase: "diseno", texto: "Diseño" },
  { clase: "backend", texto: "Backend" },
  { clase: "soporte", texto: "Soporte" },
];

function entrada() {
  const hero = document.querySelector(".hero");
  const frases = hero ? [...hero.querySelectorAll(".hero__frase")] : [];
  const hoja = hero && hero.querySelector(".pedido");
  const botones = hero ? [...hero.querySelectorAll(".hero__acciones .boton")] : [];
  const esquinas = hoja ? [...hoja.querySelectorAll(".marcas__esq")] : [];
  const tramos = hoja ? [...hoja.querySelectorAll(".etapas__item:not(:last-child)")] : [];
  const inicio = Number(html.getAttribute("data-entrada"));
  const tarde = performance.now() - inicio > 800; // si el JS llegó muy tarde, no se anima
  if (tarde || !frases.length || !hoja || botones.length < 2 || esquinas.length < 4 || !tramos.length) {
    return abandonar();
  }

  const chico = innerWidth < 600;
  const ancho = innerWidth;
  const alto = innerHeight;
  const animaciones = [];
  const eventos = ["scroll", "wheel", "touchstart", "pointerdown", "keydown", "resize"];
  let hecho = false;
  let reloj = 0;

  /* --- DOM decorativo: se crea aquí, así sin JS no existe --- */
  const NS = "http://www.w3.org/2000/svg";
  const contenedor = document.createElement("div");
  contenedor.className = "entrada";
  contenedor.setAttribute("aria-hidden", "true");
  const cursores = ROLES.map((rol) => {
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
    contenedor.append(el);
    return { el, svg, etiqueta, clase: rol.clase };
  });
  const todos = document.createElement("p");
  todos.className = "entrada__todos";
  todos.textContent = "Todos son Harold";
  contenedor.append(todos);
  const saltar = document.createElement("button");
  saltar.type = "button";
  saltar.className = "entrada__saltar";
  saltar.textContent = "Saltar";
  document.body.append(contenedor, saltar);

  /* --- Cierre: todo vuelve a su estado normal, al instante --- */
  function fin(e) {
    if (e && e.target === saltar && e.type !== "click") return; // el clic de «Saltar» lo atiende su propio manejador
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
    saltar.remove();
    void html.offsetWidth;
    html.classList.remove("js-entrada");
    html.removeAttribute("data-entrada");
    void html.offsetWidth;
    html.classList.remove("entrada-fin");
  }

  try {
    eventos.forEach((n) => addEventListener(n, fin, { capture: true, passive: true }));
    saltar.addEventListener("click", fin);
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

    const [procesos, diseno, backend, soporte] = cursores;

    /* --- Diseño: escribe el titular, una frase tras otra --- */
    const trazos = frases.map((f) => {
      const caja = f.getBoundingClientRect();
      const rango = document.createRange();
      rango.selectNodeContents(f);
      const t = rango.getBoundingClientRect();
      return { f, caja, izq: t.left - caja.left, der: t.right - caja.left + 4, x0: t.left, x1: t.right, y: t.top + Math.min(t.height, 90) / 2 };
    });
    {
      const llegada = chico ? 300 : 350;
      const dur = chico ? 270 : 320;
      const ruta = [[0, fuera.izq, trazos[0].y]];
      let t = llegada;
      ruta.push([t, trazos[0].x0 - 4, trazos[0].y, "linear"]);
      trazos.forEach((z, i) => {
        const dentro = (v) => `inset(-0.1em ${Math.max(0, z.caja.width - v)}px -0.1em 0)`;
        anim(z.f, { clipPath: [dentro(z.izq), dentro(z.der)] }, { delay: t, duration: dur, easing: "linear" });
        t += dur;
        ruta.push([t, z.x1, z.y, "linear"]);
        if (trazos[i + 1]) {
          t += 60;
          ruta.push([t, trazos[i + 1].x0 - 4, trazos[i + 1].y, "linear"]);
        }
      });
      diseno.ruta = ruta;
    }

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
      const orden = [procesos, diseno, backend, soporte];
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
  html.classList.remove("js-entrada");
  html.removeAttribute("data-entrada");
}

try {
  etapas();
} catch (e) {
  html.classList.remove("js-etapas");
}
if (html.classList.contains("js-entrada")) {
  try {
    entrada();
  } catch (e) {
    abandonar();
  }
}
