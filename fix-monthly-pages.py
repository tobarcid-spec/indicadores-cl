#!/usr/bin/env python3
"""Fix monthly UF pages: wrong metadata months + Cargando... in h1/ctx."""

import re

MESES = {
    1: ('enero',  'Enero',  'January'),
    2: ('febrero','Febrero','February'),
    3: ('marzo',  'Marzo',  'March'),
    4: ('abril',  'Abril',  'April'),
    5: ('mayo',   'Mayo',   'May'),
    6: ('junio',  'Junio',  'June'),
}

CONTEXTOS = {
    1: {
        'title': 'Inicio de año con estabilidad',
        'text': 'Enero 2026 comenzó con una UF en torno a $38.300, reflejando la inflación acumulada de diciembre 2025. El IPC de diciembre fue de 0,2%, lo que mantiene la UF con alzas moderadas durante todo el mes.'
    },
    2: {
        'title': 'Febrero con baja inflación',
        'text': 'Febrero 2026 mostró un IPC de solo 0,1%, una de las cifras más bajas del semestre. Esto se tradujo en una variación mínima de la UF durante el mes, alcanzando apenas $38.400 al cierre.'
    },
    3: {
        'title': 'Marzo con repunte moderado',
        'text': 'El IPC de febrero fue de 0,4%, lo que impulsó la UF al alza en marzo 2026. El valor cerró el mes cerca de $38.550, reflejando presiones inflacionarias por alzas en alimentos y transporte.'
    },
    4: {
        'title': 'Abril con inflación controlada',
        'text': 'Abril 2026 registró un IPC de marzo de 0,3%, manteniendo la UF en una tendencia al alza moderada. El valor promedio del mes fue cercano a $38.650, en línea con las expectativas del Banco Central.'
    },
    5: {
        'title': 'Mayo 2026 — contexto económico',
        'text': 'Durante mayo 2026, la UF se reajustó según la variación del IPC del mes anterior publicada por el INE. El Banco Central distribuye este reajuste entre los días del mes de forma proporcional.'
    },
    6: {
        'title': 'Junio 2026 — contexto económico',
        'text': 'Durante junio 2026, la UF se reajustó según la variación del IPC del mes anterior publicada por el INE. El Banco Central distribuye este reajuste entre los días del mes de forma proporcional.'
    },
}

import os

for num, (slug, nombre, _) in MESES.items():
    path = f'uf/{slug}-2026/index.html'
    if not os.path.exists(path):
        print(f'SKIP {path} (no existe)')
        continue

    with open(path, 'r', encoding='utf-8') as f:
        html = f.read()

    original = html

    # Fix <title>
    html = re.sub(
        r'<title id="page-title">.*?</title>',
        f'<title id="page-title">Valor UF {nombre} 2026 Chile — Tabla Diaria Completa | indicadoreschile.cl</title>',
        html
    )

    # Fix <meta name="description">
    html = re.sub(
        r'(<meta name="description" id="page-desc" content=").*?(")',
        f'\\1Todos los valores diarios de la UF en {slug} 2026. Mínimo, máximo, variación y promedio del mes. Fuente oficial Banco Central de Chile.\\2',
        html
    )

    # Fix <meta name="keywords">
    html = re.sub(
        r'(<meta name="keywords" id="page-kw" content=").*?(")',
        f'\\1UF {slug} 2026, valor UF {slug} 2026 Chile, UF diaria {slug} 2026, tabla UF {slug}\\2',
        html
    )

    # Fix canonical
    html = re.sub(
        r'(<link rel="canonical" id="page-canonical" href=").*?(")',
        f'\\1https://indicadoreschile.cl/uf/{slug}-2026/\\2',
        html
    )

    # Fix og:title
    html = re.sub(
        r'(<meta property="og:title" id="og-title" content=").*?(")',
        f'\\1Valor UF {nombre} 2026 Chile — Tabla Diaria\\2',
        html
    )

    # Fix h1
    html = re.sub(
        r'<h1 id="h1-titulo">.*?</h1>',
        f'<h1 id="h1-titulo"><strong>Valor UF {nombre} 2026</strong> — Chile</h1>',
        html
    )

    # Fix ctx-title
    ctx = CONTEXTOS[num]
    html = re.sub(
        r'<h3 id="ctx-title">.*?</h3>',
        f'<h3 id="ctx-title">{ctx["title"]}</h3>',
        html
    )

    # Fix ctx-text
    html = re.sub(
        r'<p id="ctx-text">.*?</p>',
        f'<p id="ctx-text">{ctx["text"]}</p>',
        html
    )

    if html != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f'FIXED {path}')
    else:
        print(f'NO CHANGE {path}')

print('Done.')
