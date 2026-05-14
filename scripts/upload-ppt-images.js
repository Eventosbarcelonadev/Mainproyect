/**
 * Sube las imágenes extraídas de las PPTs (manifest de extract-ppt-images.js)
 * al bucket 'artist-assets' de Supabase Storage y backfillea shows.image_url.
 *
 * GUARDA: solo escribe en shows cuyo image_url está vacío. Nunca pisa los que
 * ya tienen imagen (ver feedback: "No toques los que ya tenemos").
 *
 * Uso: node scripts/upload-ppt-images.js [--dry]
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'artist-assets';
const PREFIX = 'shows';
const MANIFEST = '/tmp/shows-preview/manifest.json';
const DRY = process.argv.includes('--dry');

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

async function currentImageUrls(ids) {
  // map id -> image_url para chequear el guard antes de escribir
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const inList = chunk.map(encodeURIComponent).join(',');
    const r = await fetch(`${SB}/rest/v1/shows?id=in.(${inList})&select=id,image_url`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!r.ok) throw new Error('fetch shows ' + r.status + ' ' + await r.text());
    (await r.json()).forEach(s => { out[s.id] = s.image_url; });
  }
  return out;
}

(async () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  console.log(`Manifest: ${manifest.length} imágenes${DRY ? ' (DRY RUN)' : ''}\n`);

  const curr = await currentImageUrls(manifest.map(m => m.show_id));

  let uploaded = 0, skipped = 0, failed = 0;
  for (const m of manifest) {
    const existing = curr[m.show_id];
    if (existing && String(existing).trim()) {
      console.log(`SKIP  ${m.name} — ya tiene image_url`);
      skipped++;
      continue;
    }
    const ext = path.extname(m.preview_path).toLowerCase();
    const objectPath = `${PREFIX}/${m.show_id}${ext}`;
    const publicUrl = `${SB}/storage/v1/object/public/${BUCKET}/${objectPath}`;

    if (DRY) {
      console.log(`WOULD ${m.name} -> ${objectPath}`);
      uploaded++;
      continue;
    }

    try {
      // 1. subir a Storage (upsert por si se re-corre)
      const body = fs.readFileSync(m.preview_path);
      const up = await fetch(`${SB}/storage/v1/object/${BUCKET}/${objectPath}`, {
        method: 'POST',
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'x-upsert': 'true',
        },
        body,
      });
      if (!up.ok) throw new Error('storage ' + up.status + ' ' + (await up.text()).slice(0, 200));

      // 2. backfill image_url (re-chequeo del guard: solo null o string vacío)
      const patch = await fetch(`${SB}/rest/v1/shows?id=eq.${encodeURIComponent(m.show_id)}&or=(image_url.is.null,image_url.eq.)`, {
        method: 'PATCH',
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ image_url: publicUrl }),
      });
      if (!patch.ok) throw new Error('patch ' + patch.status + ' ' + (await patch.text()).slice(0, 200));
      const rows = await patch.json();
      if (!rows.length) {
        console.log(`SKIP  ${m.name} — image_url dejó de estar vacío (carrera), no se pisó`);
        skipped++;
        continue;
      }
      console.log(`OK    ${m.name} -> ${objectPath}`);
      uploaded++;
    } catch (e) {
      console.log(`FAIL  ${m.name} — ${e.message}`);
      failed++;
    }
  }

  console.log(`\n=== ${DRY ? 'DRY ' : ''}RESUMEN ===`);
  console.log(`Subidos/backfilleados: ${uploaded}`);
  console.log(`Saltados (ya tenían imagen): ${skipped}`);
  console.log(`Fallidos: ${failed}`);
})().catch(e => { console.error(e); process.exit(1); });
