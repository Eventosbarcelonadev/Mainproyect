/**
 * Backfill de estado_show + es_favorito en los 226 records de custom_objects.shows.
 *
 * Lee shows desde Supabase (status, is_favorite, ghl_show_id) y hace PUT en GHL.
 * Idempotente.
 */
require('dotenv').config();
const https = require('https');

const KEY = process.env.GHL_API_KEY;
const LOC = process.env.GHL_LOCATION_ID;
const SBURL = process.env.SUPABASE_URL;
const SBKEY = process.env.SUPABASE_SERVICE_KEY;
const BASE = 'https://services.leadconnectorhq.com';
const APPLY = process.argv.includes('--apply');

function sbGet(p) {
  return new Promise((resolve, reject) => {
    const u = new URL(SBURL + '/rest/v1/' + p);
    const r = https.request({
      method: 'GET', hostname: u.hostname, path: u.pathname + u.search,
      headers: { apikey: SBKEY, Authorization: 'Bearer ' + SBKEY, Range: '0-9999' }
    }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => resolve(JSON.parse(d))); });
    r.on('error', reject); r.end();
  });
}
async function ghl(method, p, body) {
  const r = await fetch(BASE + p, {
    method, headers: { Authorization: 'Bearer ' + KEY, Version: '2021-07-28', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: r.status, ok: r.ok, body: await r.text() };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function loadAllGhlRecords() {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const r = await ghl('POST', '/objects/custom_objects.shows/records/search', { locationId: LOC, page, pageLimit: 100, query: '' });
    const d = JSON.parse(r.body);
    const batch = d.records || [];
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}
function norm(s) { return String(s || '').toLowerCase().trim(); }

(async () => {
  console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  const shows = await sbGet('shows?select=id,name,status,is_favorite');
  console.log(`SB shows: ${shows.length}`);
  const ghlRecs = await loadAllGhlRecords();
  console.log(`GHL records: ${ghlRecs.length}`);
  const ghlByName = new Map(ghlRecs.map(r => [norm(r.properties?.nombre_show), r]));

  const planned = [];
  for (const s of shows) {
    const rec = ghlByName.get(norm(s.name));
    if (!rec) continue;
    planned.push({ show: s, ghlId: rec.id });
  }
  console.log(`Matched: ${planned.length}`);

  let ok = 0, err = 0;
  for (let i = 0; i < planned.length; i++) {
    const { show: s, ghlId } = planned[i];
    const props = {
      estado_show: s.status || 'active',
      es_favorito: !!s.is_favorite
    };
    if (!APPLY) {
      if (i < 3) console.log(`  ${s.name} → ${JSON.stringify(props)}`);
      continue;
    }
    const g = await ghl('PUT', `/objects/custom_objects.shows/records/${encodeURIComponent(ghlId)}?locationId=${LOC}`, {
      properties: props
    });
    if (g.ok) ok++; else { err++; console.error(`✗ ${s.name}: ${g.status} ${g.body.slice(0,200)}`); }
    if ((i+1) % 25 === 0) process.stdout.write(`  ${i+1}/${planned.length}\r`);
    await sleep(80);
  }
  if (APPLY) console.log(`\nUpdated: ${ok}   errors: ${err}`);
  else console.log(`(dry-run) ${planned.length} updates planificadas`);
})();
