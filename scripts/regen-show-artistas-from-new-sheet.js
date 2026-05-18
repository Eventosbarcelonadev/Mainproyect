/**
 * Regenera la tabla show_artistas con las 370 relaciones del sheet nuevo (1ThFrtK_).
 *
 * Estado actual (modelo viejo):
 *   show_artistas: 226 filas, todas source='sheets-xavi-2026-05-13-artistas-table', solo posicion=1
 *
 * Estado objetivo (modelo nuevo):
 *   show_artistas: ~370 filas con posicion 1-3, source='sheets-xavi-1ThFrtK-2026-05-18'
 *   shows.artista_id actualizado al artista de posicion=1
 *
 * Match:
 *   - show: name normalizado del sheet ↔ shows.name de Supabase (slug en show_id)
 *   - artista: ghl_contact_id (resuelto en ghl-artistas-id-map.json) ↔ artistas.ghl_contact_id
 *             fallback: email exacto, fallback nombre normalizado
 *
 * Uso:
 *   node scripts/regen-show-artistas-from-new-sheet.js              # dry-run
 *   node scripts/regen-show-artistas-from-new-sheet.js --apply      # destruye y reinserta
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

const SBURL = (process.env.SUPABASE_URL || '').trim();
const KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();
const APPLY = process.argv.includes('--apply');

const NEW = require('../data/xavi-shows-artistas.json');
const ID_MAP = require('../data/ghl-artistas-id-map.json');
const OUT = path.join(__dirname, '..', 'data', `regen-show-artistas-report-${new Date().toISOString().slice(0,10)}.json`);

function clean(s) { return String(s || '').replace(/[‪‫‬‭‮‎‏]/g, '').trim(); }
function normName(s) {
  return clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(SBURL + '/rest/v1/' + urlPath);
    const opts = {
      method, hostname: url.hostname, path: url.pathname + url.search,
      headers: {
        apikey: KEY, Authorization: 'Bearer ' + KEY,
        'Content-Type': 'application/json',
        Prefer: (method === 'POST' || method === 'PATCH') ? 'return=representation' : ''
      }
    };
    const r = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(data ? JSON.parse(data) : null); } catch { resolve(data); }
        } else reject(new Error(`${method} ${urlPath} → ${res.statusCode}: ${data.substring(0, 300)}`));
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function fetchAll(table, cols) {
  const all = [];
  let from = 0;
  while (true) {
    const url = new URL(SBURL + '/rest/v1/' + table);
    url.searchParams.set('select', cols);
    const opts = {
      method: 'GET', hostname: url.hostname, path: url.pathname + url.search,
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, Range: `${from}-${from + 999}` }
    };
    const chunk = await new Promise((res, rej) => {
      const r = https.request(opts, x => {
        let d = ''; x.on('data', c => d += c); x.on('end', () => {
          try { res(JSON.parse(d)); } catch { rej(new Error(d.substring(0, 200))); }
        });
      });
      r.on('error', rej); r.end();
    });
    all.push(...chunk);
    if (chunk.length < 1000) break;
    from += 1000;
  }
  return all;
}

(async () => {
  console.log(`Modo: ${APPLY ? 'APPLY (destruye show_artistas y reinserta)' : 'DRY-RUN'}`);

  console.log('Cargando shows…');
  const sbShows = await fetchAll('shows', 'id,name,category,subcategory,artista_id');
  console.log(`  ${sbShows.length} shows en Supabase`);

  console.log('Cargando artistas activos…');
  const sbArtistas = await fetchAll('artistas', 'id,nombre,email,ghl_contact_id,archived');
  const activos = sbArtistas.filter(a => !a.archived);
  console.log(`  ${sbArtistas.length} total, ${activos.length} activos`);

  // Indices
  const showsByName = new Map();
  for (const s of sbShows) {
    const k = normName(s.name);
    if (k) {
      if (!showsByName.has(k)) showsByName.set(k, []);
      showsByName.get(k).push(s);
    }
  }
  const artistasByGhl = new Map();
  const artistasByEmail = new Map();
  const artistasByName = new Map();
  for (const a of activos) {
    if (a.ghl_contact_id) artistasByGhl.set(a.ghl_contact_id, a);
    if (a.email) {
      const e = a.email.toLowerCase().trim();
      if (!artistasByEmail.has(e)) artistasByEmail.set(e, []);
      artistasByEmail.get(e).push(a);
    }
    const n = normName(a.nombre || '');
    if (n) {
      if (!artistasByName.has(n)) artistasByName.set(n, []);
      artistasByName.get(n).push(a);
    }
  }

  // ghl_contact_id por nombre del sheet (calculado en build-ghl-artistas-id-map.js)
  const ghlByArtistName = new Map(ID_MAP.matched.map(m => [m.nombre, m.ghl_contact_id]));

  // Plan
  const newRelations = [];     // {show_id, artista_id, posicion, source, debug}
  const unmatchedShows = [];   // shows del sheet sin match en SB
  const unmatchedArtistas = [];// artistas en un show sin match
  const ambiguousShows = [];   // múltiples shows SB con mismo nombre
  const artistaIdByShowSlugPos1 = new Map(); // para actualizar shows.artista_id

  for (const s of NEW.shows) {
    const k = normName(s.name);
    const matches = showsByName.get(k) || [];
    if (matches.length === 0) {
      unmatchedShows.push({ macro: s.macro, name: s.name });
      continue;
    }
    let sbShow;
    if (matches.length > 1) {
      const byMacro = matches.find(m => normName(m.category || '') === normName(s.macro));
      if (byMacro) sbShow = byMacro;
      else {
        ambiguousShows.push({ name: s.name, macro: s.macro, candidates: matches.map(m => ({ id: m.id, name: m.name, cat: m.category })) });
        sbShow = matches[0];
      }
    } else {
      sbShow = matches[0];
    }

    let pos = 0;
    for (const ar of s.artistas) {
      pos++;
      if (!ar.nombre) continue;
      const ghlId = ghlByArtistName.get(ar.nombre);
      let sbArt = null;
      if (ghlId && artistasByGhl.has(ghlId)) sbArt = artistasByGhl.get(ghlId);
      if (!sbArt && ar.email) {
        const c = artistasByEmail.get(String(ar.email).toLowerCase().trim()) || [];
        if (c.length === 1) sbArt = c[0];
      }
      if (!sbArt) {
        const c = artistasByName.get(normName(ar.nombre)) || [];
        if (c.length === 1) sbArt = c[0];
      }
      if (!sbArt) {
        unmatchedArtistas.push({ show: s.name, artista: ar.nombre, email: ar.email });
        continue;
      }
      newRelations.push({
        show_id: sbShow.id,
        artista_id: sbArt.id,
        posicion: pos,
        source: 'sheets-xavi-1ThFrtK-2026-05-18'
      });
      if (pos === 1) artistaIdByShowSlugPos1.set(sbShow.id, sbArt.id);
    }
  }

  // Existing show_artistas to delete (todos los del modelo viejo)
  const existing = await fetchAll('show_artistas', 'show_id,artista_id,posicion,source');
  console.log(`\nshow_artistas actuales en SB: ${existing.length}`);

  console.log('\n=== Plan ===');
  console.log(`Shows sheet:           ${NEW.shows.length}`);
  console.log(`Shows match en SB:     ${NEW.shows.length - unmatchedShows.length}`);
  console.log(`Shows sin match:       ${unmatchedShows.length}`);
  console.log(`Shows ambiguos:        ${ambiguousShows.length}`);
  console.log(`Relaciones nuevas:     ${newRelations.length}`);
  console.log(`Artistas sin match:    ${unmatchedArtistas.length}`);
  console.log(`Existing a borrar:     ${existing.length}`);
  console.log(`shows.artista_id a actualizar: ${artistaIdByShowSlugPos1.size}`);

  if (unmatchedShows.length) {
    console.log('\nShows sin match en SB:');
    unmatchedShows.slice(0, 15).forEach(u => console.log(`  - [${u.macro}] ${u.name}`));
    if (unmatchedShows.length > 15) console.log(`  … +${unmatchedShows.length - 15}`);
  }
  if (ambiguousShows.length) {
    console.log('\nShows ambiguos (mismo nombre, distinta cat):');
    ambiguousShows.forEach(a => console.log(`  ? ${a.name} (sheet macro=${a.macro}) → ${a.candidates.map(c => c.cat||'-').join(', ')}`));
  }
  if (unmatchedArtistas.length) {
    console.log('\nArtistas sin match en algún show:');
    unmatchedArtistas.slice(0, 15).forEach(u => console.log(`  - "${u.artista}" en "${u.show}" <${u.email||'-'}>`));
    if (unmatchedArtistas.length > 15) console.log(`  … +${unmatchedArtistas.length - 15}`);
  }

  fs.writeFileSync(OUT, JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    summary: {
      sheet_shows: NEW.shows.length,
      shows_matched: NEW.shows.length - unmatchedShows.length,
      shows_unmatched: unmatchedShows.length,
      shows_ambiguous: ambiguousShows.length,
      new_relations: newRelations.length,
      unmatched_artistas: unmatchedArtistas.length,
      existing_to_delete: existing.length,
      shows_artista_id_updates: artistaIdByShowSlugPos1.size
    },
    unmatchedShows, ambiguousShows, unmatchedArtistas,
    sample_new_relations: newRelations.slice(0, 20)
  }, null, 2));

  if (!APPLY) {
    console.log(`\nDry-run reporte: ${OUT}`);
    console.log('Re-ejecuta con --apply para destruir+reinsertar.');
    return;
  }

  // ---- APPLY ----
  console.log('\n--- APPLY ---');
  console.log('Borrando show_artistas (todos)…');
  await req('DELETE', 'show_artistas?show_id=neq.__none__');

  console.log(`Insertando ${newRelations.length} relaciones (batch de 100)…`);
  let ins = 0, errs = [];
  for (let i = 0; i < newRelations.length; i += 100) {
    const batch = newRelations.slice(i, i + 100);
    try {
      await req('POST', 'show_artistas', batch);
      ins += batch.length;
      process.stdout.write('.');
    } catch (e) {
      errs.push({ batch: i, error: e.message });
      process.stdout.write('x');
    }
  }
  console.log('');

  console.log(`\nActualizando shows.artista_id en ${artistaIdByShowSlugPos1.size} shows…`);
  let upd = 0;
  for (const [show_id, artista_id] of artistaIdByShowSlugPos1) {
    try {
      await req('PATCH', `shows?id=eq.${encodeURIComponent(show_id)}`, { artista_id });
      upd++;
      process.stdout.write('.');
    } catch (e) {
      errs.push({ show_id, error: e.message });
      process.stdout.write('x');
    }
  }
  console.log('');

  // Also clear shows.artista_id for shows that no longer have a posicion=1 (e.g. Toni)
  console.log('Limpiando shows.artista_id para shows huérfanos…');
  let cleared = 0;
  for (const sbShow of sbShows) {
    if (!artistaIdByShowSlugPos1.has(sbShow.id) && sbShow.artista_id) {
      try {
        await req('PATCH', `shows?id=eq.${encodeURIComponent(sbShow.id)}`, { artista_id: null });
        cleared++;
        process.stdout.write('o');
      } catch (e) {
        errs.push({ show_id: sbShow.id, op: 'clear', error: e.message });
        process.stdout.write('x');
      }
    }
  }
  console.log('');

  console.log('\n=== APPLY DONE ===');
  console.log(`Inserted: ${ins}`);
  console.log(`Updated shows.artista_id: ${upd}`);
  console.log(`Cleared shows.artista_id: ${cleared}`);
  console.log(`Errors: ${errs.length}`);
  if (errs.length) errs.slice(0, 5).forEach(e => console.log(' -', JSON.stringify(e).substring(0, 300)));
})();
