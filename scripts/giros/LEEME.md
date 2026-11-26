# Datos por giro

Cada archivo `scripts/giros/<giro>.json` describe una página de giro. El nombre del archivo es la ruta: `vidrierias.json` genera `/vidrierias/` (el archivo `vidrierias/index.html`). El servidor no sirve esta carpeta.

Para crear un giro nuevo (`fumigadoras`, `uniformes`, `distribuidoras`, `talleres`, ...): agregue su JSON, corra `python3 scripts/giros.py` y siga el orden de «Cómo cambiar un texto» del README. No hay que tocar nada más (el `sitemap.xml` sí: agregue la URL con su `lastmod`; la regla `sitemap` avisa si falta).

## Esquema

```json
{
  "h1": ["Primera frase", "segunda frase."],
  "titulo": "Texto del <title> y de og:title / twitter:title",
  "descripcion": "Texto de la meta description, de og:description / twitter:description y de la descripción del JSON-LD.",
  "problemas": [
    { "texto": "Primer problema.", "enlace": { "texto": "Sistemas internos", "href": "#sistemas" } },
    { "texto": "Segundo problema." },
    { "texto": "Tercer problema." }
  ]
}
```

| Clave | Obligatoria | Qué es |
| --- | --- | --- |
| `h1` | sí | Texto o lista de frases. Cada frase va en su propio `<span class="hero__frase">` (un bloque propio y, en la primera visita, un trazo de la animación de entrada). Todas juntas forman el único `h1` de la página |
| `titulo` | sí | `<title>`, `og:title` y `twitter:title` |
| `descripcion` | sí | `meta description`, `og:description`, `twitter:description` y `description` del nodo `Service` del JSON-LD |
| `problemas` | sí | Exactamente 3 filas, en el orden en que se muestran |
| `problemas[].texto` | sí | La frase de la fila |
| `problemas[].enlace` | no | `{ "texto", "href" }`. Si falta, la fila conserva el enlace de la home (en la misma posición) |

Cualquier otra clave es un error (así un nombre mal escrito no pasa en silencio). Los textos van en español de México, de usted, sin nombres de clientes ni de prospectos (el repo es público).

## Qué cambia respecto de la home

Cambian: `h1`, los textos de los tres problemas (y sus enlaces si el dato los trae), `<title>`, `meta description`, `canonical`, `og:url/title/description`, `twitter:title/description` y el nodo `Service` del JSON-LD (`@id`, `url`, `description`). Además, la sección de las seis etapas (`#sistemas`) va antes de los problemas. Todo lo demás (texto bajo el titular, botones, firma, precios, preguntas, cierre, pie, animaciones, imagen para compartir) es idéntico a `index.html`.

La URL de la página es `<origen>/<giro>/` (con barra final, igual que el `canonical` y el `sitemap.xml`). El origen se toma del `canonical` de `index.html`, así que `dominio.py` lo mantiene al día.

## Las marcas de index.html

La plantilla es `index.html`; los puntos sustituibles llevan `data-giro="..."`. Las marcas NO pasan a la página generada. Si quita una marca (o cambia la estructura de modo que ya no se encuentre), `giros.py` falla con un mensaje claro y no escribe nada.

| Marca | Dónde | Para qué |
| --- | --- | --- |
| `data-giro="h1"` | el `<h1>` | se reemplaza su contenido por las frases de `h1` |
| `data-giro="problemas"` | la `<section>` de los tres problemas | delimita dónde están las filas; las etapas se colocan antes de ella |
| `data-giro="problema"` | cada `<li>` de problema (3) | su `<p class="problemas__frase">` y su `<a>` se sustituyen |
| `data-giro="etapas"` | la `<section id="sistemas">` | es la que sube antes de los problemas |
| `data-giro="json-ld"` | el `<script type="application/ld+json">` | su `@graph` debe tener un único nodo `Service`; se le cambian `@id`, `url` y `description` |

El `<head>` se encuentra por nombres estándar, sin marcas: `<title>`, `meta name="description"`, `link rel="canonical"`, `meta property="og:url|og:title|og:description"` y `meta name="twitter:title|twitter:description"` (cada uno exactamente una vez).

## Cómo se mantiene al día

`giros.py --check` (también la regla `giros` de `validar.mjs`) compara cada `<giro>/index.html` con lo que generarían hoy `index.html` y su JSON. Falla si alguien editó la página a mano, si cambió la plantilla sin regenerar o si queda una página generada cuyo JSON ya no existe (bórrela junto con su `<loc>` del sitemap). Orden de las herramientas al cambiar un texto: `giros.py`, `contacto.py`, `dominio.py`, `versionar.py` (ver README).
