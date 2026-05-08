#!/usr/bin/env node
/**
 * Limpia tags rogue de TODOS los contactos en GHL.
 *
 * Spec oficial — únicos tags permitidos:
 *   artista_ok, follow_up, new_lead, new_artist, new_supplier, proposal, proveedor_ok
 *
 * Idioma/tipo/origen se modelan ahora como custom fields (contact_idioma,
 * contact_type, contact_origen), NO como tags.
 *
 * Cualquier otro tag se considera rogue y se borra.
 *
 * Uso:
 *   node scripts/cleanup-rogue-tags.js                  # dry run (solo lista)
 *   node scripts/cleanup-rogue-tags.js --apply          # aplica cambios
 *
 * Requiere: GHL_API_KEY (PIT con scopes contacts.readonly + contacts.write) + GHL_LOCATION_ID en .env
 */

import 'dotenv/config';

const ALLOWED_TAGS = new Set([
  'artista_ok',
  'follow_up',
  'new_lead',
  'new_artist',
  'new_supplier',
  'proposal',
  'proveedor_ok'
]);

const API = 'https://services.leadconnectorhq.com';
const TOKEN = process.env.GHL_API_KEY;
const LOC = process.env.GHL_LOCATION_ID;
const APPLY = process.argv.includes('--apply');
const TIPO_TO_FIELD = process.argv.includes('--tipo-to-field');

if (!TOKEN || !LOC) {
  console.error('Falta GHL_API_KEY o GHL_LOCATION_ID en env');
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json'
};

async function fetchAllContacts() {
  // Junta IDs de dos fuentes:
  //   1. GHL /contacts/search (visibles al PIT — típicamente solo recientes)
  //   2. Supabase artistas.ghl_contact_id (todos los artistas/proveedores con vínculo)
  // El PIT puede operar por id en contactos no visibles via search, así que esta
  // unión cubre el universo real.
  const ids = new Map(); // id → contacto (con tags)

  // Fuente 1: GHL search
  const pageLimit = 100;
  let searchAfter = null;
  while (true) {
    const body = { locationId: LOC, pageLimit };
    if (searchAfter) body.searchAfter = searchAfter;
    const r = await fetch(`${API}/contacts/search`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`POST /contacts/search ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    const batch = d.contacts || [];
    for (const c of batch) ids.set(c.id, c);
    if (batch.length < pageLimit) break;
    const last = batch[batch.length - 1];
    const ts = last.dateAdded ? new Date(last.dateAdded).getTime() : null;
    if (!ts || !last.id) break;
    searchAfter = [ts, last.id];
  }
  console.log(`  GHL search: ${ids.size} contactos`);

  // Fuente 2: Supabase artistas — completar IDs faltantes con GET /contacts/{id}
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (SB_URL && SB_KEY) {
    const r = await fetch(
      `${SB_URL}/rest/v1/artistas?select=ghl_contact_id&ghl_contact_id=not.is.null`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (r.ok) {
      const rows = await r.json();
      const missing = rows.map((row) => row.ghl_contact_id).filter((id) => id && !ids.has(id));
      console.log(`  Supabase artistas: ${rows.length} IDs (${missing.length} no vistos en search)`);
      // GET por contactId con concurrencia limitada
      const concurrency = 5;
      let i = 0;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const fetchOne = async (id) => {
        let attempt = 0;
        while (true) {
          const r2 = await fetch(`${API}/contacts/${id}`, { headers: HEADERS });
          if (r2.ok) {
            const d2 = await r2.json();
            if (d2.contact) ids.set(id, d2.contact);
            return;
          }
          if (r2.status === 429 && attempt < 5) {
            await sleep(1000 * Math.pow(2, attempt));
            attempt++;
            continue;
          }
          if (r2.status === 400 || r2.status === 404) return; // contacto huérfano, skip
          throw new Error(`GET ${r2.status}`);
        }
      };
      const workers = Array.from({ length: concurrency }, async () => {
        while (i < missing.length) {
          const idx = i++;
          try { await fetchOne(missing[idx]); } catch (e) { /* skip */ }
          if (idx % 50 === 0) process.stdout.write(`  fetch ${idx}/${missing.length}\r`);
        }
      });
      await Promise.all(workers);
      console.log(`  total tras unión: ${ids.size} contactos`);
    }
  }

  return Array.from(ids.values());
}

async function delTags(contactId, tags) {
  if (!tags.length) return;
  const r = await fetch(`${API}/contacts/${contactId}/tags`, {
    method: 'DELETE',
    headers: HEADERS,
    body: JSON.stringify({ tags })
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`DELETE tags ${r.status}: ${txt.slice(0, 200)}`);
  }
}

async function setTipoField(contactId, tipoValue) {
  const r = await fetch(`${API}/contacts/${contactId}`, {
    method: 'PUT',
    headers: HEADERS,
    body: JSON.stringify({
      customFields: [{ key: 'tipo', field_value: tipoValue }]
    })
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`PUT contact ${r.status}: ${txt.slice(0, 200)}`);
  }
}

(async () => {
  console.log(`=== Cleanup rogue tags ${APPLY ? '(APPLY)' : '(dry run)'} ===\n`);

  console.log('Descargando todos los contactos...');
  const contacts = await fetchAllContacts();
  console.log(`Total: ${contacts.length} contactos\n`);

  const stats = {
    contactsAffected: 0,
    tagsRemoved: {},
    tipoFieldsSet: 0,
    errors: 0
  };

  for (const c of contacts) {
    const tags = c.tags || [];
    const rogue = tags.filter(t => !ALLOWED_TAGS.has(t));
    if (!rogue.length) continue;

    stats.contactsAffected++;

    // Si --tipo-to-field, copiar tipo:X → custom field tipo=X antes de borrar
    if (TIPO_TO_FIELD && APPLY) {
      const tipoTag = rogue.find(t => t.startsWith('tipo:'));
      if (tipoTag) {
        const tipoValue = tipoTag.slice(5).charAt(0).toUpperCase() + tipoTag.slice(6);
        try {
          await setTipoField(c.id, tipoValue);
          stats.tipoFieldsSet++;
        } catch (e) {
          console.error(`[${c.id}] error tipo→field: ${e.message}`);
          stats.errors++;
        }
      }
    }

    for (const t of rogue) stats.tagsRemoved[t] = (stats.tagsRemoved[t] || 0) + 1;

    if (APPLY) {
      try {
        await delTags(c.id, rogue);
      } catch (e) {
        console.error(`[${c.id}] error: ${e.message}`);
        stats.errors++;
      }
    } else {
      console.log(`[${c.id}] ${c.email || c.firstName || '(sin email)'}: borraría ${rogue.length} tags → ${rogue.slice(0, 5).join(', ')}${rogue.length > 5 ? '…' : ''}`);
    }
  }

  console.log(`\n=== Resumen ===`);
  console.log(`Contactos afectados: ${stats.contactsAffected} / ${contacts.length}`);
  console.log(`Custom field tipo seteado: ${stats.tipoFieldsSet}`);
  console.log(`Errores: ${stats.errors}`);
  console.log(`\nTags rogue encontrados (${Object.keys(stats.tagsRemoved).length} distintos):`);
  Object.entries(stats.tagsRemoved)
    .sort((a, b) => b[1] - a[1])
    .forEach(([t, n]) => console.log(`  ${n.toString().padStart(5)}× ${t}`));

  if (!APPLY) {
    console.log(`\n→ Dry run. Para aplicar: node scripts/cleanup-rogue-tags.js --apply`);
    console.log(`→ Para preservar el valor de tag tipo:* en el custom field 'tipo' antes de borrar:`);
    console.log(`  node scripts/cleanup-rogue-tags.js --apply --tipo-to-field`);
  }
})();
