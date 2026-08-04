# indicadoreschile.cl

Portal de indicadores económicos de Chile — UF, Dólar, UTM, IPC.
Desplegado en **Cloudflare Workers** con dominio propio `indicadoreschile.cl`.
Datos oficiales vía API pública de [mindicador.cl](https://mindicador.cl) (Banco Central de Chile).

---

## Estado del proyecto

| Aspecto | Estado |
|---|---|
| Despliegue | Cloudflare Workers (wrangler) |
| Dominio | indicadoreschile.cl |
| Analytics | Google Analytics 4 — `G-WDW33KBK92` (activo) |
| SEO | Search Console verificado, sitemap enviado, IndexNow (Bing) automático |
| AdSense | Aprobado y activo — unidades Auto Ads en las 20 páginas |
| Indexación | En proceso (contenido diferenciador agregado) |

---

## Estructura del proyecto

```
indicadores-cl/
│
├── index.html                        ← Dashboard principal (UF, Dólar, UTM, IPC)
├── sitemap.xml                       ← Mapa del sitio con fechas de modificación
├── robots.txt                        ← Permisos de indexación
├── _headers                          ← Headers de seguridad (Cloudflare)
├── _redirects                        ← Redirecciones (Cloudflare)
├── wrangler.jsonc                    ← Configuración de Cloudflare Workers
│
├── assets/
│   ├── css/base.css                  ← Design system compartido (DM Mono + Sora)
│   └── js/utils.js                   ← Fetch API, formateo, caché localStorage
│
├── uf/
│   ├── index.html                    ← Valor UF hoy + historial + gráfico
│   ├── 2024/index.html               ← Historial UF año 2024
│   ├── 2025/index.html               ← Historial UF año 2025
│   ├── 2026/index.html               ← Historial UF año 2026
│   ├── enero-2026/index.html         ← UF diaria enero 2026 (SEO long-tail)
│   ├── febrero-2026/index.html       ← UF diaria febrero 2026
│   ├── marzo-2026/index.html         ← UF diaria marzo 2026
│   ├── abril-2026/index.html         ← UF diaria abril 2026
│   ├── mayo-2026/index.html          ← UF diaria mayo 2026
│   ├── junio-2026/index.html         ← UF diaria junio 2026
│   ├── julio-2026/index.html         ← UF diaria julio 2026
│   └── agosto-2026/index.html        ← UF diaria agosto 2026 (generada automática por cron)
│
├── dolar/index.html                  ← Tipo de cambio USD/CLP
├── utm/index.html                    ← Valor UTM mensual
├── ipc/index.html                    ← IPC Chile + inflación
│
├── calculadora-arriendo-uf/          ← Calculadora de arriendo en UF
├── que-es-la-uf/index.html          ← Guía editorial sobre la UF
├── widget/index.html                 ← Código embebible para otras webs
├── privacidad/index.html             ← Política de privacidad (requerido AdSense)
└── contacto/index.html               ← Página de contacto (requerido AdSense)
```

---

## Historial de cambios relevantes

### Agosto 2026
- **IPC migrado a la API del Banco Central**: mindicador.cl dejó de actualizar la serie de IPC (quedó fija en dic-2025). El Worker ahora consulta directo `si3.bcentral.cl` (API BDE) para el IPC, con fallback a mindicador.cl si fallan las credenciales o la consulta. Requiere los secrets `BCENTRAL_API_USER`, `BCENTRAL_API_PASS` y `BCENTRAL_IPC_SERIES` en Cloudflare
- La calculadora de reajuste ahora usa el IPC mensual real del Banco Central en vez de un valor extrapolado, y muestra el rango de meses usado
- AdSense aprobado: reemplazo de placeholders "Publicidad" por unidades reales `<ins class="adsbygoogle">` (Auto Ads) en las 20 páginas del sitio
- Página mensual `/uf/agosto-2026/` creada automáticamente por el cron de GitHub Actions

### Julio 2026
- Integración de Google AdSense (`ca-pub-9836008718052688`) + `ads.txt`
- Clave de verificación IndexNow (Bing) agregada en la raíz
- Notificación automática a IndexNow en cada deploy mensual (workflow `prebuild.yml`)
- Página mensual `/uf/julio-2026/` creada

### Mayo 2026
- Página mensual `/uf/mayo-2026/` creada con tabla diaria y gráfico
- Sitemap actualizado con fechas de modificación (`<lastmod>`) en todas las URLs
- Google Analytics 4 activado en todas las páginas (código descomentado)

### Abril 2026
- Verificación de sitio en Google Search Console
- Activación de GA4 (`G-WDW33KBK92`)
- Páginas mensuales UF con breadcrumb schema y OG image
- Contenido único diferenciador agregado para resolver problema de des-indexación
- Corrección de dominio a `indicadoreschile.cl` (se quitó IVP, se estandarizó navbar)

### Versión inicial
- Dashboard principal con widget de UF, Dólar, UTM, IPC en tiempo real
- Páginas de historial UF por año (2024, 2025, 2026)
- Páginas UTM, IPC, Dólar
- Widget embebible, guía ¿Qué es la UF?, privacidad, contacto
- Cloudflare Workers configurado vía `wrangler.jsonc`
- Despliegue automático desde GitHub

---

## API utilizada

**mindicador.cl** — API pública y gratuita del Banco Central de Chile.

```
GET https://mindicador.cl/api          → todos los indicadores del día
GET https://mindicador.cl/api/uf       → UF del mes actual
GET https://mindicador.cl/api/uf/2026  → UF de todo el año 2026
GET https://mindicador.cl/api/dolar    → Dólar del mes actual
GET https://mindicador.cl/api/utm      → UTM del mes actual
GET https://mindicador.cl/api/ipc      → IPC del mes actual
```

Los datos se cachean en `localStorage` por 1 hora para evitar peticiones repetidas.

---

## Despliegue

El sitio usa **Cloudflare Workers** como plataforma de hosting estático.

```bash
# Publicar cambios
git add .
git commit -m "descripción del cambio"
git push
```

Cloudflare detecta el push desde GitHub y publica automáticamente en ~30 segundos.

---

## Tarea mensual — agregar mes nuevo de UF

1. Copiar `/uf/junio-2026/index.html` → `/uf/julio-2026/index.html`
2. Actualizar en el nuevo archivo los meta estáticos del `<head>`: `<title>`, `<meta name="description">`, `<meta name="keywords">`, canonical, og:title, og:description, og:url y el breadcrumb schema inicial
3. Agregar la entrada `'7-2026'` en el objeto `CONTEXTOS` del JS con el contexto editorial del mes
4. En `sitemap.xml`: cambiar junio-2026 a `changefreq=yearly` y agregar julio-2026:
   ```xml
   <url>
     <loc>https://indicadoreschile.cl/uf/julio-2026/</loc>
     <lastmod>2026-07-01</lastmod>
     <changefreq>monthly</changefreq>
     <priority>0.9</priority>
   </url>
   ```
5. Commit y push

---

## Monetización — AdSense (activo)

Publisher ID: `ca-pub-9836008718052688`. Cada página tiene el script SDK en el `<head>` y una unidad Auto Ads real en el cuerpo:

```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9836008718052688" crossorigin="anonymous"></script>
<ins class="adsbygoogle" style="display:block"
     data-ad-client="ca-pub-9836008718052688"
     data-ad-slot="auto"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
```

Existe el script `activar-adsense.py` que automatizó este reemplazo en todos los archivos.

---

## SEO — Checklist

- [x] Sitio verificado en Google Search Console
- [x] sitemap.xml enviado a Search Console
- [x] robots.txt permite indexación
- [x] Schema markup (WebSite, BreadcrumbList) en páginas principales
- [x] Open Graph image configurada
- [x] Contenido diferenciador agregado (resolver des-indexación)
- [x] Google Analytics 4 activo
- [x] AdSense aprobado y con unidades Auto Ads activas
- [x] Notificación automática a IndexNow (Bing) en cada deploy mensual
- [ ] PageSpeed Insights > 90 en móvil (verificar)
