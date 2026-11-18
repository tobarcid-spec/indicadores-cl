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

/* ── /uf/: valores de la UF ya publicados para los proximos dias ──
 * El Banco Central publica la UF con semanas de anticipacion (hasta el dia 9 del mes
 * siguiente). Con eso se arma, en HTML estatico, lo que otros portales no muestran:
 * la UF de manana y de fin de mes, el efecto en pesos segun el dia de pago y una
 * simulacion de la UF del proximo periodo segun el IPC. */
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
const isoUTC = iso => new Date(iso + 'T00:00:00Z');
const larga = iso => { const d = isoUTC(iso); return `${DIAS_SEMANA[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()].toLowerCase()}`; };
const corta = iso => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
const pct = (v, dec) => `${v > 0 ? '+' : ''}${v.toFixed(dec).replace('.', ',')}%`;
const num = v => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(v);

function serieUF() {
  const mapa = new Map();
  const anio = Number(hoyChile().slice(0, 4));
  for (const f of [`uf-${anio}.json`, `uf-${anio + 1}.json`, 'uf.json']) {
    const ruta = path.join('data', f);
    if (!fs.existsSync(ruta)) continue;
    for (const r of JSON.parse(fs.readFileSync(ruta, 'utf8')).serie || []) {
      if (typeof r.valor === 'number') mapa.set(r.fecha.slice(0, 10), r.valor);
    }
  }
  return [...mapa].sort(([a], [b]) => (a < b ? -1 : 1));
}

function proximos(html) {
  const hoy = hoyChile();
  const s = serieUF();
  const iHoy = s.findIndex(([f]) => f === hoy);
  if (iHoy < 0) return html;                     // sin valor de hoy: no se toca la seccion
  const futuros = s.slice(iHoy + 1);
  if (futuros.length < 3) return html;           // casi nunca pasa: la UF se publica con semanas de anticipo
  const vHoy = s[iHoy][1];
  const [fUlt, vUlt] = futuros[futuros.length - 1];
  const [fMan, vMan] = futuros[0];
  const delMes = futuros.filter(([f]) => f.slice(0, 7) === hoy.slice(0, 7));
  const finMes = delMes.length ? delMes[delMes.length - 1] : null;
  const diario = (vUlt - vHoy) / futuros.length;
  const diarioPct = diario / vHoy * 100;
  const mesesNom = i => MESES[(i + 12) % 12].toLowerCase();
  const mUlt = isoUTC(fUlt).getUTCMonth();
  const esDia9 = fUlt.slice(8, 10) === '09';

  // IPC que se esta aplicando: variacion del dia 9 anterior al ultimo dia 9 publicado
  let ipcAplicado = null;
  if (esDia9) {
    const d = isoUTC(fUlt); d.setUTCMonth(d.getUTCMonth() - 1);
    const previo = s.find(([f]) => f === d.toISOString().slice(0, 10));
    if (previo) ipcAplicado = (vUlt / previo[1] - 1) * 100;
  }

  const chip = (t, v, sub) => `<div class="stat-chip"><div class="stat-chip-label">${t}</div><div class="stat-chip-val">${esc(clp(v))}</div>` +
    `<div style="font-size:11px;color:var(--text-3);margin-top:4px">${sub}</div></div>`;
  const chips = [chip('UF mañana', vMan, larga(fMan))];
  if (finMes && finMes[0] !== fMan) chips.push(chip('UF a fin de mes', finMes[1], larga(finMes[0])));
  chips.push(chip(`UF al ${isoUTC(fUlt).getUTCDate()} de ${mesesNom(mUlt)}`, vUlt, 'último valor publicado'));

  const p = 'font-size:14px;color:var(--text-2);line-height:1.7;margin-bottom:16px';
  let h = `<h2 id="uf-proximos-h" style="font-size:18px;font-weight:600;color:var(--text);margin:8px 0 12px">UF de mañana y de fin de mes: valores ya publicados</h2>`;
  h += `<p style="${p}">El Banco Central ya fijó la UF hasta el <strong>${larga(fUlt)} de ${fUlt.slice(0, 4)}</strong>. ` +
    `Hoy (${larga(hoy)}) vale <strong>${esc(clp(vHoy))}</strong> y mañana valdrá <strong>${esc(clp(vMan))}</strong>. ` +
    `En promedio sube <strong>${esc(clp(diario))}</strong> por día (${esc(pct(diarioPct, 4))} diario)` +
    (ipcAplicado !== null ? `, porque el IPC de ${mesesNom(mUlt - 2)} (${esc(pct(ipcAplicado, 1))}) se reparte en partes iguales entre los días del 10 de ${mesesNom(mUlt - 1)} al 9 de ${mesesNom(mUlt)}.` : '.') + `</p>`;
  h += `<div class="stats-row" style="margin-bottom:24px">${chips.join('')}</div>`;

  // Tabla de los dias que faltan
  const filas = futuros.map(([f, v], i) => {
    const dif = v - vHoy;
    return `<tr><td>${larga(f)}</td><td class="td-val">${esc(clp(v))}</td><td><span class="change-pos">+${esc(clp(dif))}</span></td></tr>`;
  }).join('');
  h += `<div class="ed-table-wrap"><table><thead><tr><th>Fecha</th><th>Valor UF</th><th>Diferencia con hoy</th></tr></thead><tbody>${filas}</tbody></table></div>`;
  h += `<p style="font-size:12px;color:var(--text-3);margin:8px 0 28px;font-family:var(--font-mono)">Valores publicados por el Banco Central de Chile. Actualizado: ${corta(hoy)}.</p>`;

  // Cuanto cambia el monto en pesos segun el dia de pago
  const cols = [['Hoy', vHoy, larga(hoy)]];
  if (finMes && finMes[0] !== fMan) cols.push(['Fin de mes', finMes[1], larga(finMes[0])]);
  cols.push([`Al ${isoUTC(fUlt).getUTCDate()} de ${mesesNom(mUlt)}`, vUlt, larga(fUlt)]);
  const montos = [[20, 'Arriendo de 20 UF'], [50, 'Dividendo de 50 UF'], [3000, 'Saldo de 3.000 UF']];
  h += `<h3 style="font-size:15px;font-weight:600;color:var(--text);margin:0 0 8px">¿Cuánto cambia el monto en pesos según el día en que pagas?</h3>`;
  h += `<p style="${p}">Una deuda o un arriendo en UF cuesta más pesos cada día. Esta tabla usa los valores ya publicados:</p>`;
  h += `<div class="ed-table-wrap"><table><thead><tr><th>Monto</th>${cols.map(c => `<th>${esc(c[0])}</th>`).join('')}<th>Diferencia</th></tr></thead><tbody>` +
    montos.map(([uf, nom]) => `<tr><td>${nom}</td>${cols.map(c => `<td>$${num(uf * c[1])}</td>`).join('')}` +
      `<td><span class="change-pos">+$${num(uf * (vUlt - vHoy))}</span></td></tr>`).join('') +
    `</tbody></table></div>`;
  h += `<p style="font-size:12px;color:var(--text-3);margin:8px 0 28px;font-family:var(--font-mono)">Diferencia entre hoy y el ${larga(fUlt)}. Montos de ejemplo.</p>`;

  // Simulacion del proximo periodo segun el IPC
  if (esDia9) {
    const sig = isoUTC(fUlt); sig.setUTCMonth(sig.getUTCMonth() + 1);
    const dias = Math.round((sig - isoUTC(fUlt)) / 86400000);
    const filasIpc = [0.2, 0.4, 0.6, 0.8].map(i => {
      const v9 = vUlt * (1 + i / 100);
      return `<tr><td>${esc(pct(i, 1))}</td><td>${esc(clp(vUlt * i / 100 / dias))}</td><td class="td-val">${esc(clp(v9))}</td></tr>`;
    }).join('');
    h += `<h3 style="font-size:15px;font-weight:600;color:var(--text);margin:0 0 8px">Cómo podría estar la UF el ${larga(sig.toISOString().slice(0, 10))} según el IPC de ${mesesNom(mUlt - 1)}</h3>`;
    h += `<p style="${p}">La UF del 9 de cada mes es la del 9 anterior más el IPC del mes que acaba de cerrar, repartido día a día. ` +
      `El INE publica ese IPC alrededor del día 8. Mientras tanto, esta simulación muestra el rango habitual (no es un pronóstico oficial):</p>`;
    h += `<div class="ed-table-wrap"><table><thead><tr><th>Si el IPC de ${mesesNom(mUlt - 1)} es</th><th>La UF sube por día</th><th>UF el ${sig.getUTCDate()} de ${mesesNom(mUlt + 1)}</th></tr></thead><tbody>${filasIpc}</tbody></table></div>`;
    h += `<p style="font-size:12px;color:var(--text-3);margin:8px 0 36px;font-family:var(--font-mono)">Cálculo: UF del ${larga(fUlt)} (${esc(clp(vUlt))}) × (1 + IPC). Simulación ilustrativa.</p>`;
  }

  const r = setInner(html, 'section', 'uf-proximos', h);
  if (r === null) console.warn('  uf/: no se encontró <section id="uf-proximos">');
  return r === null ? html : r;
}

/* ── Recorrido ── */
{
  const archivo = path.join('uf', 'index.html');
  if (fs.existsSync(archivo)) {
    const original = fs.readFileSync(archivo, 'utf8');
    const nl = original.includes('\r\n') ? '\r\n' : '\n';
    const html = original.replace(/\r\n/g, '\n');
    const nuevo = proximos(html);
    if (nuevo !== html) { fs.writeFileSync(archivo, nuevo.replace(/\n/g, nl)); console.log('+ uf/ (próximos días)'); }
  }
}
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
