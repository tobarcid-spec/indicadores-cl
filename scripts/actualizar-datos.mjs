#!/usr/bin/env node
/**
 * actualizar-datos.mjs — descarga los indicadores y los guarda como JSON
 * estatico en /data, para que el sitio no dependa de mindicador.cl (lento y
 * variable: 4-20 s) al momento de la visita.
 *
 * Uso: node scripts/actualizar-datos.mjs        (Node 18+, sin dependencias)
 *
 * Genera, con la misma forma que devuelve la API:
 *   data/hoy.json            -> todos los indicadores de hoy (/api)
 *   data/{uf,dolar,utm}.json -> ultimos dias de cada indicador (/api/{ind})
 *   data/{ind}-{anio}.json   -> serie anual (START_YEAR hasta el anio actual)
 *   data/ipc.json            -> serie IPC desde 2020 (Banco Central)
 *
 * - Los anios cerrados no se vuelven a pedir si el archivo ya existe.
 * - Si una descarga falla, se conserva el archivo anterior (no se pisa).
 * - Solo se escribe un archivo si su contenido cambio (evita commits vacios).
 * - IPC: mindicador.cl dejo de actualizarlo; se toma del Banco Central con
 *   BCENTRAL_API_USER / BCENTRAL_API_PASS / BCENTRAL_IPC_SERIES. Sin esas
 *   credenciales no se escribe hoy.json y el sitio sigue usando el proxy.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const DIR = 'data';
const START_YEAR = 2024;
const INDICADORES = ['uf', 'dolar', 'utm'];
const IPC_MIN_YEAR = 2020;
const API = 'https://mindicador.cl/api';
// Respaldo: el Worker del propio sitio llega bien a mindicador desde Cloudflare, mientras que
// desde los servidores de GitHub falla seguido (timeouts, fetch failed, HTTP 500).
const API_RESPALDO = 'https://indicadoreschile.cl/api-proxy';

const anioActual = new Date().getFullYear();
let ok = 0;
let fallos = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url, intentos = 2, timeoutMs = 45_000) {
  for (let i = 1; i <= intentos; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`  intento ${i}/${intentos} fallo para ${url}: ${e.message}`);
      if (i < intentos) await sleep(3000 * i);
    }
  }
  return null;
}

// Pide a mindicador.cl; si no responde, al respaldo del sitio. ruta: '' | 'uf' | 'uf/2026'
// Corte: tras 2 fallos seguidos de una fuente se deja de insistir con ella en esta corrida,
// para no esperar minutos en cada archivo cuando mindicador.cl esta caido.
let fallosDirectos = 0;
let fallosRespaldo = 0;
async function getApi(ruta) {
  if (fallosDirectos < 2) {
    const directo = await getJson(ruta ? `${API}/${ruta}` : API);
    if (directo) { fallosDirectos = 0; return directo; }
    fallosDirectos++;
  }
  if (fallosRespaldo >= 2) return null;
  console.warn('  mindicador.cl no responde: se usa el respaldo del sitio (/api-proxy)');
  const respaldo = await getJson(ruta ? `${API_RESPALDO}/${ruta}` : API_RESPALDO, 1, 60_000);
  if (respaldo) { fallosRespaldo = 0; return respaldo; }
  fallosRespaldo++;
  return null;
}

const fechaMax = serie => serie.reduce((m, r) => (r.fecha > m ? r.fecha : m), '');

async function leer(nombre) {
  try { return JSON.parse(await fs.readFile(path.join(DIR, nombre), 'utf8')); }
  catch { return null; }
}

async function escribir(nombre, data) {
  const contenido = JSON.stringify(data);
  const ruta = path.join(DIR, nombre);
  let actual = null;
  try { actual = await fs.readFile(ruta, 'utf8'); } catch { /* no existe */ }
  if (actual === contenido) { console.log(`= ${nombre} sin cambios`); return; }
  await fs.writeFile(ruta, contenido);
  console.log(`+ ${nombre} actualizado`);
}

const serieValida = d => Array.isArray(d?.serie) && d.serie.length > 0;

// Escribe una serie solo si no es mas vieja que la guardada (el respaldo puede venir de una cache).
async function escribirSerie(nombre, data) {
  const previo = await leer(nombre);
  if (serieValida(previo) && fechaMax(data.serie) < fechaMax(previo.serie)) {
    console.warn(`  ${nombre}: el dato nuevo es mas viejo que el guardado; se conserva el actual`);
    return false;
  }
  await escribir(nombre, data);
  return true;
}

// ── IPC desde la API BDE del Banco Central (misma logica que worker.js) ──────
async function ipcBancoCentral() {
  const { BCENTRAL_API_USER: user, BCENTRAL_API_PASS: pass, BCENTRAL_IPC_SERIES: series } = process.env;
  if (!user || !pass || !series) {
    console.warn('  IPC: faltan credenciales del Banco Central; se omite');
    return null;
  }
  const params = new URLSearchParams({ user, pass, function: 'GetSeries', timeseries: series });
  try {
    const res = await fetch(`https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx?${params}`,
      { signal: AbortSignal.timeout(90_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    let texto;
    try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch { texto = new TextDecoder('iso-8859-1').decode(buf); }
    const data = JSON.parse(texto);
    if (data?.Codigo !== 0) throw new Error(`${data?.Codigo} ${data?.Descripcion}`);

    const serie = [];
    for (const o of data?.Series?.Obs || []) {
      if (o.statusCode !== 'OK') continue;
      const [d, m, y] = o.indexDateString.split('-');
      if (parseInt(y, 10) < IPC_MIN_YEAR) continue;
      serie.push({ valor: parseFloat(o.value), fecha: `${y}-${m}-${d}T03:00:00.000Z` });
    }
    serie.sort((a, b) => a.fecha.localeCompare(b.fecha));
    return serie.length ? serie : null;
  } catch (e) {
    console.warn(`  IPC: fallo la consulta al Banco Central: ${e.message}`);
    return null;
  }
}

async function main() {
  await fs.mkdir(DIR, { recursive: true });

  // IPC primero: hoy.json depende de el
  console.log('IPC (Banco Central)');
  const ipcSerie = await ipcBancoCentral();
  if (ipcSerie) { await escribir('ipc.json', { serie: ipcSerie }); ok++; } else fallos++;

  // Todos los indicadores de hoy
  console.log('hoy');
  let hoy = await getApi('');
  const hoyPrevio = await leer('hoy.json');
  if (hoy && hoyPrevio?.uf?.fecha && hoy.uf?.fecha && hoy.uf.fecha < hoyPrevio.uf.fecha) {
    console.warn('  el hoy recibido es mas viejo que el guardado; se conserva el guardado');
    hoy = null;
  }
  if (!hoy) {
    // mindicador.cl no respondio: se parte del hoy.json anterior, para que al menos el
    // IPC (que viene del Banco Central) no quede desactualizado.
    hoy = hoyPrevio;
    if (hoy) console.warn('  mindicador no respondio: se conserva hoy.json y solo se actualiza el IPC');
  }
  if (hoy) {
    // mindicador.cl dejo de actualizar el IPC: se reemplaza por el del Banco Central.
    // Sin IPC fresco no se publica hoy.json (el cliente cae al proxy).
    const ipc = ipcSerie ?? (await leer('ipc.json'))?.serie;
    if (ipc?.length) {
      hoy.ipc = ipc[ipc.length - 1];
      hoy.ipc_ok = true;
      await escribir('hoy.json', hoy);
      ok++;
    } else {
      console.warn('  hoy.json no se escribe: no hay IPC del Banco Central');
      fallos++;
    }
  } else fallos++;

  // Ultimos dias y series anuales
  for (const ind of INDICADORES) {
    console.log(ind);
    const reciente = await getApi(ind);
    if (serieValida(reciente)) { if (await escribirSerie(`${ind}.json`, reciente)) ok++; } else fallos++;

    for (let y = START_YEAR; y <= anioActual; y++) {
      const nombre = `${ind}-${y}.json`;
      if (y < anioActual && serieValida(await leer(nombre))) continue; // anio cerrado ya guardado
      const data = await getApi(`${ind}/${y}`);
      if (serieValida(data)) { if (await escribirSerie(nombre, data)) ok++; } else fallos++;
    }
  }

  console.log(`\nListo: ${ok} correctos, ${fallos} con error`);
  // Falla solo si no se pudo actualizar nada; los errores parciales conservan lo anterior.
  if (ok === 0) process.exitCode = 1;
}

main();
