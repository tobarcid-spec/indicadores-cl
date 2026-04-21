# indicadores.cl

Portal de indicadores económicos de Chile — UF, Dólar, UTM, IPC.
Monetizado con Google AdSense. Datos oficiales del Banco Central de Chile.

---

## 🗂️ Estructura del proyecto

```
indicadores-cl/
│
├── index.html                    ← Dashboard principal (todos los indicadores)
├── robots.txt                    ← Instrucciones para Google
├── sitemap.xml                   ← Mapa del sitio para SEO
├── _headers                      ← Headers de seguridad (Cloudflare Pages)
├── _redirects                    ← Redirecciones (Cloudflare Pages)
├── .gitignore
│
├── assets/
│   ├── css/
│   │   └── base.css              ← Design system compartido
│   └── js/
│       └── utils.js              ← Utilidades JS (fetch API, formateo)
│
├── uf/
│   └── index.html                ← Valor UF + historial + gráfico
│
├── dolar/
│   └── index.html                ← Tipo de cambio USD/CLP
│
├── utm/
│   └── index.html                ← Valor UTM mensual
│
├── ipc/
│   └── index.html                ← IPC Chile + inflación
│
├── calculadora-arriendo-uf/
│   └── index.html                ← 🔑 Calculadora de arriendo en UF (PRIORIDAD)
│
└── widget/
    └── index.html                ← Código embebible para otras webs
```

---

## 🚀 Setup en 15 minutos

### 1. Crear cuenta en GitHub
1. Ir a https://github.com → Sign Up
2. Crear nuevo repositorio: `indicadores-cl`
3. Visibilidad: **Public** (necesario para Cloudflare Pages gratis)

### 2. Subir el proyecto a GitHub

```bash
# En tu computador (instala Git desde https://git-scm.com)
cd ruta/a/indicadores-cl/

git init
git add .
git commit -m "🚀 Lanzamiento inicial indicadores.cl"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/indicadores-cl.git
git push -u origin main
```

### 3. Conectar con Cloudflare Pages

1. Ir a https://pages.cloudflare.com → **Create a project**
2. Conectar con GitHub → Seleccionar el repositorio `indicadores-cl`
3. Configuración de build:
   - **Framework preset**: None (sin framework)
   - **Build command**: *(dejar vacío)*
   - **Build output directory**: `/`
4. Clic en **Save and Deploy**

Cloudflare Pages publicará el sitio automáticamente.
URL inicial: `indicadores-cl.pages.dev`

### 4. Conectar tu dominio propio

1. En Cloudflare Pages → **Custom domains** → Add domain
2. Ingresar: `indicadores.cl`
3. Cloudflare mostrará los DNS records a configurar en NIC Chile
4. En NIC Chile (https://nic.cl): actualizar nameservers a los de Cloudflare

> Tiempo de propagación DNS: 10 minutos – 24 horas

---

## ✏️ Flujo de trabajo para actualizar el sitio

```bash
# Hacer cambios en los archivos localmente
# Luego:

git add .
git commit -m "descripción del cambio"
git push
```

Cloudflare Pages detecta el push y publica automáticamente en ~30 segundos.

---

## 📅 Tareas mensuales (15 minutos)

Cada inicio de mes, agregar la página del mes nuevo:

1. Copiar `/uf/index.html` → no es necesario crear página por mes separada,
   el historial se carga dinámicamente por año desde la API.
   
2. Actualizar `sitemap.xml` — agregar la URL del mes nuevo:
   ```xml
   <url>
     <loc>https://indicadores.cl/uf/mayo-2026/</loc>
     <lastmod>2026-05-31</lastmod>
     <changefreq>yearly</changefreq>
     <priority>0.6</priority>
   </url>
   ```

3. Commit y push:
   ```bash
   git add sitemap.xml
   git commit -m "📅 Agregar UF mayo 2026 al sitemap"
   git push
   ```

---

## 💰 Monetización — Agregar AdSense

Cuando recibas aprobación de AdSense:

1. Reemplazar en cada página los bloques:
   ```html
   <!-- Google AdSense — insertar código aquí cuando sea aprobado -->
   Publicidad
   ```
   
   Por el código real de AdSense:
   ```html
   <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX" crossorigin="anonymous"></script>
   <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" data-ad-slot="XXXXXXXXXX" data-ad-format="auto" data-full-width-responsive="true"></ins>
   <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
   ```

2. Eliminar el estilo `.ad-slot` del CSS (o ajustarlo).

---

## 🔧 API utilizada

**mindicador.cl** — API pública y gratuita del Banco Central de Chile.

```
GET https://mindicador.cl/api          → todos los indicadores del día
GET https://mindicador.cl/api/uf       → UF del mes actual
GET https://mindicador.cl/api/uf/2026  → UF de todo el año 2026
GET https://mindicador.cl/api/dolar    → Dólar del mes actual
GET https://mindicador.cl/api/utm      → UTM del mes actual
```

Los datos se cachean en `localStorage` por 1 hora para no hacer peticiones innecesarias.

---

## 🔍 SEO — Checklist de lanzamiento

- [ ] Verificar sitio en Google Search Console
- [ ] Enviar sitemap.xml en Search Console
- [ ] Verificar que robots.txt permite indexación
- [ ] Pedir indexación manual de las páginas principales
- [ ] Verificar PageSpeed Insights > 90 en móvil
- [ ] Confirmar que el schema markup es válido (https://validator.schema.org)

---

## 📞 Páginas que faltan por crear (próximos pasos)

| Página | Archivo | Prioridad |
|---|---|---|
| Dólar hoy | `/dolar/index.html` | Alta |
| UTM Chile | `/utm/index.html` | Alta |
| IPC inflación | `/ipc/index.html` | Media |
| Widget embebible | `/widget/index.html` | Media |
| ¿Qué es la UF? | `/que-es-la-uf/index.html` | Media |
| Política de privacidad | `/privacidad/index.html` | Alta (AdSense) |
| Contacto | `/contacto/index.html` | Alta (AdSense) |
# indicadores-cl
