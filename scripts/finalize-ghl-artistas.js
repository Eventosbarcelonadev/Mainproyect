/**
 * Finaliza los 8 casos pendientes tras apply+retry+merge:
 *   - Macarena y Pilar: existen en GHL sin tag artista_ok → UPDATE con tag + custom fields
 *   - Orlando, Bre, Elisenda, Harman, Nazely: sin match → /contacts/upsert (GHL maneja dup)
 *   - "635 774 410": skip (fake del parser, ya documentado)
 *
 * Uso: node scripts/finalize-ghl-artistas.js [--apply]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GHL_API_KEY;
const LOCATION_ID = process.env.GHL_LOCATION_ID;
const BASE = 'https://services.leadconnectorhq.com';
const APPLY = process.argv.includes('--apply');

const NEW = require('../data/xavi-shows-artistas.json');

const CONTACT_TYPE_FIELD_ID = '0LBySc0XI7qKiPQVrQs9';
const CATEGORIA_ARTISTA_ID = 'O4u824Z7LAxSwSMm0YqE';
const SUBCATEGORIA_ARTISTA_ID = 'A8CeeHJRdvK7YEakH6bV';
let SHOWS_VINCULADOS_ID = null;

function clean(s) { return String(s || '').replace(/[‪‫‬‭‮‎‏]/g, '').trim(); }

function buildCustomFields(artist) {
  const macros = new Set(); for (const s of artist.shows) macros.add(s.macro);
  const subs = new Set();
  for (const sh of artist.shows) {
    const f = NEW.shows.find(s => s.name === sh.name && s.macro === sh.macro);
    if (f && f.sub) subs.add(f.sub);
  }
  const fields = [
    { id: CONTACT_TYPE_FIELD_ID, key: 'contact_type', field_value: 'Artista' },
    { id: CATEGORIA_ARTISTA_ID, key: 'categoria_artista', field_value: [...macros].sort().join(', ') },
    { id: SUBCATEGORIA_ARTISTA_ID, key: 'subcategoria_artista', field_value: [...subs].sort().join(', ') },
  ];
  if (SHOWS_VINCULADOS_ID) {
    fields.push({ id: SHOWS_VINCULADOS_ID, key: 'shows_vinculados',
      field_value: artist.shows.map(s => `[${s.macro}] ${s.name}`).join('\n') });
  }
  return fields;
}

async function ghl(p, opts = {}) {
  const res = await fetch(`${BASE}${p}`, {
    ...opts,
    headers: { Authorization: `Bearer ${API_KEY}`, Version: '2021-07-28', 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${opts.method||'GET'} ${p} → ${res.status}: ${text.substring(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  console.log('Modo:', APPLY ? 'APPLY' : 'DRY-RUN');
  const cf = await ghl(`/locations/${LOCATION_ID}/customFields`);
  for (const f of cf.customFields || []) if (f.fieldKey === 'contact.shows_vinculados') SHOWS_VINCULADOS_ID = f.id;

  const artistByName = new Map(NEW.artistas.map(a => [a.nombre, a]));
  const report = { mode: APPLY ? 'apply' : 'dry-run', updates: [], upserts: [], skipped: [], errors: [] };

  // 1) Update Macarena y Pilar (ya existen, falta tag)
  const updates = [
    { name: 'Macarena', id: 'e5NMkmLrMkcEPsBXmGdi' },
    { name: 'Pilar', id: 'nz0BoiMUeLBzH0RRA8qj' }
  ];
  for (const u of updates) {
    const a = artistByName.get(u.name);
    if (!a) { report.skipped.push({ name: u.name, reason: 'not in sheet' }); continue; }
    const payload = {
      name: a.nombre,
      tags: ['artista_ok'],
      customFields: buildCustomFields(a)
    };
    if (a.telefono) payload.phone = clean(a.telefono);
    if (a.email) payload.email = a.email;
    if (!APPLY) { report.updates.push({ id: u.id, name: u.name, dry_run: payload }); process.stdout.write('.'); continue; }
    try {
      const r = await ghl(`/contacts/${u.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      report.updates.push({ id: u.id, name: u.name, ok: true });
      process.stdout.write('+');
    } catch (e) { report.errors.push({ name: u.name, error: e.message }); process.stdout.write('x'); }
  }

  // 2) Upsert los 5 missing reales (skip fake 635 774 410)
  const missing = ['Orlando', 'Bre', 'Elisenda', 'Harman', 'Nazely'];
  for (const name of missing) {
    const a = artistByName.get(name);
    if (!a) { report.skipped.push({ name, reason: 'not in sheet' }); continue; }
    const first = a.nombre.split(/\s+/)[0] || a.nombre;
    const last = a.nombre.split(/\s+/).slice(1).join(' ');
    const payload = {
      locationId: LOCATION_ID,
      firstName: first, lastName: last || undefined,
      name: a.nombre,
      tags: ['artista_ok'],
      customFields: buildCustomFields(a),
      source: 'sheet xavi 2026-05-18 finalize'
    };
    if (a.telefono) payload.phone = clean(a.telefono);
    if (a.email) payload.email = a.email;
    if (!APPLY) { report.upserts.push({ name, dry_run: payload }); process.stdout.write('.'); continue; }
    try {
      const r = await ghl(`/contacts/upsert`, { method: 'POST', body: JSON.stringify(payload) });
      report.upserts.push({ name, ok: true, id: r.contact && r.contact.id, new: r.new });
      process.stdout.write(r.new ? '+' : '*');
    } catch (e) { report.errors.push({ name, error: e.message }); process.stdout.write('x'); }
  }
  console.log('');

  console.log('\n=== RESUMEN FINALIZE ===');
  console.log('Updates:', report.updates.length);
  console.log('Upserts:', report.upserts.length, '(★ existing matched, + brand new)');
  console.log('Skipped:', report.skipped.length);
  console.log('Errors:',  report.errors.length);
  if (report.errors.length) report.errors.forEach(e => console.log('  -', e.name, ':', e.error.substring(0, 200)));
  if (report.upserts.length) report.upserts.forEach(u => console.log('  ', u.name, '→', u.ok ? `id=${u.id} new=${u.new}` : 'failed'));

  const out = path.join(__dirname, '..', 'data', `ghl-artistas-finalize-report-${new Date().toISOString().slice(0,10)}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('Reporte:', out);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
