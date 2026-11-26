# hjgr.dev

Sitio de Harold García: sistemas, automatizaciones y webs para negocios. Es el enlace de referencia que se manda por WhatsApp y correo.

Sitio estático, HTML, CSS y JavaScript **sin paso de build**: lo que está en el repo es lo que se sirve.

> **Estado:** el repo está recién creado. Las secciones de abajo describen cómo va a funcionar; lo que todavía no existe está marcado «Pendiente» con su issue.

## Estructura

| Ruta | Qué es | Estado |
| --- | --- | --- |
| `index.html` | Home, una sola página larga | Pendiente (#4, #5) |
| `vidrierias/index.html` | Página por giro | Pendiente (#8) |
| `privacidad/index.html` | Aviso de privacidad | Pendiente (#10) |
| `404.html`, `sitemap.xml`, `robots.txt` | Página de error y SEO técnico | Pendiente (#9) |
| `assets/css`, `assets/js`, `assets/fuentes`, `assets/img` | Estilos, scripts, fuentes e imágenes, todo alojado aquí | Pendiente (#3) |
| `scripts/` | Herramientas y pruebas. El servidor no lo sirve | Pendiente (#2) |

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

Pendiente (#2). Va a ser un solo comando que corre toda la suite contra un servidor local con las mismas cabeceras que producción.

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
