#!/usr/bin/env node
/**
 * Lista todos los custom fields configurados en la location de GHL.
 * Read-only — no modifica nada. Sirve de inventario antes de cleanup.
 *
 * Uso:
 *   node scripts/inspect-ghl-custom-fields.js
 *   node scripts/inspect-ghl-custom-fields.js --usage   # cuenta cuántos contactos tienen valor en cada campo
 */

import 'dotenv/config';

const API = 'https://services.leadconnectorhq.com';
const TOKEN = process.env.GHL_API_KEY;
const LOC = process.env.GHL_LOCATION_ID;
const WITH_USAGE = process.argv.includes('--usage');

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
    if (batch.length < pageSize) break;
    page++;
  }
  return all;
}

(async () => {
  console.log('=== Custom fields configurados en GHL location ===\n');
  const fields = await listCustomFields();
  console.log(`Total: ${fields.length} custom fields definidos\n`);

  const byModel = {};
  for (const f of fields) {
    const m = f.model || 'contact';
    if (!byModel[m]) byModel[m] = [];
    byModel[m].push(f);
  }

  for (const [model, list] of Object.entries(byModel)) {
    console.log(`\n--- model: ${model} (${list.length}) ---`);
    list.sort((a, b) => (a.fieldKey || '').localeCompare(b.fieldKey || ''));
    list.forEach((f) => {
      const opts = Array.isArray(f.picklistOptions) && f.picklistOptions.length
        ? ` opts=[${f.picklistOptions.map((o) => o.value || o).join(', ')}]`
        : '';
      console.log(`  ${(f.fieldKey || f.name).padEnd(35)} ${(f.dataType || '').padEnd(12)} ${f.name}${opts}`);
      if (f.id) console.log(`    id=${f.id}`);
    });
  }

  if (!WITH_USAGE) {
    console.log('\n(Para ver cuántos contactos tienen valor en cada campo: --usage)');
    return;
  }

  console.log('\n\nDescargando todos los contactos para medir uso...');
  const contacts = await fetchAllContacts();
  console.log(`Total contactos: ${contacts.length}\n`);

  const usage = {};
  const examples = {};
  for (const c of contacts) {
    const cf = c.customFields || [];
    for (const f of cf) {
      const key = f.id || f.key || f.fieldKey;
      if (!key) continue;
      const val = f.value ?? f.field_value;
      if (val === undefined || val === null || val === '' || (Array.isArray(val) && !val.length)) continue;
      usage[key] = (usage[key] || 0) + 1;
      if (!examples[key]) examples[key] = String(val).slice(0, 80);
    }
  }

  console.log('--- Uso por custom field ---');
  const fieldsById = Object.fromEntries(fields.map((f) => [f.id, f]));
  Object.entries(usage)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => {
      const f = fieldsById[k];
      const label = f ? `${f.fieldKey || f.name} (${f.name})` : k;
      console.log(`  ${String(n).padStart(5)}× ${label}`);
      console.log(`         ej: ${examples[k]}`);
    });

  const unusedDefined = fields.filter((f) => !usage[f.id]);
  if (unusedDefined.length) {
    console.log('\n--- Custom fields definidos pero SIN uso (candidatos a borrar) ---');
    unusedDefined.forEach((f) => console.log(`  ${f.fieldKey || f.name} — ${f.name}`));
  }
})();
