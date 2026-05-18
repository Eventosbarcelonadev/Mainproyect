/**
 * Construye data/ghl-artistas-id-map.json: para cada artista del sheet nuevo,
 * resuelve su ghl_contact_id (matching por email exacto → phone → nombre).
 *
 * Output: { artistas: [{nombre, email, telefono, ghl_contact_id, match_strategy}],
 *           unmatched: [...], stats: {...} }
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const NEW = require('../data/xavi-shows-artistas.json');
const KEY = process.env.GHL_API_KEY;
const LOC = process.env.GHL_LOCATION_ID;
const BASE = 'https://services.leadconnectorhq.com';
const OUT = path.join(__dirname, '..', 'data', 'ghl-artistas-id-map.json');

function clean(s) { return String(s || '').replace(/[‪‫‬‭‮‎‏]/g, '').trim(); }
function normEmail(s) { return String(s || '').trim().toLowerCase().replace(/[>\s]+$/g, ''); }
function normPhone(s) {
  // Use last 9 digits to handle +34 prefix mismatch (Spanish mobile).
  const digits = String(s || '').replace(/\D/g, '');
  return digits.slice(-9);
}
function normName(s) {
  return clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function searchAll() {
  const all = [];
  let sa = null, sai = null;
  while (true) {
    const body = { locationId: LOC, pageLimit: 100, filters: [] };
    if (sa && sai) body.searchAfter = [sa, sai];
    const r = await fetch(`${BASE}/contacts/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, Version: '2021-07-28', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const d = await r.json();
    const cs = d.contacts || [];
    all.push(...cs);
    if (cs.length < 100) break;
    const last = cs[cs.length - 1];
    sa = last.dateAdded ? new Date(last.dateAdded).getTime() : null;
    sai = last.id;
    if (!sa || !sai) break;
  }
  return all;
}

(async () => {
  const all = await searchAll();
  const okSet = all.filter(c => (c.tags || []).includes('artista_ok'));
  console.log(`GHL total: ${all.length}, with artista_ok: ${okSet.length}`);

  const byEmail = new Map();
  const byPhone = new Map();
  const byName = new Map();
  for (const c of okSet) {
    const e = normEmail(c.email);
    if (e) { if (!byEmail.has(e)) byEmail.set(e, []); byEmail.get(e).push(c); }
    const p = normPhone(c.phone);
    if (p) { if (!byPhone.has(p)) byPhone.set(p, []); byPhone.get(p).push(c); }
    const n = normName(c.contactName || `${c.firstName || ''} ${c.lastName || ''}`);
    if (n) { if (!byName.has(n)) byName.set(n, []); byName.get(n).push(c); }
  }

  const matched = [];
  const unmatched = [];
  const ambiguous = [];

  for (const a of NEW.artistas) {
    const email = normEmail(a.email);
    const phone = normPhone(a.telefono);
    const name = normName(a.nombre);

    let cands = [];
    let strategy = null;
    if (email && byEmail.has(email)) { cands = byEmail.get(email); strategy = 'email'; }
    if (cands.length === 0 && phone && byPhone.has(phone)) { cands = byPhone.get(phone); strategy = 'phone'; }
    if (cands.length === 0 && name && byName.has(name)) { cands = byName.get(name); strategy = 'name'; }

    if (cands.length === 1) {
      matched.push({
        nombre: a.nombre, email: a.email, telefono: a.telefono,
        ghl_contact_id: cands[0].id,
        ghl_name: cands[0].contactName,
        match_strategy: strategy,
        shows_count: a.shows_count
      });
    } else if (cands.length > 1) {
      ambiguous.push({
        nombre: a.nombre, email: a.email,
        strategy, candidates: cands.map(c => ({ id: c.id, name: c.contactName, email: c.email, phone: c.phone }))
      });
    } else {
      unmatched.push({ nombre: a.nombre, email: a.email, telefono: a.telefono });
    }
  }

  const stats = {
    sheet_total: NEW.artistas.length,
    ghl_artista_ok: okSet.length,
    matched_by_email: matched.filter(m => m.match_strategy === 'email').length,
    matched_by_phone: matched.filter(m => m.match_strategy === 'phone').length,
    matched_by_name: matched.filter(m => m.match_strategy === 'name').length,
    matched_total: matched.length,
    ambiguous: ambiguous.length,
    unmatched: unmatched.length
  };

  fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), stats, matched, ambiguous, unmatched }, null, 2));
  console.log('Stats:', JSON.stringify(stats, null, 2));
  if (ambiguous.length) {
    console.log('\nAmbiguous (need review):');
    ambiguous.slice(0, 5).forEach(a => console.log('  -', a.nombre, ':', a.candidates.map(c => c.name).join(' / ')));
  }
  if (unmatched.length) {
    console.log('\nUnmatched:');
    unmatched.forEach(u => console.log('  -', u.nombre, '<' + (u.email || '-') + '> tel:' + (u.telefono || '-')));
  }
  console.log(`\nOutput: ${OUT}`);
})();
