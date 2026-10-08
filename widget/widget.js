/*! indicadoreschile.cl — widget de indicadores económicos de Chile (UF, dólar, euro, UTM, IPC)
 *
 * Uso:
 *   <div data-ic-widget data-i="uf,dolar,utm" data-t="tarjetas" data-tema="oscuro"></div>
 *   <script async src="https://indicadoreschile.cl/widget/widget.js"></script>
 *
 *   data-i     indicadores, en el orden que quieras: uf, dolar, euro, utm, ipc   (por defecto: uf)
 *   data-t     estilo: tarjetas | lista | fila                                   (por defecto: tarjetas)
 *   data-tema  oscuro | claro                                                    (por defecto: oscuro)
 *
 * Los datos salen de /data/hoy.json (Banco Central y SII, actualizados varias veces al dia).
 */
(function () {
  'use strict';

  var ORIGIN = 'https://indicadoreschile.cl';
  try {
    var actual = document.currentScript;
    if (actual && actual.src) ORIGIN = new URL(actual.src).origin;
  } catch (e) { /* se usa el origen por defecto */ }

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var DEF = {
    uf:    { label: 'UF',    nombre: 'Unidad de Fomento',         url: '/uf/',    pct: false, mensual: false },
    dolar: { label: 'Dólar', nombre: 'Dólar observado',           url: '/dolar/', pct: false, mensual: false },
    euro:  { label: 'Euro',  nombre: 'Euro',                      url: '/',       pct: false, mensual: false },
    utm:   { label: 'UTM',   nombre: 'Unidad Tributaria Mensual', url: '/utm/',   pct: false, mensual: true },
    ipc:   { label: 'IPC',   nombre: 'IPC mensual',               url: '/ipc/',   pct: true,  mensual: true }
  };
  var ESTILOS = ['tarjetas', 'lista', 'fila'];
  var TEMAS = ['oscuro', 'claro'];

  var clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 2 });

  function valorTexto(def, v) {
    if (def.pct) return (v > 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + '%';
    return clp.format(v);
  }

  function etiqueta(def, fecha) {
    var anio = fecha.slice(0, 4), mes = parseInt(fecha.slice(5, 7), 10);
    if (def.mensual) return MESES[mes - 1] + ' ' + anio;
    return fecha.slice(8, 10) + '-' + fecha.slice(5, 7) + '-' + anio;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---- Estilos (una sola vez por pagina) ---- */
  function inyectarCss() {
    if (document.getElementById('icw-css')) return;
    var css = [
      '.icw{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;box-sizing:border-box;max-width:100%}',
      '.icw *{box-sizing:border-box}',
      '.icw a{text-decoration:none;color:inherit}',
      '.icw-oscuro{--c-bg:#111720;--c-borde:rgba(255,255,255,.1);--c-texto:#fff;--c-suave:#8a99b3;--c-acento:#3b9eff}',
      '.icw-claro{--c-bg:#fff;--c-borde:#e3e8ef;--c-texto:#0f172a;--c-suave:#64748b;--c-acento:#2563eb}',
      '.icw-item{display:block;background:var(--c-bg);border:1px solid var(--c-borde);border-radius:10px;color:var(--c-texto)}',
      '.icw-item:hover{border-color:var(--c-acento)}',
      '.icw-label{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--c-acento)}',
      '.icw-name{font-size:12px;color:var(--c-suave)}',
      '.icw-value{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:600;color:var(--c-texto)}',
      '.icw-sub{font-size:11px;color:var(--c-suave)}',
      '.icw .icw-foot{display:inline-block;margin-top:8px;font-size:11px;color:#8a99b3}',
      '.icw .icw-foot:hover{text-decoration:underline}',
      /* tarjetas */
      '.icw-tarjetas .icw-items{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}',
      '.icw-tarjetas .icw-item{padding:12px 14px}',
      '.icw-tarjetas .icw-value{display:block;font-size:20px;margin:4px 0 2px}',
      '.icw-tarjetas .icw-name{display:block;margin-top:2px}',
      /* lista */
      '.icw-lista .icw-items{background:var(--c-bg);border:1px solid var(--c-borde);border-radius:10px;overflow:hidden}',
      '.icw-lista .icw-item{display:grid;grid-template-columns:1fr auto;column-gap:12px;padding:10px 14px;border:0;border-radius:0;border-bottom:1px solid var(--c-borde)}',
      '.icw-lista .icw-item:last-child{border-bottom:0}',
      '.icw-lista .icw-name{margin-left:8px}',
      '.icw-lista .icw-value{font-size:16px;text-align:right}',
      '.icw-lista .icw-sub{text-align:right}',
      /* fila */
      '.icw-fila .icw-items{display:flex;flex-wrap:wrap;gap:8px}',
      '.icw-fila .icw-item{display:inline-flex;align-items:baseline;gap:8px;padding:7px 12px;border-radius:99px}',
      '.icw-fila .icw-value{font-size:14px}',
      '.icw-fila .icw-name,.icw-fila .icw-sub{display:none}',
      '.icw-msg{font-size:13px;color:#8a99b3;padding:8px 0}'
    ].join('\n');
    var el = document.createElement('style');
    el.id = 'icw-css';
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  }

  /* ---- Datos: un solo pedido para todos los widgets de la pagina ---- */
  var datos = null;
  function traer(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function cargar() {
    if (!datos) {
      datos = traer(ORIGIN + '/data/hoy.json').catch(function () { return traer(ORIGIN + '/api-proxy'); });
    }
    return datos;
  }

  /* Dentro de un iframe, avisa la altura para que la pagina anfitriona ajuste el marco */
  function avisarAltura() {
    if (window.parent === window) return;
    var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
    try { window.parent.postMessage({ icWidgetHeight: h }, '*'); } catch (e) { /* sin acceso */ }
  }
  if (window.parent !== window) window.addEventListener('resize', avisarAltura);

  function opciones(o) {
    var lista = Array.isArray(o.i) ? o.i : String(o.i || 'uf').split(',');
    var vistos = {}, ids = [];
    lista.forEach(function (x) {
      x = String(x).trim().toLowerCase();
      if (DEF[x] && !vistos[x]) { vistos[x] = true; ids.push(x); }
    });
    if (!ids.length) ids = ['uf'];
    return {
      ids: ids,
      t: ESTILOS.indexOf(o.t) >= 0 ? o.t : 'tarjetas',
      tema: TEMAS.indexOf(o.tema) >= 0 ? o.tema : 'oscuro'
    };
  }

  function render(el, o) {
    var op = opciones(o || {});
    inyectarCss();
    var clase = 'icw icw-' + op.tema + ' icw-' + op.t;
    el.innerHTML = '<div class="' + clase + '"><div class="icw-msg">Cargando…</div></div>';
    avisarAltura();

    cargar().then(function (d) {
      var items = '';
      op.ids.forEach(function (id) {
        var def = DEF[id], r = d && d[id];
        if (!r || typeof r.valor !== 'number') return;
        items += '<a class="icw-item" href="' + ORIGIN + def.url + '" target="_blank" rel="noopener">' +
          '<span><span class="icw-label">' + esc(def.label) + '</span>' +
          '<span class="icw-name">' + esc(def.nombre) + '</span></span>' +
          '<span class="icw-value">' + esc(valorTexto(def, r.valor)) + '</span>' +
          '<span class="icw-sub">' + esc(etiqueta(def, r.fecha)) + '</span></a>';
      });
      if (!items) throw new Error('sin datos');
      el.innerHTML = '<div class="' + clase + '"><div class="icw-items">' + items + '</div>' +
        '<a class="icw-foot" href="' + ORIGIN + '/" target="_blank" rel="noopener">indicadoreschile.cl</a></div>';
      avisarAltura();
    }).catch(function () {
      el.innerHTML = '<div class="' + clase + '"><div class="icw-msg">Indicadores no disponibles por ahora.</div></div>';
      avisarAltura();
    });
  }

  function iniciar() {
    var els = document.querySelectorAll('[data-ic-widget]');
    for (var k = 0; k < els.length; k++) {
      render(els[k], {
        i: els[k].getAttribute('data-i'),
        t: els[k].getAttribute('data-t'),
        tema: els[k].getAttribute('data-tema')
      });
    }
  }

  window.ICWidget = { render: render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
