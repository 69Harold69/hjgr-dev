# Fuentes autoalojadas

Subconjunto latino (cubre español: á é í ó ú ñ ü ¿ ¡ « » $ y puntuación general), formato `.woff2`.
Ambas fuentes son SIL Open Font License 1.1; el texto de la licencia va junto a cada una.

| Archivo | Origen | Tamaño | Licencia |
|---|---|---|---|
| `hedvig-letters-serif-latin-400-normal.woff2` | npm `@fontsource/hedvig-letters-serif@5.3.1`, `files/hedvig-letters-serif-latin-400-normal.woff2` | 22 260 bytes | `OFL-hedvig-letters-serif.txt` |
| `geist-latin-wght-normal.woff2` | npm `@fontsource-variable/geist@5.3.0`, `files/geist-latin-wght-normal.woff2` | 29 400 bytes | `OFL-geist.txt` |

- Hedvig Letters Serif: solo peso 400 (títulos, precios y nombre).
- Geist: fuente variable (eje `wght`); `fuentes.css` declara solo 400 a 500.
- Los archivos se copiaron sin modificar; el `unicode-range` de `fuentes.css` es el del subconjunto `latin` del paquete.
- Para actualizar: descargar el paquete con `npm pack`, copiar el `.woff2` y el `LICENSE`, y actualizar esta tabla.
