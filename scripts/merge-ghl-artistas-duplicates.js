/**
 * Mini-merge de los duplicados que quedaron en GHL tras retry.
 *
 * Para cada failure de retry-report:
 *   - Sacar target_contactId (el que intentábamos actualizar)
 *   - Sacar meta.contactId del error (el "otro" duplicado)
 *   - Cargar ambos
 *   - Ganador: el que ya tenga tag artista_ok DESPUÉS del primer apply, o el que tenga
 *     email exacto al del sheet, o sino el target_contactId.
 *   - Perdedor: el otro
 *   - Operaciones:
 *       perdedor: phone='', email='', tags=[artista_archivado, artista_merged_dup]
 *       ganador:  update completo con datos del sheet (UPDATE normal)
 *
 * Uso: node scripts/merge-ghl-artistas-duplicates.js [--apply]
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GHL_API_KEY;
const LOCATION_ID = process.env.GHL_LOCATION_ID;
const BASE = 'https://services.leadconnectorhq.com';
const APPLY = process.argv.includes('--apply');

const NEW = require('../data/xavi-shows-artistas.json');
const RETRY_REPORT = require('../data/ghl-artistas-retry-report-2026-05-18.json');
const OUT = path.join(__dirname, '..', 'data', `ghl-artistas-merge-report-${new Date().toISOString().slice(0,10)}.json`);

const CONTACT_TYPE_FIELD_ID = '0LBySc0XI7qKiPQVrQs9';
const CATEGORIA_ARTISTA_ID = 'O4u824Z7LAxSwSMm0YqE';
const SUBCATEGORIA_ARTISTA_ID = 'A8CeeHJRdvK7YEakH6bV';
let SHOWS_VINCULADOS_ID = null;

function clean(s) { return String(s || '').replace(/[‪‫‬‭‮‎‏]/g, '').trim(); }
function normEmail(s) { return String(s || '').trim().toLowerCase().replace(/[>\s]+$/g, ''); }

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

async function ghl(p, opts = {}) {
  const res = await fetch(`${BASE}${p}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${p} → ${res.status}: ${text.substring(0, 300)}`);
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
  const m = errMsg.match(/\{.*\}\s*$/s);
  if (!m) return null;
  try { return JSON.parse(m[0]).meta || null; } catch { return null; }
}

async function main() {
  console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  await resolveCustomFieldIds();

  const failures = (RETRY_REPORT.failures || []);
  console.log(`Failures a mergear: ${failures.length}`);

  const artistByName = new Map(NEW.artistas.map(a => [a.nombre, a]));
  const out = { mode: APPLY ? 'apply' : 'dry-run', timestamp: new Date().toISOString(), merged: [], unresolved: [] };

  for (const f of failures) {
    const artist = artistByName.get(f.artist);
    if (!artist) { out.unresolved.push({ artist: f.artist, reason: 'not in sheet' }); continue; }
    const meta = parseErrorMeta(f.error);
    if (!meta || !meta.contactId) {
      out.unresolved.push({ artist: f.artist, reason: 'no meta.contactId in error', error: f.error.substring(0,200) });
      continue;
    }
    const idA = f.target_contactId; // we tried to UPDATE this
    const idB = meta.contactId;     // GHL said dup is here
    if (idA === idB) {
      out.unresolved.push({ artist: f.artist, reason: 'idA === idB (self)' });
      continue;
    }
    try {
      const [a, b] = await Promise.all([getContact(idA), getContact(idB)]);
      const sheetEmail = normEmail(artist.email);
      // Pick winner: prefer one whose email matches sheet, then one with artista_ok tag
      const aHasEmail = sheetEmail && normEmail(a.email) === sheetEmail;
      const bHasEmail = sheetEmail && normEmail(b.email) === sheetEmail;
      const aHasOk = (a.tags || []).includes('artista_ok');
      const bHasOk = (b.tags || []).includes('artista_ok');
      let winner, loser;
      if (aHasEmail && !bHasEmail) { winner = a; loser = b; }
      else if (bHasEmail && !aHasEmail) { winner = b; loser = a; }
      else if (aHasOk && !bHasOk) { winner = a; loser = b; }
      else if (bHasOk && !aHasOk) { winner = b; loser = a; }
      else { winner = a; loser = b; } // arbitrary

      // Build payloads
      const winnerPayload = (() => {
        const tags = [...new Set([...(winner.tags || []).filter(t => t !== 'artista_archivado'), 'artista_ok'])];
        const first = artist.nombre.split(/\s+/)[0] || artist.nombre;
        const last = artist.nombre.split(/\s+/).slice(1).join(' ');
        const p = { firstName: first, lastName: last || undefined, name: artist.nombre, tags, customFields: buildCustomFields(artist) };
        if (artist.email) p.email = artist.email;
        if (artist.telefono) p.phone = clean(artist.telefono);
        return p;
      })();
      const loserPayload = {
        // Clear identifiers with null (empty string is rejected by GHL).
        email: null,
        phone: null,
        tags: [...new Set([...(loser.tags || []).filter(t => t !== 'artista_ok'), 'artista_archivado', 'artista_merged_dup'])]
      };

      if (!APPLY) {
        out.merged.push({
          artist: artist.nombre, dry_run: true,
          winner: { id: winner.id, name: winner.contactName, will_become: artist.nombre },
          loser:  { id: loser.id,  name: loser.contactName,  will_be_cleared: true }
        });
        process.stdout.write('.');
      } else {
        // Clear loser first (release phone/email), then update winner
        await ghl(`/contacts/${loser.id}`, { method: 'PUT', body: JSON.stringify(loserPayload) });
        const upd = await ghl(`/contacts/${winner.id}`, { method: 'PUT', body: JSON.stringify(winnerPayload) });
        out.merged.push({
          artist: artist.nombre,
          winner: { id: winner.id, previous_name: winner.contactName, new_name: artist.nombre },
          loser:  { id: loser.id,  previous_name: loser.contactName,  cleared: true },
          response_id: (upd.contact && upd.contact.id) || winner.id
        });
        process.stdout.write('+');
      }
    } catch (e) {
      out.unresolved.push({ artist: f.artist, idA, idB, error: e.message });
      process.stdout.write('x');
    }
  }
  console.log('');

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('\n=== RESUMEN MERGE ===');
  console.log(`Merged:     ${out.merged.length}`);
  console.log(`Unresolved: ${out.unresolved.length}`);
  if (out.unresolved.length) {
    console.log('Unresolved sample:');
    out.unresolved.slice(0,5).forEach(u => console.log('  -', JSON.stringify(u).substring(0,250)));
  }
  console.log(`\nReporte: ${OUT}`);
  if (!APPLY) console.log('\n⚠ DRY-RUN. Vuelve a ejecutar con --apply.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
