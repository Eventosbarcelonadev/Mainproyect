// Audita (y opcionalmente backfillea) las asociaciones artista↔show en GHL.
// Compara los vínculos show_artistas de Supabase contra las relations reales
// en GHL (associationId contact↔show). Reporta los que están en Supabase pero
// NO en GHL (quedaron sin pushear) y con --apply los crea.
//
// Uso:
//   node scripts/audit-show-artist-ghl-associations.js           # dry-run
//   node scripts/audit-show-artist-ghl-associations.js --apply   # crea las faltantes
require('dotenv').config({ path: '.env' });

const SB = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_KEY;
const TOKEN = (process.env.GHL_API_KEY || '').trim(), LOC = (process.env.GHL_LOCATION_ID || '').trim();
const GHL = 'https://services.leadconnectorhq.com';
const ASSOC = '6a018a66c4c95715fde952f9'; // GHL_SHOW_CONTACT_ASSOCIATION_ID
const APPLY = process.argv.includes('--apply');
const sbHdr = { apikey: K, Authorization: `Bearer ${K}` };
const ghlHdr = { Authorization: `Bearer ${TOKEN}`, Version: '2021-07-28', 'Content-Type': 'application/json' };
const c = (col, t) => `\x1b[${ {red:31,green:32,yellow:33,blue:34,dim:2}[col] }m${t}\x1b[0m`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function mapLimit(items, limit, fn) {
  const out = []; let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
}

// GET con reintento en 429 (rate limit GHL). Hasta 5 intentos con backoff.
async function ghlGetRetry(url, headers) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { headers });
    if (r.status !== 429) return r;
    await sleep(500 * (attempt + 1));
  }
  return fetch(url, { headers });
}

(async () => {
  if (!TOKEN || !LOC) { console.error('Falta GHL config'); process.exit(1); }

  const [saR, shR, arR] = await Promise.all([
    fetch(SB + '/rest/v1/show_artistas?select=show_id,artista_id&limit=3000', { headers: sbHdr }),
    fetch(SB + '/rest/v1/shows?select=id,name,ghl_show_id&limit=3000', { headers: sbHdr }),
    fetch(SB + '/rest/v1/artistas?select=id,nombre,nombre_artistico,ghl_contact_id&limit=3000', { headers: sbHdr })
  ]);
  const sa = await saR.json(), sh = await shR.json(), ar = await arR.json();
  const showById = new Map(sh.map(s => [s.id, s]));
  const artById = new Map(ar.map(a => [a.id, a]));

  // Esperado: ghl_show_id → [{contactId, showName, artName}]
  const expected = new Map();
  for (const l of sa) {
    const show = showById.get(l.show_id), art = artById.get(l.artista_id);
    if (!show || !show.ghl_show_id || !art || !art.ghl_contact_id) continue;
    if (!expected.has(show.ghl_show_id)) expected.set(show.ghl_show_id, { showName: show.name, contacts: new Map() });
    expected.get(show.ghl_show_id).contacts.set(art.ghl_contact_id, art.nombre_artistico || art.nombre || '?');
  }

  const showIds = [...expected.keys()];
  console.log(c('blue', `\n=== ${APPLY ? 'APPLY' : 'DRY-RUN'} auditoría asociaciones artista↔show GHL ===\n`));
  console.log(`Shows con vínculos pusheables: ${showIds.length}\n`);

  const missing = []; // {ghlShowId, contactId, showName, artName}
  let checked = 0, ghlErrors = 0;

  await mapLimit(showIds, 3, async (ghlShowId) => {
    let actual = new Set();
    try {
      const r = await ghlGetRetry(`${GHL}/associations/relations/${ghlShowId}?locationId=${LOC}&limit=100`, ghlHdr);
      if (r.ok) {
        const d = await r.json();
        (d.relations || []).forEach(rel => {
          if (rel.associationId !== ASSOC) return;
          const cid = rel.firstRecordId === ghlShowId ? rel.secondRecordId : rel.firstRecordId;
          actual.add(cid);
        });
      } else { ghlErrors++; }
    } catch (e) { ghlErrors++; }
    await sleep(120);
    const exp = expected.get(ghlShowId);
    for (const [cid, name] of exp.contacts) {
      if (!actual.has(cid)) missing.push({ ghlShowId, contactId: cid, showName: exp.showName, artName: name });
    }
    checked++;
    if (checked % 40 === 0) process.stdout.write(c('dim', `  …${checked}/${showIds.length}\n`));
  });

  console.log(c('blue', `\n=== RESULTADO ===`));
  console.log(`  Shows auditados: ${checked} (errores GHL: ${ghlErrors})`);
  console.log(`  ${c(missing.length ? 'yellow' : 'green', missing.length + ' asociaciones en Supabase pero NO en GHL')}\n`);
  missing.slice(0, 40).forEach(m => console.log(`  · ${(m.showName || '?').slice(0, 34).padEnd(34)} ↔ ${(m.artName || '?').slice(0, 24)}`));
  if (missing.length > 40) console.log(c('dim', `  ... ${missing.length - 40} más`));

  if (!APPLY) { console.log(c('blue', `\n[DRY-RUN] Para crear las faltantes: --apply\n`)); return; }
  if (!missing.length) { console.log(c('green', '\nNada que backfillear ✓\n')); return; }

  console.log(c('blue', `\nCreando ${missing.length} asociaciones en GHL...\n`));
  let ok = 0, fail = 0;
  for (const m of missing) {
    const r = await fetch(`${GHL}/associations/relations`, {
      method: 'POST', headers: ghlHdr,
      body: JSON.stringify({ locationId: LOC, associationId: ASSOC, firstRecordId: m.contactId, secondRecordId: m.ghlShowId })
    });
    if (r.ok) { ok++; process.stdout.write('.'); }
    else {
      const t = await r.text();
      if (/duplicate relation/i.test(t)) { ok++; process.stdout.write('='); } // ya existía
      else { fail++; console.log(c('red', '\n✗'), m.showName, '↔', m.artName, r.status, t.slice(0, 100)); }
    }
    await sleep(120); // rate limit suave
  }
  console.log(c('green', `\n\n${ok} OK, ${fail} fallos.\n`));
})().catch(e => { console.error(e); process.exit(1); });
