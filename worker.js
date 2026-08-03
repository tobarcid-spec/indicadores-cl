/**
 * Cloudflare Worker — indicadoreschile.cl
 *
 * 1. /api-proxy/*  → proxy con cache en edge (30 min) a mindicador.cl
 *    (excepto /api-proxy/ipc*, que se sirve desde el Banco Central)
 * 2. Páginas HTML  → sirve asset estático + inyecta window.__SSR__ con
 *                    valores del día para render instantáneo sin API call
 * 3. Todo lo demás → assets estáticos sin modificar
 */

const CACHE_TTL = 1800; // 30 minutos

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── Redirect www → sin www (301 permanente) ─────────────────────────
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }

    // ── Proxy de API con cache en edge ──────────────────────────────────
    if (url.pathname.startsWith('/api-proxy')) {
      return proxyApi(url, env);
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
      fetchHoy(env),
      serieType ? fetchSerie(serieType, year, env) : Promise.resolve(null),
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

// ── Proxy a mindicador.cl con cache en edge ──────────────────────────────
async function proxyApi(url, env) {
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
        },
      });
    }
  }

  const apiUrl = `https://mindicador.cl/api${apiPath}${url.search}`;
  const cacheKey = new Request(apiUrl);
  const cache = caches.default;

  // Intentar desde cache de edge
  const cached = await cache.match(cacheKey);
  if (cached) {
    const h = new Headers(cached.headers);
    h.set('X-Cache', 'HIT');
    return new Response(cached.body, { status: cached.status, headers: h });
  }

  // Fetch desde origen
  let res;
  try {
    res = await fetch(apiUrl);
  } catch {
    return new Response(JSON.stringify({ error: 'API no disponible' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!res.ok) return res;

  const body = await res.text();

  // Guardar en cache de edge
  const toStore = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
    },
  });
  await cache.put(cacheKey, toStore.clone());

  const h = new Headers(toStore.headers);
  h.set('X-Cache', 'MISS');
  return new Response(body, { status: 200, headers: h });
}

// ── Fetch serie anual de un indicador con cache en edge ──────────────────
async function fetchSerie(indicador, year, env) {
  if (indicador === 'ipc') return fetchBcentralIpcSerie(env, year);

  const apiUrl = `https://mindicador.cl/api/${indicador}/${year}`;
  const cacheKey = new Request(apiUrl);
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    try {
      const data = await cached.json();
      return data.serie || null;
    } catch { /* continúa */ }
  }

  try {
    const res = await fetch(apiUrl);
    if (!res.ok) return null;
    const body = await res.text();
    const data = JSON.parse(body);
    const toStore = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
      },
    });
    await cache.put(cacheKey, toStore);
    return data.serie || null;
  } catch { return null; }
}

// ── Fetch "todos los indicadores de hoy" con cache en edge ───────────────
async function fetchHoy(env) {
  const cacheKey = new Request('https://mindicador.cl/api');
  const cache = caches.default;

  let data = null;
  const cached = await cache.match(cacheKey);
  if (cached) {
    try { data = await cached.json(); } catch { /* continúa */ }
  }

  if (!data) {
    try {
      const res = await fetch('https://mindicador.cl/api');
      if (res.ok) {
        const body = await res.text();
        data = JSON.parse(body);
        const toStore = new Response(body, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${CACHE_TTL}`,
          },
        });
        await cache.put(cacheKey, toStore);
      }
    } catch { /* data queda null */ }
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
    if (year && parseInt(y, 10) !== year) continue;
    serie.push({ valor: parseFloat(o.value), fecha: `${y}-${m}-${d}T03:00:00.000Z` });
  }
  serie.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return serie;
}
