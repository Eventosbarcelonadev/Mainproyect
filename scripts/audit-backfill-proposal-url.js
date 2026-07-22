// Audita (y con --apply repara) las opportunities GHL que tienen una propuesta
// en Supabase pero les falta la URL en el custom field url_generador_propuesta.
// Bug histórico (Sanjeev De): lead-cliente creaba la propuesta pero a veces no
// escribía la URL en la opp. El código ya está arreglado; esto repara lo viejo.
//
// Uso:
//   node scripts/audit-backfill-proposal-url.js           # dry-run
//   node scripts/audit-backfill-proposal-url.js --apply   # escribe las faltantes
require('dotenv').config({ path: '.env' });

const SB = process.env.SUPABASE_URL.trim(), K = process.env.SUPABASE_SERVICE_KEY.trim();
const TOKEN = process.env.GHL_API_KEY.trim(), LOC = process.env.GHL_LOCATION_ID.trim();
const GHL = 'https://services.leadconnectorhq.com';
const SITE = 'https://propuestas.eventosbarcelona.com';
const OPP_URL_GENERADOR = 'LJMLhmfJN6W9xHZFXVpB'; // custom field opportunity
const APPLY = process.argv.includes('--apply');
const sbHdr = { apikey: K, Authorization: `Bearer ${K}` };
const ghlHdr = { Authorization: `Bearer ${TOKEN}`, Version: '2021-07-28', 'Content-Type': 'application/json' };
const c = (col, t) => `\x1b[${ {red:31,green:32,yellow:33,blue:34,dim:2}[col] }m${t}\x1b[0m`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ghl(method, path, body) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(GHL + path, { method, headers: ghlHdr, body: body ? JSON.stringify(body) : undefined });
    if (r.status !== 429) return r;
    await sleep(500 * (i + 1));
  }
  return fetch(GHL + path, { method, headers: ghlHdr, body: body ? JSON.stringify(body) : undefined });
}

(async () => {
  // Test emails a saltear
  const isTest = (e) => /(@growth4u|@placeholder|dev@eventosbarcelona|philosh95|ramiroperez12|test@|@example|scaleitejemplo)/i.test(e || '');

  const r = await fetch(SB + '/rest/v1/proposals?ghl_opportunity_id=not.is.null&select=id,client_name,client_email,ghl_opportunity_id,status,created_at&order=created_at.desc&limit=500', { headers: sbHdr });
  const props = (await r.json()).filter(p => !isTest(p.client_email));

  console.log(c('blue', `\n=== ${APPLY ? 'APPLY' : 'DRY-RUN'} url_generador_propuesta en opportunities ===\n`));
  console.log(`Propuestas con opportunity (sin test): ${props.length}\n`);

  const missing = [];
  let checked = 0, notFound = 0, errors = 0;
  for (const p of props) {
    const g = await ghl('GET', `/opportunities/${p.ghl_opportunity_id}`);
    if (g.status === 404) { notFound++; await sleep(600); continue; }
    if (!g.ok) { errors++; await sleep(600); continue; }
    const d = await g.json();
    const cf = (d.opportunity?.customFields || []);
    const f = cf.find(x => x.id === OPP_URL_GENERADOR);
    const val = f?.fieldValue || f?.value || '';
    if (!val || !String(val).trim()) {
      missing.push(p);
    }
    checked++;
    if (checked % 25 === 0) process.stdout.write(c('dim', `  …${checked}/${props.length}\n`));
    await sleep(600);
  }

  console.log(c('blue', `\n=== RESULTADO ===`));
  console.log(`  Chequeadas OK: ${checked} · opp borrada (404): ${notFound} · otros errores: ${errors}`);
  console.log(`  ${c(missing.length ? 'yellow' : 'green', missing.length + ' opportunities SIN url_generador_propuesta')}\n`);
  missing.slice(0, 40).forEach(p => console.log(`  · ${(p.created_at||'').slice(0,10)}  ${(p.client_name||'?').slice(0,24).padEnd(24)} ${(p.client_email||'').slice(0,32)}`));
  if (missing.length > 40) console.log(c('dim', `  ... ${missing.length - 40} más`));

  if (!APPLY) { console.log(c('blue', `\n[DRY-RUN] Para escribir las faltantes: --apply\n`)); return; }
  if (!missing.length) { console.log(c('green', '\nNada que reparar ✓\n')); return; }

  console.log(c('blue', `\nEscribiendo la URL en ${missing.length} opportunities...\n`));
  let ok = 0, fail = 0;
  for (const p of missing) {
    const url = `${SITE}/propuesta.html?id=${encodeURIComponent(p.id)}&admin=1`;
    const g = await ghl('PUT', `/opportunities/${p.ghl_opportunity_id}`, {
      customFields: [{ id: OPP_URL_GENERADOR, field_value: url }]
    });
    if (g.ok) { ok++; process.stdout.write('.'); }
    else { fail++; console.log(c('red', '\n✗'), p.id, g.status, (await g.text()).slice(0, 100)); }
    await sleep(150);
  }
  console.log(c('green', `\n\n${ok} escritas, ${fail} fallos.\n`));
})().catch(e => { console.error(e); process.exit(1); });
