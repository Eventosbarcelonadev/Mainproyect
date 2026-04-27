/**
 * Sync de proveedores: GHL contactos con tag 'tipo:proveedor' → tabla
 * Supabase artistas con tipo='proveedor'.
 *
 * Idempotente — re-correr no duplica (upsert por ghl_contact_id). Si un
 * contacto ya está en artistas (pq fue importado del pipeline ARTISTAS),
 * solo actualiza tipo.
 *
 * Uso:
 *   node scripts/import-ghl-proveedores-to-supabase.js              # dry-run
 *   node scripts/import-ghl-proveedores-to-supabase.js --apply       # aplica
 */

require('dotenv').config();

const TOKEN = process.env.GHL_API_KEY;
const LOC = process.env.GHL_LOCATION_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APPLY = process.argv.includes('--apply');

if (!TOKEN || !LOC || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Falta env: GHL_API_KEY, GHL_LOCATION_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const GHL = 'https://services.leadconnectorhq.com';
const GHL_HEAD = {
  Authorization: `Bearer ${TOKEN}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json'
};
const SB_HEAD = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};

async function fetchProveedoresFromGHL() {
  const all = [];
  let searchAfter = null;
  while (true) {
    const body = {
      locationId: LOC,
      pageLimit: 100,
      filters: [{ field: 'tags', operator: 'contains', value: 'tipo:proveedor' }]
    };
    if (searchAfter) body.searchAfter = searchAfter;

    const r = await fetch(`${GHL}/contacts/search`, {
      method: 'POST',
      headers: GHL_HEAD,
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`GHL search ${r.status}: ${await r.text()}`);
    const d = await r.json();
    const contacts = d.contacts || [];
    if (!contacts.length) break;
    all.push(...contacts);
    searchAfter = contacts[contacts.length - 1]?.searchAfter;
    if (!searchAfter || all.length >= (d.total || all.length)) break;
  }
  return all;
}

function buildRow(c) {
  const firstName = c.firstName || '';
  const lastName = c.lastName || '';
  const nombre = [firstName, lastName].filter(Boolean).join(' ').trim() || c.companyName || '(sin nombre)';
  const email = c.email && c.email.trim()
    ? c.email.trim()
    : `no-email-${c.id}@placeholder.eventosbarcelona.local`;
  return {
    nombre,
    nombre_artistico: '',
    compania: c.companyName || '',
    email,
    telefono: c.phone || '',
    ciudad: c.city || '',
    disciplinas: ['Proveedor'],
    bio_show: '',
    ghl_contact_id: c.id,
    tipo: 'proveedor',
    origen: 'ghl-proveedor-import'
  };
}

async function upsertBatch(rows) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/artistas?on_conflict=ghl_contact_id`, {
    method: 'POST',
    headers: { ...SB_HEAD, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows)
  });
  if (!r.ok) throw new Error(`Upsert ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

(async () => {
  console.log(`=== Import GHL proveedores → Supabase (${APPLY ? 'APPLY' : 'dry-run'}) ===\n`);

  // Snapshot before
  const beforeR = await fetch(`${SUPABASE_URL}/rest/v1/artistas?tipo=eq.proveedor&select=id`, {
    headers: SB_HEAD
  });
  const beforeRows = await beforeR.json();
  console.log(`Filas artistas tipo=proveedor ANTES: ${beforeRows.length}`);

  console.log('\nTrayendo contactos GHL con tag tipo:proveedor...');
  const contacts = await fetchProveedoresFromGHL();
  console.log(`  Total: ${contacts.length}`);

  // Dedup by id (defensive)
  const seen = new Set();
  const unique = contacts.filter(c => {
    if (!c.id || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
  console.log(`  Únicos: ${unique.length}`);

  const rows = unique.map(buildRow);
  const placeholders = rows.filter(r => r.email.endsWith('@placeholder.eventosbarcelona.local')).length;
  console.log(`  Filas construidas: ${rows.length} (con email placeholder: ${placeholders})\n`);

  console.log('Sample 5:');
  for (const r of rows.slice(0, 5)) {
    console.log(`  - ${r.nombre.padEnd(35)} | ${r.compania || '-'} | ${r.email}`);
  }

  if (!APPLY) {
    console.log('\n(dry-run — para escribir, correr con --apply)');
    return;
  }

  console.log('\nUpserting en lotes de 50...');
  let ok = 0, err = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const slice = rows.slice(i, i + 50);
    try {
      await upsertBatch(slice);
      ok += slice.length;
      console.log(`  ${ok}/${rows.length}`);
    } catch (e) {
      err += slice.length;
      console.error(`  FAIL lote ${i}: ${e.message}`);
    }
  }

  const afterR = await fetch(`${SUPABASE_URL}/rest/v1/artistas?tipo=eq.proveedor&select=id`, {
    headers: SB_HEAD
  });
  const afterRows = await afterR.json();
  console.log(`\nFilas artistas tipo=proveedor DESPUÉS: ${afterRows.length}`);
  console.log(`Done. ok=${ok}  err=${err}`);
})().catch(e => { console.error(e); process.exit(1); });
