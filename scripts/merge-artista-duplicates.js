#!/usr/bin/env node
/**
 * Merge 3 duplicados de artistas existentes en Supabase.
 *
 * Patrón: fila vieja (email placeholder, ghl_id inicial) y fila nueva (email
 * real, ghl_id nuevo) por el mismo teléfono. Fusionamos al más reciente:
 *   - Migra show_artistas (join N:M) del viejo al nuevo si no colisiona.
 *   - Migra shows legacy (FK shows.artista_id = viejo).
 *   - Merge fotos_urls (append de las que no tenga ya el nuevo).
 *   - Borra el row viejo.
 *   - Borra (best-effort) el contacto GHL huérfano.
 *
 * Uso:
 *   node scripts/merge-artista-duplicates.js         # dry run
 *   node scripts/merge-artista-duplicates.js --apply
 */

import 'dotenv/config';

const APPLY = process.argv.includes('--apply');
const SB = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const GHL_TOKEN = process.env.GHL_API_KEY;
const GHL_LOC = process.env.GHL_LOCATION_ID;

if (!SB || !SB_KEY) { console.error('missing SUPABASE env'); process.exit(1); }

const sbHdr = {
  apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json'
};

// Los 3 pares: [oldId, newId] — canonical = newId (email real)
const MERGES = [
  { old: 'd856175c-581c-4818-87a1-83f11b5abd66', new: '50d0aab5-5136-4b6f-9363-9a972d37742b' }, // Rudy saxo 2
  { old: '03c09c63-0565-4a27-956f-fcd5e4121e9b', new: '24e63288-a56e-46c9-8857-a53472d0168a' }, // Joan Swing → Joan Torrento
  { old: 'cdda4950-3a40-42e6-9181-6717de2e3ca7', new: '9f79dd7e-7685-4de1-9785-59678ff0540c' }  // Alba Pole Dancer → Alba Blasco
];

async function fetchArtista(id) {
  const r = await fetch(`${SB}/rest/v1/artistas?id=eq.${id}&select=*`, { headers: sbHdr });
  return (await r.json())[0];
}

async function fetchShowArtistas(artistaId) {
  const r = await fetch(`${SB}/rest/v1/show_artistas?artista_id=eq.${artistaId}&select=*`, { headers: sbHdr });
  return await r.json();
}

async function fetchLegacyShows(artistaId) {
  const r = await fetch(`${SB}/rest/v1/shows?artista_id=eq.${artistaId}&select=id,name`, { headers: sbHdr });
  return await r.json();
}

async function migrateShowArtistas(oldId, newId, oldRows) {
  // Para cada show del viejo: si el nuevo NO tiene ya una entrada para ese show,
  // migrar (update artista_id). Si sí tiene, borrar la del viejo (duplicado).
  const newLinks = await fetchShowArtistas(newId);
  const newShowIds = new Set(newLinks.map(x => x.show_id));
  const results = { migrated: 0, deletedDup: 0 };
  for (const link of oldRows) {
    if (newShowIds.has(link.show_id)) {
      if (APPLY) await fetch(`${SB}/rest/v1/show_artistas?show_id=eq.${link.show_id}&artista_id=eq.${oldId}`, {
        method: 'DELETE', headers: sbHdr
      });
      results.deletedDup++;
    } else {
      if (APPLY) await fetch(`${SB}/rest/v1/show_artistas?show_id=eq.${link.show_id}&artista_id=eq.${oldId}`, {
        method: 'PATCH', headers: sbHdr, body: JSON.stringify({ artista_id: newId })
      });
      results.migrated++;
    }
  }
  return results;
}

async function migrateLegacyShows(oldId, newId, shows) {
  if (!shows.length) return { migrated: 0 };
  if (APPLY) {
    await fetch(`${SB}/rest/v1/shows?artista_id=eq.${oldId}`, {
      method: 'PATCH', headers: sbHdr, body: JSON.stringify({ artista_id: newId })
    });
  }
  return { migrated: shows.length };
}

async function mergeFotos(oldFotos, newFotos) {
  const combined = [...(newFotos || []), ...(oldFotos || []).filter(u => !(newFotos || []).includes(u))];
  return combined.filter(Boolean);
}

async function deleteArtista(id) {
  if (!APPLY) return;
  await fetch(`${SB}/rest/v1/artistas?id=eq.${id}`, { method: 'DELETE', headers: sbHdr });
}

async function deleteGhlContact(ghlId) {
  if (!APPLY || !GHL_TOKEN || !ghlId) return;
  try {
    await fetch(`https://services.leadconnectorhq.com/contacts/${ghlId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${GHL_TOKEN}`, Version: '2021-07-28' }
    });
  } catch (e) { /* best-effort */ }
}

(async () => {
  console.log(`=== Merge duplicados artistas ${APPLY ? '(APPLY)' : '(dry run)'} ===\n`);
  for (const { old: oldId, new: newId } of MERGES) {
    const [oldA, newA] = await Promise.all([fetchArtista(oldId), fetchArtista(newId)]);
    if (!oldA || !newA) { console.log(`SKIP: no encontrado ${oldA ? newId : oldId}`); continue; }
    const oldLinks = await fetchShowArtistas(oldId);
    const oldLegacy = await fetchLegacyShows(oldId);
    console.log(`\n${(oldA.nombre_artistico || oldA.nombre).padEnd(25)} viejo=${oldId.slice(0,8)} → nuevo=${newId.slice(0,8)}`);
    console.log(`  show_artistas viejo: ${oldLinks.length}  legacy shows: ${oldLegacy.length}  fotos viejo: ${(oldA.fotos_urls || []).length}  fotos nuevo: ${(newA.fotos_urls || []).length}`);
    const linkRes = await migrateShowArtistas(oldId, newId, oldLinks);
    const legacyRes = await migrateLegacyShows(oldId, newId, oldLegacy);
    const mergedFotos = await mergeFotos(oldA.fotos_urls, newA.fotos_urls);
    if (mergedFotos.length > (newA.fotos_urls || []).length && APPLY) {
      await fetch(`${SB}/rest/v1/artistas?id=eq.${newId}`, {
        method: 'PATCH', headers: sbHdr, body: JSON.stringify({ fotos_urls: mergedFotos })
      });
    }
    console.log(`  → show_artistas: migrated=${linkRes.migrated} deletedDup=${linkRes.deletedDup}  legacy_migrated=${legacyRes.migrated}  fotos_final=${mergedFotos.length}`);
    await deleteArtista(oldId);
    await deleteGhlContact(oldA.ghl_contact_id);
    console.log(`  → deleted row Supabase + GHL contact ${oldA.ghl_contact_id || '-'}`);
  }
  console.log(`\n${APPLY ? '✅ Aplicado.' : 'Dry run. Ejecutá con --apply para fusionar.'}`);
})();
