/*
 * inicio.js: decide, antes del primer pintado, si corre la entrada del hero.
 * Script clásico y mínimo en <head>. Si corre, pone la clase js-entrada en <html>; el CSS oculta SOLO lo que
 * la animación va a revelar. Seguro: a los 5 s se quita la clase y los restos pase lo que pase (el CSS tiene
 * además su propia salida a los 5 s, por si este archivo o main.js fallaran).
 */
(function () {
  var html = document.documentElement;
  try {
    if (location.hash || window.scrollY > 0 || matchMedia("(prefers-reduced-motion: reduce)").matches || !html.animate) return;
    var visto = false;
    try {
      visto = localStorage.getItem("hjgr-entrada") === "1";
      localStorage.setItem("hjgr-entrada", "1");
    } catch (e) {
      /* Sin localStorage se comporta como primera visita. */
    }
    if (visto) return;
    html.classList.add("js-entrada");
    html.setAttribute("data-entrada", String(Math.round(performance.now())));
    setTimeout(function () {
      html.classList.remove("js-entrada");
      html.removeAttribute("data-entrada");
      var restos = document.querySelectorAll(".entrada, .entrada__saltar");
      for (var i = 0; i < restos.length; i++) restos[i].remove();
    }, 5000);
  } catch (e) {
    html.classList.remove("js-entrada");
  }
})();
