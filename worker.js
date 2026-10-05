/**
 * Cloudflare Worker — indicadoreschile.cl
 *
 * 1. /api-proxy/*  → proxy con cache en edge a mindicador.cl (dato viejo se
 *                    sirve al instante y se refresca en segundo plano)
 *    (excepto /api-proxy/ipc*, que se sirve desde el Banco Central)
 * 2. Páginas HTML  → sirve asset estático + inyecta window.__SSR__ con
 *                    valores del día para render instantáneo sin API call
 * 3. Todo lo demás → assets estáticos sin modificar
 *
 * Nota: el secret BCENTRAL_IPC_SERIES se renombro (antes IPC_SERIE); este
 * comentario existe solo para forzar un redeploy y que el Worker lo tome.
 */

const CACHE_TTL = 1800;                 // 30 min: un dato mas viejo se considera "viejo" y se refresca en segundo plano
const STALE_MAX = 86400;                // 24 h: cuanto se conserva un dato viejo para poder servirlo al instante
const PAST_YEAR_TTL = 43200;            // 12 h: los anios cerrados casi no cambian
const PAST_YEAR_STALE_MAX = 2592000;    // 30 dias
const ORIGIN_TIMEOUT = 20000;           // mindicador.cl llega a tardar 20 s: no esperar mas que eso
const MIN_YEAR = 2020;  // recorte del historial de IPC cuando se pide la serie completa

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ── Redirect www → sin www (301 permanente) ─────────────────────────
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }

    // ── Proxy de API con cache en edge ──────────────────────────────────
    if (url.pathname.startsWith('/api-proxy')) {
      return proxyApi(url, env, ctx);
    }

    // ── Assets estáticos ────────────────────────────────────────────────
    const assetRes = await env.ASSETS.fetch(request);

    // Solo modificar respuestas HTML
    if (!assetRes.headers.get('Content-Type')?.includes('text/html')) {
      return assetRes;
    }

    // ── SSR: inyectar datos de hoy + serie relevante en el HTML ────────
    const year = new Date().getFullYear();
    const path = url.pathname;

    // Determinar qué serie pre-cargar según la URL
    let serieKey  = null;
    let serieType = null;
    if (path === '/' || path === '/index.html') {
      serieKey = 'uf';          // dashboard usa fetchIndicador('uf') sin año
      serieType = 'uf';
    } else if (path.startsWith('/uf/')) {
      serieKey  = `uf_${year}`; // UF page y mensuales usan fetchIndicador('uf', año)
      serieType = 'uf';
    } else if (path.startsWith('/dolar/')) {
      serieKey  = `dolar_${year}`;
      serieType = 'dolar';
    } else if (path.startsWith('/ipc/')) {
      serieKey  = 'ipc';        // pagina IPC usa fetchIndicador('ipc') sin año
      serieType = 'ipc';
    }

    const [html, hoy, serie] = await Promise.all([
      assetRes.text(),
      fetchHoy(env, ctx),
      serieType ? fetchSerie(serieType, year, env, ctx) : Promise.resolve(null),
    ]);

    let script = '';
    if (hoy)               script += `window.__SSR__=${JSON.stringify(hoy)};`;
    if (serie && serieKey) script += `window.__SSR_SERIES__={"${serieKey}":${JSON.stringify(serie)}};`;

    const inyectado = script
      ? html.replace('</head>', `<script>${script}</script></head>`)
      : html;

    return new Response(inyectado, {
      status: assetRes.status,
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
        'X-SSR': hoy ? (serie ? 'injected+serie' : 'injected') : 'fallback',
      },
    });
  },
};

// ── Cache en edge con "stale-while-revalidate" ───────────────────────────
// mindicador.cl es lento y variable (4-20 s). Si hay un dato guardado, se
// responde al instante aunque este viejo y se refresca en segundo plano; el
// visitante solo espera cuando no hay nada guardado.
function ttlsPara(apiPath) {
  const m = apiPath.match(/^\/(?:uf|dolar|utm|euro)\/(\d{4})$/);
  if (m && Number(m[1]) < new Date().getFullYear()) {
    return { soft: PAST_YEAR_TTL, hard: PAST_YEAR_STALE_MAX };
  }
  return { soft: CACHE_TTL, hard: STALE_MAX };
}

async function traerYGuardar(apiUrl, hard) {
  const res = await fetch(apiUrl, { signal: AbortSignal.timeout(ORIGIN_TIMEOUT) });
  if (!res.ok) return { res };
  const body = await res.text();
  await caches.default.put(new Request(apiUrl), new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Cache-Control': `public, max-age=${hard}`,
      'X-Cached-At': String(Date.now()),
    },
  }));
  return { body };
}

// Devuelve { body, state } | { res } (respuesta de error del origen) | { unavailable: true }
async function cachedFetch(apiUrl, ctx, { soft, hard }) {
  const cached = await caches.default.match(new Request(apiUrl));
  if (cached) {
    const body = await cached.text();
    const edad = (Date.now() - Number(cached.headers.get('X-Cached-At') || 0)) / 1000;
    if (edad > soft) {
      const refresco = traerYGuardar(apiUrl, hard).catch(() => {});
      if (ctx) ctx.waitUntil(refresco);
      return { body, state: 'STALE' };
    }
    return { body, state: 'HIT' };
  }
  try {
    const r = await traerYGuardar(apiUrl, hard);
    return r.res ? { res: r.res } : { body: r.body, state: 'MISS' };
  } catch {
    return { unavailable: true };
  }
}

// ── Proxy a mindicador.cl con cache en edge ──────────────────────────────
async function proxyApi(url, env, ctx) {
  const apiPath = url.pathname.replace('/api-proxy', '') || '/';

  // IPC: mindicador.cl dejo de actualizar esta serie (quedo fija en dic-2025).
  // Se sirve desde el Banco Central, con la misma forma {serie:[...]} para
  // que el cliente no necesite cambios. Si no hay credenciales configuradas
  // o la consulta falla, se sigue de largo y se usa mindicador.cl como antes.
  if (apiPath === '/ipc' || apiPath.startsWith('/ipc/')) {
    const anio = apiPath.startsWith('/ipc/') ? parseInt(apiPath.slice(5), 10) : null;
    const serie = await fetchBcentralIpcSerie(env, anio);
    if (serie !== null) {
      return new Response(JSON.stringify({ serie }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Cache-Control': `public, max-age=${CACHE_TTL}`,
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }

  const ttls = ttlsPara(apiPath);
  const r = await cachedFetch(`https://mindicador.cl/api${apiPath}${url.search}`, ctx, ttls);
  if (r.res) return r.res;
  if (r.unavailable) {
    return new Response(JSON.stringify({ error: 'API no disponible' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
  let body = r.body;

  // Endpoint base ("hoy", todos los indicadores): el campo ipc que trae
  // mindicador.cl esta desactualizado, se reemplaza con Banco Central.
  if (apiPath === '/') {
    try {
      const data = JSON.parse(body);
      const ipcSerie = await fetchBcentralIpcSerie(env, null);
      if (ipcSerie && ipcSerie.length) {
        data.ipc = ipcSerie[ipcSerie.length - 1];
        body = JSON.stringify(data);
      }
    } catch { /* si no es JSON valido, se devuelve tal cual */ }
  }

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Cache-Control': `public, max-age=${ttls.soft}`,
      'X-Cache': r.state,
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ── Fetch serie anual de un indicador con cache en edge ──────────────────
async function fetchSerie(indicador, year, env, ctx) {
  if (indicador === 'ipc') return fetchBcentralIpcSerie(env, year);

  const r = await cachedFetch(`https://mindicador.cl/api/${indicador}/${year}`, ctx, ttlsPara(`/${indicador}/${year}`));
  if (r.body === undefined) return null;
  try { return JSON.parse(r.body).serie || null; } catch { return null; }
}

// ── Fetch "todos los indicadores de hoy" con cache en edge ───────────────
async function fetchHoy(env, ctx) {
  const r = await cachedFetch('https://mindicador.cl/api', ctx, { soft: CACHE_TTL, hard: STALE_MAX });
  let data = null;
  if (r.body !== undefined) {
    try { data = JSON.parse(r.body); } catch { /* data queda null */ }
  }

  // El IPC de mindicador.cl esta desactualizado: se reemplaza con Banco Central.
  const ipcSerie = await fetchBcentralIpcSerie(env, null);
  if (ipcSerie && ipcSerie.length) {
    data = data ? { ...data } : {};
    data.ipc = ipcSerie[ipcSerie.length - 1];
  }

  return data;
}

// ── Fetch IPC desde la API BDE del Banco Central (si3.bcentral.cl) ───────
// Requiere env.BCENTRAL_API_USER / BCENTRAL_API_PASS / BCENTRAL_IPC_SERIES
// configurados como secrets del Worker. Devuelve null si no hay credenciales
// o si la consulta falla.
async function fetchBcentralIpcSerie(env, year) {
  const user   = env?.BCENTRAL_API_USER;
  const pass   = env?.BCENTRAL_API_PASS;
  const series = env?.BCENTRAL_IPC_SERIES;
  if (!user || !pass || !series) {
    console.error('[bcentral] faltan credenciales: BCENTRAL_API_USER/PASS/IPC_SERIES no configurados como secrets');
    return null;
  }

  const cacheKey = new Request('https://internal-cache.indicadoreschile.cl/bcentral-ipc');
  const cache = caches.default;

  let obs = null;
  const cached = await cache.match(cacheKey);
  if (cached) {
    try { obs = await cached.json(); } catch { /* continúa */ }
  }

  if (!obs) {
    const params = new URLSearchParams({
      user, pass, function: 'GetSeries', timeseries: series,
    });
    const apiUrl = `https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx?${params}`;
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) {
        console.error(`[bcentral] HTTP ${res.status} al consultar la API`);
        return null;
      }
      const buf = await res.arrayBuffer();
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
      catch { text = new TextDecoder('iso-8859-1').decode(buf); }
      const data = JSON.parse(text);
      if (data?.Codigo !== 0) {
        console.error(`[bcentral] respuesta con error: ${data?.Codigo} ${data?.Descripcion}`);
        return null;
      }
      obs = data?.Series?.Obs || [];
      console.log(`[bcentral] OK: ${obs.length} observaciones recibidas`);
      const toStore = new Response(JSON.stringify(obs), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${CACHE_TTL}`,
        },
      });
      await cache.put(cacheKey, toStore);
    } catch (e) {
      console.error(`[bcentral] excepcion: ${e.message}`);
      return null;
    }
  }

  const serie = [];
  for (const o of obs) {
    if (o.statusCode !== 'OK') continue;
    const [d, m, y] = o.indexDateString.split('-');
    const anioObs = parseInt(y, 10);
    if (year) {
      if (anioObs !== year) continue;
    } else if (anioObs < MIN_YEAR) {
      continue; // sin año especifico: recortar historial viejo (no hace falta desde 1928)
    }
    serie.push({ valor: parseFloat(o.value), fecha: `${y}-${m}-${d}T03:00:00.000Z` });
  }
  serie.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return serie;
}
