#!/usr/bin/env python3
"""
prebuild-fallback.py - Inyecta valores reales en HTML para crawlers (SSR fallback).

Uso: python prebuild-fallback.py

Idempotente: reemplaza el contenido interno de cada elemento por su id.
Funciona independientemente de lo que haya dentro (—, skeleton, valor anterior).
El JS del cliente sobreescribe en tiempo real con datos frescos.
"""

import json, re, sys
from urllib.request import urlopen, Request
from datetime import datetime

YEAR = datetime.now().year

MESES_ES    = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre']
MESES_SHORT = ['ene','feb','mar','abr','may','jun',
               'jul','ago','sep','oct','nov','dic']
MESES_SLUGS = {i+1: m for i, m in enumerate(MESES_ES)}

DEFAULTS_HOY = {
    'uf':    {'valor': 40804.0, 'fecha': '2026-06-01T03:00:00.000Z'},
    'dolar': {'valor':   916.0, 'fecha': '2026-06-01T03:00:00.000Z'},
    'euro':  {'valor':  1042.0, 'fecha': '2026-06-01T03:00:00.000Z'},
    'utm':   {'valor': 71506.0, 'fecha': '2026-06-01T03:00:00.000Z'},
    'ipc':   {'valor':    -0.2, 'fecha': '2025-12-01T03:00:00.000Z'},
}

# ─── Fetch ────────────────────────────────────────────────────────────────────

def fetch_url(path=''):
    urls = [
        f'https://mindicador.cl/api/{path}'.rstrip('/') if path else 'https://mindicador.cl/api',
        f'https://indicadoreschile.cl/api-proxy/{path}'.rstrip('/') if path else 'https://indicadoreschile.cl/api-proxy',
    ]
    for url in urls:
        try:
            req = Request(url, headers={'User-Agent': 'prebuild-fallback/1.0 indicadoreschile.cl'})
            with urlopen(req, timeout=12) as r:
                return json.loads(r.read())
        except Exception as e:
            print(f'  (fallo {url}: {type(e).__name__})')
    return None

def fetch_api():
    data = fetch_url()
    if data:
        return data
    print('  AVISO: usando valores por defecto (API no disponible)')
    return DEFAULTS_HOY

def fetch_serie(indicador, year=None):
    path = f'{indicador}/{year}' if year else indicador
    data = fetch_url(path)
    if not data or not data.get('serie'):
        return []
    return sorted(data['serie'], key=lambda r: r['fecha'])

# ─── Formato ──────────────────────────────────────────────────────────────────

def clp(v):
    return '$' + f'{round(v):,}'.replace(',', '.')

def pct(v, d=1):
    s = f'{v:+.{d}f}'.replace('.', ',')
    return s + '%'

def mes_label(fecha_str):
    try:
        dt = datetime.fromisoformat(fecha_str.replace('Z', '+00:00'))
        return f'{MESES_ES[dt.month-1]} {dt.year}'
    except Exception:
        return fecha_str[:7]

def date_short(fecha_str):
    dt = datetime.fromisoformat(fecha_str.replace('Z', '+00:00'))
    return f'{dt.day:02d} {MESES_SHORT[dt.month-1]}'

def fecha_year(f): return int(f[:4])
def fecha_mes(f):  return int(f[5:7])
def fecha_dia(f):  return str(int(f[8:10]))

# ─── Stats ────────────────────────────────────────────────────────────────────

def year_stats(serie):
    rows = [r for r in serie if fecha_year(r['fecha']) == YEAR]
    if not rows:
        return None
    vals = [r['valor'] for r in rows]
    mn = min(vals); mx = max(vals)
    mn_r = next(r for r in rows if r['valor'] == mn)
    mx_r = next(r for r in rows if r['valor'] == mx)
    return {
        'min': mn, 'min_f': mn_r['fecha'],
        'max': mx, 'max_f': mx_r['fecha'],
        'prom': sum(vals) / len(vals),
        'var': (rows[-1]['valor'] - rows[0]['valor']) / rows[0]['valor'] * 100,
    }

def month_stats(serie, mes):
    rows = [r for r in serie
            if fecha_year(r['fecha']) == YEAR and fecha_mes(r['fecha']) == mes]
    if not rows:
        return None
    vals = [r['valor'] for r in rows]
    mn = min(vals); mx = max(vals)
    mn_r = next(r for r in rows if r['valor'] == mn)
    mx_r = next(r for r in rows if r['valor'] == mx)
    return {
        'ini': rows[0]['valor'],  'ini_day': fecha_dia(rows[0]['fecha']),
        'fin': rows[-1]['valor'], 'fin_day': fecha_dia(rows[-1]['fecha']),
        'min': mn, 'min_day': fecha_dia(mn_r['fecha']),
        'max': mx, 'max_day': fecha_dia(mx_r['fecha']),
        'prom': sum(vals) / len(vals),
        'var': (rows[-1]['valor'] - rows[0]['valor']) / rows[0]['valor'] * 100,
    }

# ─── Core: reemplazar contenido de elemento por id ────────────────────────────

TAGS = ['div', 'p', 'span', 'h1', 'h2', 'h3', 'h4']

def set_meta_content(html, meta_id, value):
    """Reemplaza atributo content de <meta id=meta_id content="...">."""
    pattern = re.compile(
        rf'(<meta\b[^>]*\bid="{re.escape(meta_id)}"[^>]*\bcontent=")[^"]*(")',
        re.DOTALL
    )
    if pattern.search(html):
        return pattern.sub(lambda m: f'{m.group(1)}{value}{m.group(2)}', html, count=1)
    # orden invertido: content antes del id
    pattern2 = re.compile(
        rf'(<meta\b[^>]*\bcontent=")[^"]*("[^>]*\bid="{re.escape(meta_id)}")',
        re.DOTALL
    )
    if pattern2.search(html):
        return pattern2.sub(lambda m: f'{m.group(1)}{value}{m.group(2)}', html, count=1)
    print(f'    WARN: meta id="{meta_id}" no encontrado')
    return html

def set_ld_value(html, script_id, key, value):
    """Reemplaza un valor en un bloque JSON-LD identificado por id."""
    pattern = re.compile(
        rf'(<script[^>]*\bid="{re.escape(script_id)}"[^>]*>)(.*?)(</script>)',
        re.DOTALL
    )
    m = pattern.search(html)
    if not m:
        print(f'    WARN: script id="{script_id}" no encontrado')
        return html
    updated = re.sub(rf'("{re.escape(key)}":\s*")[^"]*(")', rf'\g<1>{value}\g<2>', m.group(2))
    return html[:m.start()] + m.group(1) + updated + m.group(3) + html[m.end():]

def set_el(html, el_id, value, tag=None):
    """
    Reemplaza el contenido interno del elemento con id=el_id con value.
    Funciona con cualquier contenido previo: —, skeleton spans, marcadores FB, etc.
    Idempotente: siempre produce el mismo resultado independientemente del estado previo.
    """
    tags = [tag] if tag else TAGS
    for t in tags:
        pattern = re.compile(
            rf'(<{t}(?:\s[^>]*)?\bid="{re.escape(el_id)}"[^>]*>)(.*?)</{t}>',
            re.DOTALL
        )
        m = pattern.search(html)
        if m:
            def replacer(match, v=value, t=t):
                return f'{match.group(1)}{v}</{t}>'
            return pattern.sub(replacer, html, count=1)
    print(f'    WARN: id="{el_id}" no encontrado')
    return html

def process(path, fn, label=None):
    print(f'\n[{label or path}]')
    try:
        orig = open(path, encoding='utf-8').read()
        result = fn(orig)
        if result != orig:
            open(path, 'w', encoding='utf-8').write(result)
            print('  OK ACTUALIZADO')
        else:
            print('  -- Sin cambios')
    except FileNotFoundError:
        print(f'  SKIP (no existe {path})')

# ─── Fetch de todos los datos ─────────────────────────────────────────────────

print('Consultando mindicador.cl/api...')
hoy = fetch_api()

uf_val  = hoy['uf']['valor'];    uf_f  = hoy['uf']['fecha']
dol_val = hoy['dolar']['valor']; dol_f = hoy['dolar']['fecha']
euro_val= hoy['euro']['valor']
utm_val = hoy['utm']['valor'];   utm_f = hoy['utm']['fecha']
ipc_val = hoy['ipc']['valor'];   ipc_f = hoy['ipc']['fecha']

uf_s  = clp(uf_val);   dol_s  = clp(dol_val); euro_s = clp(euro_val)
utm_s = clp(utm_val);  ipc_s  = pct(ipc_val);  uta_s  = clp(utm_val * 12)

print(f'  UF {uf_s} | Dolar {dol_s} | UTM {utm_s} | IPC {ipc_s}')

print('\nFetching series anuales...')
uf_serie  = fetch_serie('uf',    YEAR)
dol_serie = fetch_serie('dolar', YEAR)
utm_serie = fetch_serie('utm',   YEAR)
ipc_base  = fetch_serie('ipc')
ipc_2026  = [r for r in ipc_base if fecha_year(r['fecha']) == YEAR]
ipc_acum  = sum(r['valor'] for r in ipc_2026)

uf_st  = year_stats(uf_serie)
dol_st = year_stats(dol_serie)
utm_st = year_stats(utm_serie)

print(f'  UF {len(uf_serie)} | Dolar {len(dol_serie)} | UTM {len(utm_serie)} | IPC base {len(ipc_base)}')
if uf_st:
    print(f'  UF min={clp(uf_st["min"])} max={clp(uf_st["max"])} var={pct(uf_st["var"])} prom={clp(uf_st["prom"])}')

# ─── 1. Dashboard ─────────────────────────────────────────────────────────────

otros_cards = (
    f'<a href="/dolar/" class="ind-card">'
    f'<div class="ind-card-label">\U0001f1fa\U0001f1f8 Dólar USD</div>'
    f'<div class="ind-card-value">{dol_s}</div>'
    f'<div class="ind-card-name">{mes_label(dol_f)}</div></a>'
    f'\n    <a href="/dolar/" class="ind-card">'
    f'<div class="ind-card-label">\U0001f1ea\U0001f1fa Euro EUR</div>'
    f'<div class="ind-card-value">{euro_s}</div>'
    f'<div class="ind-card-name">{mes_label(dol_f)}</div></a>'
    f'\n    <a href="/utm/" class="ind-card">'
    f'<div class="ind-card-label">\U0001f4cb UTM</div>'
    f'<div class="ind-card-value">{utm_s}</div>'
    f'<div class="ind-card-name">{mes_label(utm_f)}</div></a>'
    f'\n    <a href="/ipc/" class="ind-card">'
    f'<div class="ind-card-label">\U0001f4ca IPC mensual</div>'
    f'<div class="ind-card-value">{ipc_s}</div>'
    f'<div class="ind-card-name">{mes_label(ipc_f)}</div></a>'
)

def fix_dashboard(html):
    html = set_el(html, 'uf-val',  uf_s,                        'div')
    html = set_el(html, 'uf-fecha', f'Valor al {mes_label(uf_f)}', 'p')
    # otros-grid: reemplazar todo el contenido del div grid
    grid_pat = re.compile(
        r'(<div[^>]*\bid="otros-grid"[^>]*>)\s*(?:<!--.*?-->)?\s*([\s\S]*?)(\s*\n  </div>)',
        re.DOTALL
    )
    m = grid_pat.search(html)
    if m:
        html = grid_pat.sub(
            lambda _: f'{m.group(1)}\n    {otros_cards}\n  </div>',
            html, count=1
        )
    return html

process('index.html', fix_dashboard, 'index.html (dashboard)')


# ─── 2. Dolar ─────────────────────────────────────────────────────────────────

def fix_dolar(html):
    html = set_el(html, 'dolar-val',   dol_s,                         'div')
    html = set_el(html, 'dolar-fecha', f'Valor al {mes_label(dol_f)}', 'p')
    html = set_el(html, 's-hoy',  dol_s,  'div')
    if dol_st:
        html = set_el(html, 's-min',   clp(dol_st['min']),          'div')
        html = set_el(html, 's-min-f', date_short(dol_st['min_f']), 'div')
        html = set_el(html, 's-max',   clp(dol_st['max']),          'div')
        html = set_el(html, 's-max-f', date_short(dol_st['max_f']), 'div')
        html = set_el(html, 's-var',   pct(dol_st['var']),          'div')
        html = set_el(html, 's-prom',  clp(dol_st['prom']),         'div')
    mes_label_actual = MESES_ES[datetime.now().month - 1]
    desc = (f'Dólar observado hoy {dol_s} ({mes_label_actual} {YEAR}). '
            f'Conversor USD a pesos chilenos, gráfico histórico y tabla del mes. '
            f'Fuente oficial Banco Central de Chile.')
    html = set_meta_content(html, 'meta-desc', desc)
    html = set_ld_value(html, 'ld-webpage', 'description',
                        f'Dólar observado hoy {dol_s}. Conversor USD/CLP, gráfico anual y tabla del mes.')
    return html

process('dolar/index.html', fix_dolar)

def fix_dolar_og(svg):
    mes_actual = MESES_ES[datetime.now().month - 1].capitalize()
    svg = re.sub(r'(<text[^>]*\bid="og-dolar-val"[^>]*>)[^<]*(</text>)',
                 rf'\g<1>{dol_s}\g<2>', svg)
    svg = re.sub(r'(<text[^>]*\bid="og-dolar-fecha"[^>]*>)[^<]*(</text>)',
                 rf'\g<1>{mes_actual} {YEAR}\g<2>', svg)
    return svg

process('assets/img/dolar-og.svg', fix_dolar_og, 'assets/img/dolar-og.svg')


# ─── 3. UTM ───────────────────────────────────────────────────────────────────

def fix_utm(html):
    html = set_el(html, 'utm-val',   utm_s,                           'div')
    html = set_el(html, 'utm-fecha', f'Actualizado {mes_label(utm_f)}', 'p')
    html = set_el(html, 's-hoy', utm_s, 'div')
    html = set_el(html, 's-uta', uta_s, 'div')
    if utm_st:
        html = set_el(html, 's-min',   clp(utm_st['min']),          'div')
        html = set_el(html, 's-min-f', date_short(utm_st['min_f']), 'div')
        html = set_el(html, 's-max',   clp(utm_st['max']),          'div')
        html = set_el(html, 's-max-f', date_short(utm_st['max_f']), 'div')
        html = set_el(html, 's-var',   pct(utm_st['var']),          'div')
    return html

process('utm/index.html', fix_utm)


# ─── 4. UF page ───────────────────────────────────────────────────────────────

def build_uf_mes_html(serie, mes_num, anio):
    filas = [r for r in serie
             if fecha_year(r['fecha']) == anio and fecha_mes(r['fecha']) == mes_num]
    filas.sort(key=lambda r: r['fecha'])
    if not filas:
        return None
    vals = [r['valor'] for r in filas]
    mn, mx = min(vals), max(vals)
    rows_html = '\n'.join(
        f'<tr><td>{fecha_dia(r["fecha"])}</td>'
        f'<td>{int(fecha_dia(r["fecha"])):02d}/{mes_num:02d}/{anio}</td>'
        f'<td>{clp(r["valor"])}</td></tr>'
        for r in filas
    )
    nombre_mes = MESES_ES[mes_num - 1].capitalize()
    return (
        f'<div class="month-section">'
        f'<button class="month-header open">'
        f'<span>{nombre_mes} {anio} '
        f'<span style="color:var(--accent);font-size:11px;margin-left:8px">(mes actual)</span></span>'
        f'<span class="month-meta">'
        f'<span>Mín: {clp(mn)}</span>'
        f'<span>Máx: {clp(mx)}</span>'
        f'<span>{len(filas)} días</span>'
        f'</span></button>'
        f'<div class="month-body">'
        f'<div class="table-wrap"><table>'
        f'<thead><tr><th>Día</th><th>Fecha</th><th>Valor UF</th></tr></thead>'
        f'<tbody>{rows_html}</tbody>'
        f'</table></div></div></div>'
    )

def fix_uf(html):
    html = set_el(html, 's-hoy',     uf_s, 'div')
    html = set_el(html, 'h1-uf-val', uf_s, 'span')
    if uf_st:
        html = set_el(html, 's-min',  clp(uf_st['min']),  'div')
        html = set_el(html, 's-max',  clp(uf_st['max']),  'div')
        html = set_el(html, 's-var',  pct(uf_st['var']),  'div')
        html = set_el(html, 's-prom', clp(uf_st['prom']), 'div')
    html = set_el(html, 'uf-garantia', clp(uf_val * 15),  'td')
    html = set_el(html, 'uf-hipoteca', clp(uf_val * 50),  'td')
    html = set_el(html, 'uf-mora',     clp(uf_val * 0.1), 'td')
    html = set_el(html, 'uf-credito',  clp(uf_val * 130), 'td')
    mes_html = build_uf_mes_html(uf_serie, datetime.now().month, YEAR)
    if mes_html:
        html = set_el(html, 'meses-container', mes_html, 'div')
    # meta description con valor numérico
    mes_label_actual = MESES_ES[datetime.now().month - 1]
    desc = (f'UF hoy {uf_s} ({mes_label_actual} {YEAR}). '
            f'Tabla completa del mes, gráfico histórico anual y conversor UF↔pesos. '
            f'Fuente oficial Banco Central de Chile.')
    html = set_meta_content(html, 'meta-desc', desc)
    # JSON-LD WebPage description con valor
    html = set_ld_value(html, 'ld-webpage', 'description',
                        f'UF hoy {uf_s}. Tabla completa del mes, gráfico histórico anual y conversor UF↔pesos.')
    # JSON-LD Dataset variableMeasured value
    html = re.sub(r'("value":\s*")\d+(")', rf'\g<1>{round(uf_val)}\g<2>', html, count=2)
    # conversor ref
    html = set_el(html, 'conv-uf-val', uf_s, 'span')
    return html

process('uf/index.html', fix_uf, 'uf/index.html')

def fix_uf_og(svg):
    mes_actual = MESES_ES[datetime.now().month - 1].capitalize()
    svg = re.sub(r'(<text[^>]*\bid="og-uf-val"[^>]*>)[^<]*(</text>)',
                 rf'\g<1>{uf_s}\g<2>', svg)
    svg = re.sub(r'(<text[^>]*\bid="og-uf-fecha"[^>]*>)[^<]*(</text>)',
                 rf'\g<1>{mes_actual} {YEAR}\g<2>', svg)
    return svg

process('assets/img/uf-og.svg', fix_uf_og, 'assets/img/uf-og.svg')


# ─── 5. IPC ───────────────────────────────────────────────────────────────────

def fix_ipc(html):
    html = set_el(html, 'ipc-mensual',  ipc_s,              'div')
    html = set_el(html, 'ipc-mes-label', mes_label(ipc_f),  'p')
    html = set_el(html, 'ipc-acum',     pct(ipc_acum),      'div')
    html = set_el(html, 's-ult',        ipc_s,              'div')
    return html

process('ipc/index.html', fix_ipc)


# ─── 6. Calculadora arriendo ──────────────────────────────────────────────────

def fix_calc(html):
    html = set_el(html, 'result-clp', clp(uf_val * 15), 'div')
    html = set_el(html, 'chip-uf',    uf_s,             'span')
    return html

process('calculadora-arriendo-uf/index.html', fix_calc, 'calculadora-arriendo-uf/index.html')


# ─── 7. Paginas mensuales UF ─────────────────────────────────────────────────

print('\n[Paginas mensuales UF]')
for mes_num in range(1, 13):
    slug = MESES_SLUGS.get(mes_num)
    path = f'uf/{slug}-{YEAR}/index.html'
    st = month_stats(uf_serie, mes_num)
    if not st:
        continue

    def make_fn(s):
        def fn(html):
            html = set_el(html, 's-ini',   clp(s['ini']),       'div')
            html = set_el(html, 's-ini-f', s['ini_day'],        'div')
            html = set_el(html, 's-fin',   clp(s['fin']),       'div')
            html = set_el(html, 's-fin-f', s['fin_day'],        'div')
            html = set_el(html, 's-min',   clp(s['min']),       'div')
            html = set_el(html, 's-min-f', s['min_day'],        'div')
            html = set_el(html, 's-max',   clp(s['max']),       'div')
            html = set_el(html, 's-max-f', s['max_day'],        'div')
            html = set_el(html, 's-var',   pct(s['var'], 2),    'div')
            html = set_el(html, 's-prom',  clp(round(s['prom'])), 'div')
            return html
        return fn

    process(path, make_fn(st), f'  uf/{slug}-{YEAR}/')


# ─── Resumen ──────────────────────────────────────────────────────────────────
print('\n' + '-' * 44)
print(f'  UF     {uf_s:<12} ({mes_label(uf_f)})')
print(f'  Dolar  {dol_s:<12} ({mes_label(dol_f)})')
print(f'  Euro   {euro_s:<12}')
print(f'  UTM    {utm_s:<12} | UTA {uta_s}')
print(f'  IPC    {ipc_s:<12} ({mes_label(ipc_f)})')
print(f'  IPC acum {YEAR}: {pct(ipc_acum)}')
if uf_st:
    print(f'  UF min/max: {clp(uf_st["min"])} / {clp(uf_st["max"])} | var {pct(uf_st["var"])}')
