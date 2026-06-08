// One-shot: artistas/proveedores en Supabase con ghl_contact_id IS NULL
// y email real (no placeholder) → crear contact GHL via upsert, setear
// custom fields (contact_type, nombre_artista, companyName) y tag
// artista_ok/proveedor_ok según tipo. Persiste ghl_contact_id en SB.
//
// Match: por email vía /contacts/upsert (GHL deduplica). Si ya existe ese
// email en GHL, devuelve el contact id existente y solo updateamos.
//
// Uso:
//   node scripts/backfill-ghl-contacts-missing.js           # dry-run
//   node scripts/backfill-ghl-contacts-missing.js --apply   # ejecuta
require('dotenv').config({ path: '.env' });

const SB = (process.env.SUPABASE_URL || '').trim();
const K = (process.env.SUPABASE_SERVICE_KEY || '').trim();
const TOKEN = (process.env.GHL_API_KEY || '').trim();
const LOC = (process.env.GHL_LOCATION_ID || '').trim();
const APPLY = process.argv.includes('--apply');

const sbHdr = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const ghlHdr = { Authorization: `Bearer ${TOKEN}`, Version: '2021-07-28', 'Content-Type': 'application/json' };
const GHL = 'https://services.leadconnectorhq.com';

const GHL_CF = {
  contact_type: '0LBySc0XI7qKiPQVrQs9',
  nombre_artista: 'v69mW7YhrDNMoAx8fw8h',
  categoria_artista: 'O4u824Z7LAxSwSMm0YqE',
  subcategoria_artista: 'A8CeeHJRdvK7YEakH6bV',
  url_supabase: 'bd9b4HubsMstnWZMfa0G'
};
const SITE = (process.env.SITE_URL || 'https://propuestas.eventosbarcelona.com').replace(/\/$/, '');

const c = (col, t) => `\x1b[${ {red:31,green:32,yellow:33,blue:34,dim:2,bold:1}[col] }m${t}\x1b[0m`;
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const isPlaceholder = (e) => e && /@placeholder\.eventosbarcelona\.(local|com)\b/i.test(e);

(async () => {
  if (!TOKEN || !LOC) { console.error('Falta GHL_API_KEY o GHL_LOCATION_ID en .env'); process.exit(1); }

  // 1. Artistas/proveedores sin ghl_contact_id con email real
  const r = await fetch(
    SB + '/rest/v1/artistas?ghl_contact_id=is.null&select=id,nombre,nombre_artistico,compania,email,telefono,ciudad,tipo,disciplinas,bio_show,origen&limit=500',
    { headers: sbHdr }
  );
  const rows = await r.json();
  const targets = rows.filter(x => x.email && !isPlaceholder(x.email));

  console.log(c('blue', `\n=== ${APPLY ? 'APPLY' : 'DRY-RUN'} backfill GHL contacts ===\n`));
  console.log(`Sin ghl_contact_id total: ${rows.length}`);
  console.log(`Con email real (se pueden crear en GHL): ${c('yellow', targets.length)}`);
  console.log(`Sin email real (se saltean): ${rows.length - targets.length}\n`);

  const byTipo = {};
  for (const t of targets) byTipo[t.tipo] = (byTipo[t.tipo] || 0) + 1;
  console.log('Por tipo:', byTipo);
  console.log('');

  if (!APPLY) {
    targets.slice(0, 15).forEach(t => console.log(`  · ${(t.email || '').padEnd(40)} ${t.tipo.padEnd(10)} ${t.compania || t.nombre || '?'}`));
    if (targets.length > 15) console.log(c('dim', `  ... ${targets.length - 15} más`));
    console.log(c('blue', `\n[DRY-RUN] Para aplicar: --apply\n`));
    return;
  }

  let ok = 0, fail = 0;
  for (const a of targets) {
    const tipoCap = cap(a.tipo || 'artista'); // Artista|Proveedor|Venue
    const nombreLabel = a.nombre_artistico || a.compania || a.nombre || '';
    const customFields = [
      { id: GHL_CF.contact_type, key: 'contact_type', field_value: tipoCap },
      { id: GHL_CF.nombre_artista, key: 'nombre_artista', field_value: nombreLabel },
      { id: GHL_CF.url_supabase, key: 'url_supabase', field_value: `${SITE}/admin.html?artista=${a.id}` }
    ];
    if (Array.isArray(a.disciplinas) && a.disciplinas.length) {
      customFields.push({ id: GHL_CF.categoria_artista, key: 'categoria_artista', field_value: a.disciplinas[0] || '' });
      if (a.disciplinas[1]) customFields.push({ id: GHL_CF.subcategoria_artista, key: 'subcategoria_artista', field_value: a.disciplinas[1] });
    }

    const body = {
      locationId: LOC,
      firstName: a.nombre || nombreLabel,
      companyName: a.compania || '',
      email: a.email,
      phone: a.telefono || '',
      city: a.ciudad || '',
      tags: [],
      customFields
    };
    // 1. Upsert contact
    const up = await fetch(GHL + '/contacts/upsert', { method: 'POST', headers: ghlHdr, body: JSON.stringify(body) });
    const upTxt = await up.text();
    if (!up.ok) { fail++; console.log(c('red', '✗'), a.email, '·', up.status, '·', upTxt.slice(0, 150)); continue; }
    let parsed = null;
    try { parsed = JSON.parse(upTxt); } catch {}
    const ghlId = parsed?.contact?.id || parsed?.id;
    if (!ghlId) { fail++; console.log(c('red', '✗'), a.email, '· upsert sin id:', upTxt.slice(0, 150)); continue; }

    // 2. Add tag artista_ok / proveedor_ok
    const tag = tipoCap === 'Proveedor' ? 'proveedor_ok' : tipoCap === 'Venue' ? 'venue_ok' : 'artista_ok';
    await fetch(GHL + `/contacts/${ghlId}/tags`, { method: 'POST', headers: ghlHdr, body: JSON.stringify({ tags: [tag] }) }).catch(()=>{});

    // 3. Persistir ghl_contact_id en SB
    const patch = await fetch(SB + `/rest/v1/artistas?id=eq.${a.id}`, {
      method: 'PATCH', headers: sbHdr, body: JSON.stringify({ ghl_contact_id: ghlId })
    });
    if (!patch.ok) { fail++; console.log(c('red', '✗'), a.email, '· SB patch falló:', (await patch.text()).slice(0, 150)); continue; }

    ok++;
    if (ok % 5 === 0) process.stdout.write('.');
  }
  console.log(c('blue', `\n\nResultado: ${c('green', ok + ' OK')}, ${fail} fallos.\n`));
})().catch(err => { console.error(err); process.exit(1); });
