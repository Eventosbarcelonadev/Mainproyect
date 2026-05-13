#!/usr/bin/env node
/**
 * Borra ciegamente una lista cerrada de tags rogue legacy en TODOS los
 * contactos artistas (vía ghl_contact_id de Supabase).
 *
 * Necesario porque el PIT actual no tiene scope contacts.readonly, así que
 * /contacts/search y GET /contacts/{id} solo ven los contactos creados por
 * el propio PIT (4 visibles). PUT y DELETE por id sí funcionan en cualquier
 * contacto, por lo que un DELETE idempotente sobre los IDs conocidos
 * limpia el resto.
 *
 * Tags borrados:
 *   tipo:cliente, tipo:artista, tipo:proveedor,
 *   origen:web-elementor, origen:form, origen_form, form:contacto-web,
 *   info_incompleta, info_completa
 *
 * Nota: `lang:es` y `lang:en` SÍ son válidos (los setean los forms web
 * para que GHL pueda enrutar workflows por idioma). No incluirlos aquí.
 *
 * Uso:
 *   node scripts/force-delete-rogue-tags.js                # dry run
 *   node scripts/force-delete-rogue-tags.js --apply        # aplica
 */

import 'dotenv/config';

const API = 'https://services.leadconnectorhq.com';
const TOKEN = process.env.GHL_API_KEY;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const APPLY = process.argv.includes('--apply');

if (!TOKEN || !SB_URL || !SB_KEY) {
  console.error('Falta GHL_API_KEY, SUPABASE_URL o SUPABASE_SERVICE_KEY en env');
  process.exit(1);
}

const ROGUE_TAGS = [
  'tipo:cliente', 'tipo:artista', 'tipo:proveedor',
  'origen:web-elementor', 'origen:form', 'origen_form',
  'form:contacto-web',
  'info_incompleta', 'info_completa'
];

const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json'
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function deleteTags(contactId) {
  let attempt = 0;
  while (true) {
    const r = await fetch(`${API}/contacts/${contactId}/tags`, {
      method: 'DELETE',
      headers: HEADERS,
      body: JSON.stringify({ tags: ROGUE_TAGS })
    });
    if (r.ok) return { status: 'ok' };
    const txt = await r.text();
    if (r.status === 400 && /Contact not found/i.test(txt)) return { status: 'missing' };
    if (r.status === 429 && attempt < 5) {
      await sleep(1000 * Math.pow(2, attempt));
      attempt++;
      continue;
    }
    throw new Error(`DELETE ${r.status}: ${txt.slice(0, 150)}`);
  }
}

(async () => {
  console.log(`=== Force delete rogue tags ${APPLY ? '(APPLY)' : '(dry run)'} ===`);
  console.log(`Tags a borrar: ${ROGUE_TAGS.join(', ')}\n`);

  console.log('Leyendo IDs de Supabase...');
  const r = await fetch(
    `${SB_URL}/rest/v1/artistas?select=ghl_contact_id&ghl_contact_id=not.is.null`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  const ids = [...new Set(rows.map((x) => x.ghl_contact_id).filter(Boolean))];
  console.log(`Total IDs únicos: ${ids.length}\n`);

  if (!APPLY) {
    console.log(`→ Dry run. Borraría ${ROGUE_TAGS.length} tags en hasta ${ids.length} contactos.`);
    console.log(`→ Para aplicar: node scripts/force-delete-rogue-tags.js --apply`);
    return;
  }

  const stats = { ok: 0, missing: 0, errors: 0 };
  const concurrency = 3;
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < ids.length) {
      const idx = i++;
      try {
        const out = await deleteTags(ids[idx]);
        if (out.status === 'missing') stats.missing++;
        else stats.ok++;
      } catch (e) {
        stats.errors++;
        console.error(`[${ids[idx]}] ${e.message}`);
      }
      if (idx % 25 === 0) process.stdout.write(`  procesados ${idx + 1}/${ids.length}\r`);
    }
  });
  await Promise.all(workers);

  console.log(`\n\n=== Resumen ===`);
  console.log(`Procesados OK: ${stats.ok}`);
  console.log(`Huérfanos (no existen en GHL): ${stats.missing}`);
  console.log(`Errores: ${stats.errors}`);
})();
