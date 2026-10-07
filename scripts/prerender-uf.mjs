#!/usr/bin/env node
/**
 * prerender-uf.mjs — escribe en el HTML estatico las estadisticas y tablas de
 * las paginas de la UF (mensuales /uf/mes-aaaa/ y anuales /uf/aaaa/), a partir
 * de /data/uf-AAAA.json. Asi Google ve el contenido sin ejecutar JavaScript.
 *
 * El JavaScript de cada pagina sigue funcionando igual: al cargar reemplaza
 * estos mismos elementos con el mismo contenido (y agrega grafico y "hoy").
 *
 * Uso: node scripts/prerender-uf.mjs      (idempotente; solo escribe si hay cambios)
 */
import fs from 'node:fs';
import path from 'node:path';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const ahora = new Date();
const anioActual = ahora.getUTCFullYear();
const mesActual = ahora.getUTCMonth() + 1;

/* ── Formato (igual que fmt.* de assets/js/utils.js) ── */
const clpFmt = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 2 });
const clp = v => clpFmt.format(v);
const fecha = f => new Date(f).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const dia = f => new Date(f).getUTCDate();
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── Utilidades de HTML ── */
// Posicion del cierre </tag> que corresponde a un elemento, contando anidados.
function cierre(html, desde, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>|</${tag}>`, 'g');
  re.lastIndex = desde;
  let prof = 1, m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('</')) { if (--prof === 0) return m.index; } else prof++;
  }
  return -1;
}

// Reemplaza el contenido de <tag id="id">...</tag>. Devuelve null si no existe.
function setInner(html, tag, id, valor, estilo) {
  const apertura = new RegExp(`<${tag}(?:\\s[^>]*)?\\bid="${id}"[^>]*>`);
  const m = apertura.exec(html);
  if (!m) return null;
  const fin = cierre(html, m.index + m[0].length, tag);
  if (fin < 0) return null;
  let tagAbre = m[0];
  if (estilo !== undefined) {
    tagAbre = /\sstyle="[^"]*"/.test(tagAbre)
      ? tagAbre.replace(/\sstyle="[^"]*"/, ` style="${estilo}"`)
      : tagAbre.replace(/>$/, ` style="${estilo}">`);
  }
  return html.slice(0, m.index) + tagAbre + valor + html.slice(fin);
}

// Evalua un literal de objeto que vive en el JS de la pagina (CONTEXTOS, etc.)
function literal(html, patron, params, args) {
  const m = html.match(patron);
  if (!m) return null;
  try { return new Function(...params, `return (${m[1]});`)(...args); } catch { return null; }
}

/* ── Estadisticas (misma logica que el JS de las paginas) ── */
function stats(serie) {
  const valores = serie.map(r => r.valor);
  const min = Math.min(...valores), max = Math.max(...valores);
  const prom = valores.reduce((s, v) => s + v, 0) / valores.length;
  const primero = serie[0], ultimo = serie[serie.length - 1];
  const varPct = ((ultimo.valor - primero.valor) / primero.valor * 100).toFixed(2);
  return {
    primero, ultimo, min, max, prom, varPct,
    minFila: serie.find(r => r.valor === min), maxFila: serie.find(r => r.valor === max),
    varTxt: `${varPct > 0 ? '+' : ''}${varPct}%`,
    varColor: varPct >= 0 ? 'var(--red)' : 'var(--green)',
  };
}

function filasDiarias(serie, conClaseValor) {
  return serie.map((r, i) => {
    let cambio = '—';
    if (i > 0) {
      const diff = r.valor - serie[i - 1].valor;
      const pct = (diff / serie[i - 1].valor * 100).toFixed(2);
      cambio = `<span class="${diff >= 0 ? 'change-pos' : 'change-neg'}">${diff >= 0 ? '+' : ''}${clp(diff)} (${pct}%)</span>`;
    }
    return `<tr class=""><td>${dia(r.fecha)}</td><td>${fecha(r.fecha)}</td><td${conClaseValor ? ' class="td-val"' : ''}>${clp(r.valor)}</td><td>${cambio}</td></tr>`;
  }).join('');
}

function leerSerie(anio) {
  const ruta = path.join('data', `uf-${anio}.json`);
  if (!fs.existsSync(ruta)) return null;
  const s = (JSON.parse(fs.readFileSync(ruta, 'utf8')).serie || [])
    .filter(r => new Date(r.fecha).getUTCFullYear() === anio)
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  return s.length ? s : null;
}

/* ── Aplica una lista de [tag, id, valor, estilo?] y reporta los que faltan ── */
function aplicar(html, pagina, lista) {
  for (const [tag, id, valor, estilo] of lista) {
    const r = setInner(html, tag, id, valor, estilo);
    if (r === null) console.warn(`  ${pagina}: no se encontró <${tag} id="${id}">`); else html = r;
  }
  return html;
}

/* ── Pagina mensual ── */
function mensual(html, pagina, mesIdx, anio) {
  const todo = leerSerie(anio);
  if (!todo) return html;
  const serie = todo.filter(r => new Date(r.fecha).getUTCMonth() === mesIdx);
  if (!serie.length) return html;
  const s = stats(serie);
  const mesNombre = MESES[mesIdx];

  const ctxMapa = literal(html, /const CONTEXTOS = (\{[\s\S]*?\n  \});/, [], []);
  const ctx = (ctxMapa && ctxMapa[`${mesIdx + 1}-${anio}`])
    || literal(html, /const ctx = CONTEXTOS\[ctxKey\] \|\| (\{[\s\S]*?\n  \});/, ['mesNombre', 'año', 'mesNum'], [mesNombre, anio, mesIdx + 1]);

  const lista = [
    ['div', 's-ini', esc(clp(s.primero.valor))], ['div', 's-ini-f', dia(s.primero.fecha)],
    ['div', 's-fin', esc(clp(s.ultimo.valor))], ['div', 's-fin-f', dia(s.ultimo.fecha)],
    ['div', 's-min', esc(clp(s.min))], ['div', 's-min-f', s.minFila ? dia(s.minFila.fecha) : ''],
    ['div', 's-max', esc(clp(s.max))], ['div', 's-max-f', s.maxFila ? dia(s.maxFila.fecha) : ''],
    ['div', 's-var', s.varTxt, `color: ${s.varColor}`],
    ['div', 's-prom', esc(clp(Math.round(s.prom)))],
    ['span', 'chart-mes', `${mesNombre} ${anio}`],
    ['div', 'chart-sub', `UF diaria ${mesNombre} ${anio} — ${serie.length} valores`],
    ['span', 'tabla-label', `Tabla UF diaria — ${mesNombre} ${anio}`],
    ['tbody', 'tabla-uf', filasDiarias(serie, false)],
  ];
  if (ctx) lista.push(['h3', 'ctx-title', esc(ctx.title)], ['p', 'ctx-text', esc(ctx.text)]);
  return aplicar(html, pagina, lista);
}

/* ── Pagina anual ── */
function anual(html, pagina, anio) {
  const serie = leerSerie(anio);
  if (!serie) return html;
  const s = stats(serie);

  const ctxMapa = literal(html, /const ANIO_CONTEXTOS = (\{[\s\S]*?\n  \});/, [], []);
  const ctx = (ctxMapa && ctxMapa[anio])
    || literal(html, /const ctxAnio = ANIO_CONTEXTOS\[anio\] \|\| (\{[\s\S]*?\n  \});/, ['anio'], [anio]);

  const porMes = new Map();
  for (const r of serie) {
    const m = new Date(r.fecha).getUTCMonth() + 1;
    if (!porMes.has(m)) porMes.set(m, []);
    porMes.get(m).push(r);
  }
  const meses = [...porMes.keys()].sort((a, b) => b - a);
  const acordeon = meses.map((m, idx) => {
    const filas = porMes.get(m);
    const vals = filas.map(r => r.valor);
    const minM = Math.min(...vals), maxM = Math.max(...vals);
    const varM = ((vals[vals.length - 1] - vals[0]) / vals[0] * 100).toFixed(2);
    const actual = anio === anioActual && m === mesActual;
    return `<div class="month-section"><button class="month-header${idx === 0 ? ' open' : ''}">` +
      `<span>${MESES[m - 1]} ${anio}${actual ? '<span style="color:var(--text-3);font-size:11px;margin-left:8px;font-weight:400">(mes actual)</span>' : ''}</span>` +
      `<span class="month-meta"><span>Mín: ${esc(clp(minM))}</span><span>Máx: ${esc(clp(maxM))}</span>` +
      `<span class="${varM >= 0 ? 'change-pos' : 'change-neg'}">${varM > 0 ? '+' : ''}${varM}%</span><span>${filas.length} días</span></span></button>` +
      `<div class="month-body"><div style="overflow-x:auto"><table>` +
      `<thead><tr><th>Día</th><th>Fecha</th><th>Valor UF</th><th>Variación diaria</th></tr></thead>` +
      `<tbody>${filasDiarias(filas, true)}</tbody></table></div></div></div>`;
  }).join('');

  const lista = [
    ['div', 's-ini', esc(clp(s.primero.valor))], ['div', 's-ini-f', fecha(s.primero.fecha)],
    ['div', 's-fin', esc(clp(s.ultimo.valor))], ['div', 's-fin-f', fecha(s.ultimo.fecha)],
    ['div', 's-min', esc(clp(s.min))], ['div', 's-min-f', s.minFila ? fecha(s.minFila.fecha) : ''],
    ['div', 's-max', esc(clp(s.max))], ['div', 's-max-f', s.maxFila ? fecha(s.maxFila.fecha) : ''],
    ['div', 's-var', s.varTxt, `color: ${s.varColor}`],
    ['div', 's-prom', esc(clp(Math.round(s.prom)))],
    ['h1', 'h1-titulo', `<strong>Valor UF ${anio}</strong> — Chile`],
    ['p', 'h1-sub', `Tabla completa con todos los valores diarios de la UF en Chile durante ${anio}.`],
    ['span', 'chart-anio', anio],
    ['div', 'chart-sub', `UF diaria ${anio} — ${serie.length} valores`],
    ['span', 'tabla-label', `Tabla UF ${anio} — por mes`],
    ['div', 'meses-container', acordeon],
  ];
  if (ctx) lista.push(['h3', 'ctx-anio-title', esc(ctx.title)], ['p', 'ctx-anio-text', esc(ctx.text)]);
  return aplicar(html, pagina, lista);
}

/* ── Recorrido ── */
let tocadas = 0;
const paginas = [];
for (const d of fs.readdirSync('uf')) {
  const archivo = path.join('uf', d, 'index.html');
  if (fs.existsSync(archivo)) paginas.push([d, archivo]);
}

for (const [d, archivo] of paginas) {
  const original = fs.readFileSync(archivo, 'utf8');
  const nl = original.includes('\r\n') ? '\r\n' : '\n';
  const html = original.replace(/\r\n/g, '\n');
  let nuevo = html;
  const pagina = `uf/${d}/`;
  let m;
  if (/^\d{4}$/.test(d)) nuevo = anual(html, pagina, Number(d));
  else if ((m = d.match(/^([a-z]+)-(\d{4})$/)) && MESES.findIndex(x => x.toLowerCase() === m[1]) >= 0) {
    nuevo = mensual(html, pagina, MESES.findIndex(x => x.toLowerCase() === m[1]), Number(m[2]));
  } else continue;
  if (nuevo !== html) { fs.writeFileSync(archivo, nuevo.replace(/\n/g, nl)); tocadas++; console.log('+ ' + pagina); }
}
console.log(`prerender UF: ${tocadas} páginas actualizadas de ${paginas.length}`);
