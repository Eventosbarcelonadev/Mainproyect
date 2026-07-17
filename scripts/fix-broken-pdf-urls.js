// Repara proposals.pdf_url corruptas (con \n en medio por la env var de
// Vercel sin trim) y re-empuja la URL limpia al campo GHL url_propuesta_pdf
// del contacto y de la opportunity.
//
// Uso:
//   node scripts/fix-broken-pdf-urls.js           # dry-run
//   node scripts/fix-broken-pdf-urls.js --apply   # repara
require('dotenv').config({ path: '.env' });

const trim = (v) => (typeof v === 'string' ? v.trim() : v);
const SB = trim(process.env.SUPABASE_URL), K = trim(process.env.SUPABASE_SERVICE_KEY);
const TOKEN = trim(process.env.GHL_API_KEY);
const GHL = 'https://services.leadconnectorhq.com';
const CONTACT_URL_PROPUESTA_PDF = 'Ksk2gVtDGy8Ftc9Bu1cC';
const OPP_URL_PROPUESTA_PDF = '65bFezateOokNxACijCW';
const APPLY = process.argv.includes('--apply');
const sbHdr = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const ghlHdr = { Authorization: `Bearer ${TOKEN}`, Version: '2021-07-28', 'Content-Type': 'application/json' };
const c = (col, t) => `\x1b[${ {red:31,green:32,yellow:33,blue:34,dim:2}[col] }m${t}\x1b[0m`;

// Limpia cualquier whitespace embebido en la URL
const cleanUrl = (u) => String(u || '').replace(/\s+/g, '');

(async () => {
  const r = await fetch(SB + '/rest/v1/proposals?pdf_url=not.is.null&select=id,client_name,pdf_url,ghl_contact_id,ghl_opportunity_id', { headers: sbHdr });
  const rows = await r.json();
  const broken = rows.filter(p => /\s/.test(p.pdf_url || ''));

  console.log(c('blue', `\n=== ${APPLY ? 'APPLY' : 'DRY-RUN'} reparar pdf_url rotas ===\n`));
  console.log(`Con pdf_url: ${rows.length} · ${c('yellow', broken.length + ' rotas (whitespace)')}\n`);
  broken.forEach(p => console.log(`  · ${p.id} ${(p.client_name || '?').slice(0, 22).padEnd(22)} → ${cleanUrl(p.pdf_url).slice(0, 60)}...`));

  if (!APPLY) { console.log(c('blue', `\n[DRY-RUN] Para reparar: --apply\n`)); return; }
  if (!broken.length) { console.log(c('green', '\nNada que reparar ✓\n')); return; }

  console.log(c('blue', `\nReparando...\n`));
  let sbOk = 0, ghlOk = 0, fail = 0;
  for (const p of broken) {
    const url = cleanUrl(p.pdf_url);
    // 1. Supabase
    const up = await fetch(`${SB}/rest/v1/proposals?id=eq.${encodeURIComponent(p.id)}`, {
      method: 'PATCH', headers: sbHdr, body: JSON.stringify({ pdf_url: url })
    });
    if (up.ok) sbOk++; else { fail++; console.log(c('red', '✗ SB'), p.id, (await up.text()).slice(0, 80)); continue; }

    // 2. GHL: contacto + opportunity (best-effort)
    if (TOKEN && p.ghl_contact_id) {
      const g = await fetch(`${GHL}/contacts/${p.ghl_contact_id}`, {
        method: 'PUT', headers: ghlHdr,
        body: JSON.stringify({ customFields: [{ id: CONTACT_URL_PROPUESTA_PDF, field_value: url }] })
      });
      if (g.ok) ghlOk++;
    }
    if (TOKEN && p.ghl_opportunity_id) {
      await fetch(`${GHL}/opportunities/${p.ghl_opportunity_id}`, {
        method: 'PUT', headers: ghlHdr,
        body: JSON.stringify({ customFields: [{ id: OPP_URL_PROPUESTA_PDF, field_value: url }] })
      }).catch(() => {});
    }
    process.stdout.write('.');
  }
  console.log(c('green', `\n\nSupabase: ${sbOk} reparadas · GHL contacto: ${ghlOk} · fallos: ${fail}\n`));
})().catch(e => { console.error(e); process.exit(1); });
