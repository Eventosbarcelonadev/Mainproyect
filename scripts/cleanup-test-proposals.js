// Borra propuestas de TEST (Ramiro/Test/dev/Philippe/@example/@growth4u...).
// Usa el endpoint de producción delete-proposal → borra fila + PDF del bucket.
//
// Uso:
//   node scripts/cleanup-test-proposals.js           # dry-run (lista)
//   node scripts/cleanup-test-proposals.js --apply    # ejecuta
require('dotenv').config({ path: '.env' });

const SB = process.env.SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_KEY;
const PROD = 'https://propuestas.eventosbarcelona.com';
const APPLY = process.argv.includes('--apply');
const hdr = { apikey: K, Authorization: `Bearer ${K}` };
const c = (col, t) => `\x1b[${ {red:31,green:32,yellow:33,blue:34,dim:2}[col] }m${t}\x1b[0m`;

// Heurística conservadora: solo lo que es inequívocamente interno.
const testEmailPat = /(dev@eventosbarcelona|@growth4u|@placeholder|test@|@test\.|ramiroperez12@hotmail|ramiace2@gmail|philosh95@gmail|scaleitejemplo@gmail|philippe@growth4u)/i;
const testNamePat = /^(test|rami\b|ramiro test|rami test|dev |dev ramiro|prueba|qa |dummy|test28|test\d)/i;
const testEventPat = /(test|prueba|dummy|qa)/i;

function classify(p) {
  const e = (p.client_email || '').toLowerCase();
  const n = (p.client_name || '').toLowerCase().trim();
  const ev = (p.event_name || '').toLowerCase();
  if (testEmailPat.test(e)) return 'email';
  if (testNamePat.test(n)) return 'nombre';
  if (!e && testEventPat.test(ev)) return 'evento-sin-email';
  return null;
}

(async () => {
  const r = await fetch(SB + '/rest/v1/proposals?select=id,client_name,client_email,event_name,status,pdf_path,created_at&order=created_at.desc&limit=400', { headers: hdr });
  const rows = await r.json();
  const tests = rows.map(p => ({ ...p, _why: classify(p) })).filter(p => p._why);

  console.log(c('blue', `\n=== ${APPLY ? 'APPLY' : 'DRY-RUN'} cleanup propuestas test ===\n`));
  console.log(`Total: ${rows.length} · candidatas a test: ${c('yellow', tests.length)} · se quedan: ${rows.length - tests.length}\n`);
  tests.forEach(p => console.log(`  ${c('dim', (p.created_at||'').slice(0,10))} ${(p.status||'').padEnd(9)} ${(p.client_name||'?').slice(0,22).padEnd(22)} ${(p.client_email||'(sin email)').slice(0,32).padEnd(32)} [${p._why}] ${p.id}`));

  if (!APPLY) { console.log(c('blue', `\n[DRY-RUN] Para borrar: --apply\n`)); return; }

  console.log(c('blue', `\nBorrando vía endpoint producción...\n`));
  let ok = 0, fail = 0;
  for (const p of tests) {
    const del = await fetch(`${PROD}/api/admin?action=delete-proposal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id })
    });
    if (del.ok) { ok++; process.stdout.write('.'); }
    else { fail++; console.log(c('red', '\n✗'), p.id, (await del.text()).slice(0, 100)); }
  }
  console.log(c('green', `\n\n${ok} borradas, ${fail} fallos.\n`));
})().catch(e => { console.error(e); process.exit(1); });
