#!/usr/bin/env python3
"""
activar-analytics.py
====================
Activa Google Analytics 4 en todas las páginas del sitio indicadoreschile.cl

USO:
    python3 activar-analytics.py G-XXXXXXXXXX

Reemplaza G-XXXXXXXXXX con tu Measurement ID real de GA4.
El script descomenta el bloque de tracking en todos los HTML.

También agrega el meta tag de verificación de Google Search Console
si lo proporcionas como segundo argumento:

    python3 activar-analytics.py G-XXXXXXXXXX "google-site-verification_CONTENT"
"""

import sys
import os
import glob
import re

# ─── Validaciones ────────────────────────────────────────────────
if len(sys.argv) < 2:
    print("ERROR: Falta el Measurement ID de GA4")
    print("Uso: python3 activar-analytics.py G-XXXXXXXXXX")
    sys.exit(1)

GA4_ID = sys.argv[1].strip()
GSC_CONTENT = sys.argv[2].strip() if len(sys.argv) >= 3 else None

if not GA4_ID.startswith("G-"):
    print(f"ERROR: El ID debe empezar con 'G-'. Recibido: {GA4_ID}")
    print("Ejemplo correcto: G-ABC123DEF4")
    sys.exit(1)

print(f"\n📊 Activando Google Analytics 4 con ID: {GA4_ID}")
if GSC_CONTENT:
    print(f"🔍 Search Console verification: {GSC_CONTENT[:30]}...")
print()

# ─── Bloque GA4 que reemplaza al placeholder comentado ───────────
GA4_BLOCK = f"""  <!-- Google Analytics 4 -->
  <script async src="https://www.googletagmanager.com/gtag/js?id={GA4_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){{dataLayer.push(arguments);}}
    gtag('js', new Date());
    gtag('config', '{GA4_ID}');
  </script>"""

# ─── Meta tag de Search Console (solo va en index.html) ──────────
GSC_META = ""
if GSC_CONTENT:
    GSC_META = f'  <meta name="google-site-verification" content="{GSC_CONTENT}">'

# ─── Patrón del bloque comentado a reemplazar ────────────────────
PATTERN = re.compile(
    r'  <!-- Google Analytics 4 — reemplazar G-XXXXXXXXXX con tu Measurement ID -->\s*'
    r'  <!--.*?-->\s*',
    re.DOTALL
)

# ─── Procesar todos los HTML ──────────────────────────────────────
script_dir = os.path.dirname(os.path.abspath(__file__))
pages = glob.glob(os.path.join(script_dir, '**/*.html'), recursive=True)
pages = [p for p in pages if 'anio.html' not in p]
pages.sort()

updated = 0
skipped = 0

for page in pages:
    with open(page, 'r', encoding='utf-8') as f:
        content = f.read()

    # Verificar si ya fue activado
    if f'gtag/js?id={GA4_ID}' in content:
        print(f"  ⏭  Ya activado: {page.replace(script_dir+'/', '')}")
        skipped += 1
        continue

    # Reemplazar bloque comentado por el activo
    new_content = PATTERN.sub(GA4_BLOCK + '\n\n', content, count=1)

    # Agregar meta de Search Console solo en index.html principal
    if GSC_META and page.endswith('/index.html') and '/uf/' not in page \
       and '/dolar/' not in page and '/utm/' not in page \
       and '/ipc/' not in page and '/calculadora' not in page \
       and '/que-es' not in page and '/widget/' not in page \
       and '/privacidad/' not in page and '/contacto/' not in page \
       and '/uf/2' not in page:
        if 'google-site-verification' not in new_content:
            new_content = new_content.replace(
                '<meta charset="UTF-8">',
                f'<meta charset="UTF-8">\n{GSC_META}'
            )

    if new_content != content:
        with open(page, 'w', encoding='utf-8') as f:
            f.write(new_content)
        rel = page.replace(script_dir + '/', '')
        print(f"  ✅ Activado: {rel}")
        updated += 1
    else:
        print(f"  ⚠️  Sin cambios (revisar manualmente): {page.replace(script_dir+'/', '')}")

print()
print(f"{'─'*50}")
print(f"✅ Páginas actualizadas: {updated}")
print(f"⏭  Ya activadas:         {skipped}")
print()
print("Próximo paso:")
print(f"  git add -A")
print(f"  git commit -m 'feat: activar GA4 {GA4_ID}'")
print(f"  git push")
print()
if GSC_CONTENT:
    print("Search Console:")
    print("  Ir a https://search.google.com/search-console")
    print("  → Agregar propiedad → indicadoreschile.cl")
    print("  → Método: Etiqueta HTML → Verificar")
    print()
print("Google Analytics:")
print("  Ir a https://analytics.google.com")
print(f"  → Verificar que lleguen hits en Tiempo Real")
