#!/usr/bin/env node
/**
 * Limpia tags rogue de TODOS los contactos en GHL.
 *
 * Spec oficial — únicos tags permitidos:
 *   artista_ok, follow_up, new_lead, proposal, proveedor_ok
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
  const all = [];
  let page = 1;
  const pageSize = 100;
  while (true) {
    const url = `${API}/contacts/?locationId=${LOC}&limit=${pageSize}&page=${page}`;
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) throw new Error(`Fetch contacts ${r.status}: ${await r.text()}`);
    const d = await r.json();
    const batch = d.contacts || [];
    all.push(...batch);
    process.stdout.write(`  página ${page}: ${batch.length} contactos (total ${all.length})\r`);
    if (batch.length < pageSize) break;
    page++;
  }
  console.log('');
  return all;
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
