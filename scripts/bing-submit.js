/**
 * Bing submit — avisa a Bing de las URLs nuevas o modificadas (Eventos Barcelona)
 *
 * Por qué existe: el IndexNow de Yoast Premium avisa a Bing solo a ratos
 * (0 envíos en julio de 2026, visto en el panel IndexNow de Bing Webmaster Tools).
 * Este script usa la API de Bing Webmaster (SubmitUrlBatch), que no necesita el
 * archivo de clave de IndexNow: basta la clave de API del sitio verificado.
 * Bing también reparte estas URLs a Copilot, que es donde nos cita.
 *
 * Uso:
 *   node scripts/bing-submit.js                    # URLs del sitemap modificadas desde el último envío
 *   node scripts/bing-submit.js --since 2026-09-01 # URLs del sitemap modificadas desde esa fecha
 *   node scripts/bing-submit.js <url> [url...]     # URLs concretas
 *   Añadir --dry-run para ver qué se enviaría sin enviar nada.
 *
 * Requiere BING_WEBMASTER_API_KEY en .env. Cuota: 10.000 URLs/día.
 * Estado: data/bing-submit-state.json guarda la fecha del último envío completo.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const SITE_URL = 'https://www.eventosbarcelona.com/';
const SITEMAP_INDEX = SITE_URL + 'sitemap_index.xml';
const API = 'https://ssl.bing.com/webmaster/api.svc/json/';
const STATE_FILE = path.join(ROOT, 'data', 'bing-submit-state.json');
const BATCH = 100;

process.loadEnvFile(path.join(ROOT, '.env'));
const KEY = process.env.BING_WEBMASTER_API_KEY;
if (!KEY) {
  console.error('Falta BING_WEBMASTER_API_KEY en .env');
  process.exit(1);
}

function request(url, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (EB bing-submit)',
        ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      },
    }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout ' + url)));
    if (body) req.write(body);
    req.end();
  });
}

async function sitemapUrls() {
  const index = await request(SITEMAP_INDEX);
  const maps = [...index.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
  const urls = [];
  for (const map of maps) {
    const { body } = await request(map);
    for (const [, block] of body.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = block.match(/<loc>([^<]+)<\/loc>/);
      const lastmod = block.match(/<lastmod>([^<]+)<\/lastmod>/);
      if (loc) urls.push({ url: loc[1].trim(), lastmod: lastmod ? new Date(lastmod[1]) : null });
    }
  }
  return urls;
}

async function quota() {
  const r = await request(`${API}GetUrlSubmissionQuota?siteUrl=${encodeURIComponent(SITE_URL)}&apikey=${KEY}`);
  if (r.status !== 200) throw new Error(`GetUrlSubmissionQuota HTTP ${r.status}: ${r.body.slice(0, 200)}`);
  return JSON.parse(r.body).d.DailyQuota;
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const sinceIdx = args.indexOf('--since');
  const explicit = args.filter((a, i) => a.startsWith('http') && args[i - 1] !== '--since');
  const startedAt = new Date().toISOString();

  let urls;
  if (explicit.length) {
    const foreign = explicit.filter(u => !u.startsWith(SITE_URL));
    if (foreign.length) {
      console.error('Estas URLs no son de ' + SITE_URL + ':\n  ' + foreign.join('\n  '));
      process.exit(1);
    }
    urls = [...new Set(explicit)];
    console.log(`${urls.length} URLs pasadas a mano`);
  } else {
    const state = readState();
    const sinceRaw = sinceIdx >= 0 ? args[sinceIdx + 1] : state.last_submit;
    if (!sinceRaw) {
      console.error('No hay envío previo en data/bing-submit-state.json: pasa --since AAAA-MM-DD');
      process.exit(1);
    }
    const since = new Date(sinceRaw);
    if (isNaN(since)) {
      console.error('Fecha no válida: ' + sinceRaw);
      process.exit(1);
    }
    const all = await sitemapUrls();
    urls = [...new Set(all.filter(u => u.lastmod && u.lastmod >= since).map(u => u.url))].sort();
    console.log(`Sitemap: ${all.length} URLs · modificadas desde ${since.toISOString()}: ${urls.length}`);
  }

  if (!urls.length) {
    console.log('Nada que enviar.');
    return;
  }

  const before = await quota();
  console.log(`Cuota diaria disponible: ${before}`);
  if (urls.length > before) {
    console.error(`Hay ${urls.length} URLs y solo quedan ${before} de cuota hoy. Acota con --since o repite mañana.`);
    process.exit(1);
  }

  if (dryRun) {
    urls.forEach(u => console.log('  ' + u));
    console.log(`--dry-run: no se ha enviado nada (${urls.length} URLs)`);
    return;
  }

  for (let i = 0; i < urls.length; i += BATCH) {
    const batch = urls.slice(i, i + BATCH);
    const r = await request(`${API}SubmitUrlBatch?apikey=${KEY}`, {
      method: 'POST',
      body: JSON.stringify({ siteUrl: SITE_URL, urlList: batch }),
    });
    if (r.status !== 200) {
      console.error(`Lote ${i / BATCH + 1} falló: HTTP ${r.status} ${r.body.slice(0, 200)}`);
      console.error('El estado no se actualiza: el próximo envío volverá a incluir estas URLs.');
      process.exit(1);
    }
    console.log(`Lote ${i / BATCH + 1}: ${batch.length} URLs OK`);
  }

  const after = await quota();
  console.log(`Enviadas ${urls.length} URLs · cuota restante: ${after}`);

  if (!explicit.length) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ last_submit: startedAt, last_count: urls.length }, null, 2) + '\n');
    console.log('Estado guardado en data/bing-submit-state.json');
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
