/**
 * Seed Supabase.artistas con los 158 representantes del sheet nuevo (1ThFrtK_)
 * y archivar los performers viejos.
 *
 * Pre-requisito: aplicar migración supabase/migrations/20260518_artistas_archived_and_seed_v2.sql
 *
 * Lógica:
 *   1. Carga sheet nuevo + mapa ghl_contact_id
 *   2. Carga TODOS los artistas actuales de Supabase
 *   3. Para cada artista del sheet:
 *      - SKIP si nombre = "635 774 410" (fake del parser)
 *      - Match en SB por: email → ghl_contact_id → nombre normalizado
 *      - Si existe: UPDATE (nombre, email, telefono, ghl_contact_id, archived=FALSE)
 *      - Si no: INSERT (email placeholder si no hay email real)
 *   4. Artistas SB no presentes en el sheet (ni por email/ghl_id/nombre):
 *      - UPDATE archived=TRUE, archived_at=NOW(), archived_reason='replaced by representante model 2026-05-18'
 *
 * Uso:
 *   node scripts/seed-artistas-from-new-sheet.js              # dry-run
 *   node scripts/seed-artistas-from-new-sheet.js --apply      # escribe Supabase
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const { randomUUID } = require('crypto');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();
const APPLY = process.argv.includes('--apply');

const NEW = require('../data/xavi-shows-artistas.json');
const OLD = require('../data/xavi-artistas.json'); // legacy sheet (1ZjP0Ur) — 266 performers
const ID_MAP = require('../data/ghl-artistas-id-map.json');
const OUT = path.join(__dirname, '..', 'data', `seed-artistas-report-${new Date().toISOString().slice(0,10)}.json`);

function clean(s) { return String(s || '').replace(/[‪‫‬‭‮‎‏]/g, '').trim(); }
function normEmail(s) { return String(s || '').trim().toLowerCase().replace(/[>\s]+$/g, ''); }
function normName(s) { return clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + '/rest/v1/' + urlPath);
    const opts = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: (method === 'POST' || method === 'PATCH') ? 'return=representation' : ''
      }
    };
    const r = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(data ? JSON.parse(data) : null); }
          catch { resolve(data); }
        } else reject(new Error(`${method} ${urlPath} → ${res.statusCode}: ${data.substring(0, 300)}`));
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function fetchAllArtistas(includeArchived) {
  const all = [];
  let from = 0;
  const PAGE = 1000;
  const cols = includeArchived
    ? 'id,nombre,nombre_artistico,email,telefono,ghl_contact_id,archived'
    : 'id,nombre,nombre_artistico,email,telefono,ghl_contact_id';
  while (true) {
    const url = new URL(SUPABASE_URL + '/rest/v1/artistas');
    url.searchParams.set('select', cols);
    url.searchParams.set('order', 'created_at.asc');
    const opts = {
      method: 'GET',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        Range: `${from}-${from + PAGE - 1}`
      }
    };
    const chunk = await new Promise((resolve, reject) => {
      const r = https.request(opts, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(data)); } catch { resolve([]); }
          } else reject(new Error(`GET artistas → ${res.statusCode}: ${data.substring(0, 200)}`));
        });
      });
      r.on('error', reject);
      r.end();
    });
    all.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

(async () => {
  console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('Cargando artistas de Supabase…');
  let sbAll, hasArchived = true;
  try {
    sbAll = await fetchAllArtistas(true);
  } catch (e) {
    if (/archived does not exist/.test(e.message)) {
      hasArchived = false;
      sbAll = await fetchAllArtistas(false);
      // Add origen to selection (needed for archive filter even before migration)
      const all = [];
      let from = 0;
      while (true) {
        const url = new URL(SUPABASE_URL + '/rest/v1/artistas');
        url.searchParams.set('select', 'id,nombre,nombre_artistico,email,telefono,ghl_contact_id,origen');
        url.searchParams.set('order', 'created_at.asc');
        const chunk = await new Promise((res, rej) => {
          const r = https.request({ method: 'GET', hostname: url.hostname, path: url.pathname + url.search,
            headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, Range: `${from}-${from + 999}` }}, x => {
            let d = ''; x.on('data', c => d += c); x.on('end', () => res(JSON.parse(d)));
          });
          r.on('error', rej); r.end();
        });
        all.push(...chunk);
        if (chunk.length < 1000) break;
        from += 1000;
      }
      sbAll = all;
    } else throw e;
  }
  // Ensure origen is loaded even when archived col is present
  if (hasArchived && sbAll.length && !('origen' in sbAll[0])) {
    const url = new URL(SUPABASE_URL + '/rest/v1/artistas');
    url.searchParams.set('select', 'id,origen');
    const map = await new Promise((res, rej) => {
      const r = https.request({ method: 'GET', hostname: url.hostname, path: url.pathname + url.search,
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }}, x => {
        let d = ''; x.on('data', c => d += c); x.on('end', () => res(JSON.parse(d)));
      });
      r.on('error', rej); r.end();
    });
    const om = new Map(map.map(m => [m.id, m.origen]));
    for (const r of sbAll) r.origen = om.get(r.id) || null;
  }
  console.log(`  Total Supabase: ${sbAll.length} (archived col: ${hasArchived ? 'present' : 'MISSING'})`);
  if (!hasArchived) {
    console.warn('\n⚠ Columna `archived` NO presente en respuestas — migración aún no aplicada.');
    if (APPLY) {
      console.error('Abortando APPLY: aplica antes la migración supabase/migrations/20260518_artistas_archived_and_seed_v2.sql');
      process.exit(1);
    }
  }

  // Indices Supabase
  const sbByEmail = new Map(), sbByGhl = new Map(), sbByName = new Map();
  for (const r of sbAll) {
    const e = normEmail(r.email); if (e) sbByEmail.set(e, r);
    if (r.ghl_contact_id) sbByGhl.set(r.ghl_contact_id, r);
    const n = normName(r.nombre || ''); if (n) {
      if (!sbByName.has(n)) sbByName.set(n, []);
      sbByName.get(n).push(r);
    }
  }

  // ghl_id_map: nombre → ghl_contact_id
  const ghlByName = new Map(ID_MAP.matched.map(m => [m.nombre, m.ghl_contact_id]));

  const plan = { upsert_new: [], update_existing: [], archive: [], skip: [] };
  const matchedSbIds = new Set();

  for (const a of NEW.artistas) {
    if (a.nombre === '635 774 410') {
      plan.skip.push({ nombre: a.nombre, reason: 'fake artist (parser anomaly fila WOW #18)' });
      continue;
    }
    const ghlId = ghlByName.get(a.nombre) || null;
    const email = normEmail(a.email);

    // Match en SB
    let sbRow = null, strategy = null;
    if (email && sbByEmail.has(email)) { sbRow = sbByEmail.get(email); strategy = 'email'; }
    else if (ghlId && sbByGhl.has(ghlId)) { sbRow = sbByGhl.get(ghlId); strategy = 'ghl_contact_id'; }
    else {
      const cands = sbByName.get(normName(a.nombre)) || [];
      if (cands.length === 1) { sbRow = cands[0]; strategy = 'name'; }
    }

    const placeholderEmail = `artista-${(a.nombre || 'sin-nombre').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g,'')}-${(ghlId || randomUUID()).slice(0, 8)}@placeholder.eventosbarcelona.com`;
    const payload = {
      nombre: a.nombre,
      email: a.email || placeholderEmail,
      telefono: a.telefono ? clean(a.telefono) : null,
      ghl_contact_id: ghlId,
      origen: 'sheet-xavi-1ThFrtK-2026-05-18',
      archived: false,
      archived_at: null,
      archived_reason: null
    };

    if (sbRow) {
      matchedSbIds.add(sbRow.id);
      plan.update_existing.push({ sb_id: sbRow.id, strategy, current: sbRow, new: payload });
    } else {
      payload.token = randomUUID();
      payload.acepto_privacidad = true;
      payload.acepto_visibilidad = false;
      plan.upsert_new.push({ payload });
    }
  }

  // Archivar SOLO performers REALES del modelo viejo: los que tenían shows en el sheet 1ZjP0Ur.
  // Los 189 long-tail sin shows del JSON viejo NO son performers — son contactos importados de GHL.
  // Filtros adicionales de seguridad: nunca archivar proveedores ni leads web.
  const oldPerformerNames = new Set(
    OLD.artistas.filter(a => (a.shows_vinculados || []).length > 0).map(a => normName(a.nombre))
  );
  console.log(`Old sheet performers con shows: ${oldPerformerNames.size}`);
  const PROTECTED_ORIGENES = new Set(['web-formulario', 'ghl-proveedor-import']);
  for (const r of sbAll) {
    if (matchedSbIds.has(r.id)) continue;
    if (r.archived) continue;
    if (PROTECTED_ORIGENES.has(r.origen)) continue;
    const n = normName(r.nombre || '');
    if (!oldPerformerNames.has(n)) continue;
    plan.archive.push({ sb_id: r.id, nombre: r.nombre, email: r.email, ghl_contact_id: r.ghl_contact_id, origen: r.origen });
  }

  console.log('\n=== Plan ===');
  console.log(`Upsert new:       ${plan.upsert_new.length}`);
  console.log(`Update existing:  ${plan.update_existing.length}`);
  console.log(`Archive:          ${plan.archive.length}`);
  console.log(`Skip (fake):      ${plan.skip.length}`);

  if (plan.update_existing.length > 0) {
    console.log('\n--- Sample update_existing ---');
    plan.update_existing.slice(0, 5).forEach(u => {
      const diffs = [];
      if (u.current.nombre !== u.new.nombre) diffs.push(`nombre: "${u.current.nombre}"→"${u.new.nombre}"`);
      if (u.current.email !== u.new.email) diffs.push(`email: "${u.current.email}"→"${u.new.email}"`);
      if (u.current.telefono !== u.new.telefono) diffs.push(`tel: "${u.current.telefono}"→"${u.new.telefono}"`);
      if (u.current.ghl_contact_id !== u.new.ghl_contact_id) diffs.push(`ghl_id: "${u.current.ghl_contact_id}"→"${u.new.ghl_contact_id}"`);
      console.log(`  Δ [${u.strategy}] ${u.current.nombre} (id=${u.sb_id}): ${diffs.join('; ') || '(no diffs)'}`);
    });
  }
  if (plan.upsert_new.length > 0) {
    console.log('\n--- Sample upsert_new ---');
    plan.upsert_new.slice(0, 5).forEach(u => console.log(`  + ${u.payload.nombre} <${u.payload.email}> ghl:${u.payload.ghl_contact_id || '-'}`));
  }
  if (plan.archive.length > 0) {
    console.log('\n--- Sample archive ---');
    plan.archive.slice(0, 5).forEach(a => console.log(`  - ${a.nombre} (id=${a.sb_id}) <${a.email}>`));
    if (plan.archive.length > 5) console.log(`  … +${plan.archive.length - 5}`);
  }

  if (!APPLY) {
    fs.writeFileSync(OUT, JSON.stringify({ mode: 'dry-run', plan }, null, 2));
    console.log(`\nDry-run reporte: ${OUT}`);
    console.log('Re-ejecuta con --apply para escribir.');
    return;
  }

  // ---- APPLY ----
  const report = { mode: 'apply', timestamp: new Date().toISOString(), updated: [], inserted: [], archived: [], errors: [] };

  console.log('\nAplicando UPDATEs…');
  for (const u of plan.update_existing) {
    try {
      const r = await req('PATCH', `artistas?id=eq.${u.sb_id}`, u.new);
      report.updated.push({ id: u.sb_id, nombre: u.new.nombre });
      process.stdout.write('.');
    } catch (e) {
      report.errors.push({ op: 'update', id: u.sb_id, nombre: u.new.nombre, error: e.message });
      process.stdout.write('x');
    }
  }
  console.log('');

  console.log('\nAplicando INSERTs…');
  for (const u of plan.upsert_new) {
    try {
      const r = await req('POST', 'artistas', u.payload);
      const newId = Array.isArray(r) && r[0] ? r[0].id : null;
      report.inserted.push({ id: newId, nombre: u.payload.nombre });
      process.stdout.write('+');
    } catch (e) {
      report.errors.push({ op: 'insert', nombre: u.payload.nombre, error: e.message });
      process.stdout.write('x');
    }
  }
  console.log('');

  console.log('\nAplicando ARCHIVEs…');
  const archivePayload = { archived: true, archived_at: new Date().toISOString(), archived_reason: 'replaced by representante model 2026-05-18' };
  for (const a of plan.archive) {
    try {
      const r = await req('PATCH', `artistas?id=eq.${a.sb_id}`, archivePayload);
      report.archived.push({ id: a.sb_id, nombre: a.nombre });
      process.stdout.write('a');
    } catch (e) {
      report.errors.push({ op: 'archive', id: a.sb_id, nombre: a.nombre, error: e.message });
      process.stdout.write('x');
    }
  }
  console.log('');

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log('\n=== RESUMEN APPLY ===');
  console.log(`Updated:   ${report.updated.length}`);
  console.log(`Inserted:  ${report.inserted.length}`);
  console.log(`Archived:  ${report.archived.length}`);
  console.log(`Errors:    ${report.errors.length}`);
  if (report.errors.length) {
    console.log('\nErrors (top 10):');
    report.errors.slice(0, 10).forEach(e => console.log(' -', JSON.stringify(e).substring(0, 250)));
  }
  console.log(`\nReporte: ${OUT}`);
})();
