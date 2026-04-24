/**
 * Audit de la tabla Supabase `shows` vs el SHOW_CATALOG hardcoded en propuesta.html.
 *
 * Uso:
 *   node scripts/audit-shows-table.js           → dry run, sólo reporta
 *   node scripts/audit-shows-table.js --apply   → patchea las filas con fields vacíos
 *                                                 usando el valor hardcoded como fallback
 *
 * Contexto: el bug que descubrimos el 2026-04-23 (propuestas sin imágenes) vino
 * de filas en `shows` con `image_url` vacío. El código ya cae al hardcoded
 * (commit 858fcbb), pero conviene cerrar la BD para que el fallback deje de ser
 * necesario y los admins que leen la tabla no vean huecos.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APPLY = process.argv.includes('--apply');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_KEY en .env');
  process.exit(1);
}

// Fields cuyo vacío queremos cubrir con el hardcoded
const FIELDS = [
  { db: 'name',        hc: 'name' },
  { db: 'category',    hc: 'category' },
  { db: 'subcategory', hc: 'subcategory' },
  { db: 'description', hc: 'description' },
  { db: 'base_price',  hc: 'basePrice' },
  { db: 'price_note',  hc: 'priceNote' },
  { db: 'video_url',   hc: 'videoUrl' },
  { db: 'image_url',   hc: 'imageUrl' }
];

function isEmpty(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  // base_price: 0 puede ser legítimo (catálogo), no lo tratamos como vacío
  return false;
}

function extractCatalog() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'propuesta.html'), 'utf8');
  const start = html.indexOf('let SHOW_CATALOG = {');
  if (start === -1) throw new Error('No encuentro SHOW_CATALOG en propuesta.html');
  // El bloque termina con una línea `    };` (4 espacios + });
  const endMarker = '\n    };';
  const end = html.indexOf(endMarker, start);
  if (end === -1) throw new Error('No encuentro el cierre de SHOW_CATALOG');
  const block = html.slice(start, end + endMarker.length);
  // eval en sandbox: sólo hay un literal. Usamos Function en lugar de eval directo.
  const fn = new Function(block + ' return SHOW_CATALOG;');
  return fn();
}

async function fetchAllShows() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/shows?select=*&order=id`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function patchShow(id, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(patch)
  });
  if (!res.ok) throw new Error(`Patch ${id} → ${res.status}: ${await res.text()}`);
}

(async () => {
  console.log(`Mode: ${APPLY ? 'APPLY (escribirá en Supabase)' : 'DRY RUN (sólo reporta)'}`);
  console.log('');

  const catalog = extractCatalog();
  const hcIds = new Set(Object.keys(catalog));
  console.log(`Hardcoded SHOW_CATALOG: ${hcIds.size} shows`);

  const rows = await fetchAllShows();
  console.log(`Supabase shows: ${rows.length} filas`);
  console.log('');

  const notInHardcoded = [];
  const gapsByRow = [];     // {id, fields: [{db, hc, currentValue, hardcodedValue}]}
  let fullyPopulated = 0;

  for (const row of rows) {
    const hc = catalog[row.id];
    if (!hc) {
      notInHardcoded.push(row);
      continue;
    }
    const gaps = FIELDS.filter(f => isEmpty(row[f.db]) && !isEmpty(hc[f.hc]));
    if (gaps.length === 0) { fullyPopulated++; continue; }
    gapsByRow.push({ id: row.id, fields: gaps.map(f => ({
      db: f.db,
      hc: f.hc,
      currentValue: row[f.db],
      hardcodedValue: hc[f.hc]
    })) });
  }

  console.log(`Supabase rows with all fields populated: ${fullyPopulated}`);
  console.log(`Supabase rows with at least 1 empty field that hardcoded can fill: ${gapsByRow.length}`);
  console.log(`Supabase rows not present in hardcoded catalog: ${notInHardcoded.length}`);
  console.log('');

  if (gapsByRow.length) {
    console.log('--- Filas con gaps rellenables ---');
    for (const { id, fields } of gapsByRow) {
      console.log(`  ${id}`);
      for (const f of fields) {
        const hcPreview = String(f.hardcodedValue).slice(0, 80);
        console.log(`    ${f.db}: "${f.currentValue ?? ''}" → "${hcPreview}${String(f.hardcodedValue).length > 80 ? '…' : ''}"`);
      }
    }
    console.log('');
  }

  if (notInHardcoded.length) {
    console.log('--- Filas en Supabase que no existen en hardcoded (requieren revisión manual) ---');
    for (const row of notInHardcoded) {
      const missing = FIELDS.filter(f => isEmpty(row[f.db])).map(f => f.db);
      console.log(`  ${row.id} (${row.name || 'sin nombre'}) — campos vacíos: ${missing.join(', ') || 'ninguno'}`);
    }
    console.log('');
  }

  if (!APPLY) {
    console.log('Dry run — no se escribe nada. Usar --apply para patchear las filas con gaps rellenables.');
    return;
  }

  if (!gapsByRow.length) {
    console.log('Nada que aplicar.');
    return;
  }

  console.log(`Aplicando patch a ${gapsByRow.length} filas...`);
  let ok = 0, err = 0;
  for (const { id, fields } of gapsByRow) {
    const patch = {};
    for (const f of fields) patch[f.db] = f.hardcodedValue;
    try {
      await patchShow(id, patch);
      ok++;
      process.stdout.write('.');
    } catch (e) {
      err++;
      console.log(`\n  ! ${id}: ${e.message}`);
    }
  }
  console.log('');
  console.log(`Aplicado. OK: ${ok}, errores: ${err}`);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
