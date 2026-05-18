/**
 * Diff entre el JSON antiguo (data/xavi-artistas.json — sheet 1ZjP0Ur…)
 * y el nuevo (data/xavi-shows-artistas.json — sheet 1ThFrtK_, ground truth 2026-05-18).
 *
 * v2 — añade matching fuzzy (sustring + tokens) porque el antiguo no tenía emails.
 *
 * Output: data/xavi-artistas-diff-2026-05-18.json + resumen por consola.
 */

const fs = require('fs');
const path = require('path');

const OLD = require('../data/xavi-artistas.json');
const NEW = require('../data/xavi-shows-artistas.json');

const OUT = path.join(__dirname, '..', 'data', 'xavi-artistas-diff-2026-05-18.json');

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
const STOP = new Set(['de','del','la','el','los','las','y','show','dancer','dancers','duo','dúo','trio','quartet','quintet','band','dj','singer','artist','artista','contact','contactjuggler','juggler','acrobata','bailarina','bailarinas','bailarin','musico','cantante']);
function tokens(s) {
  return norm(s).split(' ').filter(t => t && !STOP.has(t));
}

// ---- Build new-side index ----
const newByName = new Map(); // norm(name) -> artistRecord
for (const a of NEW.artistas) {
  newByName.set(norm(a.nombre), a);
  if (a.nombre_variantes) for (const v of a.nombre_variantes) newByName.set(norm(v), a);
}
const newByFirstToken = new Map(); // first significant token -> artistRecord[]
const newByLastToken = new Map();
for (const a of NEW.artistas) {
  const allNames = [a.nombre, ...(a.nombre_variantes || [])];
  for (const name of allNames) {
    const tk = tokens(name);
    if (tk.length === 0) continue;
    const first = tk[0], last = tk[tk.length - 1];
    if (!newByFirstToken.has(first)) newByFirstToken.set(first, new Set());
    if (!newByLastToken.has(last)) newByLastToken.set(last, new Set());
    newByFirstToken.get(first).add(a);
    newByLastToken.get(last).add(a);
  }
}

function findFuzzyMatches(oldArtist) {
  const ntokens = tokens(oldArtist.nombre);
  if (ntokens.length === 0) return [];
  const first = ntokens[0], last = ntokens[ntokens.length - 1];
  const cands = new Set();
  if (newByFirstToken.has(first)) for (const a of newByFirstToken.get(first)) cands.add(a);
  if (newByLastToken.has(last)) for (const a of newByLastToken.get(last)) cands.add(a);
  // Also try: any token of old ⊂ any token of new (covers "Florez" vs "Florez Contact Juggler")
  for (const a of NEW.artistas) {
    const ntk = new Set(tokens(a.nombre).concat((a.nombre_variantes || []).flatMap(tokens)));
    const overlap = ntokens.filter(t => ntk.has(t));
    if (overlap.length >= Math.min(ntokens.length, 1) && overlap.length / Math.max(ntokens.length, [...ntk].length) >= 0.5) {
      cands.add(a);
    }
  }
  // Score by token overlap ratio
  const scored = [];
  for (const a of cands) {
    const ntk = new Set(tokens(a.nombre).concat((a.nombre_variantes || []).flatMap(tokens)));
    const overlap = ntokens.filter(t => ntk.has(t));
    const score = overlap.length / Math.max(ntokens.length, ntk.size || 1);
    scored.push({ artist: a, score, overlap });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.filter(s => s.score >= 0.4);
}

// ---- Shows ----
const oldShows = new Set();
for (const a of OLD.artistas) for (const s of a.shows_vinculados) oldShows.add(norm(s));
const newShowsMap = new Map();
for (const s of NEW.shows) newShowsMap.set(norm(s.name), { macro: s.macro, name: s.name });
const shows_only_in_old = [...oldShows].filter(s => !newShowsMap.has(s)).sort();
const shows_only_in_new = [...newShowsMap.keys()].filter(s => !oldShows.has(s)).map(k => newShowsMap.get(k))
  .sort((a, b) => a.name.localeCompare(b.name));

// ---- Match every old artist to new candidates ----
const oldArtistsByNorm = new Map();
for (const a of OLD.artistas) oldArtistsByNorm.set(norm(a.nombre), a);

const matched_exact = [];      // old↔new exact
const matched_fuzzy = [];      // old↔new fuzzy (needs review)
const orphan_old = [];         // old with no new candidate
for (const old of OLD.artistas) {
  const exact = newByName.get(norm(old.nombre));
  if (exact) {
    matched_exact.push({
      old_nombre: old.nombre,
      new_nombre: exact.nombre,
      new_email: exact.email,
      new_telefono: exact.telefono,
      old_shows: old.shows_vinculados.length,
      new_shows: exact.shows_count
    });
    continue;
  }
  const fuzzy = findFuzzyMatches(old);
  if (fuzzy.length === 0) {
    orphan_old.push({
      nombre: old.nombre,
      compania: old.compania || null,
      shows_vinculados: old.shows_vinculados,
      ghl_status: old.ghl_status
    });
  } else {
    matched_fuzzy.push({
      old_nombre: old.nombre,
      old_shows: old.shows_vinculados,
      candidates: fuzzy.slice(0, 3).map(f => ({
        nombre: f.artist.nombre,
        email: f.artist.email,
        telefono: f.artist.telefono,
        score: +f.score.toFixed(2),
        overlap: f.overlap,
        new_shows: f.artist.shows.map(s => `[${s.macro}] ${s.name}`).slice(0, 5)
      }))
    });
  }
}

// New artists not matched by any old (exact or fuzzy)
const matchedNewSet = new Set();
for (const m of matched_exact) matchedNewSet.add(norm(m.new_nombre));
for (const m of matched_fuzzy) for (const c of m.candidates) matchedNewSet.add(norm(c.nombre));
const new_only = [];
for (const a of NEW.artistas) {
  const normed = [norm(a.nombre), ...(a.nombre_variantes || []).map(norm)];
  if (!normed.some(n => matchedNewSet.has(n))) {
    new_only.push({
      nombre: a.nombre,
      email: a.email,
      telefono: a.telefono,
      shows_count: a.shows_count,
      shows: a.shows.map(s => `[${s.macro}] ${s.name}`)
    });
  }
}
new_only.sort((a, b) => b.shows_count - a.shows_count);

const summary = {
  shows: {
    old_unique: oldShows.size,
    new_total: newShowsMap.size,
    only_in_old: shows_only_in_old.length,
    only_in_new: shows_only_in_new.length
  },
  artistas: {
    old_total: OLD.artistas.length,
    new_total: NEW.artistas.length,
    matched_exact: matched_exact.length,
    matched_fuzzy_needs_review: matched_fuzzy.length,
    orphan_old_no_match: orphan_old.length,
    new_only_no_match: new_only.length
  }
};

fs.writeFileSync(OUT, JSON.stringify({
  generated: '2026-05-18',
  old_source: OLD.source,
  new_source: NEW.source,
  summary,
  shows_only_in_old,
  shows_only_in_new,
  matched_exact,
  matched_fuzzy,
  orphan_old,
  new_only
}, null, 2));

console.log('=== Diff v2 Xavi Artistas (con fuzzy match) ===');
console.log(JSON.stringify(summary, null, 2));

console.log('\n--- Artistas viejos SIN match (top 15 por # shows) ---');
orphan_old.sort((a, b) => b.shows_vinculados.length - a.shows_vinculados.length);
for (const a of orphan_old.slice(0, 15)) {
  console.log(`  - ${a.nombre} → ${a.shows_vinculados.length} shows`);
}

console.log('\n--- Artistas nuevos SIN match (top 10 por # shows) ---');
for (const a of new_only.slice(0, 10)) {
  console.log(`  + ${a.nombre}${a.email?` <${a.email}>`:''} → ${a.shows_count} shows`);
}

console.log('\n--- Fuzzy matches (muestra) ---');
for (const m of matched_fuzzy.slice(0, 10)) {
  console.log(`  ? "${m.old_nombre}" (${m.old_shows.length} shows)`);
  for (const c of m.candidates) {
    console.log(`      → score ${c.score} "${c.nombre}" <${c.email||'-'}> [${c.overlap.join(',')}]`);
  }
}
if (matched_fuzzy.length > 10) console.log(`  … +${matched_fuzzy.length - 10} fuzzy matches más`);

console.log(`\nDetalle completo: ${OUT}`);
