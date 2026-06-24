#!/usr/bin/env python3
"""
Crea automáticamente la página mensual UF del mes en curso si no existe.
Se ejecuta en GitHub Actions el día 1 de cada mes antes del prebuild.
"""

import os
import re
import shutil
from datetime import datetime

MESES = ['enero','febrero','marzo','abril','mayo','junio',
         'julio','agosto','septiembre','octubre','noviembre','diciembre']
MESES_TITULO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

# Contexto editorial genérico para meses sin texto preparado
CONTEXTO_GENERICO = {
    'title': 'Valores del mes en tiempo real',
    'text': (
        '{MES_TITULO} {YEAR} muestra la evolución diaria de la UF calculada '
        'por el Banco Central de Chile en base al IPC del mes anterior. '
        'Los valores se actualizan a diario durante el mes.'
    ),
}

def mes_anterior(mes, year):
    if mes == 1:
        return 12, year - 1
    return mes - 1, year

def slug_mes(mes):
    return MESES[mes - 1]

def titulo_mes(mes):
    return MESES_TITULO[mes - 1]

def get_template_path(year):
    """Busca el mes más reciente disponible como plantilla."""
    base = os.path.join(os.path.dirname(__file__), 'uf')
    for m in range(12, 0, -1):
        candidate = os.path.join(base, f'{slug_mes(m)}-{year}', 'index.html')
        if os.path.exists(candidate):
            return candidate, m, year
    # Si no hay ninguno este año, busca el año anterior
    for m in range(12, 0, -1):
        candidate = os.path.join(base, f'{slug_mes(m)}-{year-1}', 'index.html')
        if os.path.exists(candidate):
            return candidate, m, year - 1
    return None, None, None

def replace_attr(html, el_id, attr, value):
    pattern = re.compile(
        rf'(<[a-z][^>]*\bid="{re.escape(el_id)}"[^>]*\b{re.escape(attr)}=")[^"]*(")',
        re.IGNORECASE
    )
    new_html, n = pattern.subn(lambda m: f'{m.group(1)}{value}{m.group(2)}', html)
    if not n:
        # Prueba con attr antes del id
        pattern2 = re.compile(
            rf'(<[a-z][^>]*\b{re.escape(attr)}=")[^"]*("[^>]*\bid="{re.escape(el_id)}")',
            re.IGNORECASE
        )
        new_html, n = pattern2.subn(lambda m: f'{m.group(1)}{value}{m.group(2)}', html)
    return new_html

def set_tag_content(html, el_id, value, tag=None):
    tags = [tag] if tag else ['div','p','span','h1','h2','h3','h4','title','li']
    for t in tags:
        pattern = re.compile(
            rf'(<{t}(?:\s[^>]*)?\bid="{re.escape(el_id)}"[^>]*>)(.*?)</{t}>',
            re.DOTALL
        )
        if pattern.search(html):
            return pattern.sub(lambda m: f'{m.group(1)}{value}</{t}>', html, count=1)
    return html

def set_title_tag(html, value):
    return re.sub(r'<title[^>]*>.*?</title>', f'<title id="page-title">{value}</title>', html, flags=re.DOTALL)

def main():
    now = datetime.now()
    mes  = now.month
    year = now.year

    target_dir  = os.path.join(os.path.dirname(__file__), 'uf', f'{slug_mes(mes)}-{year}')
    target_file = os.path.join(target_dir, 'index.html')

    if os.path.exists(target_file):
        print(f'Pagina ya existe: uf/{slug_mes(mes)}-{year}/ — sin cambios.')
        return

    # Buscar plantilla
    tmpl_path, tmpl_mes, tmpl_year = get_template_path(year)
    if not tmpl_path:
        print('ERROR: no se encontro ninguna pagina mensual existente para usar como plantilla.')
        return

    print(f'Creando uf/{slug_mes(mes)}-{year}/ desde plantilla {slug_mes(tmpl_mes)}-{tmpl_year}/')

    os.makedirs(target_dir, exist_ok=True)
    shutil.copy2(tmpl_path, target_file)

    with open(target_file, encoding='utf-8') as f:
        html = f.read()

    mes_t   = titulo_mes(mes)
    prev_m, prev_y = mes_anterior(mes, year)
    next_m  = mes + 1 if mes < 12 else 1
    next_y  = year if mes < 12 else year + 1

    # -- Metadatos --
    html = set_title_tag(html, f'Valor UF {mes_t} {year} Chile — Tabla Diaria Completa | indicadoreschile.cl')
    html = replace_attr(html, 'page-desc', 'content',
        f'Todos los valores diarios de la UF en {slug_mes(mes)} {year}. '
        f'Minimo, maximo, variacion y promedio del mes. Fuente oficial Banco Central de Chile.')
    html = replace_attr(html, 'page-kw', 'content',
        f'UF {slug_mes(mes)} {year}, valor UF {slug_mes(mes)} {year} Chile, '
        f'UF diaria {slug_mes(mes)} {year}, tabla UF {slug_mes(mes)}')
    html = replace_attr(html, 'page-canonical', 'href',
        f'https://indicadoreschile.cl/uf/{slug_mes(mes)}-{year}/')
    html = replace_attr(html, 'og-title', 'content',
        f'Valor UF {mes_t} {year} Chile — Tabla Diaria')
    html = replace_attr(html, 'og-desc', 'content',
        f'Tabla completa con los valores diarios de la UF en {slug_mes(mes)} {year}. '
        f'Minimo, maximo y variacion del mes.')
    html = replace_attr(html, 'og-url', 'content',
        f'https://indicadoreschile.cl/uf/{slug_mes(mes)}-{year}/')

    # -- Schema breadcrumb --
    old_schema_name = re.search(r'"name":\s*"(\w+ \d{4})"', html)
    if old_schema_name:
        html = html.replace(old_schema_name.group(0), f'"name": "{mes_t} {year}"')

    # -- Breadcrumb visible --
    html = set_tag_content(html, 'bc-year', str(year), 'a')
    html = set_tag_content(html, 'bc-month', f'{mes_t} {year}', 'span')

    # -- H1 --
    html = set_tag_content(html, 'h1-titulo', f'<strong>Valor UF {mes_t} {year}</strong> — Chile', 'h1')

    # -- Contexto editorial --
    ctx = CONTEXTO_GENERICO
    ctx_text = ctx['text'].replace('{MES_TITULO}', mes_t).replace('{YEAR}', str(year))
    html = set_tag_content(html, 'ctx-title', ctx['title'], 'h3')
    html = set_tag_content(html, 'ctx-text',  ctx_text,     'p')

    # -- Stats: placeholder hasta que prebuild los llene --
    for sid in ('s-ini','s-fin','s-min','s-max','s-var','s-prom',
                's-ini-f','s-fin-f','s-min-f','s-max-f'):
        html = set_tag_content(html, sid, '--')

    # -- Navegación mes anterior/siguiente --
    # <a href="/uf/mes-year/" …> texto </a>
    # Actualizar hrefs de nav
    prev_slug = f'{slug_mes(prev_m)}-{prev_y}'
    next_slug = f'{slug_mes(next_m)}-{next_y}'
    prev_txt  = f'← {titulo_mes(prev_m)} {prev_y}'
    next_txt  = f'{titulo_mes(next_m)} {next_y} →'

    def fix_nav(h, old_slug_pattern, new_href, new_text):
        # Reemplaza href y texto en botones de nav mes
        p = re.compile(
            rf'(<a[^>]+class="month-nav-btn[^"]*"[^>]+href=")([^"]+)("[^>]*>)\s*[^<]+\s*(</a>)',
            re.DOTALL
        )
        matches = list(p.finditer(h))
        if len(matches) >= 2:
            # Primero es "anterior", segundo es "siguiente"
            return h  # reemplazamos manualmente abajo
        return h

    # Reemplazar todos los hrefs en month-nav-btn
    nav_pattern = re.compile(
        r'(<a[^>]+class="month-nav-btn(?:\s+\w+)?"[^>]+href=")([^"]+)(")',
        re.DOTALL
    )
    nav_matches = nav_pattern.findall(html)
    if len(nav_matches) >= 2:
        html = nav_pattern.sub(
            lambda m, i=iter([
                f'/uf/{prev_slug}/',
                f'/uf/{next_slug}/',
            ]): f'{m.group(1)}{next(i, m.group(2))}{m.group(3)}',
            html
        )

    # También el texto de los botones
    html = re.sub(
        r'(<a[^>]+class="month-nav-btn"[^>]*>)\s*[^←→<]+',
        lambda m: f'{m.group(1)}{prev_txt}',
        html, count=1
    )
    html = re.sub(
        r'(<a[^>]+class="month-nav-btn next"[^>]*>)\s*[^←→<]+',
        lambda m: f'{m.group(1)}{next_txt}',
        html, count=1
    )

    with open(target_file, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f'OK: creada uf/{slug_mes(mes)}-{year}/index.html')
    print(f'    Siguiente paso: prebuild-fallback.py llenara los stats con valores reales.')

if __name__ == '__main__':
    main()
