/**
 * Plan de sincronización GHL ↔ nuevo sheet de artistas (1ThFrtK_).
 *
 * DRY-RUN: no escribe nada en GHL. Solo planifica y muestra.
 *
 * Reglas:
 *   - Source of truth: data/xavi-shows-artistas.json (158 representantes).
 *   - Match GHL ↔ sheet por email (lowercase). Fallback por nombre normalizado.
 *   - Acciones por artista nuevo:
 *       CREATE  si no existe en GHL
 *       UPDATE  si existe pero cambian nombre/tel/email/tags
 *       SKIP    si está OK
 *   - Acciones por GHL `artista_ok` que ya no está en el nuevo sheet:
 *       FLAG-FOR-REVIEW (no se borra ni se cambia tag automáticamente)
 *
 * Output:
 *   data/ghl-artistas-sync-plan.json  → plan completo
 *   Consola → resumen
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GHL_API_KEY;
const LOCATION_ID = process.env.GHL_LOCATION_ID;
const BASE = 'https://services.leadconnectorhq.com';

const NEW = require('../data/xavi-shows-artistas.json');
const OUT = path.join(__dirname, '..', 'data', 'ghl-artistas-sync-plan.json');

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
function normEmail(s) {
  return String(s || '').trim().toLowerCase().replace(/[>\s]+$/g, '');
}
function normPhone(s) {
  return String(s || '').replace(/\D/g, '');
}

async function searchContacts(filters, pageLimit = 100) {
  const all = [];
  let startAfter = null, startAfterId = null;
  while (true) {
    const body = { locationId: LOCATION_ID, pageLimit, filters };
    if (startAfter && startAfterId) body.searchAfter = [startAfter, startAfterId];
    const res = await fetch(`${BASE}/contacts/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Version': '2021-07-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).substring(0, 200)}`);
    const data = await res.json();
    const contacts = data.contacts || [];
    all.push(...contacts);
    if (contacts.length < pageLimit) break;
    const last = contacts[contacts.length - 1];
    startAfter = last.dateAdded ? new Date(last.dateAdded).getTime() : null;
    startAfterId = last.id;
    if (!startAfter || !startAfterId) break;
  }
  return all;
}

async function listCustomFields() {
  const res = await fetch(`${BASE}/locations/${LOCATION_ID}/customFields`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Version': '2021-07-28',
    },
  });
  if (!res.ok) {
    return { error: `${res.status}: ${(await res.text()).substring(0, 200)}` };
  }
  return res.json();
}

async function main() {
  console.log('Cargando estado GHL…');
  const all = await searchContacts([]);
  console.log(`  Total GHL: ${all.length}`);

  // Index GHL by email and by normalized name
  const ghlByEmail = new Map();
  const ghlByName = new Map();
  for (const c of all) {
    const e = normEmail(c.email);
    if (e) {
      if (!ghlByEmail.has(e)) ghlByEmail.set(e, []);
      ghlByEmail.get(e).push(c);
    }
    const n = norm(c.contactName || `${c.firstName||''} ${c.lastName||''}`);
    if (n) {
      if (!ghlByName.has(n)) ghlByName.set(n, []);
      ghlByName.get(n).push(c);
    }
  }

  // Index GHL artistas (with tag artista_ok)
  const ghlArtistas = all.filter(c => (c.tags || []).includes('artista_ok'));
  const ghlArtistaEmails = new Set(ghlArtistas.map(c => normEmail(c.email)).filter(Boolean));

  // List custom fields (informational)
  console.log('Listando custom fields…');
  const cfRaw = await listCustomFields();
  const customFields = (cfRaw.customFields || []).map(f => ({
    id: f.id, name: f.name, fieldKey: f.fieldKey, dataType: f.dataType
  }));
  console.log(`  Custom fields existentes: ${customFields.length}`);

  // Plan per new artist
  const plan = { create: [], update: [], skip: [], ambiguous: [] };
  const matchedGhlIds = new Set();

  for (const a of NEW.artistas) {
    const email = normEmail(a.email);
    let existing = null;

    if (email && ghlByEmail.has(email)) {
      const matches = ghlByEmail.get(email);
      if (matches.length === 1) existing = matches[0];
      else {
        plan.ambiguous.push({
          artist: { nombre: a.nombre, email: a.email, telefono: a.telefono, shows_count: a.shows_count },
          reason: 'multiple GHL contacts with same email',
          ghl_candidates: matches.map(m => ({ id: m.id, name: m.contactName, tags: m.tags }))
        });
        continue;
      }
    } else if (!email) {
      // Fallback: name match
      const nameMatches = ghlByName.get(norm(a.nombre)) || [];
      const phoneDigits = normPhone(a.telefono);
      const byPhone = phoneDigits ? nameMatches.filter(c => normPhone(c.phone) === phoneDigits) : [];
      if (byPhone.length === 1) existing = byPhone[0];
      else if (nameMatches.length === 1) existing = nameMatches[0];
      else if (nameMatches.length > 1) {
        plan.ambiguous.push({
          artist: { nombre: a.nombre, email: a.email, telefono: a.telefono, shows_count: a.shows_count },
          reason: 'no email + multiple GHL contacts with same name',
          ghl_candidates: nameMatches.map(m => ({ id: m.id, name: m.contactName, email: m.email, phone: m.phone, tags: m.tags }))
        });
        continue;
      }
    }

    if (!existing) {
      plan.create.push({
        nombre: a.nombre,
        email: a.email,
        telefono: a.telefono,
        shows_count: a.shows_count,
        tags_to_add: ['artista_ok']
      });
      continue;
    }

    matchedGhlIds.add(existing.id);
    const diffs = [];
    const tagsToAdd = [];
    if (!(existing.tags || []).includes('artista_ok')) tagsToAdd.push('artista_ok');
    if (a.nombre && norm(existing.contactName || '') !== norm(a.nombre)) {
      diffs.push({ field: 'name', from: existing.contactName, to: a.nombre });
    }
    if (a.email && normEmail(existing.email) !== normEmail(a.email)) {
      diffs.push({ field: 'email', from: existing.email, to: a.email });
    }
    if (a.telefono && normPhone(existing.phone) !== normPhone(a.telefono)) {
      diffs.push({ field: 'phone', from: existing.phone, to: a.telefono });
    }
    if (diffs.length === 0 && tagsToAdd.length === 0) {
      plan.skip.push({ ghl_id: existing.id, nombre: a.nombre, email: a.email });
    } else {
      plan.update.push({
        ghl_id: existing.id,
        nombre: a.nombre,
        email: a.email,
        telefono: a.telefono,
        diffs,
        tags_to_add: tagsToAdd
      });
    }
  }

  // GHL `artista_ok` that are no longer in the new sheet
  const newEmailSet = new Set(NEW.artistas.map(a => normEmail(a.email)).filter(Boolean));
  const newNameSet = new Set(NEW.artistas.flatMap(a => [norm(a.nombre), ...((a.nombre_variantes || []).map(norm))]));
  const flagged = [];
  for (const c of ghlArtistas) {
    if (matchedGhlIds.has(c.id)) continue;
    const e = normEmail(c.email);
    const n = norm(c.contactName || '');
    if (e && newEmailSet.has(e)) continue; // matched indirectly
    if (n && newNameSet.has(n)) continue;
    flagged.push({
      ghl_id: c.id,
      name: c.contactName,
      email: c.email,
      phone: c.phone,
      tags: c.tags,
      note: 'tagged artista_ok but not in new ground-truth sheet'
    });
  }

  const summary = {
    new_sheet_total: NEW.artistas.length,
    ghl_total_contacts: all.length,
    ghl_artistas_ok_existing: ghlArtistas.length,
    plan: {
      create: plan.create.length,
      update: plan.update.length,
      skip: plan.skip.length,
      ambiguous_need_human: plan.ambiguous.length,
      ghl_orphans_needing_review: flagged.length
    }
  };

  fs.writeFileSync(OUT, JSON.stringify({
    generated_at: new Date().toISOString(),
    summary,
    custom_fields_in_ghl: customFields,
    plan,
    ghl_orphans_to_review: flagged
  }, null, 2));

  console.log('\n=== Plan GHL sync (DRY-RUN) ===');
  console.log(JSON.stringify(summary, null, 2));

  console.log('\n--- CREATE (top 10) ---');
  for (const c of plan.create.slice(0, 10)) {
    console.log(`  + ${c.nombre} <${c.email||'-'}> tel:${c.telefono||'-'} (${c.shows_count} shows)`);
  }
  if (plan.create.length > 10) console.log(`  … +${plan.create.length - 10}`);

  console.log('\n--- UPDATE (top 10) ---');
  for (const u of plan.update.slice(0, 10)) {
    const d = u.diffs.map(x => `${x.field}: "${x.from}"→"${x.to}"`).join('; ') || '(only tag)';
    console.log(`  Δ ${u.nombre} [${u.ghl_id}] ${d}${u.tags_to_add.length ? ' +tags:'+u.tags_to_add.join(',') : ''}`);
  }
  if (plan.update.length > 10) console.log(`  … +${plan.update.length - 10}`);

  if (plan.ambiguous.length) {
    console.log(`\n--- AMBIGUOUS (${plan.ambiguous.length}, need human decision) ---`);
    for (const a of plan.ambiguous.slice(0, 10)) {
      console.log(`  ? ${a.artist.nombre} <${a.artist.email||'-'}>: ${a.reason}`);
      a.ghl_candidates.forEach(c => console.log(`      • ${c.name||'(no name)'} [${c.id}] tags=${(c.tags||[]).join(',')||'-'}`));
    }
  }

  if (flagged.length) {
    console.log(`\n--- GHL ORPHANS (${flagged.length}, tagged artista_ok but not in new sheet) ---`);
    for (const f of flagged.slice(0, 10)) {
      console.log(`  ⚠ ${f.name} <${f.email||'-'}> [${f.ghl_id}]`);
    }
    if (flagged.length > 10) console.log(`  … +${flagged.length - 10}`);
  }

  console.log(`\nPlan completo: ${OUT}`);
  console.log('\nNo se ha escrito nada en GHL. Para ejecutar: scripts/apply-ghl-artistas-sync.js (aún no creado).');
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
