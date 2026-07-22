// Repara leads afectados por el bug de lead-cliente (ej. Sanjeev): la propuesta
// quedó huérfana (ghl_contact_id NULL) y la opportunity sin url_generador_propuesta.
// Para cada propuesta huérfana con email real: resuelve contacto+opp en GHL,
// escribe la URL en la opp (si falta) y linkea la propuesta (ghl_contact_id +
// ghl_opportunity_id). Agrupa por email: usa la propuesta más reciente.
//
// Uso:
//   node scripts/backfill-orphan-lead-urls.js           # dry-run
//   node scripts/backfill-orphan-lead-urls.js --apply   # repara
require('dotenv').config({ path: '.env' });

const SB = process.env.SUPABASE_URL.trim(), K = process.env.SUPABASE_SERVICE_KEY.trim();
const TOKEN = process.env.GHL_API_KEY.trim(), LOC = process.env.GHL_LOCATION_ID.trim();
const GHL = 'https://services.leadconnectorhq.com';
const SITE = 'https://propuestas.eventosbarcelona.com';
const URLGEN = 'LJMLhmfJN6W9xHZFXVpB';
const APPLY = process.argv.includes('--apply');
const sbHdr = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const ghlHdr = { Authorization: `Bearer ${TOKEN}`, Version: '2021-07-28', 'Content-Type': 'application/json' };
const c = (col, t) => `\x1b[${ {red:31,green:32,yellow:33,blue:34,dim:2}[col] }m${t}\x1b[0m`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isTest = e => /(@growth4u|@placeholder|dev@eventosbarcelona|philosh95|ramiroperez12|test@|@example|scaleitejemplo|demo@|test\.propuesta)/i.test(e || '');

async function ghl(method, path, body) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(GHL + path, { method, headers: ghlHdr, body: body ? JSON.stringify(body) : undefined });
    if (r.status !== 429) return r;
    await sleep(700 * (i + 1));
  }
  return fetch(GHL + path, { method, headers: ghlHdr, body: body ? JSON.stringify(body) : undefined });
}

(async () => {
  const r = await fetch(SB + '/rest/v1/proposals?ghl_contact_id=is.null&select=id,client_name,client_email,status,created_at&order=created_at.desc&limit=200', { headers: sbHdr });
  const orphans = (await r.json()).filter(p => p.client_email && !isTest(p.client_email));

  // Agrupar por email → propuesta más reciente
  const byEmail = new Map();
  for (const p of orphans) {
    const e = p.client_email.toLowerCase().trim();
    if (!byEmail.has(e)) byEmail.set(e, p); // ya vienen ordenadas desc → primera = más reciente
  }
  const targets = [...byEmail.entries()];

  console.log(c('blue', `\n=== ${APPLY ? 'APPLY' : 'DRY-RUN'} reparar leads huérfanos ===\n`));
  console.log(`Huérfanas con email real: ${orphans.length} · emails únicos: ${targets.length}\n`);

  const plan = []; // {email, proposal, contactId, oppId, hasUrl}
  let noContact = 0, noOpp = 0;
  for (const [email, p] of targets) {
    const s = await ghl('GET', `/contacts/search/duplicate?locationId=${LOC}&email=${encodeURIComponent(email)}`);
    const cJson = s.ok ? await s.json() : {};
    const contact = cJson.contact;
    await sleep(600);
    if (!contact) { noContact++; console.log(c('dim', `  · ${email.padEnd(34)} sin contacto GHL`)); continue; }

    const o = await ghl('GET', `/opportunities/search?location_id=${LOC}&contact_id=${contact.id}`);
    const opps = o.ok ? ((await o.json()).opportunities || []) : [];
    await sleep(600);
    if (!opps.length) { noOpp++; console.log(c('dim', `  · ${email.padEnd(34)} contacto ok, sin opp`)); continue; }

    const opp = opps[0];
    const f = (opp.customFields || []).find(x => x.id === URLGEN);
    const hasUrl = !!(f && (f.fieldValue || f.value));
    plan.push({ email, proposal: p, contactId: contact.id, oppId: opp.id, hasUrl });
    const mark = hasUrl ? c('green', 'URL ✓ (solo linkear propuesta)') : c('yellow', 'URL FALTA → escribir + linkear');
    console.log(`  · ${email.padEnd(34)} ${mark}`);
  }

  const toWriteUrl = plan.filter(x => !x.hasUrl);
  console.log(c('blue', `\n=== RESUMEN ===`));
  console.log(`  leads con opp: ${plan.length} · sin URL (a reparar): ${c('yellow', toWriteUrl.length)}`);
  console.log(`  sin contacto: ${noContact} · sin opp: ${noOpp}\n`);

  if (!APPLY) { console.log(c('blue', `[DRY-RUN] Para reparar: --apply\n`)); return; }
  if (!plan.length) { console.log(c('green', 'Nada que reparar ✓\n')); return; }

  console.log(c('blue', `Reparando...\n`));
  let ok = 0, fail = 0;
  for (const x of plan) {
    const url = `${SITE}/propuesta.html?id=${encodeURIComponent(x.proposal.id)}&admin=1`;
    // 1. Escribir URL en la opp si falta
    if (!x.hasUrl) {
      const g = await ghl('PUT', `/opportunities/${x.oppId}`, { customFields: [{ id: URLGEN, field_value: url }] });
      if (!g.ok) { fail++; console.log(c('red', '✗ URL'), x.email, g.status); await sleep(600); continue; }
      await sleep(600);
    }
    // 2. Linkear la propuesta (ghl_contact_id + opportunity_id)
    const pa = await fetch(SB + `/rest/v1/proposals?id=eq.${encodeURIComponent(x.proposal.id)}`, {
      method: 'PATCH', headers: sbHdr,
      body: JSON.stringify({ ghl_contact_id: x.contactId, ghl_opportunity_id: x.oppId })
    });
    if (pa.ok) { ok++; process.stdout.write('.'); }
    else { fail++; console.log(c('red', '✗ link'), x.email, (await pa.text()).slice(0, 80)); }
    await sleep(200);
  }
  console.log(c('green', `\n\n${ok} reparados, ${fail} fallos.\n`));
})().catch(e => { console.error(e); process.exit(1); });
