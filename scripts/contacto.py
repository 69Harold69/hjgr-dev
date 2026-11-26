#!/usr/bin/env python3
"""Enlaces de contacto del sitio, a partir de scripts/sitio.json.

El sitio no tiene build ni formularios: los contactos son enlaces. Para que el número de
WhatsApp y la agenda vivan en UN solo lugar, en los .html se marcan los enlaces y este script
les escribe el `href`:

  <a data-contacto="whatsapp">  ->  href="https://wa.me/<whatsapp>?text=<mensaje codificado>"
  <a data-contacto="cal">       ->  href="<cal>", target="_blank" rel="noopener" (se abre en pestaña nueva)
  <a data-contacto="correo">    ->  href="mailto:<correo>"  (el texto visible lo escribe usted; la clave `correo` es opcional)
  <time data-aviso-vigente>     ->  <time data-aviso-vigente datetime="AAAA-MM-DD">26 de noviembre de 2026</time>
                                    a partir de `aviso_vigente` (AAAA-MM-DD). Mientras sea PENDIENTE queda el texto
                                    «PENDIENTE», sin datetime; es el marcador del aviso de privacidad (/privacidad/).

El mensaje es «Hola Harold, vi su página y me interesa», codificado como URL (UTF-8).

Uso:
  python3 scripts/contacto.py                    escribe los href
  python3 scripts/contacto.py --check            no escribe; sale con 1 si algún href no coincide
  python3 scripts/contacto.py --exigir-reales    además falla (1) si sitio.json aún tiene marcadores
                                                 (52XXXXXXXXXX, PENDIENTE; incluido `aviso_vigente`) o si algún .html los conserva,
                                                 o conserva el hueco de la foto («Foto pendiente»,
                                                 .foto__espacio); úselo antes de publicar
  python3 scripts/contacto.py --raiz DIR         trabaja sobre otra copia del sitio (pruebas)

Mientras haya marcadores el script funciona igual, pero imprime un AVISO. Idempotente.
Si --raiz no trae scripts/sitio.json se usa el de este repo. Solo biblioteca estándar.
"""
import argparse
import datetime
import html
import json
import os
import pathlib
import re
import sys
from urllib.parse import quote

AQUI = pathlib.Path(__file__).resolve().parent
RAIZ_DEFECTO = AQUI.parent
SITIO = pathlib.Path("scripts") / "sitio.json"
EXCLUIDOS = {".git", "node_modules", "scripts", ".worktrees"}
MENSAJE = "Hola Harold, vi su página y me interesa"
MARCADORES = ("52XXXXXXXXXX", "PENDIENTE")
# En los .html, además de los marcadores de sitio.json: el hueco de la foto, que no sale de sitio.json (la clave
# `foto` es solo un recordatorio) y se reemplaza a mano en index.html. --exigir-reales lo busca en las páginas.
MARCADORES_HTML = (
    (re.compile(r"52XXXXXXXXXX"), "52XXXXXXXXXX"),
    (re.compile(r"PENDIENTE"), "PENDIENTE"),
    (re.compile(r"foto pendiente", re.I), "«Foto pendiente»"),
    (re.compile(r"""class\s*=\s*["'][^"']*\bfoto__espacio\b"""), "el hueco de la foto (.foto__espacio)"),
)

RE_A = re.compile(r"<a\b(?:[^>\"']|\"[^\"]*\"|'[^']*')*>", re.I)
RE_CONTACTO = re.compile(r"""\bdata-contacto\s*=\s*(?:"([^"]*)"|'([^']*)')""", re.I)
RE_TIME = re.compile(r"<time\b(?:[^>\"']|\"[^\"]*\"|'[^']*')*\bdata-aviso-vigente\b(?:[^>\"']|\"[^\"]*\"|'[^']*')*>.*?</time>", re.I | re.S)
RE_TARGET_REL = re.compile(r"""\s(?:target|rel)\s*=\s*(?:"[^"]*"|'[^']*')""", re.I)
MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre")
RE_HREF = re.compile(r"""(\s)href\s*=\s*(?:"[^"]*"|'[^']*')""", re.I)


def recorrer(raiz, sufijo=None):
    """Archivos de la raíz sin entrar a las carpetas excluidas (node_modules puede tener miles)."""
    for dirpath, dirnames, nombres in os.walk(raiz):
        dirnames[:] = sorted(d for d in dirnames if d not in EXCLUIDOS)
        for n in sorted(nombres):
            if sufijo is None or n.endswith(sufijo):
                yield pathlib.Path(dirpath) / n


def leer_sitio(raiz):
    propio = raiz / SITIO
    ruta = propio if propio.exists() else RAIZ_DEFECTO / SITIO
    return json.loads(ruta.read_text(encoding="utf-8"))


def destinos(sitio):
    wa = str(sitio["whatsapp"]).strip()
    urls = {
        "whatsapp": f"https://wa.me/{wa}?text={quote(MENSAJE, safe='')}",
        "cal": str(sitio["cal"]).strip(),
    }
    if str(sitio.get("correo", "")).strip():
        urls["correo"] = "mailto:" + str(sitio["correo"]).strip()
    return urls


def marcadores(sitio):
    return [k for k in ("whatsapp", "cal", "foto", "aviso_vigente") if any(m in str(sitio.get(k, "")) for m in MARCADORES)]


def fecha_legible(valor):
    """'2026-11-26' -> (date, '26 de noviembre de 2026'); ValueError si no es AAAA-MM-DD válida."""
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", valor):
        raise ValueError(valor)
    d = datetime.date.fromisoformat(valor)
    return f"{d.day} de {MESES[d.month - 1]} de {d.year}"


def poner_vigencia(texto, sitio, nombre, errores):
    valor = str(sitio.get("aviso_vigente", "")).strip()
    if not valor:
        return texto
    if "PENDIENTE" in valor:
        nuevo = '<time data-aviso-vigente>PENDIENTE</time>'
    else:
        try:
            nuevo = f'<time data-aviso-vigente datetime="{valor}">{fecha_legible(valor)}</time>'
        except ValueError:
            errores.append(f"{nombre}: aviso_vigente «{valor}» no es una fecha AAAA-MM-DD válida (o PENDIENTE)")
            return texto
    return RE_TIME.sub(lambda m: nuevo, texto)


def poner_href(etiqueta, url, nueva_pestana=False):
    nuevo = f'href="{html.escape(url, quote=True)}"'
    if RE_HREF.search(etiqueta):
        etiqueta = RE_HREF.sub(lambda m: m.group(1) + nuevo, etiqueta, count=1)
    else:
        etiqueta = re.sub(r"^<a\b", lambda m: m.group(0) + " " + nuevo, etiqueta, count=1, flags=re.I)
    if nueva_pestana:
        etiqueta = RE_TARGET_REL.sub("", etiqueta)
        etiqueta = re.sub(r"\s*/?>$", lambda m: ' target="_blank" rel="noopener"' + m.group(0).lstrip(), etiqueta)
    return etiqueta


def procesar(texto, urls, nombre, errores, sitio=None):
    def uno(m):
        etq = m.group(0)
        c = RE_CONTACTO.search(etq)
        if not c:
            return etq
        tipo = c.group(1) if c.group(1) is not None else c.group(2)
        if tipo not in urls:
            errores.append(f"{nombre}: data-contacto=\"{tipo}\" desconocido (use: {', '.join(urls)})")
            return etq
        return poner_href(etq, urls[tipo], nueva_pestana=(tipo == "cal"))

    texto = RE_A.sub(uno, texto)
    return poner_vigencia(texto, sitio, nombre, errores) if sitio is not None else texto


def main(argv=None):
    ap = argparse.ArgumentParser(description="Escribe los href de los enlaces data-contacto.")
    ap.add_argument("--check", action="store_true", help="no escribe; sale con 1 si algún href no coincide")
    ap.add_argument("--exigir-reales", action="store_true", help="falla si sitio.json aún tiene marcadores")
    ap.add_argument("--raiz", type=pathlib.Path, default=RAIZ_DEFECTO, help="raíz del sitio (por defecto, este repo)")
    args = ap.parse_args(argv)
    raiz = args.raiz.resolve()
    sitio = leer_sitio(raiz)
    urls = destinos(sitio)
    pendientes = marcadores(sitio)
    errores, cambiados, enlaces, en_paginas = [], [], 0, []
    for p in recorrer(raiz, ".html"):
        rel = p.relative_to(raiz)
        viejo = p.read_text(encoding="utf-8")
        enlaces += len(RE_CONTACTO.findall(viejo))
        nuevo = procesar(viejo, urls, rel.as_posix(), errores, sitio)
        # Lo que quedará publicado (con --check, lo que hay; si no, lo que se escribe).
        final = viejo if args.check else nuevo
        en_paginas += [f"{rel.as_posix()}: {que}" for patron, que in MARCADORES_HTML if patron.search(final)]
        if nuevo != viejo:
            cambiados.append(rel.as_posix())
            if not args.check:
                p.write_text(nuevo, encoding="utf-8")
    verbo = "desactualizado(s)" if args.check else "actualizado(s)"
    print(f"contacto: {enlaces} enlace(s) data-contacto, {len(cambiados)} archivo(s) {verbo}")
    for c in cambiados:
        print(" ", c)
    for e in errores:
        print(f"FALLA [contacto] {e}")
    if pendientes:
        print(f"AVISO [contacto] sitio.json aún tiene marcadores sin llenar: {', '.join(pendientes)}. "
              "Los enlaces quedan con el marcador; llénelos antes de publicar (--exigir-reales lo verifica).")
    falla = bool(errores)
    if args.check and cambiados:
        print("FALLA [contacto] corra: python3 scripts/contacto.py")
        falla = True
    if args.exigir_reales and pendientes:
        print(f"FALLA [contacto] --exigir-reales: quedan marcadores en sitio.json ({', '.join(pendientes)})")
        falla = True
    if args.exigir_reales and en_paginas:
        for m in en_paginas:
            print(f"FALLA [contacto] --exigir-reales: queda un marcador en {m}")
        falla = True
    return 1 if falla else 0


if __name__ == "__main__":
    sys.exit(main())
