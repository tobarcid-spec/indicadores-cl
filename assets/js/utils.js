/* =========================================
   indicadores.cl — Utilidades JS compartidas
   ========================================= */

const API_BASE = 'https://mindicador.cl/api';

/* ---- Formateo de números ---- */
const fmt = {
  clp: v => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 2 }).format(v),
  num: (v, d = 2) => new Intl.NumberFormat('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v),
  date: d => new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }),
  dateShort: d => new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }),
};

/* ---- Fetch con cache en localStorage (TTL 1 hora) ---- */
async function fetchIndicador(tipo, fecha = '') {
  const key = `ind_${tipo}_${fecha || 'hoy'}`;
  const cached = localStorage.getItem(key);
  if (cached) {
    const { ts, data } = JSON.parse(cached);
    if (Date.now() - ts < 3600_000) return data; // 1 hora de cache
  }
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
async function fetchHoy() {
  const key = 'ind_hoy_all';
  const cached = localStorage.getItem(key);
  if (cached) {
    const { ts, data } = JSON.parse(cached);
    if (Date.now() - ts < 1800_000) return data; // 30 min de cache para el dashboard
  }
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json();
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
  return data;
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
window.IC = { fmt, fetchIndicador, fetchHoy, MESES, mesNombre, mesSlug, hoy, anioActual, mesActual };
