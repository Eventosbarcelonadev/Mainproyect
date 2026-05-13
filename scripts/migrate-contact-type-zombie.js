#!/usr/bin/env node
/**
 * Migración del custom field "Contact Type" zombie al nuevo.
 *
 * Background: el setup --apply de 2026-05-13 regeneró el field contact_type
 * (id viejo kkH9STB88oCQv0CD3sKs → id nuevo 0LBySc0XI7qKiPQVrQs9). Los
 * contactos previos siguen referenciando el id viejo, y GHL no expone ese
 * field en customFields listing ni permite borrarlo. Mi código escribe al
 * nuevo via key=contact_type, así que contactos nuevos quedan bien.
 *
 * Este script propaga el valor del zombie al nuevo (via PUT con key) para
 * que el workflow GHL de Ramiro (que copia contact_type → contact.type
 * standard) tenga datos también para los contactos viejos.
 *
 * Uso:
 *   node scripts/migrate-contact-type-zombie.js              # dry run
 *   node scripts/migrate-contact-type-zombie.js --apply      # ejecutar
 */

import 'dotenv/config';

const API = 'https://services.leadconnectorhq.com';
const TOKEN = process.env.GHL_API_KEY;
const LOC = process.env.GHL_LOCATION_ID;
const APPLY = process.argv.includes('--apply');

const ZOMBIE_ID = 'kkH9STB88oCQv0CD3sKs';
const NEW_ID = '0LBySc0XI7qKiPQVrQs9';

if (!TOKEN || !LOC) {
  console.error('Faltan env vars GHL_API_KEY / GHL_LOCATION_ID');
  process.exit(1);
}

const H = {
  Authorization: `Bearer ${TOKEN}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json'
};

async function searchAllContacts() {
  const all = [];
  let searchAfter = null;
  let page = 1;
  while (true) {
    const body = { locationId: LOC, pageLimit: 100 };
    if (searchAfter) body.searchAfter = searchAfter;
    const r = await fetch(`${API}/contacts/search`, {
      method: 'POST', headers: H, body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`search ${r.status}: ${await r.text()}`);
    const d = await r.json();
    const batch = d.contacts || [];
    all.push(...batch);
    if (batch.length < 100) break;
    const last = batch[batch.length - 1];
    searchAfter = last.searchAfter || last.sort;
    if (!searchAfter) break;
    page++;
    if (page > 50) break; // safety
  }
  return all;
}

async function updateContactType(contactId, value) {
  const r = await fetch(`${API}/contacts/${contactId}`, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ customFields: [{ key: 'contact_type', field_value: value }] })
  });
  return r.ok;
}

(async () => {
  console.log(`=== Migración contact_type zombie → nuevo ${APPLY ? '(APPLY)' : '(dry run)'} ===\n`);
  const baseList = await searchAllContacts();
  console.log(`Total contactos (search): ${baseList.length}`);
  console.log(`Haciendo GET individual de cada uno para detectar zombie field...\n`);

  // /contacts/search oculta el zombie field — necesitamos GET individual
  const contacts = [];
  for (let i = 0; i < baseList.length; i++) {
    const r = await fetch(`${API}/contacts/${baseList[i].id}`, { headers: H });
    if (r.ok) contacts.push((await r.json()).contact);
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${baseList.length} GET completados`);
  }
  console.log(`Total con detalle: ${contacts.length}\n`);

  const stats = { zombieOnly: 0, bothMatch: 0, bothMismatch: 0, newOnly: 0, neither: 0, migrated: 0, failed: 0 };
  const toMigrate = [];

  for (const c of contacts) {
    const cf = c.customFields || [];
    const zombieVal = cf.find(f => f.id === ZOMBIE_ID)?.value;
    const newVal = cf.find(f => f.id === NEW_ID)?.value;

    if (zombieVal && !newVal) {
      stats.zombieOnly++;
      toMigrate.push({ id: c.id, name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email, value: zombieVal });
    } else if (zombieVal && newVal && zombieVal === newVal) {
      stats.bothMatch++;
    } else if (zombieVal && newVal && zombieVal !== newVal) {
      stats.bothMismatch++;
      console.log(`  ⚠ MISMATCH ${c.id} (${c.email}): zombie='${zombieVal}' new='${newVal}'`);
    } else if (!zombieVal && newVal) {
      stats.newOnly++;
    } else {
      stats.neither++;
    }
  }

  console.log('Distribución:');
  console.log(`  zombieOnly (a migrar): ${stats.zombieOnly}`);
  console.log(`  bothMatch (OK):        ${stats.bothMatch}`);
  console.log(`  bothMismatch:          ${stats.bothMismatch}`);
  console.log(`  newOnly:               ${stats.newOnly}`);
  console.log(`  neither (sin tipo):    ${stats.neither}`);

  if (toMigrate.length === 0) {
    console.log('\nNada que migrar.');
    return;
  }

  console.log(`\n--- ${toMigrate.length} contactos a migrar (sample primeros 10) ---`);
  toMigrate.slice(0, 10).forEach(x => console.log(`  ${x.id}  ${x.name.padEnd(35)}  →  ${x.value}`));

  if (!APPLY) {
    console.log(`\n→ Dry run. Para ejecutar: --apply`);
    return;
  }

  console.log('\nMigrando...');
  for (const x of toMigrate) {
    try {
      const ok = await updateContactType(x.id, x.value);
      if (ok) {
        stats.migrated++;
        process.stdout.write('.');
      } else {
        stats.failed++;
        console.log(`\n  ✗ ${x.id}`);
      }
    } catch (e) {
      stats.failed++;
      console.log(`\n  ✗ ${x.id}: ${e.message}`);
    }
  }
  console.log(`\n\nMigrados: ${stats.migrated}  Fallidos: ${stats.failed}`);
})();
