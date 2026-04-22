#!/usr/bin/env python3
"""
activar-adsense.py
==================
Activa Google AdSense en todas las páginas del sitio indicadoreschile.cl.

USO:
    python3 activar-adsense.py ca-pub-XXXXXXXXXXXXXXXX

Reemplaza ca-pub-XXXXXXXXXXXXXXXX con tu Publisher ID real de AdSense.

El script:
1. Agrega el script de AdSense en el <head> de todas las páginas
2. Reemplaza los placeholders "Publicidad" por unidades de anuncio reales
3. Usa Auto Ads por defecto (Google optimiza la posición automáticamente)
"""

import sys
import os
import glob
import re

# ─── Validaciones ────────────────────────────────────────────────
if len(sys.argv) < 2:
    print("ERROR: Falta el Publisher ID de AdSense")
    print("Uso: python3 activar-adsense.py ca-pub-XXXXXXXXXXXXXXXX")
    sys.exit(1)

PUB_ID = sys.argv[1].strip()

if not PUB_ID.startswith("ca-pub-"):
    print(f"ERROR: El ID debe empezar con 'ca-pub-'. Recibido: {PUB_ID}")
    print("Ejemplo: ca-pub-1234567890123456")
    sys.exit(1)

print(f"\n💰 Activando Google AdSense con Publisher ID: {PUB_ID}\n")

# ─── Script de AdSense para el <head> ────────────────────────────
ADSENSE_HEAD = f"""  <!-- Google AdSense -->
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client={PUB_ID}"
       crossorigin="anonymous"></script>"""

# ─── Unidad de anuncio (Auto Ads — reemplaza los placeholders) ───
# Para maximizar ingresos iniciales, usamos responsive display ads
# Puedes reemplazar data-ad-slot con slots específicos más adelante
AD_UNIT = f"""<div class="ad-container" style="margin:24px 0;text-align:center;min-height:90px">
  <ins class="adsbygoogle"
       style="display:block"
       data-ad-client="{PUB_ID}"
       data-ad-slot="auto"
       data-ad-format="auto"
       data-full-width-responsive="true"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({{}});</script>
</div>"""

# ─── Procesar páginas ─────────────────────────────────────────────
script_dir = os.path.dirname(os.path.abspath(__file__))
pages = glob.glob(os.path.join(script_dir, '**/*.html'), recursive=True)

# Excluir páginas que no necesitan ads
EXCLUDE = ['privacidad', 'contacto', 'anio.html']
pages = [p for p in pages if not any(e in p for e in EXCLUDE)]
pages.sort()

updated = 0

for page in pages:
    with open(page, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # 1. Agregar script AdSense en <head> si no está
    if 'pagead2.googlesyndication.com' not in content:
        content = content.replace('</head>', ADSENSE_HEAD + '\n</head>', 1)

    # 2. Reemplazar placeholders de publicidad
    # Patrón: <div class="ad-slot">Publicidad</div>
    AD_PLACEHOLDER = re.compile(
        r'<div class="ad-slot">\s*(?:<!-- Google AdSense.*?-->)?\s*Publicidad\s*</div>',
        re.DOTALL
    )
    content = AD_PLACEHOLDER.sub(AD_UNIT, content)

    if content != original:
        with open(page, 'w', encoding='utf-8') as f:
            f.write(content)
        rel = page.replace(script_dir + '/', '')
        print(f"  ✅ AdSense activado: {rel}")
        updated += 1
    else:
        rel = page.replace(script_dir + '/', '')
        print(f"  ⏭  Sin cambios: {rel}")

print()
print(f"{'─'*50}")
print(f"✅ Páginas con AdSense: {updated}")
print()
print("IMPORTANTE — Próximos pasos:")
print()
print("1. Solicitar aprobación si aún no la tienes:")
print("   → https://www.google.com/adsense/start/")
print("   → Agregar tu sitio: indicadoreschile.cl")
print("   → Google revisará el sitio (1-14 días)")
print()
print("2. Una vez aprobado, hacer git push:")
print(f"   git add -A")
print(f"   git commit -m 'feat: activar AdSense {PUB_ID}'")
print(f"   git push")
print()
print("3. Optimizar slots (después de 30 días con datos):")
print("   → En AdSense: Anuncios → Por unidad de anuncio")
print("   → Reemplazar data-ad-slot='auto' con slots específicos")
print("   → Probar posiciones: antes/después del conversor")
print()
print("4. Monitorear RPM en AdSense → Informes → Rendimiento")
