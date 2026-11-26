#!/usr/bin/env python3
"""Pruebas de las propias herramientas (solo biblioteca estándar).

  python3 -I scripts/pruebas/test_herramientas.py [--rapido]

  --rapido  omite Lighthouse al probar fixtures/bueno (lo usa `todo.mjs --sin-lighthouse`)

Qué comprueba:
  1. fixtures/bueno pasa TODA la suite (validar --estricto, sin-js, tactil, foco, contraste, cls, capturas,
     lighthouse).
  2. Cada fixtures/malos/<caso> falla POR SU REGLA y por ninguna otra. Un «malo» es una superposición: solo trae
     los archivos que cambian respecto de bueno. La prueba copia bueno a una carpeta temporal, encima pone el
     malo y (salvo en los casos de versionado) vuelve a sellar con versionar.py, como haría quien edita.
       - casos estáticos: validar.mjs --json; el conjunto de reglas que fallan debe ser exactamente el esperado.
       - casos de navegador: se corren sin-js, tactil, foco, contraste y cls; debe fallar solo la herramienta
         del caso, y validar debe seguir en verde.
  3. versionar.py, dominio.py y contacto.py: idempotencia, --check, --exigir-reales, codificación del mensaje.
  4. El servidor de pruebas: try_files, 404, archivos ocultos, cabeceras (también en los 404) y compresión.
  5. La guardia de registro de todo.mjs.
"""
import concurrent.futures
import gzip
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import urllib.error
import urllib.request

AQUI = pathlib.Path(__file__).resolve().parent
SCRIPTS = AQUI.parent
BUENO = AQUI / "fixtures" / "bueno"
MALOS = AQUI / "fixtures" / "malos"
RAPIDO = "--rapido" in sys.argv
if RAPIDO:
    sys.argv.remove("--rapido")

MENSAJE_CODIFICADO = "Hola%20Harold%2C%20vi%20su%20p%C3%A1gina%20y%20me%20interesa"
BROWSER = ["sin-js", "tactil", "foco", "contraste", "cls"]

# caso -> (herramienta que debe fallar, reglas de validar que deben fallar, ¿se vuelve a sellar con versionar?)
# Para casos de validar, la «herramienta» es "validar" y el conjunto es EXACTO.
CASOS = {
    "estilo-etiqueta": ("validar", {"csp-estatica"}),
    "estilo-atributo": ("validar", {"csp-estatica"}),
    "script-en-linea": ("validar", {"csp-estatica"}),
    "manejador-on": ("validar", {"csp-estatica"}),
    "javascript-uri": ("validar", {"csp-estatica"}),
    "cdn": ("validar", {"csp-estatica"}),
    "css-externo": ("validar", {"csp-estatica"}),
    "formulario": ("validar", {"formularios"}),
    "dos-h1": ("validar", {"meta"}),
    "tuteo": ("validar", {"trato"}),
    "somos": ("validar", {"voz"}),
    "agencia": ("validar", {"voz"}),
    "precio-fuera-de-lista": ("validar", {"precios"}),
    "precio-redondo": ("validar", {"precios"}),
    "img-sin-dimensiones": ("validar", {"imagenes"}),
    "enlace-roto": ("validar", {"enlaces"}),
    "a-sin-href": ("validar", {"enlaces"}),
    "canonical-ajeno": ("validar", {"meta", "dominio"}),
    "json-ld-resenas": ("validar", {"json-ld"}),
    "html-invalido": ("validar", {"html-validate"}),
    "csp-readme-distinta": ("validar", {"csp-readme"}),
    "sitemap-incompleto": ("validar", {"sitemap"}),
    "dominio-viejo": ("validar", {"dominio"}),
    "contacto-sin-escribir": ("validar", {"contacto"}),
    "versionado-viejo": ("validar", {"versionado"}),
    "contraste-bajo": ("contraste", set()),
    "boton-chico": ("tactil", set()),
    "sin-outline": ("foco", set()),
    "opacidad-cero": ("sin-js", set()),
    "salto-layout": ("cls", set()),
}
SIN_SELLAR = {"versionado-viejo", "contacto-sin-escribir"}  # estos casos prueban justo lo que el sellado arregla


def correr(cmd, cwd=AQUI, **kw):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, **kw)


def py(script, *args):
    return correr(["python3", "-I", str(SCRIPTS / script), *args])


def mjs(script, *args):
    return correr(["node", str(AQUI / script), *args])


def copiar_bueno(destino):
    shutil.copytree(BUENO, destino, dirs_exist_ok=True)
    return destino


def instantanea(raiz):
    return {p.relative_to(raiz).as_posix(): p.read_bytes() for p in sorted(raiz.rglob("*")) if p.is_file()}


class SitioTemporal(unittest.TestCase):
    """Cada prueba trabaja sobre su propia copia de fixtures/bueno."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.raiz = copiar_bueno(pathlib.Path(self._tmp.name) / "sitio")

    def leer(self, rel):
        return (self.raiz / rel).read_text(encoding="utf-8")

    def escribir(self, rel, texto):
        (self.raiz / rel).write_text(texto, encoding="utf-8")


class PruebasVersionar(SitioTemporal):
    def test_bueno_ya_esta_sellado(self):
        r = py("versionar.py", "--check", "--raiz", str(self.raiz))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_cambio_de_css_desactualiza_y_se_reescribe(self):
        self.escribir("assets/css/estilos.css", self.leer("assets/css/estilos.css") + "\n/* cambio */\n")
        self.assertEqual(py("versionar.py", "--check", "--raiz", str(self.raiz)).returncode, 1)
        antes = instantanea(self.raiz)
        self.assertEqual(py("versionar.py", "--check", "--raiz", str(self.raiz)).returncode, 1)
        self.assertEqual(antes, instantanea(self.raiz), "--check no debe escribir")
        self.assertEqual(py("versionar.py", "--raiz", str(self.raiz)).returncode, 0)
        self.assertEqual(py("versionar.py", "--check", "--raiz", str(self.raiz)).returncode, 0)
        hashes = set(re.findall(r"\?v=([0-9a-f]+)", self.leer("index.html") + self.leer("assets/js/main.js")))
        self.assertEqual(len(hashes), 1, "todas las URLs cambian juntas")

    def test_sella_html_e_imports_de_modulos(self):
        self.assertRegex(self.leer("index.html"), r'href="/assets/css/estilos\.css\?v=[0-9a-f]{10}"')
        self.assertRegex(self.leer("index.html"), r'src="/assets/js/main\.js\?v=[0-9a-f]{10}"')
        self.assertRegex(self.leer("assets/js/main.js"), r'from "\./util\.js\?v=[0-9a-f]{10}"')

    def test_idempotente(self):
        self.escribir("assets/js/util.js", self.leer("assets/js/util.js") + "// cambio\n")
        py("versionar.py", "--raiz", str(self.raiz))
        antes = instantanea(self.raiz)
        r = py("versionar.py", "--raiz", str(self.raiz))
        self.assertEqual(r.returncode, 0)
        self.assertIn("0 archivo(s)", r.stdout)
        self.assertEqual(antes, instantanea(self.raiz))

    def test_ignora_scripts_y_node_modules(self):
        (self.raiz / "node_modules").mkdir()
        (self.raiz / "node_modules" / "x.html").write_text('<link href="/assets/css/a.css">', encoding="utf-8")
        self.escribir("assets/css/estilos.css", "/* otro */\n")
        py("versionar.py", "--raiz", str(self.raiz))
        self.assertNotIn("?v=", (self.raiz / "node_modules" / "x.html").read_text(encoding="utf-8"))


class PruebasDominio(SitioTemporal):
    def test_bueno_coincide(self):
        self.assertEqual(py("dominio.py", "--check", "--raiz", str(self.raiz)).returncode, 0)

    def test_cambia_todo_y_es_idempotente(self):
        r = py("dominio.py", "--origen", "https://nuevo.test", "--raiz", str(self.raiz))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        for rel in ["index.html", "privacidad/index.html", "sitemap.xml", "robots.txt"]:
            texto = self.leer(rel)
            self.assertNotIn("ejemplo.test", texto, rel)
            self.assertIn("nuevo.test", texto, rel)
        index = self.leer("index.html")
        self.assertIn('<link rel="canonical" href="https://nuevo.test/">', index)
        self.assertIn('og:image" content="https://nuevo.test/assets/img/logo.png"', index)
        self.assertIn('twitter:image" content="https://nuevo.test/assets/img/logo.png"', index)
        self.assertIn('"url":"https://nuevo.test/"', index)
        self.assertIn('"@context":"https://schema.org"', index, "los hosts externos no se tocan")
        sitio = json.loads(self.leer("scripts/sitio.json"))
        self.assertEqual(sitio["origen"], "https://nuevo.test")
        self.assertEqual(sitio["whatsapp"], "5215500000000", "sitio.json conserva las demás claves")
        self.assertEqual(py("dominio.py", "--check", "--raiz", str(self.raiz)).returncode, 0)
        antes = instantanea(self.raiz)
        self.assertEqual(py("dominio.py", "--raiz", str(self.raiz)).returncode, 0)
        self.assertEqual(antes, instantanea(self.raiz))

    def test_check_no_escribe_y_falla_si_no_coincide(self):
        sitio = json.loads(self.leer("scripts/sitio.json"))
        sitio["origen"] = "https://otro.test"
        self.escribir("scripts/sitio.json", json.dumps(sitio))
        antes = instantanea(self.raiz)
        r = py("dominio.py", "--check", "--raiz", str(self.raiz))
        self.assertEqual(r.returncode, 1)
        self.assertIn("otro.test", r.stdout)
        self.assertEqual(antes, instantanea(self.raiz))

    def test_rechaza_origen_invalido(self):
        self.assertEqual(py("dominio.py", "--origen", "http://x.test/", "--raiz", str(self.raiz)).returncode, 2)

    def test_host_externo_del_json_compartido_no_se_marca_pero_otro_si(self):
        index = self.leer("index.html")
        listado = index.replace('"url":"https://ejemplo.test/"', '"url":"https://ejemplo.test/","sameAs":["https://github.com/x"],"logo":"https://cal.com/logo.png"')
        self.escribir("index.html", listado)
        self.assertEqual(py("dominio.py", "--check", "--raiz", str(self.raiz)).returncode, 0, "cal.com está en hosts-externos.json")
        self.escribir("index.html", index.replace('"url":"https://ejemplo.test/"', '"url":"https://ejemplo.test/","logo":"https://desconocido.example/l.png"'))
        r = py("dominio.py", "--check", "--raiz", str(self.raiz))
        self.assertEqual(r.returncode, 1)
        self.assertIn("desconocido.example", r.stdout)

    def test_lista_de_hosts_externos_es_una_sola(self):
        datos = json.loads((SCRIPTS / "hosts-externos.json").read_text(encoding="utf-8"))
        self.assertIn("schema.org", datos["hosts"])
        self.assertNotIn("EXTERNOS = {", (SCRIPTS / "dominio.py").read_text(encoding="utf-8"))
        self.assertNotIn("EXTERNOS = new Set([", (AQUI / "validar.mjs").read_text(encoding="utf-8"))


class PruebasContacto(SitioTemporal):
    def test_bueno_coincide(self):
        r = py("contacto.py", "--check", "--raiz", str(self.raiz))
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertNotIn("AVISO", r.stdout)

    def test_mensaje_de_whatsapp_bien_codificado(self):
        self.escribir("index.html", re.sub(r'(data-contacto="whatsapp") href="[^"]*"', r"\1", self.leer("index.html")))
        sitio = json.loads(self.leer("scripts/sitio.json"))
        sitio["whatsapp"] = "5215512345678"
        self.escribir("scripts/sitio.json", json.dumps(sitio))
        self.assertEqual(py("contacto.py", "--check", "--raiz", str(self.raiz)).returncode, 1)
        self.assertEqual(py("contacto.py", "--raiz", str(self.raiz)).returncode, 0)
        self.assertIn(f'href="https://wa.me/5215512345678?text={MENSAJE_CODIFICADO}"', self.leer("index.html"))
        self.assertIn('href="https://cal.com/ejemplo"', self.leer("index.html"))
        self.assertEqual(py("contacto.py", "--check", "--raiz", str(self.raiz)).returncode, 0)

    def test_idempotente_y_orden_de_atributos(self):
        self.escribir("index.html", self.leer("index.html").replace('<a class="boton" data-contacto="cal" href="https://cal.com/ejemplo">', '<a data-contacto="cal" class="boton" href="viejo">'))
        self.assertEqual(py("contacto.py", "--raiz", str(self.raiz)).returncode, 0)
        antes = instantanea(self.raiz)
        r = py("contacto.py", "--raiz", str(self.raiz))
        self.assertIn("0 archivo(s)", r.stdout)
        self.assertEqual(antes, instantanea(self.raiz))
        self.assertIn('<a data-contacto="cal" class="boton" href="https://cal.com/ejemplo">', self.leer("index.html"))

    def test_marcadores_avisan_y_exigir_reales_falla(self):
        sitio = json.loads(self.leer("scripts/sitio.json"))
        sitio.update(whatsapp="52XXXXXXXXXX", cal="https://cal.com/PENDIENTE", foto="PENDIENTE")
        self.escribir("scripts/sitio.json", json.dumps(sitio))
        r = py("contacto.py", "--raiz", str(self.raiz))
        self.assertEqual(r.returncode, 0, "funciona igual con marcadores")
        self.assertIn("AVISO", r.stdout)
        self.assertIn("52XXXXXXXXXX", self.leer("index.html"))
        r = py("contacto.py", "--exigir-reales", "--raiz", str(self.raiz))
        self.assertEqual(r.returncode, 1)
        self.assertIn("--exigir-reales", r.stdout)

    def test_exigir_reales_pasa_sin_marcadores(self):
        r = py("contacto.py", "--exigir-reales", "--check", "--raiz", str(self.raiz))
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_tipo_desconocido_falla(self):
        self.escribir("index.html", self.leer("index.html").replace('data-contacto="cal"', 'data-contacto="fax"'))
        self.assertEqual(py("contacto.py", "--raiz", str(self.raiz)).returncode, 1)

    def test_el_sitio_real_funciona(self):
        r = py("contacto.py", "--check")
        self.assertEqual(r.returncode, 0, r.stdout)
        sitio = (SCRIPTS / "sitio.json").read_text(encoding="utf-8")
        hay_marcadores = "52XXXXXXXXXX" in sitio or "PENDIENTE" in sitio
        self.assertEqual(py("contacto.py", "--check", "--exigir-reales").returncode, 1 if hay_marcadores else 0)


class PruebasServidor(unittest.TestCase):
    def setUp(self):
        self.proc = subprocess.Popen(["node", str(AQUI / "lib/servidor.mjs"), "--raiz", str(BUENO)], stdout=subprocess.PIPE, text=True)
        self.addCleanup(self._parar)
        linea = self.proc.stdout.readline()
        self.base = re.search(r"(http://127\.0\.0\.1:\d+)", linea).group(1)

    def _parar(self):
        self.proc.terminate()
        self.proc.wait(timeout=10)
        self.proc.stdout.close()

    def get(self, ruta, **cab):
        req = urllib.request.Request(self.base + ruta, headers=cab)
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            with e:
                return e.code, e.headers, e.read()

    def test_try_files(self):
        self.assertEqual(self.get("/")[0], 200)
        self.assertEqual(self.get("/privacidad/")[0], 200)
        self.assertEqual(self.get("/privacidad")[0], 200)
        self.assertEqual(self.get("/404")[0], 200, "{path}.html")

    def test_404_con_pagina_y_estado(self):
        estado, _, cuerpo = self.get("/no-existe")
        self.assertEqual(estado, 404)
        self.assertIn("Página no encontrada", cuerpo.decode())

    def test_oculta_internos(self):
        for ruta in ["/README.md", "/scripts/sitio.json", "/scripts", "/.git/config", "/package.json", "/node_modules/x", "/package-lock.json", "/.gitignore"]:
            self.assertEqual(self.get(ruta)[0], 404, ruta)

    def test_cabeceras_tambien_en_404(self):
        esperadas = {
            "Strict-Transport-Security": "max-age=31536000",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Permissions-Policy": "geolocation=(), camera=(), microphone=(), interest-cohort=()",
            "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        }
        for ruta in ["/", "/no-existe", "/README.md", "/assets/css/estilos.css"]:
            _, cab, _ = self.get(ruta)
            for k, v in esperadas.items():
                self.assertEqual(cab.get(k), v, f"{ruta} {k}")

    def test_compresion(self):
        _, cab, cuerpo = self.get("/assets/css/estilos.css", **{"Accept-Encoding": "gzip"})
        self.assertEqual(cab.get("Content-Encoding"), "gzip")
        self.assertIn(b"--acento", gzip.decompress(cuerpo))
        _, cab, _ = self.get("/assets/css/estilos.css")
        self.assertIsNone(cab.get("Content-Encoding"))


class PruebasRegistro(unittest.TestCase):
    def test_guardia_detecta_prueba_sin_registrar(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(mjs("todo.mjs", "--solo-registro", "--carpeta", d).returncode, 0)
            pathlib.Path(d, "nueva-prueba.mjs").write_text("// sin registrar\n")
            r = mjs("todo.mjs", "--solo-registro", "--carpeta", d)
            self.assertEqual(r.returncode, 1)
            self.assertIn("nueva-prueba.mjs", r.stderr)
            pathlib.Path(d, "nueva-prueba.mjs").unlink()
            pathlib.Path(d, "test_otra.py").write_text("# sin registrar\n")
            self.assertEqual(mjs("todo.mjs", "--solo-registro", "--carpeta", d).returncode, 1)

    def test_las_pruebas_reales_estan_registradas(self):
        r = mjs("todo.mjs", "--solo-registro")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


class PruebasBueno(unittest.TestCase):
    def test_validar_estricto(self):
        r = mjs("validar.mjs", "--raiz", str(BUENO), "--estricto")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_solo_y_regla_desconocida(self):
        r = mjs("validar.mjs", "--raiz", str(BUENO), "--solo", "trato,voz", "--json")
        self.assertEqual(set(json.loads(r.stdout)["reglas"]), {"trato", "voz"})
        self.assertEqual(mjs("validar.mjs", "--solo", "no-existe").returncode, 2)

    def test_herramientas_de_navegador(self):
        def una(h):
            return h, mjs(f"{h}.mjs", "--raiz", str(BUENO))

        herramientas = BROWSER + ["capturas"] + ([] if RAPIDO else ["lighthouse"])
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
            for h, r in ex.map(una, herramientas):
                with self.subTest(herramienta=h):
                    self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_marcadores_avisan_y_con_estricto_fallan(self):
        with tempfile.TemporaryDirectory() as d:
            raiz = copiar_bueno(pathlib.Path(d) / "s")
            p = raiz / "privacidad/index.html"
            p.write_text(p.read_text(encoding="utf-8").replace("responderle.", "responderle. 52XXXXXXXXXX"), encoding="utf-8")
            suave = json.loads(mjs("validar.mjs", "--raiz", str(raiz), "--solo", "marcadores", "--json").stdout)["reglas"]["marcadores"]
            self.assertTrue(suave["ok"])
            self.assertTrue(suave["avisos"])
            self.assertEqual(mjs("validar.mjs", "--raiz", str(raiz), "--solo", "marcadores", "--estricto").returncode, 1)

    def test_sin_paginas_no_se_rompe(self):
        with tempfile.TemporaryDirectory() as d:
            for h in BROWSER:
                r = mjs(f"{h}.mjs", "--raiz", d)
                self.assertEqual(r.returncode, 0, f"{h}: {r.stdout}{r.stderr}")
                self.assertIn("0 páginas", r.stdout)


def evaluar_caso(caso):
    """Devuelve una lista de problemas (vacía si el caso se comporta como se espera)."""
    herramienta, esperadas = CASOS[caso]
    problemas = []
    with tempfile.TemporaryDirectory() as d:
        raiz = copiar_bueno(pathlib.Path(d) / "s")
        shutil.copytree(MALOS / caso, raiz, dirs_exist_ok=True)
        if caso not in SIN_SELLAR:
            py("versionar.py", "--raiz", str(raiz))
        v = mjs("validar.mjs", "--raiz", str(raiz), "--json", "--estricto")
        try:
            reglas = json.loads(v.stdout)["reglas"]
        except Exception:
            return [f"validar no produjo JSON: {v.stdout[-300:]}{v.stderr[-300:]}"]
        fallan = {n for n, x in reglas.items() if not x["ok"]}
        if herramienta == "validar":
            if fallan != esperadas:
                problemas.append(f"debían fallar {sorted(esperadas)} y fallaron {sorted(fallan)}: " + "; ".join(f for n in fallan for f in reglas[n]["fallas"][:2]))
        else:
            if fallan:
                problemas.append(f"validar no debía fallar y falló en {sorted(fallan)}: " + "; ".join(f for n in fallan for f in reglas[n]["fallas"][:2]))
            for h in BROWSER:
                r = mjs(f"{h}.mjs", "--raiz", str(raiz))
                if h == herramienta and r.returncode == 0:
                    problemas.append(f"{h} debía fallar y pasó")
                if h != herramienta and r.returncode != 0:
                    problemas.append(f"{h} no debía fallar: {r.stderr[:300]}")
    return problemas


class PruebasMalos(unittest.TestCase):
    def test_hay_un_malo_por_caso_y_ninguno_de_mas(self):
        en_disco = {p.name for p in MALOS.iterdir() if p.is_dir()}
        self.assertEqual(en_disco, set(CASOS), "fixtures/malos y CASOS deben coincidir")

    def test_cada_malo_falla_por_su_regla(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
            resultados = dict(zip(CASOS, ex.map(evaluar_caso, CASOS)))
        for caso, problemas in resultados.items():
            with self.subTest(malo=caso):
                self.assertEqual(problemas, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
