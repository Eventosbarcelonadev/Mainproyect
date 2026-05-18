/**
 * Aplica el plan ghl-artistas-sync-plan.json a GHL.
 *
 * Por defecto DRY-RUN. Para escribir realmente: node scripts/apply-ghl-artistas-sync.js --apply
 *
 * Operaciones:
 *   1. Para cada artista del sheet nuevo (158): UPSERT.
 *      - Si NO existe en GHL (match por email, fallback nombre+tel): CREATE
 *      - Si existe: UPDATE (pisar nombre, email, phone; añadir tag `artista_ok`)
 *      - Custom fields: contact_type=Artista, shows_vinculados, categoria_artista, subcategoria_artista
 *   2. Para cada GHL contact orphan (tag `artista_ok` pero no en sheet):
 *      - quitar tag `artista_ok`, añadir tag `artista_archivado`
 *
 * Lee la lista de orphans del plan ya generado.
 *
 * Custom field IDs (de memoria project_ghl_spec — verificados via /customFields):
 *   contact_type            0LBySc0XI7qKiPQVrQs9   (SINGLE_OPTIONS Cliente/Artista/Proveedor)
 *   shows_vinculados        (LARGE_TEXT — se resuelve dinámicamente)
 *   categoria_artista       O4u824Z7LAxSwSMm0YqE
 *   subcategoria_artista    A8CeeHJRdvK7YEakH6bV
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GHL_API_KEY;
const LOCATION_ID = process.env.GHL_LOCATION_ID;
const BASE = 'https://services.leadconnectorhq.com';
const APPLY = process.argv.includes('--apply');

const NEW = require('../data/xavi-shows-artistas.json');
const PLAN = require('../data/ghl-artistas-sync-plan.json');
const REPORT_PATH = path.join(__dirname, '..', 'data', `ghl-artistas-sync-report-${new Date().toISOString().slice(0,10)}.json`);

const CONTACT_TYPE_FIELD_ID = '0LBySc0XI7qKiPQVrQs9';
const CONTACT_TYPE_VALUE = 'Artista';
const CATEGORIA_ARTISTA_ID = 'O4u824Z7LAxSwSMm0YqE';
const SUBCATEGORIA_ARTISTA_ID = 'A8CeeHJRdvK7YEakH6bV';
// shows_vinculados id discovered at runtime
let SHOWS_VINCULADOS_ID = null;

function normEmail(s) { return String(s || '').trim().toLowerCase().replace(/[>\s]+$/g, ''); }
function normPhone(s) { return String(s || '').replace(/\D/g, ''); }
function clean(s) { return String(s || '').replace(/[‪‫‬‭‮‎‏]/g, '').trim(); }

function buildCustomFields(artist) {
  // Aggregate macros and subs from artist's shows
  const macros = new Set();
  for (const s of artist.shows) macros.add(s.macro);
  const shows_text = artist.shows
    .map(s => `[${s.macro}] ${s.name}`)
    .join('\n');

  // Subs: need the original show records (artist.shows only has {macro, name})
  // We re-lookup against NEW.shows to get sub.
  const subs = new Set();
  for (const showRef of artist.shows) {
    const full = NEW.shows.find(s => s.name === showRef.name && s.macro === showRef.macro);
    if (full && full.sub) subs.add(full.sub);
  }

  const fields = [
    { id: CONTACT_TYPE_FIELD_ID, key: 'contact_type', field_value: CONTACT_TYPE_VALUE },
    { id: CATEGORIA_ARTISTA_ID, key: 'categoria_artista', field_value: [...macros].sort().join(', ') },
    { id: SUBCATEGORIA_ARTISTA_ID, key: 'subcategoria_artista', field_value: [...subs].sort().join(', ') },
  ];
  if (SHOWS_VINCULADOS_ID) {
    fields.push({ id: SHOWS_VINCULADOS_ID, key: 'shows_vinculados', field_value: shows_text });
  }
  return fields;
}

async function ghl(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${res.status}: ${text.substring(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function resolveCustomFieldIds() {
  const data = await ghl(`/locations/${LOCATION_ID}/customFields`);
  const list = data.customFields || [];
  for (const f of list) {
    if (f.fieldKey === 'contact.shows_vinculados') SHOWS_VINCULADOS_ID = f.id;
  }
  console.log(`  shows_vinculados id: ${SHOWS_VINCULADOS_ID || 'NOT FOUND (will skip)'}`);
}

async function searchAll() {
  const all = [];
  let startAfter = null, startAfterId = null;
  while (true) {
    const body = { locationId: LOCATION_ID, pageLimit: 100, filters: [] };
    if (startAfter && startAfterId) body.searchAfter = [startAfter, startAfterId];
    const data = await ghl(`/contacts/search`, { method: 'POST', body: JSON.stringify(body) });
    const contacts = data.contacts || [];
    all.push(...contacts);
    if (contacts.length < 100) break;
    const last = contacts[contacts.length - 1];
    startAfter = last.dateAdded ? new Date(last.dateAdded).getTime() : null;
    startAfterId = last.id;
    if (!startAfter || !startAfterId) break;
  }
  return all;
}

function buildContactPayload(artist, existingTags = []) {
  const tags = [...new Set([...existingTags.filter(t => t !== 'artista_archivado'), 'artista_ok'])];
  const first = artist.nombre.split(/\s+/)[0] || artist.nombre;
  const lastParts = artist.nombre.split(/\s+/).slice(1);
  const last = lastParts.join(' ');
  const payload = {
    locationId: LOCATION_ID,
    firstName: first,
    lastName: last || undefined,
    name: artist.nombre,
    tags,
    customFields: buildCustomFields(artist)
  };
  if (artist.email) payload.email = artist.email;
  if (artist.telefono) payload.phone = clean(artist.telefono);
  return payload;
}

async function createContact(artist) {
  const payload = buildContactPayload(artist, []);
  payload.source = 'sheet xavi 2026-05-18';
  if (!APPLY) return { dry_run: true, payload };
  return ghl(`/contacts/`, { method: 'POST', body: JSON.stringify(payload) });
}

async function updateContact(ghlId, artist, existingTags) {
  const payload = buildContactPayload(artist, existingTags || []);
  // updates do not accept locationId
  delete payload.locationId;
  if (!APPLY) return { dry_run: true, ghlId, payload };
  return ghl(`/contacts/${ghlId}`, { method: 'PUT', body: JSON.stringify(payload) });
}

async function archiveOrphan(ghlId, existingTags) {
  const tags = [...new Set([...(existingTags || []).filter(t => t !== 'artista_ok'), 'artista_archivado'])];
  const payload = { tags };
  if (!APPLY) return { dry_run: true, ghlId, payload };
  return ghl(`/contacts/${ghlId}`, { method: 'PUT', body: JSON.stringify(payload) });
}

async function main() {
  console.log(`Modo: ${APPLY ? 'APPLY (escribir en GHL)' : 'DRY-RUN (sin escribir)'}`);

  console.log('Resolviendo IDs de custom fields…');
  await resolveCustomFieldIds();

  console.log('Cargando estado GHL actual…');
  const all = await searchAll();
  const byId = new Map(all.map(c => [c.id, c]));
  const byEmail = new Map();
  const byName = new Map();
  for (const c of all) {
    const e = normEmail(c.email);
    if (e) {
      if (!byEmail.has(e)) byEmail.set(e, []);
      byEmail.get(e).push(c);
    }
    const n = clean(c.contactName || '').toLowerCase();
    if (n) {
      if (!byName.has(n)) byName.set(n, []);
      byName.get(n).push(c);
    }
  }
  console.log(`  ${all.length} contactos cargados.`);

  const report = { mode: APPLY ? 'apply' : 'dry-run', timestamp: new Date().toISOString(),
    created: [], updated: [], skipped: [], errors: [], archived: [] };

  // --- Upsert los 158 ---
  for (let i = 0; i < NEW.artistas.length; i++) {
    const a = NEW.artistas[i];
    const email = normEmail(a.email);
    let existing = null;
    if (email && byEmail.has(email) && byEmail.get(email).length === 1) {
      existing = byEmail.get(email)[0];
    } else if (!email) {
      const n = clean(a.nombre).toLowerCase();
      const matches = (byName.get(n) || []);
      const phoneDigits = normPhone(a.telefono);
      const byPhone = phoneDigits ? matches.filter(c => normPhone(c.phone) === phoneDigits) : [];
      if (byPhone.length === 1) existing = byPhone[0];
      else if (matches.length === 1) existing = matches[0];
    }

    try {
      if (!existing) {
        const r = await createContact(a);
        report.created.push({ artist: a.nombre, email: a.email, telefono: a.telefono, response: r });
        process.stdout.write('+');
      } else {
        const r = await updateContact(existing.id, a, existing.tags || []);
        report.updated.push({ artist: a.nombre, ghl_id: existing.id, response: r });
        process.stdout.write('.');
      }
    } catch (e) {
      report.errors.push({ artist: a.nombre, error: e.message });
      process.stdout.write('x');
    }
  }
  console.log('');

  // --- Archive los 56 orphans ---
  console.log(`\nArchivando ${PLAN.ghl_orphans_to_review.length} orphans…`);
  for (const o of PLAN.ghl_orphans_to_review) {
    try {
      const r = await archiveOrphan(o.ghl_id, o.tags || []);
      report.archived.push({ ghl_id: o.ghl_id, name: o.name, response: r });
      process.stdout.write('a');
    } catch (e) {
      report.errors.push({ orphan_id: o.ghl_id, name: o.name, error: e.message });
      process.stdout.write('x');
    }
  }
  console.log('');

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log('\n=== RESUMEN ===');
  console.log(`Created:  ${report.created.length}`);
  console.log(`Updated:  ${report.updated.length}`);
  console.log(`Archived: ${report.archived.length}`);
  console.log(`Errors:   ${report.errors.length}`);
  if (report.errors.length) {
    console.log('\nErrores:');
    report.errors.slice(0, 10).forEach(e => console.log('  -', JSON.stringify(e).substring(0, 250)));
  }
  console.log(`\nReporte: ${REPORT_PATH}`);
  if (!APPLY) console.log('\n⚠ DRY-RUN: no se ha escrito nada. Vuelve a ejecutar con --apply para confirmar.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
