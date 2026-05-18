/**
 * Regenera las associations contact↔show en GHL para que reflejen show_artistas
 * (modelo nuevo) y borra las del modelo viejo.
 *
 * Para cada show:
 *   - Encuentra su record GHL en custom_objects.shows (por nombre)
 *   - Lee associations actuales (GET /associations/relations/{recordId})
 *   - Calcula objetivo: ghl_contact_id de cada artista en show_artistas
 *   - DELETE associations cuyo contact NO está en el objetivo
 *   - POST associations que faltan
 *
 * Uso:
 *   node scripts/regen-ghl-show-associations.js              # dry-run
 *   node scripts/regen-ghl-show-associations.js --apply      # ejecuta
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

const KEY = process.env.GHL_API_KEY;
const LOC = process.env.GHL_LOCATION_ID;
const SBURL = process.env.SUPABASE_URL;
const SBKEY = process.env.SUPABASE_SERVICE_KEY;
const BASE = 'https://services.leadconnectorhq.com';
const OBJECT_KEY = 'custom_objects.shows';
const ASSOCIATION_ID = '6a018a66c4c95715fde952f9';
const APPLY = process.argv.includes('--apply');
const OUT = path.join(__dirname, '..', 'data', `regen-ghl-associations-report-${new Date().toISOString().slice(0,10)}.json`);

function normName(s) { return String(s || '').toLowerCase().trim(); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ghl(method, p, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: {
      Authorization: 'Bearer ' + KEY,
      Version: '2021-07-28',
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  return { status: r.status, ok: r.ok, body: text };
}

function sbGet(table, cols) {
  return new Promise(async (resolve, reject) => {
    const all = [];
    let from = 0;
    while (true) {
      const u = new URL(SBURL + '/rest/v1/' + table);
      u.searchParams.set('select', cols);
      const chunk = await new Promise((res, rej) => {
        const r = https.request({
          method: 'GET', hostname: u.hostname, path: u.pathname + u.search,
          headers: { apikey: SBKEY, Authorization: 'Bearer ' + SBKEY, Range: `${from}-${from + 999}` }
        }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => { try { res(JSON.parse(d)); } catch { rej(new Error(d.substring(0, 200))); } }); });
        r.on('error', rej); r.end();
      });
      all.push(...chunk);
      if (chunk.length < 1000) break;
      from += 1000;
    }
    resolve(all);
  });
}

async function loadAllGhlRecords() {
  const all = [];
  let searchAfter = null;
  while (true) {
    const body = { locationId: LOC, page: 1, pageLimit: 100, query: '' };
    if (searchAfter) body.searchAfter = searchAfter;
    const r = await ghl('POST', `/objects/${OBJECT_KEY}/records/search`, body);
    if (!r.ok) throw new Error('Records search failed: ' + r.status + ' ' + r.body);
    const d = JSON.parse(r.body);
    const batch = d.records || [];
    all.push(...batch);
    if (batch.length < 100) break;
    const last = batch[batch.length - 1];
    searchAfter = last.searchAfter || last.sort;
    if (!searchAfter) break;
    if (all.length > 5000) break;
  }
  return all;
}

async function getRelations(recordId) {
  const r = await ghl('GET', `/associations/relations/${recordId}?locationId=${LOC}`);
  if (!r.ok) return [];
  const d = JSON.parse(r.body);
  return (d.relations || []).filter(rel => rel.associationId === ASSOCIATION_ID && rel.firstObjectKey === 'contact');
}

(async () => {
  console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  console.log('Cargando estado SB…');
  const shows = await sbGet('shows', 'id,name');
  const showArts = await sbGet('show_artistas', 'show_id,artista_id,posicion');
  const artistas = await sbGet('artistas', 'id,nombre,ghl_contact_id');
  const artById = new Map(artistas.map(a => [a.id, a]));
  console.log(`  shows: ${shows.length}  show_artistas: ${showArts.length}  artistas: ${artistas.length}`);

  console.log('Cargando GHL records…');
  const ghlRecords = await loadAllGhlRecords();
  console.log(`  GHL custom_objects.shows: ${ghlRecords.length}`);
  const ghlByName = new Map();
  for (const r of ghlRecords) {
    const n = normName(r.properties?.nombre_show);
    if (n) ghlByName.set(n, r);
  }

  // Build target: show_id → Set<ghl_contact_id>
  const targetByShow = new Map();
  for (const sa of showArts) {
    const a = artById.get(sa.artista_id);
    if (!a || !a.ghl_contact_id) continue;
    if (!targetByShow.has(sa.show_id)) targetByShow.set(sa.show_id, new Set());
    targetByShow.get(sa.show_id).add(a.ghl_contact_id);
  }

  // Per-show plan: DELETE/POST
  const plan = [];
  const toDelete = [];
  const toCreate = [];
  let shows_missing_ghl_record = 0;
  let shows_with_zero_artistas = 0;

  console.log(`Leyendo associations actuales (${shows.length} GETs, esto tarda)…`);
  for (let i = 0; i < shows.length; i++) {
    const s = shows[i];
    const ghlRec = ghlByName.get(normName(s.name));
    if (!ghlRec) {
      shows_missing_ghl_record++;
      continue;
    }
    const targetIds = targetByShow.get(s.id) || new Set();
    if (targetIds.size === 0) shows_with_zero_artistas++;

    const current = await getRelations(ghlRec.id);
    const currentIds = new Set(current.map(r => r.firstRecordId));

    const dels = current.filter(r => !targetIds.has(r.firstRecordId));
    const adds = [...targetIds].filter(id => !currentIds.has(id));

    plan.push({
      show_id: s.id, show_name: s.name, ghl_record_id: ghlRec.id,
      current_count: current.length, target_count: targetIds.size,
      delete_count: dels.length, add_count: adds.length
    });
    for (const d of dels) toDelete.push({ show_id: s.id, show_name: s.name, relation_id: d.id, contact_id: d.firstRecordId });
    for (const cid of adds) toCreate.push({ show_id: s.id, show_name: s.name, ghl_record_id: ghlRec.id, contact_id: cid });

    if ((i + 1) % 25 === 0) process.stdout.write(`  ${i+1}/${shows.length}\r`);
    await sleep(80);
  }
  console.log('');

  const summary = {
    shows_total: shows.length,
    shows_with_ghl_record: shows.length - shows_missing_ghl_record,
    shows_missing_ghl_record,
    shows_with_zero_target_artistas: shows_with_zero_artistas,
    associations_to_delete: toDelete.length,
    associations_to_create: toCreate.length
  };
  console.log('\n=== Plan ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log('\nMuestra delete (5):');
  toDelete.slice(0,5).forEach(d => console.log(`  - [${d.show_name}] rel=${d.relation_id} contact=${d.contact_id}`));
  console.log('\nMuestra create (5):');
  toCreate.slice(0,5).forEach(c => console.log(`  + [${c.show_name}] contact=${c.contact_id}`));

  fs.writeFileSync(OUT, JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', summary, plan, toDelete, toCreate }, null, 2));

  if (!APPLY) {
    console.log(`\nDry-run reporte: ${OUT}`);
    return;
  }

  // ---- APPLY ----
  console.log(`\n--- APPLY ---`);
  let delOk = 0, delErr = 0;
  for (let i = 0; i < toDelete.length; i++) {
    const d = toDelete[i];
    const r = await ghl('DELETE', `/associations/relations/${d.relation_id}?locationId=${LOC}`);
    if (r.ok) delOk++; else delErr++;
    if ((i+1) % 25 === 0) process.stdout.write(`  del ${i+1}/${toDelete.length}\r`);
    await sleep(80);
  }
  console.log(`\nDeleted: ${delOk}   errors: ${delErr}`);

  let addOk = 0, addDup = 0, addErr = 0;
  for (let i = 0; i < toCreate.length; i++) {
    const c = toCreate[i];
    const r = await ghl('POST', '/associations/relations', {
      locationId: LOC,
      associationId: ASSOCIATION_ID,
      firstRecordId: c.contact_id,
      secondRecordId: c.ghl_record_id
    });
    if (r.ok) addOk++;
    else if (r.status === 400 && /duplicate/i.test(r.body)) addDup++;
    else addErr++;
    if ((i+1) % 25 === 0) process.stdout.write(`  add ${i+1}/${toCreate.length}\r`);
    await sleep(80);
  }
  console.log(`\nCreated: ${addOk}   dup-skipped: ${addDup}   errors: ${addErr}`);

  const finalReport = { mode: 'apply', summary, deleted: delOk, deleted_errors: delErr, created: addOk, created_dup: addDup, created_errors: addErr };
  fs.writeFileSync(OUT, JSON.stringify(finalReport, null, 2));
  console.log(`Reporte: ${OUT}`);
})();
