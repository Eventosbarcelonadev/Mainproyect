/**
 * Dashboard de resultados en local: los mismos datos y el mismo HTML que el cron de Vercel.
 * El informe de producción lo genera solo api/dashboard-cron.js cada dos semanas; esto sirve
 * para revisar cambios antes de publicarlos o para guardar un informe a mano.
 *
 *   node scripts/dashboard-resultados.mjs                 datos + HTML en data/ (ignorado por git)
 *   node scripts/dashboard-resultados.mjs --sin-datos     solo el HTML, con los datos ya descargados
 *   node scripts/dashboard-resultados.mjs --subir         además lo guarda en Supabase como el informe de hoy
 *   node scripts/dashboard-resultados.mjs 2026-06 2026-07 meses concretos
 *
 * Credenciales: .env (GHL_*, BING_WEBMASTER_API_KEY, SUPABASE_*) y .secrets/ga4-reader.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recogerDatos, resumenInforme } from '../lib/dashboard/datos.js';
import { renderDashboard } from '../lib/dashboard/render.js';
import { crearBucket, publicarInforme } from '../lib/dashboard/almacen.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data', 'dashboard-resultados.json');
const HTML = path.join(ROOT, 'data', 'dashboard-resultados.html');
const args = process.argv.slice(2);
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n').filter(l => /^[A-Z_]+=/.test(l))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));

let D;
if (args.includes('--sin-datos')) {
  D = JSON.parse(fs.readFileSync(DATA, 'utf8'));
} else {
  const sa = JSON.parse(fs.readFileSync(path.join(ROOT, '.secrets', 'ga4-reader.json'), 'utf8'));
  const meses = args.filter(a => /^\d{4}-\d{2}$/.test(a));
  D = await recogerDatos({ env, sa, meses, log: s => process.stdout.write(s) });
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(D, null, 1));
  console.log(`Escrito ${path.relative(ROOT, DATA)}`);
}
const citas = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bing-ai-citas.json'), 'utf8'));
const html = renderDashboard(D, citas);
fs.writeFileSync(HTML, html);
console.log(`Escrito ${path.relative(ROOT, HTML)} (${Math.round(html.length / 1024)} KB)`);

for (const m of D.months) {
  const g = D.gsc[m], a = D.ga4[m], l = D.ghl.months[m], e = D.en.gsc[m];
  console.log(`${m}: imp ${g.impressions} · clics ${g.clicks} · sesiones ${a.sessions} · leads ${l.total} (${l.idioma.en} en inglés) · inglés ${e.impressions} imp / ${e.clicks} clics`);
}

if (args.includes('--subir')) {
  await crearBucket(env);
  const fecha = D.generatedAt.slice(0, 10);
  const indice = await publicarInforme(env, { fecha, html, datos: D, resumen: resumenInforme(D) });
  console.log(`Guardado en Supabase como el informe del ${fecha} (${indice.length} informes en total)`);
}
