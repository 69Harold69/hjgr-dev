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

## Animaciones de la home (#7)

Las dirige `assets/js/inicio.js` (clásico, en `<head>`; decide y pone `js-entrada` en `<html>`) y `assets/js/main.js` (módulo; dibuja los cursores y la línea de etapas). El CSS vive al final de `home.css`.

- Los estados «ocultos para animar» existen SOLO bajo `.js-entrada` (hero) y `.js-etapas` (línea de etapas), y solo con `prefers-reduced-motion: no-preference`. Sin JS, con movimiento reducido o si algo falla, todo se ve.
- `.js-entrada` trae su propia salida a los 2.5 s (`@keyframes entrada-seguro`, con `forwards`) por si el JS que la quita no llegara a correr; `inicio.js` además la quita con un temporizador de 2.5 s (con `entrada-fin`, para que no haya transiciones). Cuando `main.js` toma el control pone `entrada-activa` en `<html>`: el CSS retira entonces su respaldo y `inicio.js` no corta nada (la entrada dura 3.9 s y la termina `main.js`).
- Solo `transform` y `opacity`; el titular y su párrafo no se animan (visibles desde el primer pintado, así el LCP es el H1). Las animaciones se crean con la Web Animations API, no con `style`, así que la CSP no se toca.
- La entrada sale en cada carga: no hay memoria de visitas (ni `localStorage` ni cookies).
- `.entrada` (contenedor de cursores, `aria-hidden`, `pointer-events: none`), `.cursor`, `.cursor__rol`, `.entrada__todos` y `.entrada__saltar` los crea el JS y los quita al terminar.
