# hjgr.dev

Sitio de Harold García: sistemas, automatizaciones y webs para negocios. Es el enlace de referencia que se manda por WhatsApp y correo.

Sitio estático, HTML, CSS y JavaScript **sin paso de build**: lo que está en el repo es lo que se sirve.

> **Estado:** el repo está recién creado. Las secciones de abajo describen cómo va a funcionar; lo que todavía no existe está marcado «Pendiente» con su issue.

## Estructura

| Ruta | Qué es | Estado |
| --- | --- | --- |
| `index.html` | Home, una sola página larga | Pendiente (#4, #5) |
| `vidrierias/index.html` | Página por giro. **Generada** por `scripts/giros.py` desde `index.html` y `scripts/giros/vidrierias.json`: no se edita a mano | Listo (#8) |
| `privacidad/index.html` | Aviso de privacidad | Pendiente (#10) |
| `404.html`, `sitemap.xml`, `robots.txt` | Página de error y SEO técnico. Datos estructurados (JSON-LD) en la home y en cada página de giro | Listo (#9) |
| `assets/css`, `assets/js`, `assets/fuentes`, `assets/img` | Estilos, scripts, fuentes e imágenes, todo alojado aquí | Pendiente (#3) |
| `scripts/` | Herramientas (`giros.py`, `versionar.py`, `dominio.py`, `contacto.py`), datos del sitio (`sitio.json`, `hosts-externos.json`, `giros/<giro>.json`) y pruebas (`pruebas/`). El servidor no lo sirve | Listo (#2) |

## Reglas del sitio

- **Trato:** español de México, de usted. Harold trabaja solo: nunca «somos», «nuestro equipo» ni «agencia».
- **Confidencialidad:** ningún nombre de cliente, giro exacto, ciudad ni captura de sistemas de clientes. Tampoco nombres de prospectos ni la tabla de códigos de `/w/<código>`: eso vive fuera del repo.
- **Nada inventado:** sin testimonios, métricas, logos ni años de experiencia. Lo que no existe todavía se marca «Próximamente», sin fecha ni precio.
- **CSP estricta:** `default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`. Por eso no hay scripts ni estilos en línea (tampoco atributos `style`), ni CDNs, ni formularios; los contactos son enlaces.
- **Funciona sin JavaScript:** todo el texto y los enlaces principales se ven y se usan con JS apagado. El JS solo mejora.
- **Solo tema claro** en el lanzamiento.

## Cómo se trabaja

- Rama por defecto `main`. Nada de commits directos: ramas `claude/<tema>` y PR.
- Worktrees en `.worktrees/` (ignorado por git).
- Un issue por pieza de trabajo, citado en los commits («… (#N)»). La PR dice `Closes #N` para que GitHub lo cierre al mergear.
- Los issues viven en el Project «hjgr.dev».

## Cómo probar

Requisitos: Node 22 o superior, Python 3 (solo biblioteca estándar) y Chromium del sistema. Las pruebas usan Playwright con ese Chromium (`/usr/bin/chromium`, o la ruta de `CHROME_PATH`); no se descarga ningún navegador.

```sh
npm ci --prefix scripts/pruebas   # una sola vez (desde la raíz del repo)
node scripts/pruebas/todo.mjs     # toda la suite, un solo comando
```

`todo.mjs` corre todos los pasos sin detenerse en el primero que falle, imprime un resumen OK/FALLA por paso y sale con código distinto de 0 si algo falla. Opciones: `--raiz DIR` (otro sitio), `--sin-lighthouse` (omite Lighthouse, que es lo más lento), `--corridas N`, `--estricto` (los marcadores `52XXXXXXXXXX` y `PENDIENTE` fallan; úselo antes de publicar) y `--solo-registro`.

**Sin páginas.** Mientras el repo no tenga páginas reales, `todo.mjs` avisa «0 páginas del sitio» y corre los pasos de navegador contra `scripts/pruebas/fixtures/bueno` (el mini sitio de referencia, que debe pasarlo todo), además de revisar del repo real la CSP del README y `dominio`, `versionado` y `contacto`. En cuanto exista un `.html`, todo corre contra el sitio.

Cada prueba descubre sola las páginas (todos los `.html`, sin `scripts/`, `node_modules/` ni `.worktrees/`), acepta `--raiz DIR` y se puede correr suelta, desde `scripts/pruebas/`:

| Comando | Qué comprueba |
| --- | --- |
| `node validar.mjs [--solo regla,...] [--estricto]` | Reglas estáticas: `html-validate`, `csp-estatica`, `csp-readme`, `formularios`, `meta`, `json-ld` (toda página indexable lleva JSON-LD válido, con precios solo de la lista y sin reseñas, teléfono, correo, horario ni calle), `sitemap`, `imagenes`, `enlaces`, `trato` (de usted), `voz`, `precios`, `marcadores`, `giros`, `dominio`, `versionado`, `contacto`. `--lista` las enumera |
| `node sin-js.mjs` | Con JavaScript apagado, en 1440, 768, 390 y 320 px: `<h1>` y enlaces de contacto visibles, sin scroll horizontal ni texto con opacidad 0 |
| `node tactil.mjs` | En 390 px, todo `a`, `button` y `summary` mide al menos 44×44 px (excepción: atributo `data-tactil-excepcion`) |
| `node foco.mjs` | Tabulando, cada elemento enfocable muestra un indicador de foco visible |
| `node contraste.mjs` | Contraste de todo el texto visible con píxeles reales, tema claro: 4.5:1, o 3:1 para texto grande |
| `node animaciones.mjs` | Entrada del hero y línea de las seis etapas, en la home y en las páginas de giro (comparten hero): primera visita, «Saltar», movimiento reducido, sin JS y fallas simuladas |
| `node cls.mjs [--max 0]` | Layout Instability con red limitada en 360, 390 y 412 px |
| `node lighthouse.mjs [--corridas 3]` | Móvil y escritorio, las cuatro categorías, mediana de N corridas; falla por debajo de 95 |
| `node capturas.mjs` | Capturas de página completa en 1440, 768, 390 y 320 px en `scripts/pruebas/salida/` (ignorada por git) |
| `python3 -I test_herramientas.py [--rapido]` | Pruebas de las propias herramientas: `fixtures/bueno` pasa todo y cada `fixtures/malos/<caso>` falla por su regla |
| `node lib/servidor.mjs [--raiz DIR]` | Solo el servidor local, con las cabeceras de producción (también en los 404) |

Herramientas que escriben en los `.html` (todas aceptan `--check`, que no escribe y sale con 1 si algo no coincide, y `--raiz DIR`):

- `python3 scripts/giros.py`: genera cada página de giro (`<giro>/index.html`) desde `index.html` (plantilla, con marcas `data-giro`) y `scripts/giros/<giro>.json`. Esquema en `scripts/giros/LEEME.md`. Si a la plantilla le falta una marca, falla con un mensaje claro y no escribe nada.
- `python3 scripts/versionar.py`: sella `?v=<hash>` en los CSS y JS propios. Córralo cada vez que cambie algo de `assets/css` o `assets/js`.
- `python3 scripts/dominio.py [--origen https://x.y]`: reescribe canonical, `og:url`, `og:image`, Twitter, JSON-LD, `sitemap.xml` y `robots.txt` según `origen` de `scripts/sitio.json`. Los hosts externos permitidos viven en `scripts/hosts-externos.json`.
- `python3 scripts/contacto.py [--exigir-reales]`: escribe el `href` de los `<a data-contacto="whatsapp">` y `<a data-contacto="cal">` a partir de `scripts/sitio.json`. Mientras `whatsapp`, `cal` o `foto` sean marcadores (`52XXXXXXXXXX`, `PENDIENTE`) avisa; `--exigir-reales` falla si queda alguno.

### Cómo cambiar un texto

Los textos de la home y de los giros salen de DOS fuentes: `index.html` (todo lo que es común) y `scripts/giros/<giro>.json` (titular, tres problemas, título y descripción de cada giro). Nunca edite `<giro>/index.html` a mano: la regla `giros` (y `giros.py --check`) lo detecta.

1. Edite `index.html` o el JSON del giro (o `scripts/sitio.json` para WhatsApp, agenda u origen).
2. Corra, **en este orden**:

```sh
python3 scripts/giros.py      # regenera las páginas de giro desde la plantilla
python3 scripts/contacto.py   # href de los enlaces de WhatsApp y agenda
python3 scripts/dominio.py    # URLs absolutas (canonical, og:*, JSON-LD, sitemap, robots)
python3 scripts/versionar.py  # sello ?v=<hash> de CSS y JS
node scripts/pruebas/todo.mjs
```

El orden importa porque `giros.py` arma cada página con lo que la plantilla tiene en ese momento, y las otras tres herramientas reescriben plantilla y páginas de giro por igual. Así el resultado es estable: correr los cuatro una segunda vez no cambia nada, y `giros.py --check` sigue pasando después de `contacto`, `dominio` y `versionar` (comprueba que la página sea exactamente lo que saldría de la plantilla de hoy). Si cambia solo CSS o JS, basta `versionar.py`.

Un giro nuevo (`fumigadoras`, `uniformes`, `distribuidoras`, `talleres`) es un archivo `scripts/giros/<giro>.json` más su `<loc>` en `sitemap.xml`; después, los cuatro comandos de arriba.

**Primera visita.** La clave de `localStorage` de la animación de entrada (`hjgr-entrada`) es una sola para todo el sitio: quien ya vio la entrada en la home no la vuelve a ver en `/vidrierias/`, y al revés.

Si cambia la CSP, cámbiela en este README y en `scripts/pruebas/lib/servidor.mjs`: la regla `csp-readme` exige que sean idénticas.

## Cómo se publica

Pendiente (#11, #12). En resumen:

1. Suite completa en verde y versionado de assets hecho.
2. Tag `publicable-AAAA-MM-DD<letra>` sobre `main`. Un tag publicado no se mueve; una corrección es un tag nuevo.
3. Con la aprobación de Harold para ese tag, en el clon de producción: `git fetch --tags && git checkout <tag>`. Nunca `git pull`.
4. Verificación desde fuera: 200 en cada página, cabeceras, y 404 en los archivos internos.

## Cómo se deshace

- **El sitio:** `git checkout <tag anterior>` en el clon de producción.
- **El servidor:** restaurar el respaldo del Caddyfile, validarlo como el usuario `caddy` y recargar. El detalle queda documentado junto con el script (#11).

## Pendientes de Harold

Ver #13.
