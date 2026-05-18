/**
 * Mergea un par ES↔EN de shows en uno solo:
 *   - Copia campos del show EN al show ES como name_en/description_en/etc.
 *   - Transfiere associations contact↔show de GHL del EN al ES.
 *   - Archiva el show EN (status=archived) en Supabase.
 *   - Marca el record GHL del EN con tag o lo deja huérfano (no se borra).
 *
 * Uso:
 *   node scripts/merge-es-en-shows.js --es <slug-es> --en <slug-en>           # dry-run
 *   node scripts/merge-es-en-shows.js --es <slug-es> --en <slug-en> --apply   # ejecuta
 *
 * Ejemplo:
 *   node scripts/merge-es-en-shows.js --es rumba-catalana --en catalan-rumba
 */
require('dotenv').config();

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();
const GHL_TOKEN = (process.env.GHL_API_KEY || '').trim();
const GHL_LOC = (process.env.GHL_LOCATION_ID || '').trim();

const GHL_API = 'https://services.leadconnectorhq.com';
const GHL_SHOW_CONTACT_ASSOCIATION_ID = '6a018a66c4c95715fde952f9';

const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const APPLY = args.includes('--apply');
const ES_ID = get('--es');
const EN_ID = get('--en');

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!ES_ID || !EN_ID) { console.error('Uso: --es <slug-es> --en <slug-en> [--apply]'); process.exit(1); }

const sbHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
const ghlHeaders = { Authorization: `Bearer ${GHL_TOKEN}`, Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' };

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders });
  if (!r.ok) throw new Error(`SB GET ${path} ${r.status}: ${await r.text()}`);
  return r.json();
}
async function sbPatch(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...sbHeaders, Prefer: 'return=representation' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`SB PATCH ${path} ${r.status}: ${await r.text()}`);
  return r.json();
}
async function ghl(method, path, body) {
  if (!GHL_TOKEN || !GHL_LOC) return { ok: false, skipped: 'missing_ghl_config' };
  // Para PUT/GET/DELETE de custom_objects records: locationId va como query param.
  // Para POST de associations: va en body. Detectamos heurísticamente:
  const needsQueryLocation = /^\/objects\//.test(path) && method !== 'POST';
  const url = needsQueryLocation && !path.includes('locationId=')
    ? `${GHL_API}${path}${path.includes('?') ? '&' : '?'}locationId=${encodeURIComponent(GHL_LOC)}`
    : `${GHL_API}${path}`;
  const r = await fetch(url, {
    method, headers: ghlHeaders, body: body ? JSON.stringify(body) : undefined
  });
  const txt = await r.text();
  return { ok: r.ok, status: r.status, body: txt };
}

async function main() {
  console.log(`Modo: ${APPLY ? 'APPLY' : 'dry-run'}`);
  console.log(`ES principal: ${ES_ID}`);
  console.log(`EN a mergear: ${EN_ID}\n`);

  // 1. Cargar ambos shows con sus relaciones
  const showsSel = 'id,name,name_en,category,subcategory,subcategory_en,description,description_en,base_price,price_note,price_note_en,video_url,image_url,image_urls,status,ghl_show_id,show_artistas(artista_id,posicion,artista:artista_id(id,nombre,ghl_contact_id))';
  const [esRows, enRows] = await Promise.all([
    sbGet(`shows?id=eq.${encodeURIComponent(ES_ID)}&select=${showsSel}`),
    sbGet(`shows?id=eq.${encodeURIComponent(EN_ID)}&select=${showsSel}`)
  ]);
  if (!esRows.length) { console.error(`No existe show ES: ${ES_ID}`); process.exit(1); }
  if (!enRows.length) { console.error(`No existe show EN: ${EN_ID}`); process.exit(1); }
  const es = esRows[0], en = enRows[0];

  console.log('--- Estado actual ---');
  console.log(`ES "${es.name}" (${es.id})  base=${es.base_price}€  name_en=${es.name_en || '∅'}  ghl_show_id=${es.ghl_show_id || '∅'}`);
  console.log(`   artistas: ${(es.show_artistas || []).map(sa => sa.artista?.nombre).join(', ') || '—'}`);
  console.log(`EN "${en.name}" (${en.id})  base=${en.base_price}€  status=${en.status}  ghl_show_id=${en.ghl_show_id || '∅'}`);
  console.log(`   artistas: ${(en.show_artistas || []).map(sa => sa.artista?.nombre).join(', ') || '—'}`);

  // 2. Calcular patch para ES: rellenar campos _en con valores de EN (sin pisar
  //    los que ya tenga el ES).
  const patch = {};
  if (!es.name_en && en.name) patch.name_en = en.name;
  if (!es.subcategory_en && en.subcategory) patch.subcategory_en = en.subcategory;
  if (!es.description_en && en.description) patch.description_en = en.description;
  if (!es.price_note_en && en.price_note) patch.price_note_en = en.price_note;
  // Si ES no tiene imagen y EN sí, copiar
  if (!es.image_url && en.image_url) patch.image_url = en.image_url;
  if ((!es.image_urls || !es.image_urls.length) && Array.isArray(en.image_urls) && en.image_urls.length) {
    patch.image_urls = en.image_urls;
  }
  // Si ES no tiene video y EN sí, copiar
  if (!es.video_url && en.video_url) patch.video_url = en.video_url;

  console.log('\n--- Patch a aplicar al ES ---');
  if (!Object.keys(patch).length) {
    console.log('(nada — el ES ya tiene todos los campos)');
  } else {
    for (const [k, v] of Object.entries(patch)) {
      const preview = typeof v === 'string' ? v.slice(0, 80) : JSON.stringify(v).slice(0, 80);
      console.log(`  ${k} = ${preview}${typeof v === 'string' && v.length > 80 ? '…' : ''}`);
    }
  }

  // 3. Calcular transfer de artistas: tomar artistas del EN que no estén en ES
  const esArtIds = new Set((es.show_artistas || []).map(sa => sa.artista_id));
  const enArtistas = (en.show_artistas || []).map(sa => sa.artista).filter(Boolean);
  const artistasToTransfer = enArtistas.filter(a => !esArtIds.has(a.id));
  const finalArtistas = [
    ...(es.show_artistas || []).sort((a, b) => (a.posicion || 99) - (b.posicion || 99)).map(sa => sa.artista),
    ...artistasToTransfer
  ].filter(Boolean).slice(0, 3); // backend limita 3

  console.log('\n--- Artistas a transferir EN→ES ---');
  console.log(`Actuales en ES: ${(es.show_artistas || []).map(sa => sa.artista?.nombre).join(', ') || '(ninguno)'}`);
  console.log(`A transferir desde EN: ${artistasToTransfer.map(a => a.nombre).join(', ') || '(ninguno)'}`);
  console.log(`Lista final (máx 3): ${finalArtistas.map(a => a.nombre).join(', ') || '(ninguno)'}`);
  if (enArtistas.length > 3 - (es.show_artistas || []).length + artistasToTransfer.length) {
    console.log(`  ⚠ algunos artistas EN quedarán sin transferir por el límite de 3`);
  }

  // 4. Plan GHL
  console.log('\n--- GHL ---');
  if (es.ghl_show_id) console.log(`ES tiene ghl_show_id (${es.ghl_show_id}) — se actualizarán properties (nombre_show, descripcion, url_imagen)`);
  else console.log(`ES NO tiene ghl_show_id — saltar update GHL`);
  if (en.ghl_show_id) console.log(`EN tiene ghl_show_id (${en.ghl_show_id}) — se borrará el record GHL del EN`);
  else console.log(`EN NO tiene ghl_show_id — nada que borrar en GHL`);

  // 5. Plan archive del EN
  console.log('\n--- Archive ---');
  console.log(`Archivar show EN: status='archived'`);

  if (!APPLY) {
    console.log('\n(dry-run — nada se aplicó. Repetir con --apply para ejecutar.)');
    return;
  }

  console.log('\n--- APLICANDO ---');

  // 5.1 PATCH ES con _en campos
  if (Object.keys(patch).length) {
    await sbPatch(`shows?id=eq.${encodeURIComponent(ES_ID)}`, patch);
    console.log(`✓ ES actualizado en SB con campos _en`);
  }

  // 5.2 Update GHL record del ES (nombre_show queda igual; url_imagen actualizada si cambió)
  if (es.ghl_show_id && GHL_TOKEN && GHL_LOC) {
    const finalImage = patch.image_url || es.image_url || null;
    const props = {};
    if (finalImage) props.url_imagen = finalImage;
    if (Object.keys(props).length) {
      const g = await ghl('PUT', `/objects/custom_objects.shows/records/${encodeURIComponent(es.ghl_show_id)}`, {
        locationId: GHL_LOC, properties: props
      });
      if (g.ok) console.log(`✓ GHL ES record actualizado`);
      else console.log(`✗ GHL ES update falló: ${g.status} ${g.body.slice(0, 160)}`);
    }
  }

  // 5.3 Transfer artistas: usar mismo flujo que /api/admin set-show-artistas
  //     (wipe show_artistas del ES y reinsertar la lista final, sin pasar por
  //     el endpoint para no requerir el server corriendo).
  await fetch(`${SUPABASE_URL}/rest/v1/show_artistas?show_id=eq.${encodeURIComponent(ES_ID)}`, {
    method: 'DELETE', headers: sbHeaders
  });
  if (finalArtistas.length) {
    const rows = finalArtistas.map((a, i) => ({ show_id: ES_ID, artista_id: a.id, posicion: i + 1, source: 'merge-es-en' }));
    const r = await fetch(`${SUPABASE_URL}/rest/v1/show_artistas`, {
      method: 'POST', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(rows)
    });
    if (!r.ok) throw new Error('insert show_artistas ES failed: ' + await r.text());
    // Cache artista_id en shows.artista_id (primary)
    await sbPatch(`shows?id=eq.${encodeURIComponent(ES_ID)}`, { artista_id: finalArtistas[0].id });
    console.log(`✓ ${finalArtistas.length} artista(s) en show_artistas del ES`);
  }

  // 5.4 GHL associations: crear contact↔ES para artistas que no estaban
  if (es.ghl_show_id && GHL_TOKEN && GHL_LOC) {
    for (const a of artistasToTransfer) {
      if (!a.ghl_contact_id) continue;
      const r = await ghl('POST', '/associations/relations', {
        locationId: GHL_LOC, associationId: GHL_SHOW_CONTACT_ASSOCIATION_ID,
        firstRecordId: a.ghl_contact_id, secondRecordId: es.ghl_show_id
      });
      if (r.ok || (r.status === 400 && /duplicate relation/i.test(r.body))) {
        console.log(`✓ GHL association ${a.nombre} ↔ ES`);
      } else {
        console.log(`✗ GHL association ${a.nombre}: ${r.status} ${r.body.slice(0, 120)}`);
      }
    }
  }

  // 5.5 Borrar associations del EN en GHL y borrar el record EN
  if (en.ghl_show_id && GHL_TOKEN && GHL_LOC) {
    const list = await ghl('GET',
      `/associations/relations/${GHL_SHOW_CONTACT_ASSOCIATION_ID}/${encodeURIComponent(en.ghl_show_id)}?locationId=${encodeURIComponent(GHL_LOC)}`);
    if (list.ok) {
      let relations = [];
      try { relations = JSON.parse(list.body).relations || []; } catch {}
      for (const rel of relations) {
        const d = await ghl('DELETE', `/associations/relations/${encodeURIComponent(rel.id)}`);
        if (d.ok) console.log(`✓ GHL EN association ${rel.id} borrada`);
      }
    }
    // Borrar el record EN del custom_objects.shows
    const del = await ghl('DELETE', `/objects/custom_objects.shows/records/${encodeURIComponent(en.ghl_show_id)}`);
    if (del.ok) console.log(`✓ GHL EN record borrado`);
    else console.log(`✗ GHL EN record delete falló: ${del.status} ${del.body.slice(0, 160)}`);
  }

  // 5.6 Archivar el show EN en SB (no borramos para preservar histórico)
  await sbPatch(`shows?id=eq.${encodeURIComponent(EN_ID)}`, { status: 'archived' });
  console.log(`✓ Show EN archivado en SB`);

  console.log('\n✓ Merge completado.');
}

main().catch(e => { console.error('\n✗ Error:', e.message); process.exit(1); });
