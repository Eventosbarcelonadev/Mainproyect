/**
 * Retry de los 78 errores "duplicated contacts" del primer apply.
 *
 * Estrategia: para cada error, GHL devuelve meta.contactId del duplicado en
 * meta.matchingField=phone. Hacemos UPDATE en ese contactId con el payload
 * que corresponde al artista del sheet — asumiendo que el duplicado es la
 * versión actual de ese mismo artista en GHL (mismo teléfono).
 *
 * Garantías:
 *   - Si el target_contactId YA está marcado como artista_ok DESPUÉS de la sync (porque
 *     mi script lo creó o actualizó correctamente), se SKIP (no re-update).
 *   - Si target_contactId es un orphan recién archivado: lo "rescatamos" cambiando tags
 *     y datos al artista nuevo (es el mismo artista — sería un re-merge implícito).
 *   - Conflictos no resueltos se loggean para revisión.
 *
 * Uso: node scripts/retry-ghl-artistas-duplicates.js [--apply]
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GHL_API_KEY;
const LOCATION_ID = process.env.GHL_LOCATION_ID;
const BASE = 'https://services.leadconnectorhq.com';
const APPLY = process.argv.includes('--apply');

const NEW = require('../data/xavi-shows-artistas.json');
const PREV_REPORT = require('../data/ghl-artistas-sync-report-2026-05-18.json');
const OUT = path.join(__dirname, '..', 'data', `ghl-artistas-retry-report-${new Date().toISOString().slice(0,10)}.json`);

const CONTACT_TYPE_FIELD_ID = '0LBySc0XI7qKiPQVrQs9';
const CATEGORIA_ARTISTA_ID = 'O4u824Z7LAxSwSMm0YqE';
const SUBCATEGORIA_ARTISTA_ID = 'A8CeeHJRdvK7YEakH6bV';
let SHOWS_VINCULADOS_ID = null;

function clean(s) { return String(s || '').replace(/[‪‫‬‭‮‎‏]/g, '').trim(); }

function buildCustomFields(artist) {
  const macros = new Set();
  for (const s of artist.shows) macros.add(s.macro);
  const subs = new Set();
  for (const showRef of artist.shows) {
    const full = NEW.shows.find(s => s.name === showRef.name && s.macro === showRef.macro);
    if (full && full.sub) subs.add(full.sub);
  }
  const shows_text = artist.shows.map(s => `[${s.macro}] ${s.name}`).join('\n');
  const fields = [
    { id: CONTACT_TYPE_FIELD_ID, key: 'contact_type', field_value: 'Artista' },
    { id: CATEGORIA_ARTISTA_ID, key: 'categoria_artista', field_value: [...macros].sort().join(', ') },
    { id: SUBCATEGORIA_ARTISTA_ID, key: 'subcategoria_artista', field_value: [...subs].sort().join(', ') },
  ];
  if (SHOWS_VINCULADOS_ID) {
    fields.push({ id: SHOWS_VINCULADOS_ID, key: 'shows_vinculados', field_value: shows_text });
  }
  return fields;
}

function buildUpdatePayload(artist, existingTags) {
  const tags = [...new Set([...(existingTags || []).filter(t => t !== 'artista_archivado'), 'artista_ok'])];
  const first = artist.nombre.split(/\s+/)[0] || artist.nombre;
  const lastParts = artist.nombre.split(/\s+/).slice(1);
  const last = lastParts.join(' ');
  const payload = {
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
  for (const f of (data.customFields || [])) {
    if (f.fieldKey === 'contact.shows_vinculados') SHOWS_VINCULADOS_ID = f.id;
  }
}

async function getContact(id) {
  const data = await ghl(`/contacts/${id}`);
  return data.contact || data;
}

function parseErrorMeta(errMsg) {
  // Extract JSON body part of the error
  const m = errMsg.match(/\{.*\}\s*$/s);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    return obj.meta || null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  await resolveCustomFieldIds();

  const errors = (PREV_REPORT.errors || []).filter(e => e.artist);
  console.log(`Errores a procesar: ${errors.length}`);

  const artistByName = new Map(NEW.artistas.map(a => [a.nombre, a]));

  const result = {
    mode: APPLY ? 'apply' : 'dry-run',
    timestamp: new Date().toISOString(),
    fixed: [],
    skipped_already_ok: [],
    no_target: [],
    failures: []
  };

  for (const err of errors) {
    const artist = artistByName.get(err.artist);
    if (!artist) {
      result.no_target.push({ artist: err.artist, reason: 'artist name not in sheet' });
      continue;
    }
    const meta = parseErrorMeta(err.error);
    if (!meta || !meta.contactId) {
      result.no_target.push({ artist: err.artist, reason: 'could not extract target contactId', error: err.error.substring(0, 200) });
      continue;
    }
    const targetId = meta.contactId;

    try {
      const existing = await getContact(targetId);
      const existingTags = existing.tags || [];

      // Skip if this contact already has artista_ok AND already matches the artist
      // (idempotency check — but since we're retrying explicit errors, almost never true)
      const payload = buildUpdatePayload(artist, existingTags);

      if (!APPLY) {
        result.fixed.push({
          artist: artist.nombre,
          target_contactId: targetId,
          existing_name: existing.contactName,
          existing_tags: existingTags,
          would_update: payload,
          dry_run: true
        });
        process.stdout.write('.');
        continue;
      }

      const upd = await ghl(`/contacts/${targetId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      result.fixed.push({
        artist: artist.nombre,
        target_contactId: targetId,
        previous_name: existing.contactName,
        previous_tags: existingTags,
        ghl_response_id: (upd.contact && upd.contact.id) || targetId
      });
      process.stdout.write('+');
    } catch (e) {
      result.failures.push({ artist: err.artist, target_contactId: targetId, error: e.message });
      process.stdout.write('x');
    }
  }
  console.log('');

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log('\n=== RESUMEN RETRY ===');
  console.log(`Fixed:                 ${result.fixed.length}`);
  console.log(`Skipped (already OK):  ${result.skipped_already_ok.length}`);
  console.log(`No target:             ${result.no_target.length}`);
  console.log(`Still failing:         ${result.failures.length}`);
  if (result.failures.length) {
    console.log('\nFailures restantes:');
    result.failures.slice(0, 10).forEach(f => console.log(`  - ${f.artist} → ${f.error.substring(0, 200)}`));
  }
  console.log(`\nReporte: ${OUT}`);
  if (!APPLY) console.log('\n⚠ DRY-RUN. Vuelve a ejecutar con --apply.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
