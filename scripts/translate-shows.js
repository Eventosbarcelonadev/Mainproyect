/**
 * Aplica traducciones ES/EN de shows a Supabase + sincroniza GHL.
 *
 * El JSON con las traducciones se genera manualmente (Claude lo escribe en
 * conversación) y se guarda en data/shows-translations.json con formato:
 *   [
 *     {
 *       "id": "rumba-catalana",
 *       "ghl_show_id": "6a0470bd03438fcf8025cd39",
 *       "proposed": {
 *         "name": "Rumba Catalana",
 *         "name_en": "Catalan Rumba",
 *         "subcategory": "Rumba",
 *         "subcategory_en": "Rumba",
 *         "description": "...",
 *         "description_en": "...",
 *         "price_note": "...",
 *         "price_note_en": "..."
 *       }
 *     },
 *     ...
 *   ]
 *
 * Uso:
 *   node scripts/translate-shows.js --apply              # aplica el JSON a SB+GHL
 *   node scripts/translate-shows.js --apply --dry        # imprime cambios sin escribir
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();
const GHL_TOKEN = (process.env.GHL_API_KEY || '').trim();
const GHL_LOC = (process.env.GHL_LOCATION_ID || '').trim();

const OUT_PATH = path.join(__dirname, '..', 'data', 'shows-translations.json');
const GHL_API = 'https://services.leadconnectorhq.com';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY = args.includes('--dry');

if (!APPLY) {
  console.log('Uso: node scripts/translate-shows.js --apply [--dry]');
  console.log('');
  console.log('El JSON con propuestas debe existir en data/shows-translations.json');
  console.log('Se genera manualmente desde Claude (no necesita ANTHROPIC_API_KEY).');
  process.exit(0);
}
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Faltan SUPABASE_URL/SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!fs.existsSync(OUT_PATH)) { console.error(`No existe ${OUT_PATH}`); process.exit(1); }

const sbHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

async function sbPatch(qpath, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${qpath}`, {
    method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=representation' }, body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`SB PATCH ${qpath} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function ghlPut(path, body) {
  if (!GHL_TOKEN || !GHL_LOC) return { ok: false, skipped: 'missing_ghl_config' };
  // locationId va como query param para custom_objects records (no en body)
  const sep = path.includes('?') ? '&' : '?';
  const url = `${GHL_API}${path}${sep}locationId=${encodeURIComponent(GHL_LOC)}`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${GHL_TOKEN}`, Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  });
  return { ok: r.ok, status: r.status, body: await r.text() };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
  console.log(`${DRY ? '[DRY] ' : ''}Aplicando ${data.length} traducciones${DRY ? ' (no se escribe)' : ' a Supabase y GHL'}...\n`);

  let okSB = 0, errSB = 0, okGHL = 0, errGHL = 0, skipGHL = 0;
  for (const item of data) {
    const p = item.proposed || {};
    const patch = {
      name: p.name, name_en: p.name_en,
      description: p.description, description_en: p.description_en,
      subcategory: p.subcategory, subcategory_en: p.subcategory_en,
      price_note: p.price_note, price_note_en: p.price_note_en
    };
    if (DRY) {
      console.log(`  [${item.id}] name="${p.name}"  name_en="${p.name_en}"`);
      okSB++;
      continue;
    }
    try {
      await sbPatch(`shows?id=eq.${encodeURIComponent(item.id)}`, patch);
      okSB++;
    } catch (e) {
      console.log(`  ✗ SB ${item.id}: ${e.message.slice(0, 120)}`);
      errSB++;
      continue;
    }
    if (item.ghl_show_id) {
      const g = await ghlPut(`/objects/custom_objects.shows/records/${encodeURIComponent(item.ghl_show_id)}`, {
        properties: {
          nombre_show: p.name || '',
          descripcion_show: p.description || ''
        }
      });
      if (g.ok) okGHL++;
      else { errGHL++; console.log(`  ⚠ GHL ${item.id}: ${g.status} ${(g.body || '').slice(0, 100)}`); }
    } else skipGHL++;

    if ((okSB + errSB) % 20 === 0) process.stdout.write(`  Progreso: ${okSB + errSB}/${data.length}\r`);
  }
  console.log(`\n✓ SB ok=${okSB} err=${errSB} | GHL ok=${okGHL} err=${errGHL} skipped=${skipGHL}`);
}

main().catch(e => { console.error('\n✗', e.message); process.exit(1); });
