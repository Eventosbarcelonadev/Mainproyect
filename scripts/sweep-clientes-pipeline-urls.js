// Barrido completo del pipeline Clientes en GHL: detecta TODA opportunity sin
// url_generador_propuesta y la repara vía el endpoint ensure-proposal-for-lead
// (crea propuesta shell si no existe + escribe la URL en la opp).
//
// Cubre el hueco de audit-backfill-proposal-url.js: ese arranca desde propuestas
// en Supabase, así que NO ve los leads de Make (que ni siquiera tienen propuesta).
// Este arranca desde el pipeline, así que los ve todos.
//
// IMPORTANTE: /opportunities/search NO devuelve customFields de forma fiable.
// Hay que hacer GET /opportunities/{id} uno por uno. Por eso los 600ms de delay.
//
// Uso:
//   node scripts/sweep-clientes-pipeline-urls.js           # dry-run
//   node scripts/sweep-clientes-pipeline-urls.js --apply   # repara
require('dotenv').config({ path: '.env' });

const TOKEN = process.env.GHL_API_KEY.trim(), LOC = process.env.GHL_LOCATION_ID.trim();
const PIPE = process.env.GHL_PIPELINE_CLIENTES.trim();
const GHL = 'https://services.leadconnectorhq.com';
const ENDPOINT = 'https://propuestas.eventosbarcelona.com/api/admin?action=ensure-proposal-for-lead';
const URLGEN = 'LJMLhmfJN6W9xHZFXVpB';
const APPLY = process.argv.includes('--apply');
const ghlHdr = { Authorization: `Bearer ${TOKEN}`, Version: '2021-07-28', 'Content-Type': 'application/json' };
const c = (col, t) => `\x1b[${ {red:31,green:32,yellow:33,blue:34,dim:2}[col] }m${t}\x1b[0m`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isTest = e => /(@growth4u|@placeholder|dev@eventosbarcelona|philosh95|ramiroperez12|test@|@example|scaleitejemplo|demo@|test\.propuesta)/i.test(e || '');

async function ghl(method, path, body) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(GHL + path, { method, headers: ghlHdr, body: body ? JSON.stringify(body) : undefined });
    if (r.status !== 429) return r;
    await sleep(600 * (i + 1));
  }
  return fetch(GHL + path, { method, headers: ghlHdr, body: body ? JSON.stringify(body) : undefined });
}

(async () => {
  // 1. Listar todas las opps del pipeline Clientes (paginado)
  console.log(c('blue', `\n=== ${APPLY ? 'APPLY' : 'DRY-RUN'} barrido pipeline Clientes ===\n`));
  const opps = [];
  let page = 1;
  while (page <= 20) {
    const r = await ghl('GET', `/opportunities/search?location_id=${LOC}&pipeline_id=${PIPE}&limit=100&page=${page}`);
    if (!r.ok) { console.log(c('red', `search page ${page}: ${r.status}`)); break; }
    const batch = (await r.json()).opportunities || [];
    opps.push(...batch);
    if (batch.length < 100) break;
    page++;
    await sleep(400);
  }
  console.log(`Opportunities en el pipeline: ${opps.length}\n`);

  // 2. GET-by-id cada una para leer el custom field de verdad
  const missing = [];
  let checked = 0, errors = 0, skipped = 0;
  for (const o of opps) {
    const email = o.contact?.email || '';
    if (isTest(email)) { skipped++; continue; }
    const g = await ghl('GET', `/opportunities/${o.id}`);
    if (!g.ok) { errors++; await sleep(600); continue; }
    const cf = (await g.json()).opportunity?.customFields || [];
    const f = cf.find(x => x.id === URLGEN);
    const val = f?.fieldValue || f?.value || '';
    if (!String(val).trim()) missing.push({ id: o.id, name: o.name, email, contactId: o.contact?.id, source: o.source || '' });
    checked++;
    if (checked % 25 === 0) process.stdout.write(c('dim', `  …${checked}/${opps.length - skipped}\n`));
    await sleep(600);
  }

  console.log(c('blue', `\n=== RESULTADO ===`));
  console.log(`  Chequeadas: ${checked} · test saltadas: ${skipped} · errores: ${errors}`);
  console.log(`  ${c(missing.length ? 'yellow' : 'green', missing.length + ' opportunities SIN url_generador_propuesta')}\n`);
  missing.forEach(m => console.log(`  · ${(m.name || '?').slice(0, 30).padEnd(30)} ${(m.email || '—').slice(0, 32).padEnd(32)} ${c('dim', m.source || '')}`));

  if (!APPLY) { console.log(c('blue', `\n[DRY-RUN] Para reparar: --apply\n`)); return; }
  if (!missing.length) { console.log(c('green', '\nNada que reparar ✓\n')); return; }

  console.log(c('blue', `\nReparando ${missing.length} vía ensure-proposal-for-lead...\n`));
  let ok = 0, fail = 0;
  for (const m of missing) {
    const body = m.contactId ? { contactId: m.contactId } : { opportunityId: m.id };
    const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.success) {
      ok++;
      console.log(c('green', '  ✓'), (m.name || '?').slice(0, 30).padEnd(30), j.proposalId, j.reused ? c('dim', '(reusada)') : '(nueva)');
    } else {
      fail++;
      console.log(c('red', '  ✗'), (m.name || '?').slice(0, 30).padEnd(30), r.status, JSON.stringify(j).slice(0, 90));
    }
    await sleep(900);
  }
  console.log(c('green', `\n${ok} reparadas, ${fail} fallos.\n`));
})().catch(e => { console.error(e); process.exit(1); });
