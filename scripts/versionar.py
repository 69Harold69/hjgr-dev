#!/usr/bin/env python3
"""Sello de versión (?v=<hash>) de los recursos propios del sitio.

El sitio no tiene build, así que el navegador cachea assets/css y assets/js por URL.
Este script calcula un hash corto del CONTENIDO de todos los .css y .js de assets/
(ignorando los `?v=` ya escritos) y lo pone como `?v=<hash>` en:
  - los `href` / `src` de assets/css y assets/js en todos los .html;
  - los imports entre módulos JS propios (`from "./x.js"`, `import("./x.js")`) y los
    `@import "./x.css"` de los CSS (si solo se sellara main.js, el navegador seguiría
    usando un módulo viejo).
Todas las URLs cambian juntas, así un módulo nunca se carga con dos URLs distintas.
Imágenes y fuentes NO se sellan (cambian de nombre cuando cambian).

Idempotente: si nada cambió, no toca ningún archivo.

Uso:
  python3 scripts/versionar.py              reescribe
  python3 scripts/versionar.py --check      no escribe; sale con 1 si hay URLs desactualizadas
  python3 scripts/versionar.py --raiz DIR   trabaja sobre otra copia del sitio (pruebas)
Solo biblioteca estándar.
"""
import argparse
import hashlib
import os
import pathlib
import re
import sys

RAIZ_DEFECTO = pathlib.Path(__file__).resolve().parent.parent
EXCLUIDOS = {".git", "node_modules", "scripts", ".worktrees"}
V = re.compile(r"\?v=[0-9a-f]+")

# href/src de assets propios en HTML (comillas dobles o simples)
RE_HTML = re.compile(r"""((?:href|src)=(["'])[^"'?#]*assets/(?:css|js)/[^"'?#]+\.(?:css|js))(?:\?v=[0-9a-f]+)?(\2)""")
# from "./x.js" / import("./x.js") en módulos
RE_JS = re.compile(r"""((?:from\s+|import\s*\(\s*)(["'])\.{1,2}/[^"'?#]+\.js)(?:\?v=[0-9a-f]+)?(\2)""")
# @import "./x.css" / @import url("./x.css") en CSS
RE_CSS = re.compile(r"""(@import\s+(?:url\(\s*)?(["'])\.{1,2}/[^"'?#]+\.css)(?:\?v=[0-9a-f]+)?(\2)""")


def recorrer(raiz, sufijo=None):
    """Archivos de la raíz sin entrar a las carpetas excluidas (node_modules puede tener miles)."""
    for dirpath, dirnames, nombres in os.walk(raiz):
        dirnames[:] = sorted(d for d in dirnames if d not in EXCLUIDOS)
        for n in sorted(nombres):
            if sufijo is None or n.endswith(sufijo):
                yield pathlib.Path(dirpath) / n


def fuentes(raiz):
    assets = raiz / "assets"
    if assets.is_dir():
        for ext in (".css", ".js"):
            yield from sorted(p for p in recorrer(assets, ext))


def calcular_hash(raiz):
    h = hashlib.sha1()
    for f in fuentes(raiz):
        h.update(f.relative_to(raiz).as_posix().encode())
        h.update(V.sub("", f.read_text(encoding="utf-8")).encode())
    return h.hexdigest()[:10]


def objetivos(raiz):
    for p in recorrer(raiz, ".html"):
        yield p, RE_HTML
    for p in fuentes(raiz):
        if "vendor" in p.relative_to(raiz).parts:
            continue
        yield p, (RE_JS if p.suffix == ".js" else RE_CSS)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Sello ?v=<hash> de assets/css y assets/js.")
    ap.add_argument("--check", action="store_true", help="no escribe; sale con 1 si hay URLs desactualizadas")
    ap.add_argument("--raiz", type=pathlib.Path, default=RAIZ_DEFECTO, help="raíz del sitio (por defecto, este repo)")
    args = ap.parse_args(argv)
    raiz = args.raiz.resolve()
    version = calcular_hash(raiz)
    cambiados = []
    for ruta, regex in objetivos(raiz):
        viejo = ruta.read_text(encoding="utf-8")
        nuevo = regex.sub(lambda m: f"{m.group(1)}?v={version}{m.group(3)}", viejo)
        if viejo != nuevo:
            cambiados.append(ruta.relative_to(raiz).as_posix())
            if not args.check:
                ruta.write_text(nuevo, encoding="utf-8")
    verbo = "desactualizado(s)" if args.check else "actualizado(s)"
    print(f"versión {version}: {len(cambiados)} archivo(s) {verbo}")
    for c in cambiados:
        print(" ", c)
    if args.check and cambiados:
        print("FALLA [versionado] corra: python3 scripts/versionar.py")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
