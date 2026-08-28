#!/usr/bin/env node
/**
 * Setup 2 custom fields TEXT en GHL para foto URL (bug 3 sync fotos):
 *   - Contact: `Foto Artista URL` → fieldKey contact.foto_artista_url
 *   - Custom object shows: `Foto Show URL` → fieldKey custom_objects.shows.foto_show_url
 *
 * Idempotente. Ejecutar:
 *   node scripts/setup-foto-url-fields.js           # dry run
 *   node scripts/setup-foto-url-fields.js --apply
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

async function listContactFields() {
  const r = await fetch(`${API}/locations/${LOC}/customFields`, { headers: HEADERS });
  if (!r.ok) throw new Error(`GET contact fields ${r.status}: ${await r.text()}`);
  return (await r.json()).customFields || [];
}

async function listShowsFields() {
  const key = 'custom_objects.shows';
  const r = await fetch(`${API}/custom-fields/object-key/${encodeURIComponent(key)}?locationId=${LOC}`, {
    headers: HEADERS
  });
  if (!r.ok) throw new Error(`GET shows fields ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.fields || d.customFields || [];
}

async function createContactField(payload) {
  const r = await fetch(`${API}/locations/${LOC}/customFields`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify(payload)
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`POST contact field ${r.status}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}

async function createShowsField(payload) {
  const r = await fetch(`${API}/custom-fields/`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify(payload)
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`POST shows field ${r.status}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}

(async () => {
  console.log(`=== Setup Foto URL fields ${APPLY ? '(APPLY)' : '(dry run)'} ===\n`);

  // 1. Contact: Foto Artista URL
  const contactFields = await listContactFields();
  const contactKeys = ['contact.foto_artista_url', 'foto_artista_url'];
  const existingContact = contactFields.find((f) =>
    contactKeys.includes(f.fieldKey) || /foto\s*artista\s*url/i.test(f.name || '')
  );
  if (existingContact) {
    console.log(`✓ Contact "Foto Artista URL" ya existe · id=${existingContact.id} · fieldKey=${existingContact.fieldKey}`);
  } else if (APPLY) {
    const created = await createContactField({
      name: 'Foto Artista URL',
      dataType: 'TEXT',
      placeholder: 'https://…',
      model: 'contact'
    });
    const f = created.customField || created;
    console.log(`+ Contact "Foto Artista URL" creado · id=${f.id} · fieldKey=${f.fieldKey}`);
  } else {
    console.log('· Contact "Foto Artista URL" NO existe · se crearía (dry run)');
  }

  // 2. Custom object shows: Foto Show URL
  const showsFields = await listShowsFields();
  const showsKeys = ['custom_objects.shows.foto_show_url', 'foto_show_url'];
  const existingShow = showsFields.find((f) =>
    showsKeys.includes(f.fieldKey) || /foto\s*show\s*url/i.test(f.name || '')
  );
  if (existingShow) {
    console.log(`✓ Shows "Foto Show URL" ya existe · id=${existingShow.id} · fieldKey=${existingShow.fieldKey}`);
  } else if (APPLY) {
    // parentId es el folder default de shows fields (mismo para todos los campos existentes)
    const parentId = showsFields[0]?.parentId;
    if (!parentId) throw new Error('No parentId found in shows fields');
    const created = await createShowsField({
      locationId: LOC,
      name: 'Foto Show URL',
      description: 'URL pública de la portada del show (Supabase Storage). Se rellena desde /admin al aprobar.',
      dataType: 'TEXT',
      placeholder: 'https://…',
      fieldKey: 'foto_show_url',
      objectKey: 'custom_objects.shows',
      parentId
    });
    const f = created.field || created.customField || created;
    console.log(`+ Shows "Foto Show URL" creado · id=${f.id} · fieldKey=${f.fieldKey}`);
  } else {
    console.log('· Shows "Foto Show URL" NO existe · se crearía (dry run)');
  }

  console.log(`\n${APPLY ? 'Aplicado.' : 'Dry run. Ejecutá con --apply para crear.'}`);
})();
