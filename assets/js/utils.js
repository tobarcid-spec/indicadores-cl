/* =========================================
   indicadores.cl — Utilidades JS compartidas
   ========================================= */

// Proxy en el Worker de Cloudflare (respaldo si falta el dato estático), mismo dominio
const API_BASE = '/api-proxy';

/* ---- Formateo de números ---- */
const fmt = {
  clp: v => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 2 }).format(v),
  num: (v, d = 2) => new Intl.NumberFormat('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v),
  date: d => new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }),
  dateShort: d => new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }),
};

/* ---- Datos estáticos: /data/*.json, regenerados por el workflow cada pocas horas ----
   Salen del CDN (milisegundos) y evitan depender de mindicador.cl, que tarda 4-20 s. */
const DATA_BASE = '/data';

async function fetchEstatico(archivo) {
  const res = await fetch(`${DATA_BASE}/${archivo}`, { cache: 'no-cache' });
  if (!res.ok || !(res.headers.get('Content-Type') || '').includes('json')) throw new Error(`data ${res.status}`);
  return res.json();
}

/* Evita pedidos duplicados: si una página adelanta una carga, la segunda llamada
   reutiliza la misma promesa en vez de volver a pedir. */
const enVuelo = new Map();
function unaVez(key, fn) {
  if (!enVuelo.has(key)) enVuelo.set(key, fn().finally(() => enVuelo.delete(key)));
  return enVuelo.get(key);
}

const hoyChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

/* ---- Fetch con cache en localStorage (TTL 1 hora) ---- */
function fetchIndicador(tipo, fecha = '') {
  return unaVez(`ind_${tipo}_${fecha || 'hoy'}`, () => cargarIndicador(tipo, fecha));
}

async function cargarIndicador(tipo, fecha) {
  const key = `ind_${tipo}_${fecha || 'hoy'}`;

  // Prioridad 0: serie pre-inyectada por el Worker (cero latencia, render instantáneo)
  const ssrKey = fecha ? `${tipo}_${fecha}` : tipo;
  if (window.__SSR_SERIES__?.[ssrKey]) {
    const data = { serie: window.__SSR_SERIES__[ssrKey] };
    delete window.__SSR_SERIES__[ssrKey]; // consumir una sola vez
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
    return data;
  }

  // Prioridad 1: cache localStorage (1 hora)
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const { ts, data } = JSON.parse(cached);
      if (Date.now() - ts < 3600_000) return data;
    }
  } catch { localStorage.removeItem(key); }

  // Prioridad 2: archivo estático /data (CDN). Si falta o viene vacío, se sigue al proxy.
  try {
    const data = await fetchEstatico(fecha ? `${tipo}-${fecha}.json` : `${tipo}.json`);
    if (Array.isArray(data?.serie) && data.serie.length) {
      try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
      return data;
    }
  } catch { /* cae al proxy */ }

  // Prioridad 3: llamada al proxy en edge (cachea en Cloudflare)
  const url = fecha
    ? `${API_BASE}/${tipo}/${fecha}`
    : `${API_BASE}/${tipo}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
  return data;
}

/* ---- Fetch de todos los indicadores de hoy ---- */
function fetchHoy() {
  return unaVez('ind_hoy_all', cargarHoy);
}

async function cargarHoy() {
  const key = 'ind_hoy_all';

  // Prioridad 1: datos pre-inyectados por el Worker (cero latencia)
  if (window.__SSR__) {
    const data = window.__SSR__;
    window.__SSR__ = null; // consumir una sola vez
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
    return data;
  }

  // Prioridad 2: cache localStorage (30 min)
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const { ts, data } = JSON.parse(cached);
      if (Date.now() - ts < 1800_000) return data;
    }
  } catch { localStorage.removeItem(key); }

  // Prioridad 3: archivo estático /data/hoy.json. Se usa solo si trae IPC del
  // Banco Central y la UF es de hoy (hora de Chile); si no, se pide al proxy.
  try {
    const data = await fetchEstatico('hoy.json');
    if (data?.ipc_ok && data.uf?.fecha && data.uf.fecha.slice(0, 10) >= hoyChile()) {
      try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
      return data;
    }
  } catch { /* cae al proxy */ }

  // Prioridad 4: llamada al proxy en edge
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
  return data;
}

/* ---- Exportar series a CSV ----
   Separador ";" y coma decimal, con BOM UTF-8: abre directo en Excel en español. */
function descargarCSV(nombre, encabezados, filas) {
  const esc = v => {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const texto = [encabezados, ...filas].map(f => f.map(esc).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + texto], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportarSerieCSV(tipo, anio, encabezadoValor) {
  // IPC se pide completo (una sola serie); el resto, por año
  const data = await fetchIndicador(tipo, tipo === 'ipc' ? '' : String(anio));
  const serie = (data.serie || [])
    .filter(r => new Date(r.fecha).getUTCFullYear() === Number(anio))
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  if (!serie.length) throw new Error('sin datos');
  descargarCSV(`${tipo}-${anio}.csv`, ['fecha', encabezadoValor],
    serie.map(r => [r.fecha.slice(0, 10), String(r.valor).replace('.', ',')]));
}

/* Agrega un botón "Descargar CSV" al contenedor. El año sale de la pestaña activa
   (.year-tab.active) o de opts.anio si la página no tiene pestañas. */
function agregarBotonCSV(contenedorId, tipo, encabezadoValor, opts = {}) {
  const cont = document.getElementById(contenedorId);
  if (!cont) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-csv';
  btn.textContent = '⬇ Descargar CSV';
  btn.title = 'Descarga la serie del año en CSV (abre directo en Excel)';
  btn.onclick = async () => {
    const activa = cont.querySelector('.year-tab.active');
    const anio = opts.anio ?? (activa ? parseInt(activa.textContent, 10) : anioActual);
    btn.disabled = true;
    try { await exportarSerieCSV(tipo, anio, encabezadoValor); }
    catch (e) { alert('No se pudo descargar la serie. Intenta de nuevo en unos segundos.'); }
    btn.disabled = false;
  };
  cont.appendChild(btn);
}

/* ---- Mes en español ---- */
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const mesNombre = n => MESES[n - 1];
const mesSlug = n => MESES[n - 1].toLowerCase();

/* ---- Año/mes actual ---- */
const hoy = new Date();
const anioActual = hoy.getFullYear();
const mesActual = hoy.getMonth() + 1;

/* ---- Exportar para uso global ---- */
window.IC = { fmt, fetchIndicador, fetchHoy, descargarCSV, exportarSerieCSV, agregarBotonCSV, MESES, mesNombre, mesSlug, hoy, anioActual, mesActual };
