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
  6. giros.py (páginas por giro): idempotencia, --check, marcas faltantes, giro nuevo solo con su JSON, y que el
     orden giros -> contacto -> dominio -> versionar es estable.
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
    "giros-desactualizado": ("validar", {"giros"}),
    "json-ld-precio-inventado": ("validar", {"json-ld"}),
    "json-ld-campo-prohibido": ("validar", {"json-ld"}),
    "json-ld-ausente": ("validar", {"json-ld"}),
    "tuteo-atributo": ("validar", {"trato"}),
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


REPO = SCRIPTS.parent


def copiar_repo_para_giros(destino):
    """Copia mínima del sitio real (HTML, assets de CSS/JS, scripts y datos) para probar el orden de las herramientas."""
    destino = pathlib.Path(destino)
    destino.mkdir(parents=True, exist_ok=True)
    for rel in ["index.html", "vidrierias", "sitemap.xml", "robots.txt", "README.md", "assets/css", "assets/js"]:
        origen = REPO / rel
        if origen.is_dir():
            shutil.copytree(origen, destino / rel, dirs_exist_ok=True)
        elif origen.exists():
            (destino / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(origen, destino / rel)
    (destino / "scripts").mkdir(exist_ok=True)
    shutil.copy2(SCRIPTS / "sitio.json", destino / "scripts" / "sitio.json")
    shutil.copytree(SCRIPTS / "giros", destino / "scripts" / "giros", dirs_exist_ok=True)
    return destino


class PruebasGiros(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.raiz = pathlib.Path(self._tmp.name) / "sitio"
        # Solo la plantilla (index.html real) y los datos: las páginas de giro se generan aquí.
        (self.raiz / "scripts").mkdir(parents=True)
        shutil.copy2(REPO / "index.html", self.raiz / "index.html")
        shutil.copytree(SCRIPTS / "giros", self.raiz / "scripts" / "giros")

    def gen(self, *args):
        return py("giros.py", "--raiz", str(self.raiz), *args)

    def leer(self, rel):
        return (self.raiz / rel).read_text(encoding="utf-8")

    def test_genera_la_pagina_de_vidrierias(self):
        r = self.gen()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        pagina = self.leer("vidrierias/index.html")
        self.assertTrue(pagina.startswith("<!doctype html>"))
        self.assertIn("Generado por scripts/giros.py desde index.html y scripts/giros/vidrierias.json. No editar a mano.", pagina[:300])
        self.assertNotIn("data-giro", pagina, "las marcas no se copian a la página generada")

    def test_idempotente_y_check_pasa(self):
        self.gen()
        antes = instantanea(self.raiz)
        r = self.gen()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(antes, instantanea(self.raiz), "una segunda corrida no cambia nada")
        self.assertEqual(self.gen("--check").returncode, 0)

    def test_check_sin_pagina_falla_y_no_escribe(self):
        antes = instantanea(self.raiz)
        r = self.gen("--check")
        self.assertEqual(r.returncode, 1)
        self.assertIn("vidrierias/index.html", r.stdout)
        self.assertEqual(antes, instantanea(self.raiz), "--check no escribe")

    def test_check_detecta_pagina_editada_a_mano(self):
        self.gen()
        ruta = self.raiz / "vidrierias" / "index.html"
        ruta.write_text(ruta.read_text(encoding="utf-8").replace("Cada vendedor cotiza distinto.", "Cada vendedor cotiza igual."), encoding="utf-8")
        antes = instantanea(self.raiz)
        r = self.gen("--check")
        self.assertEqual(r.returncode, 1)
        self.assertIn("vidrierias/index.html", r.stdout)
        self.assertIn("python3 scripts/giros.py", r.stdout)
        self.assertEqual(antes, instantanea(self.raiz))
        self.assertEqual(self.gen().returncode, 0, "regenerar deshace la edición a mano")
        self.assertEqual(self.gen("--check").returncode, 0)

    def test_check_detecta_plantilla_cambiada_sin_regenerar(self):
        self.gen()
        ruta = self.raiz / "index.html"
        ruta.write_text(ruta.read_text(encoding="utf-8").replace("<p>hjgr.dev</p>", "<p>hjgr.dev, 2026</p>"), encoding="utf-8")
        self.assertEqual(self.gen("--check").returncode, 1)
        self.gen()
        self.assertEqual(self.gen("--check").returncode, 0)
        self.assertIn("<p>hjgr.dev, 2026</p>", self.leer("vidrierias/index.html"), "el resto de la página sigue a la plantilla")

    def test_falta_una_marca_falla_con_mensaje_claro_y_no_escribe(self):
        for marca in ["h1", "problemas", "problema", "etapas", "json-ld"]:
            with self.subTest(marca=marca):
                original = self.leer("index.html")
                self.assertIn(f'data-giro="{marca}"', original, f"la plantilla debe tener la marca {marca}")
                self.raiz.joinpath("index.html").write_text(original.replace(f' data-giro="{marca}"', ""), encoding="utf-8")
                r = self.gen()
                self.assertNotEqual(r.returncode, 0)
                self.assertIn(f'data-giro="{marca}"', r.stdout + r.stderr)
                self.assertIn("index.html", r.stdout + r.stderr)
                self.assertFalse((self.raiz / "vidrierias").exists(), "nunca una página a medias")
                self.raiz.joinpath("index.html").write_text(original, encoding="utf-8")

    def test_falta_un_dato_o_sobra_una_clave_falla_con_mensaje_claro(self):
        ruta = self.raiz / "scripts" / "giros" / "vidrierias.json"
        datos = json.loads(ruta.read_text(encoding="utf-8"))
        for cambio, esperado in [
            (lambda d: d.pop("h1"), "h1"),
            (lambda d: d.update(titulo=""), "titulo"),
            (lambda d: d.update(problemas=d["problemas"][:2]), "problemas"),
            (lambda d: d.update(inventada="x"), "inventada"),
        ]:
            malo = json.loads(json.dumps(datos))
            cambio(malo)
            ruta.write_text(json.dumps(malo, ensure_ascii=False), encoding="utf-8")
            r = self.gen()
            self.assertNotEqual(r.returncode, 0, esperado)
            self.assertIn(esperado, r.stdout + r.stderr)
            self.assertFalse((self.raiz / "vidrierias").exists())

    def test_un_giro_nuevo_se_genera_solo_con_su_json(self):
        nuevo = {
            "h1": ["Pedidos y rutas", "en un solo sistema."],
            "titulo": "Sistemas para giro de prueba | Harold García",
            "descripcion": "Descripción de prueba del giro nuevo.",
            "problemas": [
                {"texto": "Primer problema de prueba."},
                {"texto": "Segundo problema de prueba.", "enlace": {"texto": "Sistemas internos", "href": "#sistemas"}},
                {"texto": "Tercer problema de prueba."},
            ],
        }
        (self.raiz / "scripts" / "giros" / "giro-de-prueba.json").write_text(json.dumps(nuevo, ensure_ascii=False), encoding="utf-8")
        self.assertEqual(self.gen().returncode, 0)
        pagina = self.leer("giro-de-prueba/index.html")
        self.assertIn("<title>Sistemas para giro de prueba | Harold García</title>", pagina)
        self.assertIn('<link rel="canonical" href="https://hjgr.dev/giro-de-prueba/">', pagina)
        self.assertIn("Segundo problema de prueba.", pagina)
        self.assertIn("scripts/giros/giro-de-prueba.json", pagina)
        # Sin enlace en el dato, la fila conserva el de la home (tercera fila: «Webs», #trabajo).
        self.assertIn('href="#trabajo">Webs</a>', pagina)
        self.assertEqual(self.gen("--check").returncode, 0)
        self.assertTrue((self.raiz / "vidrierias" / "index.html").exists(), "los demás giros también se generan")

    def test_no_pisa_una_pagina_que_no_es_generada_ni_usa_nombres_reservados(self):
        (self.raiz / "hecha-a-mano").mkdir()
        (self.raiz / "hecha-a-mano" / "index.html").write_text("<!doctype html>", encoding="utf-8")
        datos = (self.raiz / "scripts" / "giros" / "vidrierias.json").read_text(encoding="utf-8")
        for nombre in ["hecha-a-mano", "assets", "Con Mayusculas"]:
            ruta = self.raiz / "scripts" / "giros" / f"{nombre}.json"
            ruta.write_text(datos, encoding="utf-8")
            r = self.gen()
            self.assertNotEqual(r.returncode, 0, nombre)
            self.assertIn(nombre, r.stdout + r.stderr)
            ruta.unlink()
        self.assertEqual((self.raiz / "hecha-a-mano" / "index.html").read_text(encoding="utf-8"), "<!doctype html>")
        self.assertFalse((self.raiz / "vidrierias").exists())

    def test_los_textos_de_la_home_no_sobreviven_y_el_orden_es_el_pedido(self):
        self.gen()
        home = self.leer("index.html")
        pagina = self.leer("vidrierias/index.html")
        for texto in [
            "Su negocio ya funciona.",
            "Lo que falla es el control.",
            "Nadie sabe en qué va el pedido hasta que el cliente llama enojado.",
            "Sus clientes preguntan lo mismo por WhatsApp todo el día.",
            "Su web no existe, o da pena mandarla.",
            "Harold García: sistemas y webs para negocios en Guadalajara",
            'href="https://hjgr.dev/"',
        ]:
            self.assertIn(texto, home, texto)
            self.assertNotIn(texto, pagina, f"«{texto}» de la home sobrevive en la página de giro")
        for texto in [
            "Cotizaciones, cortes y entregas",
            "en un solo sistema.",
            "Cada vendedor cotiza distinto.",
            "Se tira vidrio y aluminio porque el corte se planea al ojo.",
            "Nadie sabe si el pedido ya salió del templado.",
            "<title>Sistemas para vidrierías: cotización, cortes y entregas | Harold García</title>",
            '<link rel="canonical" href="https://hjgr.dev/vidrierias/">',
            '<meta property="og:url" content="https://hjgr.dev/vidrierias/">',
            '<meta property="og:title" content="Sistemas para vidrierías: cotización, cortes y entregas | Harold García">',
            '<meta name="twitter:title" content="Sistemas para vidrierías: cotización, cortes y entregas | Harold García">',
        ]:
            self.assertIn(texto, pagina, texto)
        descripcion = "Un solo sistema para cotizar igual, planear los cortes y saber en qué etapa va cada pedido. Para vidrierías que hoy se organizan con Excel, libretas y WhatsApp."
        for etiqueta in ['<meta name="description" content="', '<meta property="og:description" content="', '<meta name="twitter:description" content="']:
            self.assertIn(etiqueta + descripcion + '">', pagina)
        self.assertEqual(len(re.findall(r"<h1\b", pagina)), 1)
        self.assertLess(pagina.index('id="sistemas"'), pagina.index('id="problemas-titulo"'), "las etapas van antes de los problemas")
        self.assertGreater(pagina.index('id="sistemas"'), pagina.index("</section>", pagina.index('class="hero')), "y después del hero")
        self.assertEqual(len(re.findall(r'<a class="enlace-accion" href="#sistemas">Sistemas internos</a>', pagina)), 3 + 0)
        self.assertIn('<a class="barra__marca nombre" href="/">Harold García</a>', pagina)
        # Lo demás es idéntico: precios, preguntas, cierre y pie.
        for trozo in ["<h2 id=\"precios-titulo\">", "Preguntas frecuentes", "¿Platicamos?", "Harold de Jesús García Ramírez, 2026", "$48,760"]:
            self.assertEqual(home.count(trozo), pagina.count(trozo), trozo)
        # La imagen para compartir es la misma.
        self.assertEqual(re.search(r'og:image" content="([^"]*)"', home).group(1), re.search(r'og:image" content="([^"]*)"', pagina).group(1))

    def test_json_ld_de_la_pagina_de_giro_usa_su_url_y_descripcion(self):
        self.gen()
        def datos(rel):
            m = re.search(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', self.leer(rel), re.S)
            return json.loads(m.group(1))["@graph"]
        home = {n["@type"]: n for n in datos("index.html")}
        giro = {n["@type"]: n for n in datos("vidrierias/index.html")}
        self.assertEqual(home["Service"]["url"], "https://hjgr.dev/")
        self.assertEqual(giro["Service"]["url"], "https://hjgr.dev/vidrierias/")
        self.assertIn("vidrierías", giro["Service"]["description"])
        self.assertEqual(home["Person"], giro["Person"])
        self.assertEqual(home["WebSite"], giro["WebSite"])
        self.assertEqual(home["Service"]["hasOfferCatalog"], giro["Service"]["hasOfferCatalog"])

    def test_el_sitio_real_esta_al_dia(self):
        r = py("giros.py", "--check")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_orden_de_las_herramientas_es_estable(self):
        # giros -> contacto -> dominio -> versionar, dos veces; la segunda no cambia nada y `giros --check` pasa.
        with tempfile.TemporaryDirectory() as d:
            raiz = copiar_repo_para_giros(pathlib.Path(d) / "s")
            sitio = json.loads((raiz / "scripts" / "sitio.json").read_text(encoding="utf-8"))
            sitio.update(whatsapp="5215512345678", cal="https://cal.com/ejemplo")
            (raiz / "scripts" / "sitio.json").write_text(json.dumps(sitio), encoding="utf-8")
            (raiz / "assets" / "css" / "home.css").write_text((raiz / "assets" / "css" / "home.css").read_text(encoding="utf-8") + "\n/* cambio */\n", encoding="utf-8")

            def ciclo(*extra_dominio):
                for script, args in [("giros.py", []), ("contacto.py", []), ("dominio.py", list(extra_dominio)), ("versionar.py", [])]:
                    r = py(script, "--raiz", str(raiz), *args)
                    self.assertEqual(r.returncode, 0, f"{script}: {r.stdout}{r.stderr}")

            ciclo("--origen", "https://otro.test")
            primera = instantanea(raiz)
            self.assertIn("5215512345678", primera["vidrierias/index.html"].decode())
            self.assertIn("https://otro.test/vidrierias/", primera["vidrierias/index.html"].decode())
            self.assertEqual(py("giros.py", "--check", "--raiz", str(raiz)).returncode, 0)
            ciclo("--origen", "https://otro.test")
            self.assertEqual(primera, instantanea(raiz), "correr los cuatro otra vez no cambia nada")
            for script in ["giros.py", "contacto.py", "dominio.py", "versionar.py"]:
                self.assertEqual(py(script, "--check", "--raiz", str(raiz)).returncode, 0, script)


class PruebasReglaGiros(unittest.TestCase):
    def test_la_regla_giros_existe_y_pasa_en_el_sitio_real(self):
        r = mjs("validar.mjs", "--raiz", str(REPO), "--solo", "giros", "--json")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue(json.loads(r.stdout)["reglas"]["giros"]["ok"])

    def test_la_regla_giros_pasa_si_no_hay_giros(self):
        r = mjs("validar.mjs", "--raiz", str(BUENO), "--solo", "giros", "--json")
        self.assertTrue(json.loads(r.stdout)["reglas"]["giros"]["ok"], r.stdout)


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
        for ruta in ["/README.md", "/scripts/sitio.json", "/scripts", "/.git/config", "/package.json", "/node_modules/x", "/package-lock.json", "/.gitignore",
                     "/assets/css/LEEME.md", "/privado/codigos.csv", "/.env", "/.env.local"]:
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
    def test_guardia_con_sin_lighthouse(self):
        # Saltarse Lighthouse no lo convierte en prueba sin registrar.
        r = mjs("todo.mjs", "--solo-registro", "--sin-lighthouse")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

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
