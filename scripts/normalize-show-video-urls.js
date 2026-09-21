/**
 * Convierte los vídeos de shows en formato embed de YouTube
 * (youtube.com/embed/ID) a enlace normal (youtube.com/watch?v=ID), en
 * Supabase (shows.video_url) y en GHL (custom_objects.shows → url_video).
 *
 * Por qué: video_url solo se usa como ENLACE (botón "Vídeo" del /admin, ficha
 * del show en GHL, catálogo). Una URL /embed/ abierta en su propia pestaña sin
 * Referer da "Error 153 · Error de configuración del reproductor de vídeo".
 * La propuesta no fallaba porque ya hacía replace('/embed/', '/watch?v=').
 *
 * Uso:
 *   node scripts/normalize-show-video-urls.js           # dry-run
 *   node scripts/normalize-show-video-urls.js --apply   # backup + escribe
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();
const GHL_TOKEN = (process.env.GHL_PIT_TOKEN || process.env.GHL_API_KEY || '').trim();
const GHL_LOC = (process.env.GHL_LOCATION_ID || '').trim();
const APPLY = process.argv.includes('--apply');

const EMBED_RE = /^https?:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})(?:[?#](.*))?$/;

function toWatchUrl(u) {
  const m = EMBED_RE.exec(String(u || '').trim());
  if (!m) return null;
  const start = new URLSearchParams(m[2] || '').get('start');
  return `https://www.youtube.com/watch?v=${m[1]}${start ? `&t=${start}s` : ''}`;
}

function req(method, hostname, p, headers, body) {
  return new Promise((resolve, reject) => {
    const r = https.request({ method, hostname, path: p, headers }, res => {
      let buf = ''; res.on('data', d => buf += d);
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    r.on('error', reject); if (body) r.write(JSON.stringify(body)); r.end();
  });
}
const sbHost = () => new URL(SUPABASE_URL).hostname;
const sbHeaders = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };
const ghlHeaders = { Authorization: 'Bearer ' + GHL_TOKEN, Version: '2021-07-28', Accept: 'application/json', 'Content-Type': 'application/json' };
const ghl = (method, p, body) => req(method, 'services.leadconnectorhq.com', p, ghlHeaders, body);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function loadAllGhlRecords() {
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const r = await ghl('POST', '/objects/custom_objects.shows/records/search', {
      locationId: GHL_LOC, page, pageLimit: 100, query: ''
    });
    const batch = JSON.parse(r.body).records || [];
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

(async () => {
  console.log(`=== Normalizar vídeos embed → watch (${APPLY ? 'APPLY' : 'dry-run'}) ===\n`);

  const sbRes = await req('GET', sbHost(), '/rest/v1/shows?select=id,name,video_url,ghl_show_id&video_url=not.is.null&limit=2000', sbHeaders);
  const sbShows = JSON.parse(sbRes.body).filter(s => toWatchUrl(s.video_url));
  const ghlRecords = (await loadAllGhlRecords()).filter(r => toWatchUrl(r.properties?.url_video));

  console.log(`Supabase: ${sbShows.length} shows con URL embed`);
  console.log(`GHL:      ${ghlRecords.length} records con url_video embed\n`);
  for (const s of sbShows.slice(0, 5)) console.log(`  SB  ${s.id}: ${s.video_url} → ${toWatchUrl(s.video_url)}`);
  for (const r of ghlRecords.slice(0, 5)) console.log(`  GHL ${r.id}: ${r.properties.url_video} → ${toWatchUrl(r.properties.url_video)}`);

  if (!APPLY) { console.log('\nDry-run. Añade --apply para escribir.'); return; }

  const stamp = new Date().toISOString().slice(0, 10);
  const backup = path.join(__dirname, '..', 'data', `backup-show-video-urls-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify({
    supabase: sbShows.map(s => ({ id: s.id, video_url: s.video_url })),
    ghl: ghlRecords.map(r => ({ id: r.id, url_video: r.properties.url_video }))
  }, null, 2));
  console.log(`\nBackup: ${path.relative(process.cwd(), backup)}`);

  let sbOk = 0, ghlOk = 0;
  const errors = [];
  for (const s of sbShows) {
    const r = await req('PATCH', sbHost(), `/rest/v1/shows?id=eq.${encodeURIComponent(s.id)}`, sbHeaders, { video_url: toWatchUrl(s.video_url) });
    if (r.status < 300) sbOk++; else errors.push(`SB ${s.id}: ${r.status} ${r.body.slice(0, 120)}`);
  }
  for (const rec of ghlRecords) {
    const r = await ghl('PUT', `/objects/custom_objects.shows/records/${encodeURIComponent(rec.id)}?locationId=${encodeURIComponent(GHL_LOC)}`, {
      properties: { url_video: toWatchUrl(rec.properties.url_video) }
    });
    if (r.status < 300) ghlOk++; else errors.push(`GHL ${rec.id}: ${r.status} ${r.body.slice(0, 120)}`);
    await sleep(120);
  }
  console.log(`\nSupabase actualizados: ${sbOk}/${sbShows.length}`);
  console.log(`GHL actualizados:      ${ghlOk}/${ghlRecords.length}`);
  if (errors.length) { console.log('\nErrores:'); errors.forEach(e => console.log('  ' + e)); process.exitCode = 1; }
})();
