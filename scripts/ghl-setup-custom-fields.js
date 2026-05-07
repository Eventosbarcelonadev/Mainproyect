#!/usr/bin/env node
/**
 * Setup de custom fields en GHL location.
 *
 * - Crea `contact_type` (SINGLE_OPTIONS: Cliente, Artista, Proveedor) si no existe.
 * - Borra `contact.id` (NUMERICAL) huérfano si existe.
 *
 * Idempotente: ejecutarlo varias veces no rompe nada.
 *
 * Uso:
 *   node scripts/ghl-setup-custom-fields.js                # dry run
 *   node scripts/ghl-setup-custom-fields.js --apply        # aplica cambios
 */

import 'dotenv/config';

const API = 'https://services.leadconnectorhq.com';
const TOKEN = process.env.GHL_API_KEY;
const LOC = process.env.GHL_LOCATION_ID;
const APPLY = process.argv.includes('--apply');

if (!TOKEN || !LOC) {
  console.error('Falta GHL_API_KEY o GHL_LOCATION_ID en env');
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json'
};

async function listCustomFields() {
  const r = await fetch(`${API}/locations/${LOC}/customFields`, { headers: HEADERS });
  if (!r.ok) throw new Error(`GET customFields ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.customFields || [];
}

async function createCustomField(payload) {
  const r = await fetch(`${API}/locations/${LOC}/customFields`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(payload)
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`POST customFields ${r.status}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}

async function deleteCustomField(id) {
  const r = await fetch(`${API}/locations/${LOC}/customFields/${id}`, {
    method: 'DELETE',
    headers: HEADERS
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`DELETE customField ${id} ${r.status}: ${txt.slice(0, 200)}`);
  }
}

(async () => {
  console.log(`=== Setup custom fields GHL ${APPLY ? '(APPLY)' : '(dry run)'} ===\n`);

  const fields = await listCustomFields();

  // -- 1. Crear contact_type si no existe --
  const typeKeys = ['contact_type', 'contact.contact_type'];
  const existingType = fields.find((f) => typeKeys.includes(f.fieldKey));
  if (existingType) {
    console.log(`✓ contact_type ya existe (id=${existingType.id})`);
  } else {
    const payload = {
      name: 'Contact Type',
      dataType: 'SINGLE_OPTIONS',
      placeholder: '',
      position: 0,
      model: 'contact',
      options: ['Cliente', 'Artista', 'Proveedor']
    };
    if (APPLY) {
      const created = await createCustomField(payload);
      console.log(`✓ contact_type creado (id=${created.customField?.id || created.id || '?'})`);
    } else {
      console.log(`→ crearía contact_type SINGLE_OPTIONS [Cliente, Artista, Proveedor]`);
    }
  }

  // -- 2. Borrar contact.id (NUMERICAL) huérfano --
  const orphan = fields.find((f) => f.fieldKey === 'contact.id' || (f.name === 'id' && f.dataType === 'NUMERICAL'));
  if (orphan) {
    if (APPLY) {
      await deleteCustomField(orphan.id);
      console.log(`✓ borrado custom field huérfano "id" (was id=${orphan.id})`);
    } else {
      console.log(`→ borraría custom field huérfano "id" (id=${orphan.id})`);
    }
  } else {
    console.log(`✓ no hay custom field "id" huérfano`);
  }

  if (!APPLY) console.log(`\n→ Dry run. Para aplicar: --apply`);
})();
