#!/usr/bin/env node
/**
 * Backfill del custom field `url_supabase` en contactos artista de GHL.
 *
 * Antes apuntaba a la URL REST cruda de Supabase (no navegable). Ahora debe
 * apuntar al panel admin: `${SITE_URL}/admin.html?artista=<uuid>` para que
 * Xavi pueda abrir la ficha del artista desde el contacto en GHL.
 *
 * Uso:
 *   node scripts/backfill-url-admin-artistas.js                # dry run
 *   node scripts/backfill-url-admin-artistas.js --apply        # aplica cambios
 *
 * Requiere en .env:
 *   GHL_API_KEY (PIT con scope contacts.write)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   SITE_URL (opcional; fallback https://eventos-barcelona.vercel.app)
 */

import 'dotenv/config';

const API = 'https://services.leadconnectorhq.com';
const TOKEN = process.env.GHL_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SITE_URL = process.env.SITE_URL || 'https://eventos-barcelona.vercel.app';
const APPLY = process.argv.includes('--apply');
const CONCURRENCY = 3;
const MAX_RETRIES = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Falta GHL_API_KEY, SUPABASE_URL o SUPABASE_SERVICE_KEY en env');
  process.exit(1);
}

const GHL_HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json'
};

const SB_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};

async function fetchArtistas() {
  const url = `${SUPABASE_URL}/rest/v1/artistas?select=id,email,ghl_contact_id&ghl_contact_id=not.is.null`;
  const r = await fetch(url, { headers: SB_HEADERS });
  if (!r.ok) throw new Error(`Supabase fetch ${r.status}: ${await r.text()}`);
  return await r.json();
}

async function updateGhlUrl(contactId, adminUrl) {
  let attempt = 0;
  while (true) {
    const r = await fetch(`${API}/contacts/${contactId}`, {
      method: 'PUT',
      headers: GHL_HEADERS,
      body: JSON.stringify({
        customFields: [{ key: 'url_supabase', field_value: adminUrl }]
      })
    });
    if (r.ok) return { status: 'ok' };

    const txt = await r.text();

    // 400 "Contact not found" → contacto huérfano en Supabase. No reintentar.
    if (r.status === 400 && /Contact not found/i.test(txt)) {
      return { status: 'missing', detail: txt.slice(0, 200) };
    }

    // 429 → rate limit, backoff exponencial
    if (r.status === 429 && attempt < MAX_RETRIES) {
      const delay = 1000 * Math.pow(2, attempt);
      attempt++;
      await sleep(delay);
      continue;
    }

    throw new Error(`PUT ${r.status}: ${txt.slice(0, 200)}`);
  }
}

async function runWithConcurrency(items, limit, worker) {
  const results = { ok: 0, missing: 0, errors: 0, missingIds: [] };
  let i = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      const it = items[idx];
      try {
        const out = await worker(it, idx);
        if (out?.status === 'missing') {
          results.missing++;
          results.missingIds.push(it.ghl_contact_id);
        } else {
          results.ok++;
        }
      } catch (e) {
        results.errors++;
        console.error(`[${it.ghl_contact_id}] ${it.email || ''}: ${e.message}`);
      }
    }
  });
  await Promise.all(runners);
  return results;
}

(async () => {
  console.log(`=== Backfill url_supabase → admin URL ${APPLY ? '(APPLY)' : '(dry run)'} ===`);
  console.log(`SITE_URL: ${SITE_URL}\n`);

  console.log('Leyendo artistas con ghl_contact_id desde Supabase...');
  const artistas = await fetchArtistas();
  console.log(`Total: ${artistas.length} artistas vinculados a GHL\n`);

  if (!APPLY) {
    artistas.slice(0, 10).forEach(a => {
      const adminUrl = `${SITE_URL}/admin.html?artista=${a.id}`;
      console.log(`[${a.ghl_contact_id}] ${a.email || '(sin email)'} → ${adminUrl}`);
    });
    if (artistas.length > 10) console.log(`… y ${artistas.length - 10} más`);
    console.log(`\n→ Dry run. Para aplicar: node scripts/backfill-url-admin-artistas.js --apply`);
    return;
  }

  const stats = await runWithConcurrency(artistas, CONCURRENCY, async (a) => {
    const adminUrl = `${SITE_URL}/admin.html?artista=${a.id}`;
    return await updateGhlUrl(a.ghl_contact_id, adminUrl);
  });

  console.log(`\n=== Resumen ===`);
  console.log(`Actualizados: ${stats.ok}`);
  console.log(`Huérfanos (contacto no existe en GHL): ${stats.missing}`);
  console.log(`Errores: ${stats.errors}`);
  if (stats.missingIds.length) {
    console.log(`\nIDs huérfanos en Supabase (revisar/limpiar ghl_contact_id):`);
    stats.missingIds.forEach((id) => console.log(`  ${id}`));
  }
})();
