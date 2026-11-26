/*
 * inicio.js: decide, antes del primer pintado, si corre la entrada del hero (en CADA carga; no guarda nada: sin localStorage ni memoria de visitas).
 * Script clásico y mínimo en <head>. Si corre, pone la clase js-entrada en <html>; el CSS oculta SOLO lo que
 * la animación va a revelar. Respaldo: si a los 2.5 s main.js no tomó el control (no puso entrada-activa), se
 * quita la clase y los restos, con el estado final aplicado al instante (sin transiciones). Si main.js sí arrancó,
 * él mismo termina a los 3.9 s. El CSS tiene además su propia salida a los 2.5 s (se retira con entrada-activa),
 * por si este archivo o main.js fallaran.
 */
(function () {
  var html = document.documentElement;
  try {
    if (location.hash || window.scrollY > 0 || matchMedia("(prefers-reduced-motion: reduce)").matches || !html.animate) return;
    html.classList.add("js-entrada");
    html.setAttribute("data-entrada", String(Math.round(performance.now())));
    setTimeout(function () {
      if (html.classList.contains("entrada-activa")) return; // main.js ya dirige la entrada
      html.classList.add("entrada-fin"); // sin transiciones: el estado final se aplica de golpe
      html.classList.remove("js-entrada");
      html.removeAttribute("data-entrada");
      var restos = document.querySelectorAll(".entrada, .entrada__saltar");
      for (var i = 0; i < restos.length; i++) restos[i].remove();
      void html.offsetWidth;
      html.classList.remove("entrada-fin");
    }, 2500);
  } catch (e) {
    html.classList.remove("js-entrada");
  }
})();
