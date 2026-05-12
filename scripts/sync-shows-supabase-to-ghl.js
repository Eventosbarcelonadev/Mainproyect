#!/usr/bin/env node
/**
 * Sync one-way: Supabase shows → GHL custom_objects.shows
 *
 * - Lee shows activos (active=true AND status='active') desde Supabase.
 * - Upsert en GHL custom object por nombre_show (key implícita = primaryDisplay).
 * - Mantiene mapping ghl_show_id en supabase.shows (columna opcional; si no existe, se ignora).
 * - Asociación show↔artista (contact) se deja para una segunda pasada — requiere
 *   resolver el endpoint de associations en GHL.
 *
 * Uso:
 *   node scripts/sync-shows-supabase-to-ghl.js              # dry run
 *   node scripts/sync-shows-supabase-to-ghl.js --apply      # ejecuta upsert
 *   node scripts/sync-shows-supabase-to-ghl.js --apply --limit 10
 */

import 'dotenv/config';

const API = 'https://services.leadconnectorhq.com';
const TOKEN = process.env.GHL_API_KEY;
const LOC = process.env.GHL_LOCATION_ID;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.find((a, i) => process.argv[i - 1] === '--limit');
const LIMIT = limitArg ? parseInt(limitArg, 10) : null;

if (!TOKEN || !LOC || !SB_URL || !SB_KEY) {
  console.error('Faltan env vars: GHL_API_KEY / GHL_LOCATION_ID / SUPABASE_URL / SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const GHL_HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json'
};
const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json'
};

const OBJ = 'custom_objects.shows';

async function fetchShows() {
  const q = `${SB_URL}/rest/v1/shows?active=eq.true&status=eq.active&select=*&order=name.asc`;
  const r = await fetch(q, { headers: SB_HEADERS });
  if (!r.ok) throw new Error(`Supabase shows ${r.status}: ${await r.text()}`);
  return r.json();
}

async function fetchAllGhlShows() {
  // Paginado simple: pedimos en bloques hasta vaciar
  const all = [];
  let searchAfter = null;
  while (true) {
    const body = { locationId: LOC, page: 1, pageLimit: 100, query: '' };
    if (searchAfter) body.searchAfter = searchAfter;
    const r = await fetch(`${API}/objects/${OBJ}/records/search`, {
      method: 'POST',
      headers: GHL_HEADERS,
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`GHL search ${r.status}: ${await r.text()}`);
    const d = await r.json();
    const batch = d.records || [];
    all.push(...batch);
    const last = batch[batch.length - 1];
    if (!last || batch.length < 100) break;
    searchAfter = last.searchAfter || last.sort;
    if (!searchAfter) break;
  }
  return all;
}

async function createRecord(payload) {
  const r = await fetch(`${API}/objects/${OBJ}/records`, {
    method: 'POST',
    headers: GHL_HEADERS,
    body: JSON.stringify(payload)
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`POST record ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t);
}

async function updateRecord(recordId, properties) {
  const r = await fetch(`${API}/objects/${OBJ}/records/${recordId}`, {
    method: 'PUT',
    headers: GHL_HEADERS,
    body: JSON.stringify({ locationId: LOC, properties })
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`PUT record ${recordId} ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t);
}

function mapShow(s) {
  const props = {
    nombre_show: s.name || '',
    descripcion_show: s.description || '',
  };
  if (s.base_price != null) props.precio = Number(s.base_price);
  if (s.video_url) props.url_video = s.video_url;
  // adjunto_fotos (FILE_UPLOAD, maxFileLimit=1) — GHL no acepta URL externa directa.
  // dossier_pdf y duraccion: no hay equivalente en Supabase shows todavía.
  return props;
}

(async () => {
  console.log(`=== Sync shows Supabase → GHL ${APPLY ? '(APPLY)' : '(dry run)'} ===\n`);
  const [shows, ghlRecords] = await Promise.all([fetchShows(), fetchAllGhlShows()]);
  console.log(`Supabase: ${shows.length} shows activos`);
  console.log(`GHL: ${ghlRecords.length} records existentes\n`);

  const byName = new Map();
  for (const r of ghlRecords) {
    const n = (r.properties?.nombre_show || '').trim().toLowerCase();
    if (n) byName.set(n, r);
  }

  const todo = LIMIT ? shows.slice(0, LIMIT) : shows;
  let created = 0, updated = 0, skipped = 0;

  for (const s of todo) {
    const name = (s.name || '').trim();
    if (!name) { skipped++; continue; }
    const existing = byName.get(name.toLowerCase());
    const props = mapShow(s);

    if (existing) {
      // Sólo actualiza si hay diff en algún field core
      const diff = ['descripcion_show', 'precio', 'url_video'].some(
        (k) => String(existing.properties?.[k] ?? '') !== String(props[k] ?? '')
      );
      if (!diff) { skipped++; continue; }
      console.log(`UPD ${name}  (id=${existing.id})`);
      if (APPLY) {
        try { await updateRecord(existing.id, props); updated++; }
        catch (e) { console.error(`  ✗ ${e.message}`); }
      } else { updated++; }
    } else {
      console.log(`NEW ${name}  precio=${props.precio ?? '-'}`);
      if (APPLY) {
        try {
          const r = await createRecord({ locationId: LOC, properties: props });
          created++;
          // Si supabase.shows tiene columna ghl_show_id, guardamos el binding
          await fetch(`${SB_URL}/rest/v1/shows?id=eq.${encodeURIComponent(s.id)}`, {
            method: 'PATCH',
            headers: SB_HEADERS,
            body: JSON.stringify({ ghl_show_id: r.record?.id || r.id || null })
          }).catch(() => {});
        } catch (e) { console.error(`  ✗ ${e.message}`); }
      } else { created++; }
    }
  }

  console.log(`\nResumen: created=${created} updated=${updated} skipped=${skipped}`);
  if (!APPLY) console.log(`\n→ Dry run. Para aplicar: --apply`);
})();
