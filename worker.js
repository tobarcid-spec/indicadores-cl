/**
 * Cloudflare Worker — indicadoreschile.cl
 *
 * 1. /api-proxy/*  → proxy con cache en edge (30 min) a mindicador.cl
 * 2. Páginas HTML  → sirve asset estático + inyecta window.__SSR__ con
 *                    valores del día para render instantáneo sin API call
 * 3. Todo lo demás → assets estáticos sin modificar
 */

const CACHE_TTL = 1800; // 30 minutos

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── Proxy de API con cache en edge ──────────────────────────────────
    if (url.pathname.startsWith('/api-proxy')) {
      return proxyApi(url);
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
    }

    const [html, hoy, serie] = await Promise.all([
      assetRes.text(),
      fetchHoy(),
      serieType ? fetchSerie(serieType, year) : Promise.resolve(null),
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
async function proxyApi(url) {
  const apiPath = url.pathname.replace('/api-proxy', '') || '/';
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
async function fetchSerie(indicador, year) {
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
async function fetchHoy() {
  const cacheKey = new Request('https://mindicador.cl/api');
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    try { return await cached.json(); } catch { /* continúa */ }
  }

  try {
    const res = await fetch('https://mindicador.cl/api');
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
    return data;
  } catch { return null; }
}
