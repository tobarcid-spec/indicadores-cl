#!/usr/bin/env node
/**
 * actualizar-sitemap.mjs — pone en cada <lastmod> del sitemap la fecha del
 * ultimo commit que modifico el HTML de esa pagina (UTC), para que refleje
 * cambios reales. Google ignora el lastmod si no es confiable.
 *
 * Uso: node scripts/actualizar-sitemap.mjs   (requiere historial de git completo:
 * en GitHub Actions, actions/checkout con fetch-depth: 0)
 */
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

const RUTA = 'sitemap.xml';
const BASE = 'https://indicadoreschile.cl/';

const original = fs.readFileSync(RUTA, 'utf8');
let cambios = 0;
let sinHistorial = 0;

const nuevo = original.replace(/<url><loc>([^<]+)<\/loc><lastmod>([^<]*)<\/lastmod>/g, (m, url, actual) => {
  if (!url.startsWith(BASE)) return m;
  const archivo = url.slice(BASE.length) + 'index.html';
  let fecha = '';
  try {
    // Si la pagina tiene cambios sin commitear (p. ej. los que acaban de generar los
    // scripts de datos), su fecha es hoy; si no, la del ultimo commit que la toco.
    const modificada = spawnSync('git', ['diff', '--quiet', 'HEAD', '--', archivo]).status === 1   // 1 = hay diferencias
      || spawnSync('git', ['ls-files', '--others', '--exclude-standard', '--', archivo]).stdout.length > 0;
    fecha = modificada
      ? new Date().toISOString().slice(0, 10)
      : execFileSync('git', ['log', '-1', '--format=%cd', '--date=format-local:%Y-%m-%d', '--', archivo],
          { env: { ...process.env, TZ: 'UTC' } }).toString().trim();
  } catch { /* sin git */ }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { sinHistorial++; return m; }
  if (fecha === actual) return m;
  cambios++;
  return `<url><loc>${url}</loc><lastmod>${fecha}</lastmod>`;
});

if (nuevo !== original) fs.writeFileSync(RUTA, nuevo);
console.log(`sitemap: ${cambios} lastmod actualizados` + (sinHistorial ? ` (${sinHistorial} sin historial de git)` : ''));
