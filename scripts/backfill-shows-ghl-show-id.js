/**
 * Rellena shows.ghl_show_id en Supabase mapeando por nombre con los records
 * de custom_objects.shows en GHL. Una vez aplicado, admin.js puede sincronizar
 * cambios al record GHL sin búsqueda por nombre cada vez.
 */
require('dotenv').config();
const https = require('https');

const KEY = process.env.GHL_API_KEY;
const LOC = process.env.GHL_LOCATION_ID;
const SBURL = process.env.SUPABASE_URL;
const SBKEY = process.env.SUPABASE_SERVICE_KEY;
const BASE = 'https://services.leadconnectorhq.com';
const APPLY = process.argv.includes('--apply');

function sb(method, p, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(SBURL + '/rest/v1/' + p);
    const r = https.request({
      method, hostname: u.hostname, path: u.pathname + u.search,
      headers: {
        apikey: SBKEY, Authorization: 'Bearer ' + SBKEY,
        'Content-Type': 'application/json',
        Prefer: method === 'PATCH' ? 'return=minimal' : ''
      }
    }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => { try { resolve(d ? JSON.parse(d) : null); } catch { resolve(d); } }); });
    r.on('error', reject); if (body) r.write(JSON.stringify(body)); r.end();
  });
}
async function ghl(method, p, body) {
  const r = await fetch(BASE + p, {
    method, headers: { Authorization: 'Bearer ' + KEY, Version: '2021-07-28', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: r.status, ok: r.ok, body: await r.text() };
}
async function fetchAllShows() {
  return new Promise((res, rej) => {
    const u = new URL(SBURL + '/rest/v1/shows?select=id,name,ghl_show_id&order=name.asc');
    https.get({ hostname: u.hostname, path: u.pathname + u.search, headers: { apikey: SBKEY, Authorization: 'Bearer ' + SBKEY, Range: '0-9999' } }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res(JSON.parse(d))); }).on('error', rej);
  });
}
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  const shows = await fetchAllShows();
  const ghlRecs = await loadAllGhlRecords();
  console.log(`SB shows: ${shows.length}   GHL records: ${ghlRecs.length}`);
  const byName = new Map(ghlRecs.map(r => [norm(r.properties?.nombre_show), r]));

  const toUpdate = shows.filter(s => !s.ghl_show_id && byName.has(norm(s.name)));
  const noMatch = shows.filter(s => !s.ghl_show_id && !byName.has(norm(s.name)));
  const alreadySet = shows.filter(s => s.ghl_show_id).length;
  console.log(`Ya tenían ghl_show_id: ${alreadySet}`);
  console.log(`A actualizar:          ${toUpdate.length}`);
  console.log(`Sin match en GHL:      ${noMatch.length}`);
  if (noMatch.length) noMatch.slice(0, 5).forEach(s => console.log(`  - ${s.name}`));
  if (!APPLY) { console.log('(dry-run)'); return; }

  let ok = 0, err = 0;
  for (let i = 0; i < toUpdate.length; i++) {
    const s = toUpdate[i];
    const rec = byName.get(norm(s.name));
    try {
      await sb('PATCH', `shows?id=eq.${encodeURIComponent(s.id)}`, { ghl_show_id: rec.id });
      ok++;
    } catch (e) { err++; console.error('✗', s.name, e.message); }
    if ((i+1) % 25 === 0) process.stdout.write(`  ${i+1}/${toUpdate.length}\r`);
    await sleep(30);
  }
  console.log(`\nUpdated: ${ok}   errors: ${err}`);
})();
