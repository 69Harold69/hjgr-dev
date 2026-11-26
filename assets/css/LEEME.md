# CSS del sitio

Orden de carga: `tokens.css`, `fuentes.css`, `base.css`, `componentes.css`. Solo tema claro, sin JavaScript, sin estilos en línea. Capas: `base < componentes < utilidades` (declaradas en `tokens.css`).
Convención de nombres: `.bloque`, `.bloque__elemento`, `.bloque--variante`, `.u-utilidad`.

## Componentes y clases

| Clase | Uso |
|---|---|
| `.contenedor` | Ancho máximo con márgenes laterales de 24 px (celular) o 56 px (escritorio, desde 1024 px). |
| `.rejilla`, `.rejilla--2`, `.rejilla--3` | Columnas automáticas, 40 px de hueco (dejan sitio a las marcas de corte). |
| `.seccion` | Aire vertical de una sección. |
| `.pila`, `.pila--grande` | Separa verticalmente a los hijos directos. |
| `.solo-lectores`, `.salto` | Texto solo para lectores de pantalla; enlace para saltar al contenido. |
| `.boton` | Botón principal: único con relleno naranja, texto `--ink`, 44 px mínimo. |
| `.boton--secundario` | Con `.boton`: borde de 1 px en tinta, sin relleno; en hover se rellena de tinta. |
| `.enlace-accion` | Enlace de acción con área táctil de 44 px. |
| `.prosa` | Columna de lectura (42 rem) para páginas de texto largo: separa hijos, h1 a `--titulo-2`, h2 a `--titulo-3` con más aire arriba, listas con hueco. Solo en `/privacidad/` |
| `.etiqueta`, `.etiqueta--guia` | Texto chico Geist 500 en `--muted`; la variante añade una línea guía naranja de 1 px. |
| `.nombre`, `.precio` | Hedvig fuera de los títulos (nombre y precios). |
| `.hoja` | Hoja de papel (`--paper-hi`) con `--shadow-sheet`. |
| `.marcas` + 4 `<span class="marcas__esq marcas__esq--nw|ne|sw|se" aria-hidden="true">` | Marcas de corte: 8 líneas de 1 px; se abren 4 px con hover o foco interno (solo `transform`). |
| `.u-puntos` | Retícula de puntos de 24 px; solo para barra, hero y cierre. |
| `.banda`, `.banda--tinta` | Banda `--paper-2`; banda de tinta con texto `--paper` (una por página). |
| `.fila`, `.fila__etiqueta`, `.fila__valor` | Fila con línea de 1 px (`--rule`). |
| `.captura`, `.captura__img`, `.captura__pie` | Tarjeta de captura: imagen 6/5, `object-position: top`, con `.marcas`. |

## Contraste medido (WCAG, razón de luminancia relativa)

Todo texto requiere 4.5:1.

| Texto | paper | paper-2 | paper-3 | paper-hi |
|---|---|---|---|---|
| `--ink` | 17.94 | 16.36 | 14.72 | 18.83 |
| `--ink-2` | 10.86 | 9.90 | 8.91 | 11.40 |
| `--muted` | 5.76 | 5.25 | 4.72 | 6.04 |

| Par | Razón |
|---|---|
| `--paper` sobre `--ink` (banda de tinta) | 17.94 |
| Texto del botón principal `--ink` sobre `--accent` | 6.37 |
| (descartado) blanco sobre `--accent` | 3.05, no cumple |
| `--focus` sobre paper / paper-2 / paper-3 / paper-hi | 5.41 / 4.93 / 4.44 / 5.68 |
| `--focus` sobre `--ink` (anillo en banda de tinta) | aprox. 3.3 (no es texto; requisito 3:1) |

Todos los pares de texto pedidos cumplen. `--focus` sobre `--paper-3` (4.44) no es texto, pero queda por debajo de 4.5.

## Animaciones de la home (#7, #31)

Las dirige `assets/js/inicio.js` (clásico, en `<head>`; decide y pone `js-entrada` y `js-secciones` en `<html>`) y `assets/js/main.js` (módulo; dibuja los cursores). El CSS vive al final de `home.css`.

- Los estados «desarmados» existen SOLO bajo `.js-entrada` (hero) y `.js-secciones` (secciones), y solo con `prefers-reduced-motion: no-preference` (las secciones, además, solo en `@media screen`). Sin JS, con movimiento reducido, al imprimir o si algo falla, todo está armado.
- **Hero.** `.js-entrada` trae su propia salida a los 2.5 s (`@keyframes entrada-seguro`, con `forwards`) por si el JS que la quita no llegara a correr; `inicio.js` además la quita con un temporizador de 2.5 s. Cuando `main.js` toma el control pone `entrada-activa`: el CSS retira su respaldo y la entrada (3.9 s) la termina `main.js`. El titular y su párrafo no se animan (el LCP es el H1).
- **Secciones.** Cada `main > section` (menos el hero y la banda de la frase, que no tiene nada visual que armar) está «desarmada» mientras no tenga `.armada`: sus líneas, bordes, marcas de corte, capturas, la línea de las etapas y el resaltado de la fila del diagnóstico están ocultos. Las líneas que se dibujan son capas propias (pseudo-elementos con `scaleX`/`scaleY`); el borde real se pone transparente (no cambia ninguna medida) y vuelve al quedar armada. El texto nunca se esconde. Un solo `IntersectionObserver` (sin listeners de scroll) dispara la sección cuando entra ~30 % de ella (o 30 % de la pantalla, si es más alta); lo que queda por encima de la pantalla se arma al instante; mientras corre el hero no se arma nada. Enfocar con el teclado dentro de una sección sin armar la arma al instante.
- Cada sección dura 1.3 s como máximo (0.9 s en celular, ≤ 767 px, donde además hay 2 cursores en vez de 3). Sus cursores viven en `.cursores-seccion`, capa `aria-hidden`, `pointer-events: none` y `overflow: clip`, dentro de la sección (no cambia el layout ni genera scroll horizontal). Lo armado por sección: problemas (filete y líneas de las filas), sistemas (línea de las seis etapas con sus marcas, y las filas), trabajo (marcas de corte, filete de cada tarjeta y la captura dentro de su marco), cómo trabajo (línea naranja bajo cada número), precios (resaltado de la fila del diagnóstico), quién (marcas de la foto y líneas de las preguntas) y cierre (línea naranja del título y filete de arriba).
- **«Saltar».** Un solo botón (`.entrada__saltar`, 44 px o más) sale con el hero y con cada sección que se arma, y se queda 1.5 s después; Escape hace lo mismo. Apaga los cursores en toda la página durante esa visita (quita `js-secciones`: todo queda armado al instante). Sin memoria: en la siguiente carga vuelven.
- Respaldos: si a los 4 s `main.js` no puso `secciones-activa`, `inicio.js` quita `js-secciones` y todo queda armado; si `main.js` falla, él mismo la quita. Si el visitante activa «reducir movimiento» a mitad de la visita, `main.js` apaga todo como con «Saltar».
- Solo `transform` y `opacity`; las animaciones se crean con la Web Animations API (también sobre pseudo-elementos), no con `style`, así que la CSP no se toca. No hay memoria de visitas (ni `localStorage` ni cookies).
- `.entrada` (cursores del hero), `.cursores-seccion`, `.cursor`, `.cursor__rol`, `.entrada__todos` y `.entrada__saltar` los crea el JS y los quita al terminar.
