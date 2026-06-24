#!/usr/bin/env python3
"""
prebuild-fallback.py - Inyecta valores reales en HTML para crawlers (SSR fallback).

Uso: python prebuild-fallback.py

Idempotente: usa marcadores <!-- #FB:KEY# -->valor<!-- /#FB:KEY# -->.
- 1a ejecucion: detecta skeletons/placeholders y los reemplaza con marcadores.
- Ejecuciones siguientes: actualiza el valor entre marcadores existentes.

JS del cliente sobreescribe estos valores en tiempo real con datos frescos.
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

# Valores de respaldo si la API no responde
DEFAULTS_HOY = {
    'uf':    {'valor': 40804.0, 'fecha': '2026-06-01T03:00:00.000Z'},
    'dolar': {'valor':   916.0, 'fecha': '2026-06-01T03:00:00.000Z'},
    'euro':  {'valor':  1042.0, 'fecha': '2026-06-01T03:00:00.000Z'},
    'utm':   {'valor': 71506.0, 'fecha': '2026-06-01T03:00:00.000Z'},
    'ipc':   {'valor':    -0.2, 'fecha': '2025-12-01T03:00:00.000Z'},
}

# ─── Helpers de fetch ─────────────────────────────────────────────────────────

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
            print(f'  (fallo {url}: {type(e).__name__}: {e})')
    return None

def fetch_api():
    data = fetch_url()
    if data:
        return data
    print('  AVISO: usando valores por defecto (API no disponible)')
    return DEFAULTS_HOY

def fetch_serie(indicador, year=None):
    """Retorna lista ordenada de {fecha, valor} para indicador/year."""
    path = f'{indicador}/{year}' if year else indicador
    data = fetch_url(path)
    if not data or not data.get('serie'):
        return []
    return sorted(data['serie'], key=lambda r: r['fecha'])

# ─── Helpers de formato ───────────────────────────────────────────────────────

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
    """'2026-04-03T...' -> '03 abr'"""
    dt = datetime.fromisoformat(fecha_str.replace('Z', '+00:00'))
    return f'{dt.day:02d} {MESES_SHORT[dt.month-1]}'

def fecha_year(f): return int(f[:4])
def fecha_mes(f):  return int(f[5:7])

# ─── Computo de estadisticas ──────────────────────────────────────────────────

def compute_year_stats(serie, year):
    """Min/max/var/prom de una serie filtrada al year dado."""
    rows = [r for r in serie if fecha_year(r['fecha']) == year]
    if not rows:
        return None
    vals = [r['valor'] for r in rows]
    min_v = min(vals); max_v = max(vals)
    min_r = next(r for r in rows if r['valor'] == min_v)
    max_r = next(r for r in rows if r['valor'] == max_v)
    var   = (rows[-1]['valor'] - rows[0]['valor']) / rows[0]['valor'] * 100
    return {
        'min': min_v, 'min_f': min_r['fecha'],
        'max': max_v, 'max_f': max_r['fecha'],
        'prom': sum(vals) / len(vals),
        'var': var,
        'first': rows[0]['valor'],
        'last':  rows[-1]['valor'],
    }

def compute_month_stats(serie, year, mes):
    """Stats para un mes especifico."""
    rows = [r for r in serie
            if fecha_year(r['fecha']) == year and fecha_mes(r['fecha']) == mes]
    if not rows:
        return None
    vals = [r['valor'] for r in rows]
    min_v = min(vals); max_v = max(vals)
    min_r = next(r for r in rows if r['valor'] == min_v)
    max_r = next(r for r in rows if r['valor'] == max_v)
    var   = (rows[-1]['valor'] - rows[0]['valor']) / rows[0]['valor'] * 100
    return {
        'ini': rows[0]['valor'],  'ini_day': fecha_mes_dia(rows[0]['fecha']),
        'fin': rows[-1]['valor'], 'fin_day': fecha_mes_dia(rows[-1]['fecha']),
        'min': min_v, 'min_day': fecha_mes_dia(min_r['fecha']),
        'max': max_v, 'max_day': fecha_mes_dia(max_r['fecha']),
        'prom': sum(vals) / len(vals),
        'var': var,
    }

def fecha_mes_dia(f):
    """'2026-04-03T...' -> '3' (dia del mes)"""
    return str(int(f[8:10]))

# ─── Nucleo: reemplazo idempotente con marcadores ─────────────────────────────

def fb_set(html, key, value, frp=None, frt=None):
    """
    Actualiza <!-- #FB:KEY# -->valor<!-- /#FB:KEY# --> si existe.
    Si no, aplica patron frp/frt para insertar el marcador.
    frt usa {MARKER} como placeholder.
    """
    mk_o = f'<!-- #FB:{key}# -->'
    mk_c = f'<!-- /#FB:{key}# -->'
    mk   = f'{mk_o}{value}{mk_c}'
    existing = re.compile(re.escape(mk_o) + r'.*?' + re.escape(mk_c), re.DOTALL)
    if existing.search(html):
        return existing.sub(mk, html)
    if frp and frt:
        result = re.sub(frp, frt.replace('{MARKER}', mk), html, count=1, flags=re.DOTALL)
        if result != html:
            return result
    print(f'    WARN: no encontrado key={key}')
    return html

def stat_dash(html, key, value, el_id):
    """Reemplaza — en un stat-chip-val/span con el id dado."""
    return fb_set(html, key, value,
        rf'(<[^>]+\bid="{el_id}"[^>]*>)—(<)',
        r'\g<1>{MARKER}\g<2>')

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


# ─── Fetch de datos ───────────────────────────────────────────────────────────

print('Consultando mindicador.cl/api...')
hoy = fetch_api()

uf_val  = hoy['uf']['valor'];    uf_f  = hoy['uf']['fecha']
dol_val = hoy['dolar']['valor']; dol_f = hoy['dolar']['fecha']
euro_val= hoy['euro']['valor']
utm_val = hoy['utm']['valor'];   utm_f = hoy['utm']['fecha']
ipc_val = hoy['ipc']['valor'];   ipc_f = hoy['ipc']['fecha']

uf_s  = clp(uf_val);  dol_s = clp(dol_val); euro_s = clp(euro_val)
utm_s = clp(utm_val); ipc_s = pct(ipc_val); uta_s  = clp(utm_val * 12)

print(f'  UF {uf_s} | Dolar {dol_s} | UTM {utm_s} | IPC {ipc_s}')

print('\nFetching series anuales...')
uf_serie  = fetch_serie('uf',    YEAR)
dol_serie = fetch_serie('dolar', YEAR)
utm_serie = fetch_serie('utm',   YEAR)
ipc_base  = fetch_serie('ipc')          # base endpoint (todos los meses)

uf_stats  = compute_year_stats(uf_serie,  YEAR)
dol_stats = compute_year_stats(dol_serie, YEAR)
utm_stats = compute_year_stats(utm_serie, YEAR)
ipc_2026  = [r for r in ipc_base if fecha_year(r['fecha']) == YEAR]
ipc_acum  = sum(r['valor'] for r in ipc_2026)

print(f'  UF serie: {len(uf_serie)} entradas | Dolar: {len(dol_serie)} | UTM: {len(utm_serie)} | IPC base: {len(ipc_base)}')
if uf_stats:
    print(f'  UF year: min={clp(uf_stats["min"])} max={clp(uf_stats["max"])} var={pct(uf_stats["var"])} prom={clp(uf_stats["prom"])}')


# ─── 1. Dashboard ─────────────────────────────────────────────────────────────

otros_cards = (
    f'<a href="/dolar/" class="ind-card">'
    f'<div class="ind-card-label">🇺🇸 Dólar USD</div>'
    f'<div class="ind-card-value">{dol_s}</div>'
    f'<div class="ind-card-name">{mes_label(dol_f)}</div></a>'
    f'\n    <a href="/dolar/" class="ind-card">'
    f'<div class="ind-card-label">🇪🇺 Euro EUR</div>'
    f'<div class="ind-card-value">{euro_s}</div>'
    f'<div class="ind-card-name">{mes_label(dol_f)}</div></a>'
    f'\n    <a href="/utm/" class="ind-card">'
    f'<div class="ind-card-label">📋 UTM</div>'
    f'<div class="ind-card-value">{utm_s}</div>'
    f'<div class="ind-card-name">{mes_label(utm_f)}</div></a>'
    f'\n    <a href="/ipc/" class="ind-card">'
    f'<div class="ind-card-label">📊 IPC mensual</div>'
    f'<div class="ind-card-value">{ipc_s}</div>'
    f'<div class="ind-card-name">{mes_label(ipc_f)}</div></a>'
)

def fix_dashboard(html):
    html = fb_set(html, 'UF_VAL', uf_s,
        r'(<div[^>]*\bid="uf-val"[^>]*>)<span class="skel"[^>]*></span>(</div>)',
        r'\g<1>{MARKER}\g<2>')
    html = fb_set(html, 'UF_FECHA', f'Valor al {mes_label(uf_f)}',
        r'(<p[^>]*\bid="uf-fecha"[^>]*>)<span class="skel"[^>]*></span>(</p>)',
        r'\g<1>{MARKER}\g<2>')
    html = fb_set(html, 'OTROS_GRID', otros_cards,
        r'(id="otros-grid"[^>]*>)\s*<!-- JS los inserta -->\s*'
        r'<div class="ind-card">.*?</div>\s*'
        r'<div class="ind-card">.*?</div>\s*'
        r'<div class="ind-card">.*?</div>',
        r'\g<1>\n    {MARKER}')
    return html

process('index.html', fix_dashboard, 'index.html (dashboard)')


# ─── 2. Dolar ─────────────────────────────────────────────────────────────────

def fix_dolar(html):
    html = fb_set(html, 'DOLAR_VAL', dol_s,
        r'(<div[^>]*\bid="dolar-val"[^>]*>)<span class="skel"[^>]*></span>(</div>)',
        r'\g<1>{MARKER}\g<2>')
    html = fb_set(html, 'DOLAR_FECHA', f'Valor al {mes_label(dol_f)}',
        r'(<p[^>]*\bid="dolar-fecha"[^>]*>)<span class="skel"[^>]*></span>(</p>)',
        r'\g<1>{MARKER}\g<2>')
    html = stat_dash(html, 'DOLAR_S_HOY',  dol_s, 's-hoy')
    if dol_stats:
        html = stat_dash(html, 'DOLAR_S_MIN',  clp(dol_stats['min']),       's-min')
        html = stat_dash(html, 'DOLAR_S_MIN_F',date_short(dol_stats['min_f']), 's-min-f')
        html = stat_dash(html, 'DOLAR_S_MAX',  clp(dol_stats['max']),       's-max')
        html = stat_dash(html, 'DOLAR_S_MAX_F',date_short(dol_stats['max_f']), 's-max-f')
        html = stat_dash(html, 'DOLAR_S_VAR',  pct(dol_stats['var']),       's-var')
        html = stat_dash(html, 'DOLAR_S_PROM', clp(dol_stats['prom']),      's-prom')
    return html

process('dolar/index.html', fix_dolar)


# ─── 3. UTM ───────────────────────────────────────────────────────────────────

def fix_utm(html):
    html = fb_set(html, 'UTM_VAL', utm_s,
        r'(<div[^>]*\bid="utm-val"[^>]*>)<span class="skel"[^>]*></span>(</div>)',
        r'\g<1>{MARKER}\g<2>')
    html = fb_set(html, 'UTM_FECHA', f'Actualizado {mes_label(utm_f)}',
        r'(<p[^>]*\bid="utm-fecha"[^>]*>)<span class="skel"[^>]*></span>(</p>)',
        r'\g<1>{MARKER}\g<2>')
    html = stat_dash(html, 'UTM_S_HOY', utm_s, 's-hoy')
    html = stat_dash(html, 'UTM_S_UTA', uta_s, 's-uta')
    if utm_stats:
        html = stat_dash(html, 'UTM_S_MIN',   clp(utm_stats['min']),        's-min')
        html = stat_dash(html, 'UTM_S_MIN_F', date_short(utm_stats['min_f']),'s-min-f')
        html = stat_dash(html, 'UTM_S_MAX',   clp(utm_stats['max']),        's-max')
        html = stat_dash(html, 'UTM_S_MAX_F', date_short(utm_stats['max_f']),'s-max-f')
        html = stat_dash(html, 'UTM_S_VAR',   pct(utm_stats['var']),        's-var')
    return html

process('utm/index.html', fix_utm)


# ─── 4. UF page ───────────────────────────────────────────────────────────────

def fix_uf(html):
    html = stat_dash(html, 'UF_S_HOY', uf_s, 's-hoy')
    if uf_stats:
        html = stat_dash(html, 'UF_S_MIN',  clp(uf_stats['min']),  's-min')
        html = stat_dash(html, 'UF_S_MAX',  clp(uf_stats['max']),  's-max')
        html = stat_dash(html, 'UF_S_VAR',  pct(uf_stats['var']),  's-var')
        html = stat_dash(html, 'UF_S_PROM', clp(uf_stats['prom']), 's-prom')
    return html

process('uf/index.html', fix_uf, 'uf/index.html')


# ─── 5. IPC ───────────────────────────────────────────────────────────────────

def fix_ipc(html):
    html = fb_set(html, 'IPC_MENSUAL', ipc_s,
        r'(<div[^>]*\bid="ipc-mensual"[^>]*>)<span class="skel"[^>]*></span>(</div>)',
        r'\g<1>{MARKER}\g<2>')
    html = fb_set(html, 'IPC_MES_LABEL', mes_label(ipc_f),
        r'(<p[^>]*\bid="ipc-mes-label"[^>]*>)<span class="skel"[^>]*></span>(</p>)',
        r'\g<1>{MARKER}\g<2>')
    html = fb_set(html, 'IPC_ACUM', pct(ipc_acum),
        r'(<div[^>]*\bid="ipc-acum"[^>]*>)<span class="skel"[^>]*></span>(</div>)',
        r'\g<1>{MARKER}\g<2>')
    html = stat_dash(html, 'IPC_S_ULT', ipc_s, 's-ult')
    return html

process('ipc/index.html', fix_ipc)


# ─── 6. Calculadora arriendo ──────────────────────────────────────────────────

def fix_calc(html):
    html = fb_set(html, 'CALC_RESULT', clp(uf_val * 15),
        r'(<div[^>]*\bid="result-clp"[^>]*>)Calculando…(</div>)',
        r'\g<1>{MARKER}\g<2>')
    html = fb_set(html, 'CALC_UF', uf_s,
        r'(<span\s+id="chip-uf">)—(</span>)',
        r'\g<1>{MARKER}\g<2>')
    return html

process('calculadora-arriendo-uf/index.html', fix_calc, 'calculadora-arriendo-uf/index.html')


# ─── 7. Paginas mensuales UF ─────────────────────────────────────────────────

print('\n[Paginas mensuales UF]')
for mes_num in range(1, 13):
    slug = MESES_SLUGS.get(mes_num)
    path = f'uf/{slug}-{YEAR}/index.html'
    stats = compute_month_stats(uf_serie, YEAR, mes_num)
    if not stats:
        continue

    def make_fix_mes(st):
        def fix_mes(html):
            html = stat_dash(html, 'M_S_INI',   clp(st['ini']),      's-ini')
            html = stat_dash(html, 'M_S_INI_F', st['ini_day'],       's-ini-f')
            html = stat_dash(html, 'M_S_FIN',   clp(st['fin']),      's-fin')
            html = stat_dash(html, 'M_S_FIN_F', st['fin_day'],       's-fin-f')
            html = stat_dash(html, 'M_S_MIN',   clp(st['min']),      's-min')
            html = stat_dash(html, 'M_S_MIN_F', st['min_day'],       's-min-f')
            html = stat_dash(html, 'M_S_MAX',   clp(st['max']),      's-max')
            html = stat_dash(html, 'M_S_MAX_F', st['max_day'],       's-max-f')
            html = stat_dash(html, 'M_S_VAR',   pct(st['var'], 2),   's-var')
            html = stat_dash(html, 'M_S_PROM',  clp(round(st['prom'])), 's-prom')
            return html
        return fix_mes

    process(path, make_fix_mes(stats), f'  uf/{slug}-{YEAR}/')


# ─── Resumen ──────────────────────────────────────────────────────────────────
print('\n' + '-' * 44)
print('Valores inyectados:')
print(f'  UF     {uf_s:<12} ({mes_label(uf_f)})')
print(f'  Dolar  {dol_s:<12} ({mes_label(dol_f)})')
print(f'  Euro   {euro_s:<12}')
print(f'  UTM    {utm_s:<12} ({mes_label(utm_f)})')
print(f'  UTA    {uta_s:<12}')
print(f'  IPC    {ipc_s:<12} ({mes_label(ipc_f)})')
print(f'  IPC acum {YEAR}: {pct(ipc_acum)} ({len(ipc_2026)} meses con datos)')
if uf_stats:
    print(f'  UF min/max: {clp(uf_stats["min"])} / {clp(uf_stats["max"])} | var: {pct(uf_stats["var"])}')
