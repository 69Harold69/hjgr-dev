#!/usr/bin/env node
/*
  validar: reglas estáticas (sin navegador) sobre todos los .html de la raíz.

  Uso: node validar.mjs [--raiz DIR] [--solo regla1,regla2] [--estricto] [--json] [--lista]
    --raiz     sitio a validar (por defecto, este repo)
    --solo     corre solo esas reglas (ver --lista)
    --estricto los avisos de `marcadores` (52XXXXXXXXXX, PENDIENTE) fallan
    --json     imprime el resultado como JSON (para las pruebas de las herramientas)
  Sale con 1 si alguna regla falla.

  Reglas
    html-validate  html-validate con la configuración recomendada
    csp-estatica   nada que la CSP bloquee: sin <style>, style=, scripts en línea (salvo JSON-LD), on*=, javascript:,
                   <base>, ni recursos de otros orígenes (HTML y CSS)
    csp-readme     la CSP que cita el README es idéntica a la de lib/servidor.mjs
    formularios    no hay <form>
    meta           lang, un h1, title y description únicos, canonical absoluto dentro de origen, OG y Twitter con imagen
                   absoluta; 404.html con noindex y sin canonical
    json-ld        toda página indexable con JSON-LD válido (@context schema.org y @type o @graph); sin aggregateRating, review,
                   ratingValue, teléfono, correo, horario, calle, código postal, foundingDate, numberOfEmployees ni logo; los
                   precios (price/minPrice/maxPrice) solo de la lista de precios permitidos y en MXN; URLs propias o de
                   hosts-externos.json
    sitemap        toda página indexable en sitemap.xml con lastmod y viceversa; robots.txt apunta al sitemap
    imagenes       todo <img> con alt, width y height
    enlaces        enlaces internos a archivos (y anclas) existentes; ningún <a> sin href
    trato          de USTED (patrones en TUTEO e IMPERATIVOS_INICIALES; excepción: data-trato-excepcion) en el texto visible y
                   también en <title>, meta description/og/twitter, alt, title, aria-label, placeholder y cadenas del JSON-LD
    voz            sin «somos», «nuestro equipo», «nuestra agencia», «agencia» (mismos textos que trato)
    precios        cifras con $ solo de la lista exacta; ninguna termina en 99 o 990 ni es redonda; ninguna cifra con
                   separador de miles sin $; en toda tabla con columna «Servicio», cada fila es un servicio de
                   PRECIOS_POR_SERVICIO y lleva exactamente SUS cifras (y el JSON-LD, en la regla json-ld, también)
    marcadores     avisa de 52XXXXXXXXXX / PENDIENTE y del hueco de la foto («Foto pendiente», .foto__espacio) (con --estricto, falla)
    giros          corre giros.py --check: cada <giro>/index.html es exactamente lo que generan index.html y scripts/giros/<giro>.json
    dominio, versionado, contacto   corren dominio.py, versionar.py y contacto.py con --check
*/
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "parse5";
import { HtmlValidate } from "html-validate/node";
import { CARPETA_SCRIPTS, archivosDe, descubrirPaginas, leerArgs, raizDe, salir } from "./lib/comun.mjs";
import { CSP, archivoDe } from "./lib/servidor.mjs";

/* ---------- datos de las reglas ---------- */

/** Cifras con $ permitidas (únicas que pueden aparecer en el texto visible). */
export const PRECIOS_PERMITIDOS = [9870, 1140, 24680, 1460, 38470, 12460, 3280, 27340, 3870, 14860, 1870, 48760, 2940];

/*
  La tabla de precios, fila por fila, como la aprobó Harold: [precio, al mes]. Una cifra de la lista puesta en la
  fila equivocada (p. ej. $24,680 en «Web Express») pasaría la lista de arriba; esta tabla la detecta. La usan la
  regla `precios` (toda tabla con encabezado de columna «Servicio») y `json-ld` (cada Offer con itemOffered.name).
*/
export const PRECIOS_POR_SERVICIO = {
  "Web Express": ["$9,870", "$1,140"],
  "Web Negocio": ["$24,680", "$1,460"],
  "Web a la medida": ["desde $38,470", "desde $1,460"],
  "Asistente de WhatsApp": ["$12,460", "$3,280"],
  "Web y asistente": ["$27,340", "$3,870"],
  "Automatización": ["desde $14,860", "soporte desde $1,870"],
  "Sistema interno": ["desde $48,760", "soporte desde $2,940"],
  "Diagnóstico de procesos": ["$3,870", "Se descuenta si seguimos"],
};
/* Cifra con separador de miles que no lleva $ delante: «9,870 pesos» es un precio mal escrito. */
const RE_CIFRA_SIN_SIGNO = /(?<![$\d.,])(?<!\$\s)\d{1,3}(?:,\d{3})+(?![\d,])/g;

/*
  Trato de USTED. Cada patrón se busca como palabra completa (sin distinguir mayúsculas) en el texto visible.
  La lista es deliberadamente de casos EVIDENTES: pronombres y posesivos de tú/vos, verbos frecuentes en
  segunda persona informal y los imperativos con pronombre pegado. Si una cita textual los necesita, envuélvala
  en un elemento con el atributo data-trato-excepcion.
*/
export const TUTEO = [
  "tú", "tu", "tus", "tuyo", "tuya", "tuyos", "tuyas", "ti", "contigo", "te", "vos",
  // verbos de segunda persona informal
  "puedes", "quieres", "tienes", "necesitas", "sabes", "eres", "estás", "vas", "haces", "buscas", "prefieres", "debes", "piensas",
  // imperativos con pronombre
  "escríbeme", "escríbenos", "cuéntame", "cuéntanos", "llámame", "llámanos", "contáctame", "contáctanos", "agéndame",
  "mándame", "mándanos", "pregúntame", "platícame", "cotízame", "dime", "háblame", "avísame", "pídeme",
  // voseo
  "podés", "querés", "tenés", "sabés", "sos", "escribí", "contame", "mandá", "hablá", "vení", "decime", "mirá", "fijate", "agendá",
  // frases
  "agenda tu", "agenda una",
];
/* Imperativos de tú al INICIO de un texto (botones y llamadas a la acción): «Agenda una llamada». */
export const IMPERATIVOS_INICIALES = [
  "agenda", "reserva", "solicita", "descubre", "conoce", "cotiza", "empieza", "comienza", "contacta", "escribe", "llama", "pide", "mira", "haz", "ven", "prueba", "ahorra",
];
export const VOZ_PROHIBIDA = ["somos", "nuestro equipo", "nuestra agencia", "agencia"];
export const MARCADORES = ["52XXXXXXXXXX", "PENDIENTE"];
/* Además del texto exacto: el hueco de la foto, que se escribe «Foto pendiente» (minúsculas) y lleva su clase. */
export const MARCADORES_RE = [
  [/foto pendiente/i, "«Foto pendiente»"],
  [/class="[^"]*\bfoto__espacio\b/, "el hueco de la foto (.foto__espacio)"],
];
/* Datos que NO se publican en el JSON-LD: nada que no esté escrito en la página (ni reseñas, ni contacto, ni calle). */
const CLAVES_PROHIBIDAS_LD = new Set([
  "aggregaterating", "review", "reviews", "ratingvalue", "ratingcount", "reviewcount", "bestrating", "worstrating",
  "telephone", "faxnumber", "email", "openinghours", "openinghoursspecification", "streetaddress", "postalcode", "postofficeboxnumber",
  "foundingdate", "numberofemployees", "logo", "geo", "hasmap",
]);
const CLAVES_PRECIO_LD = new Set(["price", "minprice", "maxprice"]);
const TIPOS_PROHIBIDOS_LD = new Set(["aggregaterating", "review"]);
const CLAVES_URL_LD = new Set(["@id", "url", "image", "logo", "item", "mainEntityOfPage"]);

const palabra = (alternativas) => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternativas.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")).join("|")})(?![\\p{L}\\p{N}_])`, "iu");
const RE_TUTEO = palabra(TUTEO);
const RE_IMPERATIVO = new RegExp(`^\\s*(?:${IMPERATIVOS_INICIALES.join("|")})(?![\\p{L}\\p{N}_])`, "iu");
const RE_VOZ = palabra(VOZ_PROHIBIDA);

/* ---------- parseo ---------- */

const attr = (n, nombre) => n.attrs?.find((a) => a.name === nombre)?.value;
const hijos = (n) => (n.content ? n.content.childNodes : n.childNodes) ?? [];
const linea = (n) => n.sourceCodeLocation?.startLine ?? 0;

function recorrer(nodo, fn) {
  fn(nodo);
  for (const h of hijos(nodo)) recorrer(h, fn);
}
const elementos = (arbol, tag) => {
  const r = [];
  recorrer(arbol, (n) => n.tagName && (!tag || n.tagName === tag) && r.push(n));
  return r;
};
const textoDe = (n) => hijos(n).filter((h) => h.nodeName === "#text").map((h) => h.value).join("");
const textoCompleto = (n) => {
  let t = "";
  recorrer(n, (x) => x.nodeName === "#text" && (t += x.value));
  return t.replace(/\s+/g, " ").trim();
};

/** Nodos de texto visibles: sin head/script/style/template ni elementos con `hidden`; opcionalmente sin data-trato-excepcion. */
function textosVisibles(arbol, { sinExcepcion = false } = {}) {
  const r = [];
  const ir = (n) => {
    if (n.tagName && (["head", "script", "style", "template"].includes(n.tagName) || attr(n, "hidden") !== undefined)) return;
    if (sinExcepcion && n.attrs && attr(n, "data-trato-excepcion") !== undefined) return;
    if (n.nodeName === "#text" && n.value.trim()) r.push({ texto: n.value.replace(/\s+/g, " ").trim(), linea: linea(n) });
    for (const h of hijos(n)) ir(h);
  };
  ir(arbol);
  return r;
}

/*
  Textos que el visitante (o su lector de pantalla, o WhatsApp al compartir) también lee aunque no sean nodos de texto
  del <body>: el <title>, los metadatos de descripción y de compartir, los atributos alt/title/aria-label/placeholder y
  las cadenas del JSON-LD. Las reglas de trato y voz los revisan igual que el texto visible.
*/
const META_TEXTO = new Set(["description", "og:title", "og:description", "og:image:alt", "twitter:title", "twitter:description", "twitter:image:alt"]);
const ATRIBUTOS_TEXTO = ["alt", "title", "aria-label", "aria-description", "placeholder"];
const CLAVES_LD_NO_TEXTO = new Set(["@context", "@type", "@id", "url", "sameAs", "image", "logo", "item", "mainEntityOfPage", "priceCurrency", "inLanguage", "addressCountry"]);
function textosNoVisibles(arbol, { sinExcepcion = false } = {}) {
  const r = [];
  const ir = (n, enExcepcion) => {
    const exc = enExcepcion || (sinExcepcion && n.attrs && attr(n, "data-trato-excepcion") !== undefined);
    if (n.tagName && !exc) {
      if (n.tagName === "title") r.push({ texto: textoCompleto(n), linea: linea(n), origen: "<title>" });
      if (n.tagName === "meta") {
        const clave = attr(n, "name") ?? attr(n, "property");
        if (META_TEXTO.has(clave) && attr(n, "content")) r.push({ texto: attr(n, "content").trim(), linea: linea(n), origen: `meta ${clave}` });
      }
      for (const a of ATRIBUTOS_TEXTO) if (attr(n, a)?.trim()) r.push({ texto: attr(n, a).trim(), linea: linea(n), origen: `${a}= de <${n.tagName}>` });
      if (n.tagName === "script" && attr(n, "type") === "application/ld+json") {
        let datos = null;
        try {
          datos = JSON.parse(textoDe(n));
        } catch {
          /* la regla json-ld ya lo reporta */
        }
        const cadenas = (v, k) => {
          if (Array.isArray(v)) return v.forEach((x) => cadenas(x, k));
          if (v && typeof v === "object") return Object.entries(v).forEach(([kk, x]) => cadenas(x, kk));
          if (typeof v === "string" && !CLAVES_LD_NO_TEXTO.has(k) && !/^https?:\/\//i.test(v)) r.push({ texto: v.trim(), linea: linea(n), origen: `JSON-LD «${k}»` });
        };
        cadenas(datos, "");
      }
    }
    for (const h of hijos(n)) ir(h, exc);
  };
  ir(arbol, false);
  return r;
}

function metaContenido(arbol, clave) {
  return elementos(arbol, "meta").find((m) => attr(m, "property") === clave || attr(m, "name") === clave);
}

/* ---------- contexto ---------- */

function cargar(raiz) {
  const leerJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
  const propio = path.join(raiz, "scripts/sitio.json");
  const sitio = leerJson(fs.existsSync(propio) ? propio : path.join(CARPETA_SCRIPTS, "sitio.json"));
  const externos = new Set(leerJson(path.join(CARPETA_SCRIPTS, "hosts-externos.json")).hosts);
  const paginas = descubrirPaginas(raiz).map((p) => {
    const html = fs.readFileSync(path.join(raiz, p.archivo), "utf8");
    const arbol = parse(html, { scriptingEnabled: false, sourceCodeLocationInfo: true });
    const robots = metaContenido(arbol, "robots");
    const noindex = /noindex/i.test(attr(robots ?? { attrs: [] }, "content") ?? "");
    return { ...p, html, arbol, noindex, es404: p.archivo === "404.html" };
  });
  return { raiz, sitio, origen: sitio.origen, externos, paginas };
}

const donde = (p, n) => `${p.archivo}${n ? `:${linea(n)}` : ""}`;
const porPagina = (ctx, fn) => ctx.paginas.flatMap((p) => fn(p) ?? []);

/* ---------- reglas ---------- */

const esExterna = (u) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(u.trim()) && !/^data:/i.test(u.trim());
const REL_RECURSO = /\b(stylesheet|preload|modulepreload|prefetch|preconnect|dns-prefetch|icon|apple-touch-icon|manifest|mask-icon)\b/i;

const reglas = {
  async "html-validate"(ctx) {
    const hv = new HtmlValidate({
      extends: ["html-validate:recommended"],
      // Estilo puro, o ya cubierto por csp-estatica (para no fallar dos veces por lo mismo).
      rules: {
        "void-style": "off",
        "no-trailing-whitespace": "off",
        "no-inline-style": "off",
        "doctype-style": "off",
        // El título de la página de vidrierías (71 caracteres) es el texto acordado; el máximo por defecto es 70.
        "long-title": ["error", { maxlength: 75 }],
      },
    });
    const fallas = [];
    for (const p of ctx.paginas) {
      const r = await hv.validateString(p.html, p.archivo);
      for (const res of r.results) for (const m of res.messages) fallas.push(`${p.archivo}:${m.line} [${m.ruleId}] ${m.message}`);
    }
    return { fallas };
  },

  "csp-estatica"(ctx) {
    const fallas = porPagina(ctx, (p) => {
      const f = [];
      recorrer(p.arbol, (n) => {
        if (!n.tagName) return;
        const en = donde(p, n);
        if (n.tagName === "style") f.push(`${en} <style> en línea (style-src 'self')`);
        if (n.tagName === "base") f.push(`${en} <base> (base-uri 'none')`);
        for (const a of n.attrs) {
          if (a.name === "style") f.push(`${en} atributo style= en <${n.tagName}>`);
          if (/^on[a-z]/i.test(a.name)) f.push(`${en} manejador ${a.name}= en <${n.tagName}>`);
          if (/^\s*javascript:/i.test(a.value) && ["href", "src", "action", "formaction", "data", "xlink:href"].includes(a.name)) f.push(`${en} URL javascript: en ${a.name}`);
        }
        if (n.tagName === "script") {
          const src = attr(n, "src");
          if (src === undefined && attr(n, "type") !== "application/ld+json") f.push(`${en} <script> en línea (solo se permite application/ld+json)`);
          if (src !== undefined && esExterna(src)) f.push(`${en} script de otro origen: ${src}`);
        }
        const recurso = (valor, que) => valor && esExterna(valor) && f.push(`${en} ${que} de otro origen: ${valor.trim().slice(0, 80)}`);
        if (["img", "source", "video", "audio", "track", "iframe", "embed", "input"].includes(n.tagName)) recurso(attr(n, "src"), `<${n.tagName}> src`);
        if (["img", "source"].includes(n.tagName)) for (const c of (attr(n, "srcset") ?? "").split(",")) recurso(c.trim().split(/\s+/)[0], `<${n.tagName}> srcset`);
        if (n.tagName === "video") recurso(attr(n, "poster"), "<video> poster");
        if (n.tagName === "object") recurso(attr(n, "data"), "<object> data");
        if (n.tagName === "link" && REL_RECURSO.test(attr(n, "rel") ?? "")) recurso(attr(n, "href"), `<link rel="${attr(n, "rel")}"> href`);
      });
      return f;
    });
    // CSS propio: @import y url() a otros orígenes (fuentes e imágenes de fondo).
    for (const rel of archivosDe(ctx.raiz, (n) => n.endsWith(".css"))) {
      const css = fs.readFileSync(path.join(ctx.raiz, rel), "utf8");
      for (const m of css.matchAll(/(?:@import\s+(?:url\(\s*)?|url\(\s*)["']?((?:https?:)?\/\/[^"')\s]+)/gi)) fallas.push(`${rel} recurso de otro origen en CSS: ${m[1]}`);
    }
    return { fallas };
  },

  "csp-readme"(ctx) {
    const ruta = path.join(ctx.raiz, "README.md");
    if (!fs.existsSync(ruta)) return { fallas: [`no hay README.md en ${ctx.raiz}: debe citar la CSP`] };
    const m = fs.readFileSync(ruta, "utf8").match(/default-src[^`\n]*?frame-ancestors 'none'/);
    if (!m) return { fallas: ["README.md no cita la CSP (default-src ... frame-ancestors 'none')"] };
    return { fallas: m[0] === CSP ? [] : [`la CSP del README no es idéntica a la de lib/servidor.mjs\n    README:   ${m[0]}\n    servidor: ${CSP}`] };
  },

  formularios: (ctx) => ({ fallas: porPagina(ctx, (p) => elementos(p.arbol, "form").map((n) => `${donde(p, n)} <form>: los contactos son enlaces (form-action 'none')`)) }),

  meta(ctx) {
    const titulos = new Map();
    const descripciones = new Map();
    const fallas = porPagina(ctx, (p) => {
      const f = [];
      const html = elementos(p.arbol, "html")[0];
      if (!/^es(-MX)?$/i.test(attr(html, "lang") ?? "")) f.push(`${p.archivo} <html lang> debe ser «es» o «es-MX» (hay «${attr(html, "lang") ?? ""}»)`);
      const h1 = elementos(p.arbol, "h1");
      if (h1.length !== 1) f.push(`${p.archivo} debe tener exactamente un <h1> (hay ${h1.length})`);
      const titulo = textoCompleto(elementos(p.arbol, "title")[0] ?? { childNodes: [] });
      if (!titulo) f.push(`${p.archivo} <title> vacío o ausente`);
      else if (titulos.has(titulo)) f.push(`${p.archivo} <title> repetido con ${titulos.get(titulo)}: «${titulo}»`);
      else titulos.set(titulo, p.archivo);
      const desc = (attr(metaContenido(p.arbol, "description") ?? { attrs: [] }, "content") ?? "").trim();
      if (!desc) f.push(`${p.archivo} meta description vacía o ausente`);
      else if (descripciones.has(desc)) f.push(`${p.archivo} meta description repetida con ${descripciones.get(desc)}`);
      else descripciones.set(desc, p.archivo);
      const canon = elementos(p.arbol, "link").find((l) => /\bcanonical\b/i.test(attr(l, "rel") ?? ""));
      if (p.es404) {
        if (!p.noindex) f.push(`${p.archivo} debe llevar <meta name="robots" content="noindex">`);
        if (canon) f.push(`${donde(p, canon)} la 404 no lleva canonical`);
        return f;
      }
      if (p.noindex) return f;
      const href = attr(canon ?? { attrs: [] }, "href");
      if (!href) f.push(`${p.archivo} falta <link rel="canonical">`);
      else if (href !== ctx.origen && !href.startsWith(`${ctx.origen}/`)) f.push(`${donde(p, canon)} canonical «${href}» debe ser absoluto y estar dentro de ${ctx.origen}`);
      for (const clave of ["og:image", "twitter:image"]) {
        const v = attr(metaContenido(p.arbol, clave) ?? { attrs: [] }, "content");
        if (!v || !/^https:\/\/[^/\s]+\//.test(v)) f.push(`${p.archivo} ${clave} debe ser una URL absoluta https (hay «${v ?? ""}»)`);
      }
      return f;
    });
    return { fallas };
  },

  "json-ld"(ctx) {
    const fallas = porPagina(ctx, (p) => {
      const f = [];
      const scripts = elementos(p.arbol, "script").filter((x) => attr(x, "type") === "application/ld+json");
      if (!scripts.length && !p.noindex && !p.es404) f.push(`${p.archivo} la página indexable no tiene JSON-LD (<script type="application/ld+json">)`);
      for (const s of scripts) {
        let datos;
        try {
          datos = JSON.parse(textoDe(s));
        } catch (e) {
          f.push(`${donde(p, s)} JSON-LD no es JSON válido: ${e.message}`);
          continue;
        }
        if (!datos || typeof datos !== "object" || !/^https:\/\/schema\.org\/?$/.test(String([].concat(datos["@context"] ?? "")[0]))) f.push(`${donde(p, s)} JSON-LD sin "@context": "https://schema.org"`);
        if (datos && typeof datos === "object" && !datos["@type"] && !datos["@graph"]) f.push(`${donde(p, s)} JSON-LD sin "@type" ni "@graph"`);
        const ir = (v, clave) => {
          if (Array.isArray(v)) return v.forEach((x) => ir(x, clave));
          if (v && typeof v === "object") {
            for (const [k, x] of Object.entries(v)) {
              if (CLAVES_PROHIBIDAS_LD.has(k.toLowerCase())) f.push(`${donde(p, s)} JSON-LD con «${k}» (solo se publica lo que está escrito en la página; sin reseñas, contacto, calle ni datos inventados)`);
              if (k === "@type") for (const t of [].concat(x)) TIPOS_PROHIBIDOS_LD.has(String(t).toLowerCase()) && f.push(`${donde(p, s)} JSON-LD con @type «${t}»`);
              if (CLAVES_PRECIO_LD.has(k.toLowerCase())) {
                const n = Number(String(x).replace(/[$,\s]/g, ""));
                if (!Number.isFinite(n) || !PRECIOS_PERMITIDOS.includes(n)) f.push(`${donde(p, s)} JSON-LD «${k}» = ${JSON.stringify(x)} no está en la lista de precios permitidos`);
              }
              if (k === "priceCurrency" && x !== "MXN") f.push(`${donde(p, s)} JSON-LD priceCurrency «${x}» debe ser MXN`);
              if (k === "itemOffered" && x && typeof x === "object" && typeof x.name === "string") {
                // La oferta de un servicio de la tabla: su precio de arranque debe ser el de SU fila (y «desde» = minPrice).
                const fila = PRECIOS_POR_SERVICIO[x.name];
                const ps = [].concat(v.priceSpecification ?? [], v.price !== undefined ? [{ price: v.price }] : [])[0] ?? {};
                if (!fila) f.push(`${donde(p, s)} JSON-LD: oferta «${x.name}» no es un servicio de la tabla de precios`);
                else {
                  const esperado = Number(fila[0].replace(/[^\d]/g, ""));
                  const desde = /^desde\b/.test(fila[0]);
                  const dado = ps[desde ? "minPrice" : "price"];
                  if (Number(dado) !== esperado) f.push(`${donde(p, s)} JSON-LD: «${x.name}» debe llevar ${desde ? "minPrice" : "price"} ${esperado} (la tabla dice «${fila[0]}») y lleva ${JSON.stringify(ps)}`);
                }
              }
              ir(x, k);
            }
          } else if (typeof v === "string" && CLAVES_URL_LD.has(clave) && /^https?:\/\//i.test(v)) {
            const host = new URL(v).host;
            if (v !== ctx.origen && !v.startsWith(`${ctx.origen}/`) && !ctx.externos.has(host)) f.push(`${donde(p, s)} JSON-LD «${clave}» apunta a ${host}, que no es el origen ni está en hosts-externos.json`);
          }
        };
        ir(datos, "");
      }
      return f;
    });
    return { fallas };
  },

  sitemap(ctx) {
    const fallas = [];
    const rutaSitemap = path.join(ctx.raiz, "sitemap.xml");
    const rutaRobots = path.join(ctx.raiz, "robots.txt");
    if (!fs.existsSync(rutaSitemap)) fallas.push("no existe sitemap.xml");
    else {
      const xml = fs.readFileSync(rutaSitemap, "utf8");
      const enSitemap = new Map();
      for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
        const loc = m[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/)?.[1];
        if (!loc) continue;
        const lastmod = m[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/)?.[1];
        enSitemap.set(loc, lastmod);
        if (!lastmod || !/^\d{4}-\d{2}-\d{2}(T[\d:.+Z-]+)?$/.test(lastmod)) fallas.push(`sitemap.xml ${loc}: falta <lastmod> válido (AAAA-MM-DD)`);
      }
      const esperadas = new Set(ctx.paginas.filter((p) => !p.noindex && !p.es404).map((p) => ctx.origen + p.ruta));
      for (const u of esperadas) if (!enSitemap.has(u)) fallas.push(`sitemap.xml: falta la página indexable ${u}`);
      for (const u of enSitemap.keys()) if (!esperadas.has(u)) fallas.push(`sitemap.xml: ${u} no corresponde a ninguna página indexable`);
    }
    if (!fs.existsSync(rutaRobots)) fallas.push("no existe robots.txt");
    else if (!new RegExp(`^sitemap:\\s*${ctx.origen.replace(/[.]/g, "\\.")}/sitemap\\.xml\\s*$`, "im").test(fs.readFileSync(rutaRobots, "utf8"))) fallas.push(`robots.txt debe tener «Sitemap: ${ctx.origen}/sitemap.xml»`);
    return { fallas };
  },

  imagenes: (ctx) =>
    ({
      fallas: porPagina(ctx, (p) =>
        elementos(p.arbol, "img").flatMap((n) => ["alt", "width", "height"].filter((a) => attr(n, a) === undefined).map((a) => `${donde(p, n)} <img src="${attr(n, "src") ?? ""}"> sin ${a}`)),
      ),
    }),

  enlaces(ctx) {
    const ids = new Map();
    const idsDe = (archivoRel) => {
      if (!ids.has(archivoRel)) {
        const s = new Set();
        const p = ctx.paginas.find((x) => path.join(ctx.raiz, x.archivo) === archivoRel);
        if (p) recorrer(p.arbol, (n) => n.attrs && attr(n, "id") && s.add(attr(n, "id")));
        ids.set(archivoRel, s);
      }
      return ids.get(archivoRel);
    };
    const fallas = porPagina(ctx, (p) => {
      const f = [];
      for (const a of elementos(p.arbol, "a")) {
        const href = attr(a, "href");
        if (href === undefined || !href.trim()) {
          f.push(`${donde(p, a)} <a> sin href${attr(a, "data-contacto") ? ` (data-contacto="${attr(a, "data-contacto")}": corra scripts/contacto.py)` : ""}`);
          continue;
        }
        let h = href.trim();
        if (h.startsWith(`${ctx.origen}/`) || h === ctx.origen) h = h.slice(ctx.origen.length) || "/";
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(h)) continue; // externo, mailto:, tel:...
        const [sinHash, ancla] = [h.split("#")[0], h.includes("#") ? h.split("#")[1] : null];
        const [rutaUrl] = sinHash.split("?");
        const destinoUrl = new URL(rutaUrl || p.ruta, `http://x${p.ruta.endsWith("/") ? p.ruta : p.ruta.replace(/[^/]*$/, "")}`).pathname;
        const archivo = archivoDe(ctx.raiz, destinoUrl);
        if (!archivo) {
          f.push(`${donde(p, a)} enlace roto: ${href}`);
          continue;
        }
        if (ancla && archivo.endsWith(".html") && !idsDe(archivo).has(decodeURIComponent(ancla))) f.push(`${donde(p, a)} ancla inexistente: ${href}`);
      }
      return f;
    });
    return { fallas };
  },

  trato(ctx) {
    return {
      fallas: porPagina(ctx, (p) =>
        [...textosVisibles(p.arbol, { sinExcepcion: true }), ...textosNoVisibles(p.arbol, { sinExcepcion: true })].flatMap((t) => {
          const m = t.texto.match(RE_TUTEO) ?? t.texto.match(RE_IMPERATIVO);
          return m ? [`${p.archivo}:${t.linea} trato de tú/vos («${m[0].trim()}») en ${t.origen ? `${t.origen} ` : ""}«${t.texto.slice(0, 70)}»: use de usted`] : [];
        }),
      ),
    };
  },

  voz(ctx) {
    return {
      fallas: porPagina(ctx, (p) =>
        [...textosVisibles(p.arbol), ...textosNoVisibles(p.arbol)].flatMap((t) => {
          const m = t.texto.match(RE_VOZ);
          return m ? [`${p.archivo}:${t.linea} voz plural/agencia («${m[0]}») en ${t.origen ? `${t.origen} ` : ""}«${t.texto.slice(0, 70)}»: Harold trabaja solo`] : [];
        }),
      ),
    };
  },

  precios(ctx) {
    return {
      fallas: porPagina(ctx, (p) =>
        textosVisibles(p.arbol).flatMap((t) =>
          [...t.texto.matchAll(/\$\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?/g)].flatMap((m) => {
            const valor = Number(m[1].replace(/,/g, ""));
            const en = `${p.archivo}:${t.linea} «${m[0].trim()}»`;
            const f = [];
            if (m[2] && /[^0]/.test(m[2])) f.push(`${en} lleva centavos`);
            if (!PRECIOS_PERMITIDOS.includes(valor)) f.push(`${en} no está en la lista de precios permitidos`);
            if (/99$/.test(String(valor)) || /990$/.test(String(valor))) f.push(`${en} termina en 99 o 990`);
            if (valor % 1000 === 0) f.push(`${en} es una cifra redonda`);
            return f;
          }),
        ).concat(
          // Cifras con separador de miles sin $ («9,870 pesos»): un precio mal escrito que la lista no ve.
          textosVisibles(p.arbol).flatMap((t) => [...t.texto.matchAll(RE_CIFRA_SIN_SIGNO)].map((m) => `${p.archivo}:${t.linea} «${m[0]}» parece un precio sin $ en «${t.texto.slice(0, 70)}»`)),
          // Tabla de precios (encabezado de columna «Servicio»): cada fila es un servicio conocido y lleva SUS cifras.
          elementos(p.arbol, "table")
            .filter((tabla) => elementos(tabla, "th").some((th) => attr(th, "scope") !== "row" && textoCompleto(th) === "Servicio"))
            .flatMap((tabla) =>
              elementos(tabla, "tr")
                .filter((tr) => hijos(tr).some((c) => c.tagName === "td"))
                .flatMap((tr) => {
                  const celdas = hijos(tr).filter((c) => c.tagName === "th" || c.tagName === "td");
                  const servicio = textoCompleto(celdas[0] ?? { childNodes: [] });
                  const fila = PRECIOS_POR_SERVICIO[servicio];
                  if (!fila) return [`${donde(p, tr)} la tabla de precios tiene «${servicio}», que no es un servicio de la lista (PRECIOS_POR_SERVICIO)`];
                  const dados = celdas.slice(1).map((c) => textoCompleto(c));
                  return fila.flatMap((esperado, i) => (dados[i] === esperado ? [] : [`${donde(p, tr)} «${servicio}»: la columna ${i + 1} debe decir «${esperado}» y dice «${dados[i] ?? ""}»`]));
                }),
            ),
        ),
      ),
    };
  },

  marcadores(ctx, args) {
    const hallazgos = porPagina(ctx, (p) => [
      ...MARCADORES.filter((m) => p.html.includes(m)).map((m) => `${p.archivo} aún contiene el marcador ${m}`),
      ...MARCADORES_RE.filter(([re]) => re.test(p.html)).map(([, que]) => `${p.archivo} aún contiene ${que}`),
    ]);
    return args.estricto ? { fallas: hallazgos } : { fallas: [], avisos: hallazgos };
  },

  giros: (ctx) => python("giros.py", ctx),
  dominio: (ctx) => python("dominio.py", ctx),
  versionado: (ctx) => python("versionar.py", ctx),
  contacto: (ctx) => python("contacto.py", ctx),
};

function python(script, ctx) {
  const r = spawnSync("python3", ["-I", path.join(CARPETA_SCRIPTS, script), "--check", "--raiz", ctx.raiz], { encoding: "utf8" });
  if (r.status === 0) return { fallas: [], avisos: (r.stdout.match(/^AVISO.*$/gm) ?? []).map((l) => l.replace(/^AVISO\s*/, "")) };
  const lineas = `${r.stdout}${r.stderr}`.split("\n").filter(Boolean);
  return { fallas: lineas.length ? lineas : [`${script} --check terminó con ${r.status}`] };
}

/* ---------- ejecución ---------- */

export async function validar(raiz, { solo = null, estricto = false } = {}) {
  const ctx = cargar(raiz);
  const resultado = {};
  for (const [nombre, fn] of Object.entries(reglas)) {
    if (solo && !solo.includes(nombre)) continue;
    const r = await fn(ctx, { estricto });
    resultado[nombre] = { ok: r.fallas.length === 0, fallas: r.fallas, avisos: r.avisos ?? [] };
  }
  return { paginas: ctx.paginas.length, reglas: resultado };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = leerArgs();
  if (a.ayuda || a.help) salir(0, fs.readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace("#!/usr/bin/env node\n/*", "").trim());
  if (a.lista) salir(0, Object.keys(reglas).join("\n"));
  const solo = a.solo && a.solo !== true ? String(a.solo).split(",").map((s) => s.trim()) : null;
  const desconocidas = (solo ?? []).filter((s) => !(s in reglas));
  if (desconocidas.length) salir(2, `Reglas desconocidas: ${desconocidas.join(", ")}. Disponibles: ${Object.keys(reglas).join(", ")}`);
  const r = await validar(raizDe(a), { solo, estricto: !!a.estricto });
  const malas = Object.entries(r.reglas).filter(([, x]) => !x.ok);
  if (a.json) {
    console.log(JSON.stringify(r));
  } else {
    console.log(`validar: ${r.paginas} página(s)`);
    for (const [nombre, x] of Object.entries(r.reglas)) {
      console.log(`${x.ok ? "OK   " : "FALLA"} ${nombre}${x.fallas.length ? ` (${x.fallas.length})` : ""}`);
      for (const f of x.fallas) console.log(`       ${f}`);
      for (const av of x.avisos) console.log(`       AVISO ${av}`);
    }
    console.log(malas.length ? `\nvalidar: FALLAN ${malas.length} regla(s): ${malas.map(([n]) => n).join(", ")}` : "\nvalidar: todas las reglas pasan");
  }
  process.exit(malas.length ? 1 : 0);
}
