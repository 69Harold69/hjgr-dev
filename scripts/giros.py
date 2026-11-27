#!/usr/bin/env python3
"""Páginas por giro (/vidrierias, /fumigadoras, ...) generadas desde la home.

El sitio no tiene build: el servidor sirve el repo tal cual, así que cada página de giro es un archivo HTML real y
versionado (<giro>/index.html). Para no mantener dos copias a mano, este script toma `index.html` como PLANTILLA y un
archivo de datos por giro, `scripts/giros/<giro>.json`, y escribe `<giro>/index.html`. Para crear un giro nuevo basta
agregar su JSON (esquema en scripts/giros/LEEME.md) y correr este script.

Qué cambia en la página de giro (todo lo demás es idéntico a la home):
  - h1; el texto bajo el titular (`hero`), la entrada de la sección de etapas (`intro_etapas`) y preguntas propias
    antes de las generales (`preguntas`), los tres opcionales; y el texto (y, si el dato lo trae, el enlace) de cada una de las tres filas de problemas;
  - el orden: la sección de las seis etapas (#sistemas) va antes de los problemas;
  - <title>, meta description, canonical, og:url/title/description y twitter:title/description;
  - el JSON-LD: el nodo Service lleva la url y la descripción de esa página.

Los puntos sustituibles de index.html se marcan con atributos `data-giro="..."` (h1, hero, intro-etapas, faq, problemas, problema, etapas,
json-ld); el <head> se localiza por sus nombres estándar (title, description, canonical, og:*, twitter:*). Si la
plantilla ya no tiene algo de lo que el generador necesita, FALLA con un mensaje claro y no escribe nada: nunca deja una
página a medias. Las marcas no se copian a la página generada.

Orden de las herramientas (cada una deja la plantilla y las páginas de giro en el mismo estado):
  giros.py -> contacto.py -> dominio.py -> versionar.py
La página se arma con lo que la plantilla tiene en ese momento (hrefs de contacto, dominio, sello ?v=); las otras tres
herramientas reescriben plantilla y páginas de giro por igual. Por eso `giros.py --check` pasa después de correr las
otras tres (comprueba que la página sea EXACTAMENTE lo que saldría de la plantilla de hoy).

Uso:
  python3 scripts/giros.py                 escribe <giro>/index.html de cada scripts/giros/<giro>.json
  python3 scripts/giros.py --check         no escribe; sale con 1 si alguna página no coincide con lo que se generaría
  python3 scripts/giros.py --raiz DIR      trabaja sobre otra copia del sitio (pruebas)
Errores de plantilla o de datos: sale con 2 sin escribir nada. Solo biblioteca estándar.
"""
import argparse
import json
import pathlib
import re
import sys

RAIZ_DEFECTO = pathlib.Path(__file__).resolve().parent.parent
CARPETA_DATOS = pathlib.Path("scripts") / "giros"
PREFIJO_COMENTARIO = "Generado por scripts/giros.py"
RESERVADOS = {"assets", "scripts", "privado", "privacidad", "node_modules", "404", "sitemap", "robots", "favicon"}
RE_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
CLAVES = {"h1", "titulo", "descripcion", "problemas"}
CLAVES_OPCIONALES = {"hero", "intro_etapas", "preguntas"}
CLAVES_PREGUNTA = {"pregunta", "respuesta"}
CLAVES_PROBLEMA = {"texto", "enlace"}
CLAVES_ENLACE = {"texto", "href"}
FILAS = 3

ATR = r"""(?:[^>"']|"[^"]*"|'[^']*')*"""


class ErrorGiros(Exception):
    """Plantilla o datos que impiden generar; nada se escribe."""


# ------------------------------------------------------------------------------------------------------------------
# Utilidades de texto
# ------------------------------------------------------------------------------------------------------------------
def esc(texto):
    return texto.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def esc_attr(texto):
    return esc(texto).replace('"', "&quot;")


def marca(nombre):
    return re.compile(rf"""<(?P<tag>[a-z][a-z0-9]*)\b{ATR}\sdata-giro="{re.escape(nombre)}"{ATR}>""", re.I)


def bloque(html, nombre, para, esperadas=1):
    """Elementos marcados con data-giro="nombre": [(inicio, fin_apertura, inicio_cierre, fin)], con el cierre emparejado."""
    encontrados = []
    for m in marca(nombre).finditer(html):
        tag = m.group("tag").lower()
        profundidad, pos = 1, m.end()
        for t in re.finditer(rf"<(/?){tag}\b{ATR}>", html[m.end():], re.I):
            profundidad += -1 if t.group(1) else 1
            if profundidad == 0:
                encontrados.append((m.start(), m.end(), m.end() + t.start(), m.end() + t.end()))
                break
        else:
            raise ErrorGiros(f'index.html: la marca data-giro="{nombre}" abre <{tag}> y no se encuentra su cierre')
    if len(encontrados) != esperadas:
        raise ErrorGiros(
            f'index.html: la plantilla debe tener {esperadas} elemento(s) con data-giro="{nombre}" ({para}) y tiene {len(encontrados)}. '
            "Si cambió index.html, vuelva a poner la marca o actualice scripts/giros.py."
        )
    return encontrados


def una(patron, html, descripcion, flags=0):
    ms = list(re.finditer(patron, html, flags))
    if len(ms) != 1:
        raise ErrorGiros(f"index.html: se esperaba exactamente una vez {descripcion} y aparece {len(ms)}")
    return ms[0]


# ------------------------------------------------------------------------------------------------------------------
# Datos
# ------------------------------------------------------------------------------------------------------------------
def texto_no_vacio(valor, donde):
    if not isinstance(valor, str) or not valor.strip():
        raise ErrorGiros(f"{donde}: debe ser un texto no vacío")
    return valor.strip()


def leer_datos(ruta, nombre):
    donde = f"scripts/giros/{nombre}.json"
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise ErrorGiros(f"{donde}: no se pudo leer como JSON ({e})")
    if not isinstance(datos, dict):
        raise ErrorGiros(f"{donde}: debe ser un objeto JSON")
    faltan, sobran = CLAVES - set(datos), set(datos) - CLAVES - CLAVES_OPCIONALES
    if faltan:
        raise ErrorGiros(f"{donde}: faltan las claves {', '.join(sorted(faltan))}")
    if sobran:
        raise ErrorGiros(f"{donde}: clave(s) desconocida(s) {', '.join(sorted(sobran))} (válidas: {', '.join(sorted(CLAVES | CLAVES_OPCIONALES))})")
    h1 = datos["h1"]
    frases = [h1] if isinstance(h1, str) else h1
    if not isinstance(frases, list) or not frases:
        raise ErrorGiros(f"{donde}: h1 debe ser un texto o una lista de frases")
    out = {
        "h1": [texto_no_vacio(f, f"{donde}: h1") for f in frases],
        "titulo": texto_no_vacio(datos["titulo"], f"{donde}: titulo"),
        "descripcion": texto_no_vacio(datos["descripcion"], f"{donde}: descripcion"),
    }
    for clave in ("hero", "intro_etapas"):
        if clave in datos:
            out[clave] = texto_no_vacio(datos[clave], f"{donde}: {clave}")
    if "preguntas" in datos:
        preguntas = datos["preguntas"]
        if not isinstance(preguntas, list) or not preguntas:
            raise ErrorGiros(f"{donde}: preguntas debe ser una lista no vacía de objetos con «pregunta» y «respuesta»")
        out["preguntas"] = []
        for i, q in enumerate(preguntas, 1):
            if not isinstance(q, dict) or set(q) != CLAVES_PREGUNTA:
                raise ErrorGiros(f"{donde}: preguntas[{i}] debe ser un objeto con «pregunta» y «respuesta»")
            out["preguntas"].append({k: texto_no_vacio(q[k], f"{donde}: preguntas[{i}].{k}") for k in sorted(CLAVES_PREGUNTA)})
    problemas = datos["problemas"]
    if not isinstance(problemas, list) or len(problemas) != FILAS:
        raise ErrorGiros(f"{donde}: problemas debe ser una lista de {FILAS} elementos")
    out["problemas"] = []
    for i, p in enumerate(problemas, 1):
        if not isinstance(p, dict) or "texto" not in p or set(p) - CLAVES_PROBLEMA:
            raise ErrorGiros(f"{donde}: problemas[{i}] debe ser un objeto con «texto» y, opcional, «enlace»")
        fila = {"texto": texto_no_vacio(p["texto"], f"{donde}: problemas[{i}].texto"), "enlace": None}
        if "enlace" in p:
            e = p["enlace"]
            if not isinstance(e, dict) or set(e) != CLAVES_ENLACE:
                raise ErrorGiros(f"{donde}: problemas[{i}].enlace debe ser un objeto con «texto» y «href»")
            fila["enlace"] = {k: texto_no_vacio(e[k], f"{donde}: problemas[{i}].enlace.{k}") for k in CLAVES_ENLACE}
        out["problemas"].append(fila)
    return out


# ------------------------------------------------------------------------------------------------------------------
# Generación
# ------------------------------------------------------------------------------------------------------------------
def poner_atributo(etiqueta, atributo, valor, donde):
    patron = re.compile(rf'(\b{atributo}\s*=\s*")([^"]*)(")')
    if not patron.search(etiqueta):
        raise ErrorGiros(f"index.html: {donde} no tiene el atributo {atributo}")
    return patron.sub(lambda m: m.group(1) + esc_attr(valor) + m.group(3), etiqueta, count=1)


def cambiar_meta(html, clave, nuevo):
    """<meta property|name="clave" content="..."> -> content=nuevo (debe existir exactamente una)."""
    patron = rf"""<meta\b{ATR}\b(?:property|name)="{re.escape(clave)}"{ATR}>"""
    m = una(patron, html, f'<meta ... "{clave}">', re.I)
    return html[: m.start()] + poner_atributo(m.group(0), "content", nuevo, f'<meta "{clave}">') + html[m.end():]


def sangria_de(html, pos):
    inicio = html.rfind("\n", 0, pos) + 1
    return re.match(r"[ \t]*", html[inicio:pos]).group(0)


def generar(plantilla, datos, giro):
    html = plantilla
    if not re.match(r"<!doctype html>", html, re.I):
        raise ErrorGiros("index.html: debe empezar con <!doctype html>")
    if PREFIJO_COMENTARIO in html[:400]:
        raise ErrorGiros("index.html: la plantilla no puede ser una página generada")

    # Origen y URL de la página, a partir del canonical que la plantilla tiene hoy (dominio.py ya lo dejó al día).
    canon = una(rf"""<link\b{ATR}\brel="canonical"{ATR}>""", html, '<link rel="canonical">', re.I)
    href = re.search(r'\bhref="([^"]*)"', canon.group(0))
    origen = re.match(r"^(https?://[^/]+)", href.group(1)) if href else None
    if not origen:
        raise ErrorGiros('index.html: <link rel="canonical"> debe traer un href absoluto (https://dominio/)')
    url = f"{origen.group(1)}/{giro}/"

    # <head>
    t = una(r"(<title>)(.*?)(</title>)", html, "<title>", re.S)
    html = html[: t.start()] + t.group(1) + esc(datos["titulo"]) + t.group(3) + html[t.end():]
    canon = una(rf"""<link\b{ATR}\brel="canonical"{ATR}>""", html, '<link rel="canonical">', re.I)
    html = html[: canon.start()] + poner_atributo(canon.group(0), "href", url, '<link rel="canonical">') + html[canon.end():]
    for clave, valor in [
        ("description", datos["descripcion"]),
        ("og:url", url),
        ("og:title", datos["titulo"]),
        ("og:description", datos["descripcion"]),
        ("twitter:title", datos["titulo"]),
        ("twitter:description", datos["descripcion"]),
    ]:
        html = cambiar_meta(html, clave, valor)

    # h1
    (i, a, c, f), = bloque(html, "h1", "el titular")
    frases = " ".join(f'<span class="hero__frase">{esc(x)}</span>' for x in datos["h1"])
    html = html[:a] + frases + html[c:]

    # Texto bajo el titular (opcional)
    if "hero" in datos:
        (i, a, c, f), = bloque(html, "hero", "el párrafo bajo el titular")
        html = html[:a] + esc(datos["hero"]) + html[c:]
    else:
        bloque(html, "hero", "el párrafo bajo el titular")

    # Preguntas propias del giro, ANTES de las generales (opcional); mismo marcado que las de la home
    (i, a, c, f), = bloque(html, "faq", "la lista de preguntas frecuentes")
    if "preguntas" in datos:
        sangria = sangria_de(html, i)
        items = "\n".join(
            f'{sangria}<details class="faq__item">\n{sangria}  <summary>{esc(q["pregunta"])}</summary>\n{sangria}  <p>{esc(q["respuesta"])}</p>\n{sangria}</details>'
            for q in datos["preguntas"]
        )
        html = html[:a] + "\n" + items + html[a:]

    # Problemas
    (pi, pa, pc, pf), = bloque(html, "problemas", "la sección de los tres problemas")
    seccion = html[pi:pf]
    filas = bloque(seccion, "problema", "cada fila de problema", esperadas=FILAS)
    for (fi, fa, fc, ff), fila in reversed(list(zip(filas, datos["problemas"]))):
        cuerpo = seccion[fa:fc]
        frase = una(r'(<p class="problemas__frase">)(.*?)(</p>)', cuerpo, '<p class="problemas__frase"> de la fila', re.S)
        cuerpo = cuerpo[: frase.start()] + frase.group(1) + esc(fila["texto"]) + frase.group(3) + cuerpo[frase.end():]
        if fila["enlace"]:
            enlace = una(r"<a\b[^>]*>(.*?)</a>", cuerpo, "el <a> de la fila", re.S)
            etq = poner_atributo(re.match(r"<a\b[^>]*>", enlace.group(0)).group(0), "href", fila["enlace"]["href"], "el <a> de la fila")
            cuerpo = cuerpo[: enlace.start()] + etq + esc(fila["enlace"]["texto"]) + "</a>" + cuerpo[enlace.end():]
        seccion = seccion[:fa] + cuerpo + seccion[fc:]
    html = html[:pi] + seccion + html[pf:]

    # Orden: las etapas (#sistemas) van antes de los problemas.
    (pi, _, _, _), = bloque(html, "problemas", "la sección de los tres problemas")
    (ei, _, _, ef), = bloque(html, "etapas", "la sección de las seis etapas (#sistemas)")
    if ei > pi:
        hueco = re.search(r"\s*$", html[:ei]).group(0)
        etapas = html[ei:ef]
        html = html[: ei - len(hueco)] + html[ef:]
        html = html[:pi] + etapas + hueco + html[pi:]

    # Entrada propia de la sección de etapas (opcional): sustituye a la genérica, sin crear sección nueva
    if "intro_etapas" in datos:
        (i, a, c, f), = bloque(html, "intro-etapas", "la entrada bajo el H2 de las etapas")
        html = html[:a] + esc(datos["intro_etapas"]) + html[c:]
    else:
        bloque(html, "intro-etapas", "la entrada bajo el H2 de las etapas")

    # JSON-LD
    (ji, ja, jc, jf), = bloque(html, "json-ld", "el JSON-LD")
    try:
        grafo = json.loads(html[ja:jc])
    except ValueError as e:
        raise ErrorGiros(f"index.html: el JSON-LD marcado no es JSON válido ({e})")
    servicios = [n for n in (grafo.get("@graph") or []) if isinstance(n, dict) and n.get("@type") == "Service"] if isinstance(grafo, dict) else []
    if len(servicios) != 1:
        raise ErrorGiros(f'index.html: el JSON-LD marcado debe tener en "@graph" exactamente un nodo "Service" y tiene {len(servicios)}')
    servicio = servicios[0]
    servicio["@id"] = f"{url}#servicio"
    servicio["url"] = url
    servicio["description"] = datos["descripcion"]
    sangria = sangria_de(html, ji)
    cuerpo = json.dumps(grafo, ensure_ascii=False, indent=2).replace("\n", "\n" + sangria + "  ")
    html = html[:ja] + "\n" + sangria + "  " + cuerpo + "\n" + sangria + html[jc:]

    # Fuera las marcas y puesto el aviso al inicio.
    html = re.sub(r'[ \t]+data-giro="[^"]*"', "", html)
    if "data-giro" in html:
        raise ErrorGiros('index.html: queda un data-giro que no es de la forma data-giro="nombre"')
    comentario = f"<!-- {PREFIJO_COMENTARIO} desde index.html y scripts/giros/{giro}.json. No editar a mano. -->"
    doctype = re.match(r"<!doctype html>", html, re.I).group(0)
    return doctype + "\n" + comentario + html[len(doctype):]


# ------------------------------------------------------------------------------------------------------------------
# Archivos
# ------------------------------------------------------------------------------------------------------------------
def giros_de(raiz):
    carpeta = raiz / CARPETA_DATOS
    return sorted(carpeta.glob("*.json")) if carpeta.is_dir() else []


def comprobar_destino(raiz, giro):
    if not RE_SLUG.match(giro) or giro in RESERVADOS:
        raise ErrorGiros(f"scripts/giros/{giro}.json: el nombre del giro debe ser minúsculas, números y guiones, y no ser uno reservado ({', '.join(sorted(RESERVADOS))})")
    if (raiz / f"{giro}.html").exists():
        raise ErrorGiros(f"{giro}.html ya existe en la raíz y chocaría con /{giro}")
    destino = raiz / giro / "index.html"
    if destino.exists() and PREFIJO_COMENTARIO not in destino.read_text(encoding="utf-8")[:400]:
        raise ErrorGiros(f"{giro}/index.html ya existe y no fue generado por scripts/giros.py: no se sobrescribe (renombre el giro o borre esa página)")
    return destino


def diferencias(viejo, nuevo):
    a, b = viejo.splitlines(), nuevo.splitlines()
    return [(i + 1, x.strip()[:110], y.strip()[:110]) for i, (x, y) in enumerate(zip(a, b)) if x != y] or [(min(len(a), len(b)) + 1, "(distinto largo)", "")]


def huerfanas(raiz, giros):
    """Páginas generadas por este script (<dir>/index.html con el aviso) cuyo scripts/giros/<dir>.json ya no existe:
    nadie las regenera, así que se quedarían publicadas con textos viejos sin que --check lo note."""
    r = []
    for pagina in sorted(raiz.glob("*/index.html")):
        nombre = pagina.parent.name
        if nombre in giros or nombre.startswith(".") or nombre in RESERVADOS:
            continue
        try:
            inicio = pagina.read_text(encoding="utf-8")[:400]
        except (OSError, UnicodeDecodeError):
            continue
        if PREFIJO_COMENTARIO in inicio:
            r.append(pagina.relative_to(raiz).as_posix())
    return r


def main(argv=None):
    ap = argparse.ArgumentParser(description="Genera <giro>/index.html desde index.html y scripts/giros/<giro>.json.")
    ap.add_argument("--check", action="store_true", help="no escribe; sale con 1 si alguna página no coincide con lo que se generaría")
    ap.add_argument("--raiz", type=pathlib.Path, default=RAIZ_DEFECTO, help="raíz del sitio (por defecto, este repo)")
    args = ap.parse_args(argv)
    raiz = args.raiz.resolve()
    archivos = giros_de(raiz)
    sobrantes = huerfanas(raiz, {r.stem for r in archivos})
    for rel in sobrantes:
        print(f"FALLA [giros] {rel} fue generada por scripts/giros.py pero ya no existe scripts/giros/{rel.split('/')[0]}.json: "
              "bórrela (y su <loc> de sitemap.xml) o restaure el JSON")
    if not archivos:
        print("giros: 0 giro(s) en scripts/giros/; nada que generar")
        return 1 if sobrantes else 0
    try:
        plantilla_ruta = raiz / "index.html"
        if not plantilla_ruta.exists():
            raise ErrorGiros(f"no existe la plantilla {plantilla_ruta}")
        plantilla = plantilla_ruta.read_text(encoding="utf-8")
        listas = []
        for ruta in archivos:
            giro = ruta.stem
            destino = comprobar_destino(raiz, giro)
            listas.append((giro, destino, generar(plantilla, leer_datos(ruta, giro), giro)))
    except ErrorGiros as e:
        print(f"FALLA [giros] {e}", file=sys.stderr)
        return 2
    cambiados = []
    for giro, destino, nuevo in listas:
        viejo = destino.read_text(encoding="utf-8") if destino.exists() else None
        if viejo == nuevo:
            continue
        cambiados.append((giro, destino, viejo, nuevo))
    verbo = "desactualizada(s)" if args.check else "escrita(s)"
    print(f"giros: {len(listas)} giro(s), {len(cambiados)} página(s) {verbo}")
    for giro, destino, viejo, nuevo in cambiados:
        rel = destino.relative_to(raiz).as_posix()
        print(" ", rel)
        if args.check:
            if viejo is None:
                print(f"FALLA [giros] {rel} no existe")
            else:
                for linea, x, y in diferencias(viejo, nuevo)[:3]:
                    print(f"FALLA [giros] {rel}:{linea} no coincide con lo que generaría index.html + scripts/giros/{giro}.json\n    hay:  {x}\n    debe: {y}")
        else:
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(nuevo, encoding="utf-8")
    if args.check and cambiados:
        print("FALLA [giros] corra: python3 scripts/giros.py")
        return 1
    return 1 if sobrantes else 0


if __name__ == "__main__":
    sys.exit(main())
