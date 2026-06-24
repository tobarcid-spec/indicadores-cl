#!/usr/bin/env python3
"""
prebuild-fallback.py — Inyecta valores reales en HTML para crawlers (SSR fallback).

Uso: python prebuild-fallback.py

Idempotente: usa marcadores <!-- #FB:KEY# -->valor<!-- /#FB:KEY# -->.
- 1ª ejecución: detecta skeletons/placeholders y los reemplaza con marcadores.
- Ejecuciones siguientes: actualiza el valor entre marcadores existentes.

JS del cliente sobreescribe estos valores en tiempo real con datos frescos.
"""

import json, re, sys
from urllib.request import urlopen, Request
from datetime import datetime

API_URL       = 'https://mindicador.cl/api'
API_URL_PROXY = 'https://indicadoreschile.cl/api-proxy'

# Valores de respaldo si la API no responde (actualizar manualmente si es necesario)
DEFAULTS = {
    'uf':    {'valor': 40766.0, 'fecha': '2026-06-01T03:00:00.000Z'},
    'dolar': {'valor':   916.0, 'fecha': '2026-06-01T03:00:00.000Z'},
    'euro':  {'valor':  1058.0, 'fecha': '2026-06-01T03:00:00.000Z'},
    'utm':   {'valor': 71506.0, 'fecha': '2026-06-01T03:00:00.000Z'},
    'ipc':   {'valor':    -0.2, 'fecha': '2025-12-01T03:00:00.000Z'},
}

# ─── Helpers ─────────────────────────────────────────────────────────────────

def fetch_api():
    for url in [API_URL, API_URL_PROXY]:
        try:
            req = Request(url, headers={'User-Agent': 'prebuild-fallback/1.0 indicadoreschile.cl'})
            with urlopen(req, timeout=10) as r:
                return json.loads(r.read())
        except Exception as e:
            print(f'  (fallo {url}: {e})')
    print('  AVISO: usando valores por defecto (API no disponible)')
    return DEFAULTS

def clp(v):
    """$40.766"""
    return '$' + f'{round(v):,}'.replace(',', '.')

def pct(v, decimals=1):
    """-0,2%"""
    s = f'{v:+.{decimals}f}'.replace('.', ',')
    return s + '%'

MESES_ES = ['enero','febrero','marzo','abril','mayo','junio',
            'julio','agosto','septiembre','octubre','noviembre','diciembre']

def mes_label(fecha_str):
    """'2025-12-01T00:00:00.000Z' → 'diciembre 2025'"""
    try:
        d = datetime.fromisoformat(fecha_str.replace('Z', '+00:00'))
        return f'{MESES_ES[d.month-1]} {d.year}'
    except Exception:
        return fecha_str[:7]

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

# ─── Core: idempotent marker replacement ─────────────────────────────────────

def fb_set(html, key, value, first_run_pattern=None, first_run_tpl=None):
    """
    Reemplaza <!-- #FB:KEY# -->*<!-- /#FB:KEY# --> si existe.
    Si no, aplica first_run_pattern/tpl para insertar el marcador.

    first_run_tpl puede usar {MARKER} como placeholder para el bloque marcador.
    """
    mk_open  = f'<!-- #FB:{key}# -->'
    mk_close = f'<!-- /#FB:{key}# -->'
    marker   = f'{mk_open}{value}{mk_close}'

    # Update existing marker (idempotent)
    m_re = re.compile(re.escape(mk_open) + r'.*?' + re.escape(mk_close), re.DOTALL)
    if m_re.search(html):
        return m_re.sub(marker, html)

    # First run: inject marker using fallback pattern
    if first_run_pattern and first_run_tpl:
        tpl = first_run_tpl.replace('{MARKER}', marker)
        new_html = re.sub(first_run_pattern, tpl, html, count=1, flags=re.DOTALL)
        if new_html != html:
            return new_html

    print(f'    WARN: No se encontro patron para key={key}')
    return html


def process(path, fn, label=None):
    lbl = label or path
    print(f'\n[{lbl}]')
    try:
        original = read_file(path)
        result   = fn(original)
        if result != original:
            write_file(path, result)
            print(f'  OK ACTUALIZADO')
        else:
            print(f'  -- Sin cambios')
    except FileNotFoundError:
        print(f'  ✗ Archivo no encontrado: {path}')


# ─── Fetch ───────────────────────────────────────────────────────────────────

print('Consultando mindicador.cl/api...')
try:
    data = fetch_api()
except Exception as e:
    print(f'ERROR al consultar API: {e}')
    sys.exit(1)

uf_val   = data['uf']['valor']
dol_val  = data['dolar']['valor']
euro_val = data['euro']['valor']
utm_val  = data['utm']['valor']
ipc_val  = data['ipc']['valor']

uf_f   = data['uf']['fecha']
dol_f  = data['dolar']['fecha']
utm_f  = data['utm']['fecha']
ipc_f  = data['ipc']['fecha']

uf_s    = clp(uf_val)
dol_s   = clp(dol_val)
euro_s  = clp(euro_val)
utm_s   = clp(utm_val)
ipc_s   = pct(ipc_val)
uta_s   = clp(utm_val * 12)

uf_fecha_s   = f'Valor al {mes_label(uf_f)}'
dol_fecha_s  = f'Valor al {mes_label(dol_f)}'
utm_fecha_s  = f'Actualizado {mes_label(utm_f)}'

print(f'  UF {uf_s} | Dólar {dol_s} | UTM {utm_s} | IPC {ipc_s} | Euro {euro_s}')


# ─── 1. Dashboard ────────────────────────────────────────────────────────────

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
    # UF value (skeleton 220px)
    html = fb_set(html, 'UF_VAL', uf_s,
        r'(<div[^>]*\bid="uf-val"[^>]*>)<span class="skel"[^>]*></span>(</div>)',
        r'\g<1>{MARKER}\g<2>')

    # UF fecha (skeleton 160px)
    html = fb_set(html, 'UF_FECHA', uf_fecha_s,
        r'(<p[^>]*\bid="uf-fecha"[^>]*>)<span class="skel"[^>]*></span>(</p>)',
        r'\g<1>{MARKER}\g<2>')

    # otros-grid: replace the 3 skeleton cards
    html = fb_set(html, 'OTROS_GRID', otros_cards,
        r'(id="otros-grid"[^>]*>)\s*<!-- JS los inserta -->\s*'
        r'<div class="ind-card">.*?</div>\s*'
        r'<div class="ind-card">.*?</div>\s*'
        r'<div class="ind-card">.*?</div>',
        r'\g<1>\n    {MARKER}')

    return html

process('index.html', fix_dashboard, 'index.html (dashboard)')


# ─── 2. Dólar ────────────────────────────────────────────────────────────────

def fix_dolar(html):
    # Hero value (skeleton 200×56)
    html = fb_set(html, 'DOLAR_VAL', dol_s,
        r'(<div[^>]*\bid="dolar-val"[^>]*>)<span class="skel"[^>]*></span>(</div>)',
        r'\g<1>{MARKER}\g<2>')

    # Hero fecha (skeleton 180×14)
    html = fb_set(html, 'DOLAR_FECHA', dol_fecha_s,
        r'(<p[^>]*\bid="dolar-fecha"[^>]*>)<span class="skel"[^>]*></span>(</p>)',
        r'\g<1>{MARKER}\g<2>')

    # s-hoy stat chip
    html = fb_set(html, 'DOLAR_S_HOY', dol_s,
        r'(<div[^>]*\bid="s-hoy"[^>]*>)—(</div>)',
        r'\g<1>{MARKER}\g<2>')

    return html

process('dolar/index.html', fix_dolar)


# ─── 3. UTM ──────────────────────────────────────────────────────────────────

def fix_utm(html):
    html = fb_set(html, 'UTM_VAL', utm_s,
        r'(<div[^>]*\bid="utm-val"[^>]*>)<span class="skel"[^>]*></span>(</div>)',
        r'\g<1>{MARKER}\g<2>')

    html = fb_set(html, 'UTM_FECHA', utm_fecha_s,
        r'(<p[^>]*\bid="utm-fecha"[^>]*>)<span class="skel"[^>]*></span>(</p>)',
        r'\g<1>{MARKER}\g<2>')

    html = fb_set(html, 'UTM_S_HOY', utm_s,
        r'(<div[^>]*\bid="s-hoy"[^>]*>)—(</div>)',
        r'\g<1>{MARKER}\g<2>')

    html = fb_set(html, 'UTM_S_UTA', uta_s,
        r'(<div[^>]*\bid="s-uta"[^>]*>)—(</div>)',
        r'\g<1>{MARKER}\g<2>')

    return html

process('utm/index.html', fix_utm)


# ─── 4. UF page ──────────────────────────────────────────────────────────────

def fix_uf(html):
    html = fb_set(html, 'UF_S_HOY', uf_s,
        r'(<div[^>]*\bid="s-hoy"[^>]*>)—(</div>)',
        r'\g<1>{MARKER}\g<2>')

    return html

process('uf/index.html', fix_uf, 'uf/index.html')


# ─── 5. IPC ──────────────────────────────────────────────────────────────────

def fix_ipc(html):
    # Hero IPC mensual (skeleton 120×48)
    html = fb_set(html, 'IPC_MENSUAL', ipc_s,
        r'(<div[^>]*\bid="ipc-mensual"[^>]*>)<span class="skel"[^>]*></span>(</div>)',
        r'\g<1>{MARKER}\g<2>')

    # Hero mes label (skeleton 160×14)
    html = fb_set(html, 'IPC_MES_LABEL', mes_label(ipc_f),
        r'(<p[^>]*\bid="ipc-mes-label"[^>]*>)<span class="skel"[^>]*></span>(</p>)',
        r'\g<1>{MARKER}\g<2>')

    # s-ult stat chip
    html = fb_set(html, 'IPC_S_ULT', ipc_s,
        r'(<div[^>]*\bid="s-ult"[^>]*>)—(</div>)',
        r'\g<1>{MARKER}\g<2>')

    return html

process('ipc/index.html', fix_ipc)


# ─── 6. Calculadora arriendo ─────────────────────────────────────────────────

def fix_calc(html):
    # result-clp: "Calculando…"
    html = fb_set(html, 'CALC_RESULT', clp(uf_val * 15),
        r'(<div[^>]*\bid="result-clp"[^>]*>)Calculando…(</div>)',
        r'\g<1>{MARKER}\g<2>')

    # chip-uf: "—"
    html = fb_set(html, 'CALC_UF', uf_s,
        r'(<span\s+id="chip-uf">)—(</span>)',
        r'\g<1>{MARKER}\g<2>')

    return html

process('calculadora-arriendo-uf/index.html', fix_calc, 'calculadora-arriendo-uf/index.html')


# ─── Resumen ─────────────────────────────────────────────────────────────────
print('\n' + '-' * 40)
print('Fallback values inyectados:')
print(f'  UF     {uf_s:<12} ({mes_label(uf_f)})')
print(f'  Dólar  {dol_s:<12} ({mes_label(dol_f)})')
print(f'  Euro   {euro_s:<12}')
print(f'  UTM    {utm_s:<12} ({mes_label(utm_f)})')
print(f'  UTA    {uta_s:<12}')
print(f'  IPC    {ipc_s:<12} ({mes_label(ipc_f)})')
