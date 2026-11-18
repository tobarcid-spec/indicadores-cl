#!/usr/bin/env node
/**
 * prerender-resumenes.mjs — escribe en HTML estatico dos secciones con datos propios:
 *   /dolar/  → #dolar-resumen : variaciones, minimos y maximos, comparacion con hace un
 *              año, ultimos 10 valores y resumen mes a mes del año.
 *   /utm/    → #utm-resumen   : UTM del mes y del mes siguiente (el SII la publica antes),
 *              UTA, variacion anual y equivalencias en pesos.
 * Todo sale de /data/*.json, asi Google lo ve sin ejecutar JavaScript.
 *
 * Uso: node scripts/prerender-resumenes.mjs   (idempotente; solo escribe si hay cambios)
 */
import fs from 'node:fs';
import path from 'node:path';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const clpFmt = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 2 });
const entFmt = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
const clp = v => clpFmt.format(v);
const clp2 = v => '$' + new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const con = (d, f) => `${d >= 0 ? '+' : '−'}${f(Math.abs(d))}`;
const peso = v => '$' + entFmt.format(Math.round(v));
const pct = (v, d = 1) => {
  const txt = Math.abs(v).toFixed(d).replace('.', ',');
  return `${Number(txt.replace(',', '.')) === 0 ? '' : v > 0 ? '+' : '−'}${txt}%`;
};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
const dUTC = iso => new Date(iso + 'T00:00:00Z');
const isoDe = d => d.toISOString().slice(0, 10);
const larga = iso => { const d = dUTC(iso); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`; };
const corta = iso => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
const restarDias = (iso, n) => { const d = dUTC(iso); d.setUTCDate(d.getUTCDate() - n); return isoDe(d); };
const restarAnio = iso => { const d = dUTC(iso); d.setUTCFullYear(d.getUTCFullYear() - 1); return isoDe(d); };

const P = 'font-size:14px;color:var(--text-2);line-height:1.7;margin-bottom:16px';
const H2 = 'font-size:18px;font-weight:600;color:var(--text);margin:8px 0 12px';
const H3 = 'font-size:15px;font-weight:600;color:var(--text);margin:0 0 8px';
const NOTA = 'font-size:12px;color:var(--text-3);margin:8px 0 28px;font-family:var(--font-mono)';

/* ── HTML: reemplazo del contenido de <tag id="id">…</tag> (igual que prerender-uf.mjs) ── */
function cierre(html, desde, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>|</${tag}>`, 'g');
  re.lastIndex = desde;
  let prof = 1, m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('</')) { if (--prof === 0) return m.index; } else prof++;
  }
  return -1;
}
function setInner(html, tag, id, valor) {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?\\bid="${id}"[^>]*>`).exec(html);
  if (!m) return null;
  const fin = cierre(html, m.index + m[0].length, tag);
  if (fin < 0) return null;
  return html.slice(0, m.index + m[0].length) + valor + html.slice(fin);
}

/* ── Datos ── */
function serie(prefijo, anios) {
  const mapa = new Map();
  for (const a of anios) {
    const ruta = path.join('data', `${prefijo}-${a}.json`);
    if (!fs.existsSync(ruta)) continue;
    for (const r of JSON.parse(fs.readFileSync(ruta, 'utf8')).serie || []) {
      if (typeof r.valor === 'number') mapa.set(r.fecha.slice(0, 10), r.valor);
    }
  }
  return [...mapa].sort(([a], [b]) => (a < b ? -1 : 1));   // [[iso, valor], …] ascendente
}
const hasta = (s, iso) => { let r = null; for (const x of s) { if (x[0] <= iso) r = x; else break; } return r; };

const tabla = (cabeceras, filas) =>
  `<div class="ed-table-wrap"><table><thead><tr>${cabeceras.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${filas.join('')}</tbody></table></div>`;
const fila = celdas => `<tr>${celdas.map(c => `<td>${c}</td>`).join('')}</tr>`;
const chip = (t, v, sub) => `<div class="stat-chip"><div class="stat-chip-label">${t}</div><div class="stat-chip-val">${v}</div>` +
  `<div style="font-size:11px;color:var(--text-3);margin-top:4px">${sub}</div></div>`;
const cls = v => (v >= 0 ? 'change-pos' : 'change-neg');

/* ── /dolar/ ── */
function dolar() {
  const hoy = hoyChile(), anio = Number(hoy.slice(0, 4));
  const s = serie('dolar', [anio - 1, anio]);
  const i = s.findIndex(x => x[0] === hasta(s, hoy)?.[0]);
  if (i < 1) return null;
  const [fU, vU] = s[i], [fP, vP] = s[i - 1];
  const dif = vU - vP, difPct = dif / vP * 100;

  const ref = n => hasta(s, restarDias(fU, n));
  const h7 = ref(7), h30 = ref(30), hAnio = hasta(s, restarAnio(fU));
  const ult30 = s.filter(x => x[0] > restarDias(fU, 30) && x[0] <= fU);
  const min30 = ult30.reduce((a, b) => (b[1] < a[1] ? b : a)), max30 = ult30.reduce((a, b) => (b[1] > a[1] ? b : a));
  const delAnio = s.filter(x => x[0].startsWith(String(anio)) && x[0] <= fU);
  const ini = delAnio[0];
  const delMes = delAnio.filter(x => x[0].slice(0, 7) === fU.slice(0, 7));
  const promMes = delMes.reduce((a, x) => a + x[1], 0) / delMes.length;
  const mesNom = MESES[dUTC(fU).getUTCMonth()];

  let h = `<h2 id="dolar-resumen-h" style="${H2}">Dólar de la semana y del mes: resumen con los valores publicados</h2>`;
  h += `<p style="${P}">El dólar observado cerró en <strong>${clp2(vU)}</strong> el ${larga(fU)}, ` +
    `<strong>${clp2(Math.abs(dif))} ${dif >= 0 ? 'más' : 'menos'}</strong> que el día hábil anterior (${clp2(vP)}; ${pct(difPct, 2)}). ` +
    `En los últimos 30 días se movió entre <strong>${clp2(min30[1])}</strong> (${larga(min30[0])}) y <strong>${clp2(max30[1])}</strong> (${larga(max30[0])}). ` +
    `El promedio de ${mesNom} va en ${clp2(promMes)}` +
    (hAnio ? ` y hace un año, el ${corta(hAnio[0])}, valía ${clp2(hAnio[1])}: hoy está ${pct(Math.abs(vU / hAnio[1] - 1) * 100, 1).replace('+', '')} ${vU >= hAnio[1] ? 'más alto' : 'más bajo'}.` : '.') + `</p>`;

  const chips = [chip('Dólar observado', clp2(vU), larga(fU))];
  if (h7) chips.push(chip('Vs. 7 días atrás', pct((vU / h7[1] - 1) * 100, 2), clp2(h7[1])));
  if (h30) chips.push(chip('Vs. 30 días atrás', pct((vU / h30[1] - 1) * 100, 2), clp2(h30[1])));
  if (ini) chips.push(chip(`En lo que va de ${anio}`, pct((vU / ini[1] - 1) * 100, 1), `desde ${clp2(ini[1])}`));
  h += `<div class="stats-row" style="margin-bottom:24px">${chips.join('')}</div>`;

  if (hAnio) {
    const dif1000 = (vU - hAnio[1]) * 1000;
    h += `<p style="${P}">En la práctica: comprar US$1.000 hoy cuesta <strong>${peso(vU * 1000)}</strong>; ` +
      `hace un año costaba ${peso(hAnio[1] * 1000)}, es decir <strong>${peso(Math.abs(dif1000))} ${dif1000 >= 0 ? 'más' : 'menos'}</strong>.</p>`;
  }

  // Ultimos 10 valores
  const ult10 = s.slice(Math.max(1, i - 9), i + 1).reverse();
  h += `<h3 style="${H3}">Últimos 10 valores del dólar observado</h3>`;
  h += tabla(['Fecha', 'Dólar observado', 'Variación'], ult10.map(([f, v]) => {
    const prev = s[s.findIndex(x => x[0] === f) - 1];
    const d = v - prev[1];
    return fila([larga(f), `<span class="td-val">${clp2(v)}</span>`, `<span class="${cls(d)}">${con(d, clp2)} (${pct(d / prev[1] * 100, 2)})</span>`]);
  }));
  h += `<p style="${NOTA}">El Banco Central publica el dólar observado solo en días hábiles. Actualizado: ${corta(fU)}.</p>`;

  // Mes a mes
  const meses = [...new Set(delAnio.map(x => x[0].slice(5, 7)))];
  h += `<h3 style="${H3}">Dólar mes a mes en ${anio}</h3>`;
  h += tabla(['Mes', 'Promedio', 'Mínimo', 'Máximo', 'Último valor'], meses.map(m => {
    const v = delAnio.filter(x => x[0].slice(5, 7) === m).map(x => x[1]);
    return fila([`${MESES[Number(m) - 1]} ${anio}`, clp2(v.reduce((a, b) => a + b, 0) / v.length), clp2(Math.min(...v)), clp2(Math.max(...v)), clp2(v[v.length - 1])]);
  }));
  h += `<p style="${NOTA}">Valores del dólar observado (Banco Central de Chile). ${mesNom[0].toUpperCase() + mesNom.slice(1)} incluye solo los días transcurridos.</p>`;
  return h;
}

/* ── /utm/ ── */
function utm() {
  const hoy = hoyChile(), anio = Number(hoy.slice(0, 4));
  const s = serie('utm', [anio - 1, anio, anio + 1]);
  const actual = hasta(s, hoy);
  if (!actual) return null;
  const mesAct = actual[0].slice(0, 7);
  const sig = s.find(x => x[0] > actual[0]);
  const nombre = f => `${MESES[dUTC(f).getUTCMonth()]} ${f.slice(0, 4)}`;
  const hAnio = s.find(x => x[0].slice(0, 7) === `${Number(mesAct.slice(0, 4)) - 1}-${mesAct.slice(5, 7)}`);
  const ene = s.find(x => x[0] === `${mesAct.slice(0, 4)}-01-01`);
  const vAct = actual[1];

  let h = `<h2 id="utm-resumen-h" style="${H2}">UTM de ${sig ? nombre(sig[0]) + ' ya publicada' : nombre(actual[0])} y equivalencias en pesos</h2>`;
  h += `<p style="${P}">La UTM de <strong>${nombre(actual[0])}</strong> vale <strong>${peso(vAct)}</strong> y su UTA (12 UTM) es <strong>${peso(vAct * 12)}</strong>.`;
  if (sig) h += ` El SII ya publicó la de <strong>${nombre(sig[0])}</strong>: <strong>${peso(sig[1])}</strong> (${pct((sig[1] / vAct - 1) * 100, 2)}), con una UTA de ${peso(sig[1] * 12)}.`;
  if (hAnio) h += ` Frente a ${nombre(hAnio[0])} (${peso(hAnio[1])}), la UTM ${vAct >= hAnio[1] ? 'subió' : 'bajó'} ${pct(Math.abs(vAct / hAnio[1] - 1) * 100, 1).replace('+', '')} en 12 meses.`;
  if (ene && ene[0] !== actual[0]) h += ` En lo que va del año acumula ${pct((vAct / ene[1] - 1) * 100, 1)} desde enero (${peso(ene[1])}).`;
  h += `</p>`;

  const chips = [chip(`UTM ${nombre(actual[0])}`, peso(vAct), 'mes actual')];
  if (sig) chips.push(chip(`UTM ${nombre(sig[0])}`, peso(sig[1]), 'ya publicada'));
  chips.push(chip('UTA del mes', peso(vAct * 12), '12 × UTM'));
  h += `<div class="stats-row" style="margin-bottom:24px">${chips.join('')}</div>`;

  const montos = [1, 2, 5, 10, 20, 50, 100];
  const cab = ['UTM', nombre(actual[0])].concat(sig ? [nombre(sig[0]), 'Diferencia'] : []);
  h += `<h3 style="${H3}">Cuántos pesos son 1, 5, 10 o 50 UTM</h3>`;
  h += tabla(cab, montos.map(n => fila([`${n} UTM`, peso(n * vAct)].concat(sig
    ? [peso(n * sig[1]), `<span class="change-pos">+${peso(n * (sig[1] - vAct))}</span>`] : []))));
  h += `<p style="${NOTA}">Valores de la UTM publicados por el SII. Las multas y los impuestos en UTM se pagan con la UTM del mes de pago. Actualizado: ${corta(hoy)}.</p>`;
  return h;
}

/* ── Aplicacion ── */
let tocadas = 0;
for (const [archivo, id, generar] of [['dolar/index.html', 'dolar-resumen', dolar], ['utm/index.html', 'utm-resumen', utm]]) {
  if (!fs.existsSync(archivo)) continue;
  const original = fs.readFileSync(archivo, 'utf8');
  const nl = original.includes('\r\n') ? '\r\n' : '\n';
  const html = original.replace(/\r\n/g, '\n');
  const contenido = generar();
  if (contenido === null) { console.warn(`  ${archivo}: sin datos suficientes, no se toca`); continue; }
  const nuevo = setInner(html, 'section', id, contenido);
  if (nuevo === null) { console.warn(`  ${archivo}: no se encontró <section id="${id}">`); continue; }
  if (nuevo !== html) { fs.writeFileSync(archivo, nuevo.replace(/\n/g, nl)); tocadas++; console.log('+ ' + archivo); }
}
console.log(`prerender resúmenes: ${tocadas} páginas actualizadas`);
