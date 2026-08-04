# indicadoreschile.cl — Documentación del Proyecto

Portal de indicadores económicos de Chile actualizado en tiempo real.
URL: **https://indicadoreschile.cl**

---

## Qué es el sitio

Un portal de consulta rápida de indicadores económicos chilenos: UF, Dólar, UTM, Euro e IPC. Muestra el valor del día, histórico mensual y anual con gráficos, y un conversor de arriendo en UF a pesos.

El objetivo es ser la referencia más rápida, clara y bien posicionada en Google para búsquedas como "UF hoy", "valor dólar Chile", "UTM 2026", etc.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Hosting | Cloudflare Pages (CDN global, HTTPS automático) |
| Deploy | GitHub → push a `main` publica en ~30 segundos |
| Lógica de servidor | Cloudflare Worker (JavaScript) |
| Frontend | HTML5 + CSS3 + JavaScript vanilla (sin frameworks) |
| Gráficos | Chart.js 4.4.1 — servido localmente desde `/assets/js/chart.min.js` |
| Fuente de datos | mindicador.cl API (pública, sin autenticación) |
| Monetización | Google AdSense (`ca-pub-9836008718052688`) |
| Analytics | Google Analytics 4 (GA4) |
| SEO | JSON-LD Schema.org, sitemap.xml, meta OG completos |

**Sin base de datos. Sin framework. Sin NPM en producción. Sin servidor propio.**

---

## Arquitectura

```
Usuario
  │
  ▼
Cloudflare Edge (CDN)
  │
  ├── /api-proxy/*  ──►  mindicador.cl API  (proxy con cache 30 min)
  │                       (excepto IPC ──► API Banco Central, ver abajo)
  │
  └── /*.html  ──►  worker.js
                      │
                      ├── 1. Fetch asset estático (HTML del repo)
                      ├── 2. Fetch datos del día desde mindicador.cl
                      ├── 3. Inyecta window.__SSR__ y window.__SSR_SERIES__ en el HTML
                      └── 4. Devuelve HTML enriquecido al usuario
```

### Cómo fluyen los datos

1. **El Worker** intercepta cada request a una página HTML
2. Llama a la API de mindicador.cl para obtener el valor del día (UF, Dólar, etc.)
3. Inyecta los datos en el HTML antes de enviarlo al browser, dentro de variables globales:
   - `window.__SSR__` → valores del día (UF, dólar, UTM, euro, IPC)
   - `window.__SSR_SERIES__` → serie histórica del año en curso
4. El JavaScript del browser lee esas variables al cargar → render instantáneo sin petición adicional
5. Si el Worker falla, el JS hace fetch directamente a `/api-proxy/` como fallback

### Prebuild de datos estáticos

El script `prebuild-fallback.py` se ejecuta localmente antes de hacer deploy cuando se necesita actualizar stats estáticos (mínimo, máximo, promedio, variación del mes/año). Hace fetch a mindicador.cl y escribe los valores directamente en atributos de elementos HTML por `id`. Esto garantiza que los crawlers de Google vean datos reales sin ejecutar JavaScript.

---

## Estructura de archivos

```
indicadores-cl/
├── index.html                        ← Dashboard principal
├── uf/
│   ├── index.html                    ← Página UF (valor del día + gráfico anual)
│   ├── 2024/index.html               ← Histórico anual 2024
│   ├── 2025/index.html               ← Histórico anual 2025
│   ├── 2026/index.html               ← Histórico anual 2026
│   ├── enero-2026/index.html         ← Tabla diaria enero 2026
│   ├── febrero-2026/index.html
│   ├── marzo-2026/index.html
│   ├── abril-2026/index.html
│   ├── mayo-2026/index.html
│   ├── junio-2026/index.html
│   ├── julio-2026/index.html
│   └── agosto-2026/index.html
├── dolar/index.html                  ← Dólar observado
├── ipc/index.html                    ← IPC mensual
├── utm/index.html                    ← UTM
├── calculadora-arriendo-uf/          ← Conversor arriendo UF → CLP
├── que-es-la-uf/                     ← Página informativa (SEO)
├── widget/
│   ├── index.html                    ← Widget embebible configurable
│   └── embed.html                    ← iframe embed (noindex)
├── contacto/index.html
├── privacidad/index.html
├── assets/
│   ├── css/base.css                  ← Estilos globales (dark theme)
│   ├── js/chart.min.js               ← Chart.js 4.4.1 UMD (200KB, local)
│   └── img/
│       ├── uf-og.svg                 ← OG image UF (1200×630)
│       └── dashboard-og.svg          ← OG image dashboard
├── worker.js                         ← Cloudflare Worker (SSR + proxy)
├── wrangler.jsonc                    ← Config Wrangler/Cloudflare
├── sitemap.xml
├── ads.txt                           ← Verificación AdSense
├── 52cf498c33d348b8ba4f593067b4f3b0.txt ← Clave verificación IndexNow (Bing)
├── prebuild-fallback.py              ← Inyector de stats estáticos
├── activar-analytics.py             ← Script para agregar GA4 a todas las páginas
├── activar-adsense.py               ← Script para agregar AdSense a todas las páginas
├── create-monthly-uf-page.py        ← Generador de nuevas páginas mensuales
└── .github/workflows/prebuild.yml   ← Cron mensual: crea página del mes, actualiza fallback SEO, notifica IndexNow
```

---

## Páginas del sitio

| URL | Descripción |
|---|---|
| `/` | Dashboard con UF, Dólar, Euro, UTM, IPC del día |
| `/uf/` | Valor UF hoy + gráfico anual + tabla del mes |
| `/uf/2024/` | Histórico UF 2024 con tabla diaria |
| `/uf/2025/` | Histórico UF 2025 con tabla diaria |
| `/uf/2026/` | Histórico UF 2026 con tabla diaria |
| `/uf/enero-2026/` a `/uf/agosto-2026/` | Tabla diaria de cada mes (se agrega automáticamente el día 1 de cada mes) |
| `/dolar/` | Dólar observado + histórico |
| `/ipc/` | IPC mensual + histórico |
| `/utm/` | UTM + histórico |
| `/calculadora-arriendo-uf/` | Conversor de arriendos UF ↔ CLP |
| `/que-es-la-uf/` | Artículo informativo sobre la UF |
| `/widget/` | Widget embebible para otros sitios |

---

## Fuente de datos

**mindicador.cl** — API pública chilena, sin clave, sin registro. Fuente de UF, Dólar, UTM y Euro.

```
GET https://mindicador.cl/api          → valores del día de todos los indicadores
GET https://mindicador.cl/api/uf/2026  → serie histórica UF año 2026
GET https://mindicador.cl/api/dolar    → últimos 30 días dólar
```

El Worker también actúa como proxy (`/api-proxy/`) para evitar CORS y agregar cache de 30 minutos en el edge de Cloudflare.

### IPC — excepción: fuente Banco Central

mindicador.cl dejó de actualizar la serie de IPC (quedó fija en diciembre 2025). Desde agosto 2026, el IPC se sirve directo desde la API BDE del Banco Central de Chile (`si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx`), con la misma forma `{serie:[...]}` para que el frontend no requiera cambios.

- Implementado en `worker.js`, función `fetchBcentralIpcSerie(env, year)`.
- Aplica en tres puntos: `/api-proxy/ipc*` (proxy), el endpoint base `/api-proxy/` (campo `ipc` del "hoy") y `fetchSerie('ipc', year)` (series anuales para SSR).
- Requiere credenciales configuradas como **secrets del Worker** en Cloudflare: `BCENTRAL_API_USER`, `BCENTRAL_API_PASS`, `BCENTRAL_IPC_SERIES` (código de la serie BDE).
- Si faltan credenciales o la consulta al Banco Central falla, hace fallback silencioso a mindicador.cl (comportamiento anterior).
- El historial se acota a partir de `MIN_YEAR = 2020` cuando se pide la serie completa, para no traer todo el histórico del Banco Central.
- La calculadora de reajuste (`/calculadora-arriendo-uf/`) usa el IPC mensual real de esta serie en vez de un valor extrapolado.

---

## SEO

Cada página tiene:
- `<title>` y `<meta name="description">` únicos
- `<link rel="canonical">`
- Open Graph completo (`og:title`, `og:description`, `og:image`, `og:url`)
- JSON-LD Schema.org: `BreadcrumbList` + `WebPage`
- Imágenes OG en SVG (1200×630)
- `sitemap.xml` con todas las URLs y `lastmod`
- Contenido editorial único por página ("CONTEXTOS") para evitar contenido duplicado entre páginas de meses similares

---

## Google Analytics 4

**Measurement ID:** `G-WDW33KBK92`

Se integró usando el script `activar-analytics.py`:

```bash
python3 activar-analytics.py G-WDW33KBK92
```

El script recorre todos los archivos HTML, reemplaza el bloque placeholder comentado por el snippet real de GA4 con el ID configurado, y hace git push.

El snippet que se inserta en cada `<head>`:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-WDW33KBK92"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-WDW33KBK92');
</script>
```

**Google Search Console** también está activado con meta tag de verificación en `index.html`.

---

## Google AdSense

**Publisher ID:** `ca-pub-9836008718052688`

Pasos realizados:
1. Crear cuenta en [adsense.google.com](https://adsense.google.com) con tobarcid@gmail.com
2. Agregar `indicadoreschile.cl` como sitio
3. Obtener el script de verificación
4. Agregar el script al `<head>` de las 20 páginas HTML (excluyendo `widget/embed.html` que tiene `noindex`)
5. Crear `ads.txt` en la raíz del sitio

Script agregado en cada `<head>`:
```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9836008718052688" crossorigin="anonymous"></script>
```

Contenido de `/ads.txt`:
```
google.com, pub-9836008718052688, DIRECT, f08c47fec0942fa0
```

Los placeholders `<div class="ad-slot">Publicidad</div>` fueron reemplazados por unidades de anuncio reales (Auto Ads) en las 20 páginas del sitio:

```html
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="ca-pub-9836008718052688"
     data-ad-slot="auto"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
```

---

## IndexNow (Bing)

El sitio notifica automáticamente a Bing/IndexNow cada vez que corre el cron mensual de `.github/workflows/prebuild.yml`. La clave de verificación vive en `/52cf498c33d348b8ba4f593067b4f3b0.txt` en la raíz del sitio. El workflow hace `POST` a `https://api.indexnow.org/indexnow` con las URLs principales y la del mes recién publicado, para acelerar la indexación en Bing sin esperar el rastreo natural.

---

## Deploy

El deploy es completamente automático:

```bash
git add -A
git commit -m "descripción del cambio"
git push
```

Cloudflare Pages detecta el push a `main` y publica en ~30 segundos. No hay build step, no hay compilación — los archivos HTML se sirven tal como están, enriquecidos por el Worker en cada request.

---

## Cómo crear un sitio equivalente

Para replicar este proyecto para otro país o conjunto de indicadores:

1. **Fork del repo** en GitHub
2. Conectar a **Cloudflare Pages** (gratis, plan free soporta este volumen)
3. Adaptar `worker.js` para apuntar a la API de datos del país/sector correspondiente
4. Reemplazar contenidos HTML (títulos, descripciones, datos)
5. Registrar dominio propio y configurarlo en Cloudflare
6. Crear cuenta de Google AdSense para el nuevo dominio
7. Ejecutar `python activar-analytics.py G-NUEVO_ID` con el ID de GA4 del nuevo sitio
8. `git push` → en producción

**Costo operativo mensual estimado: $0** (Cloudflare Pages free tier, dominio aparte ~$10 USD/año).

---

## Scripts de utilidad

| Script | Uso |
|---|---|
| `prebuild-fallback.py` | Inyecta stats reales en HTML antes de deploy |
| `activar-analytics.py <G-ID>` | Agrega GA4 a todas las páginas |
| `activar-adsense.py` | Agrega script AdSense a todas las páginas |
| `create-monthly-uf-page.py` | Genera nueva página mensual de UF (corre automático vía cron el día 1 de cada mes) |

---

## Decisiones de diseño

- **Sin framework:** Reduce complejidad, carga más rápido, sin dependencias que actualizar. Un desarrollador puede entender todo el sitio en una tarde.
- **Worker como SSR ligero:** Los datos del día se inyectan en el servidor, el HTML que llega al browser ya tiene los valores. Sin flash de carga, SEO perfecto.
- **Chart.js local:** Evita dependencia de CDN externo que causaba fallos de carga en horas de alta latencia desde Chile.
- **Una carpeta = una URL:** Cada indicador y cada período tiene su propio `index.html`. URLs limpias, fáciles de mantener, sin routing dinámico.
- **Dark theme por defecto:** Orientado a usuarios que consultan indicadores frecuentemente, generalmente en contexto profesional/financiero.
