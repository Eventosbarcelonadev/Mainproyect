require('dotenv').config();
const NEW = require('../data/xavi-shows-artistas.json');
const API_KEY = process.env.GHL_API_KEY;
const LOCATION_ID = process.env.GHL_LOCATION_ID;
const BASE = 'https://services.leadconnectorhq.com';

function clean(s) { return String(s || '').replace(/[‪‫‬‭‮‎‏]/g, '').trim(); }
function normEmail(s) { return String(s || '').trim().toLowerCase().replace(/[>\s]+$/g, ''); }
function normPhone(s) { return String(s || '').replace(/\D/g, ''); }

async function searchAll() {
  const all = [];
  let startAfter = null, startAfterId = null;
  while (true) {
    const body = { locationId: LOCATION_ID, pageLimit: 100, filters: [] };
    if (startAfter && startAfterId) body.searchAfter = [startAfter, startAfterId];
    const res = await fetch(`${BASE}/contacts/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, Version: '2021-07-28', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    const cs = data.contacts || [];
    all.push(...cs);
    if (cs.length < 100) break;
    const last = cs[cs.length - 1];
    startAfter = last.dateAdded ? new Date(last.dateAdded).getTime() : null;
    startAfterId = last.id;
    if (!startAfter || !startAfterId) break;
  }
  return all;
}

(async () => {
  const all = await searchAll();
  const byEmail = new Map();
  const byPhone = new Map();
  const byName = new Map();
  for (const c of all) {
    const e = normEmail(c.email);
    if (e) (byEmail.get(e) || byEmail.set(e, []).get(e)).push(c);
    const p = normPhone(c.phone);
    if (p) (byPhone.get(p) || byPhone.set(p, []).get(p)).push(c);
    const n = clean(c.contactName || '').toLowerCase();
    if (n) (byName.get(n) || byName.set(n, []).get(n)).push(c);
  }

  const missing = [];
  const okButNotTagged = [];
  const matchedOk = [];

  for (const a of NEW.artistas) {
    const email = normEmail(a.email);
    const phone = normPhone(a.telefono);
    const name = clean(a.nombre).toLowerCase();
    let cands = [];
    if (email && byEmail.has(email)) cands = cands.concat(byEmail.get(email));
    if (phone && byPhone.has(phone)) cands = cands.concat(byPhone.get(phone));
    if (!cands.length && name && byName.has(name)) cands = cands.concat(byName.get(name));
    const uniq = [...new Map(cands.map(c => [c.id, c])).values()];
    if (uniq.length === 0) {
      missing.push({ nombre: a.nombre, email: a.email, telefono: a.telefono, shows: a.shows_count });
      continue;
    }
    const withOk = uniq.find(c => (c.tags || []).includes('artista_ok'));
    if (withOk) matchedOk.push(a.nombre);
    else okButNotTagged.push({ nombre: a.nombre, email: a.email, candidates: uniq.map(c => ({ id: c.id, name: c.contactName, tags: c.tags })) });
  }

  console.log(`Total contactos GHL: ${all.length}`);
  console.log(`Artistas sheet con match + tag artista_ok: ${matchedOk.length} / ${NEW.artistas.length}`);
  console.log(`Artistas sheet con match pero SIN tag artista_ok: ${okButNotTagged.length}`);
  console.log(`Artistas sheet SIN match en GHL: ${missing.length}`);
  console.log('');
  if (missing.length) {
    console.log('NO ENCONTRADOS:');
    missing.forEach(m => console.log('  -', m.nombre, '<' + (m.email||'-') + '>', 'tel:', m.telefono||'-', '(' + m.shows + ' shows)'));
  }
  if (okButNotTagged.length) {
    console.log('\nMATCH PERO SIN TAG artista_ok:');
    okButNotTagged.forEach(x => {
      console.log('  -', x.nombre, '<' + (x.email||'-') + '>');
      x.candidates.forEach(c => console.log('       ', c.id, c.name, '[' + (c.tags||[]).join(',') + ']'));
    });
  }
})();
