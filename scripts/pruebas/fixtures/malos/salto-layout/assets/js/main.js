import { marcar } from "./util.js?v=408438fcca";

marcar(document);

setTimeout(() => {
  const hueco = document.createElement("div");
  hueco.className = "hueco";
  document.querySelector("main").prepend(hueco);
}, 600);
