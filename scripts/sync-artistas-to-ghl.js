/**
 * Sync de artistas Supabase → contactos GHL.
 *
 * Por cada artista con ghl_contact_id:
 *   1. PUT website con la URL del formulario tokenizado (que el artista usa
 *      para auto-actualizar perfil/shows).
 *   2. Tag perfil:completa o perfil:incompleta según completeness.
 *
 * Criterio de "completa":
 *   - email real (no @placeholder.eventosbarcelona.local)
 *   - telefono no vacío
 *   - al menos uno de: bio_show, fotos_urls.length>=1, video1
 *
 * Uso:
 *   node scripts/sync-artistas-to-ghl.js              # dry-run
 *   node scripts/sync-artistas-to-ghl.js --apply       # aplica
 */

require('dotenv').config();

const TOKEN = process.env.GHL_API_KEY;
const LOC = process.env.GHL_LOCATION_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APPLY = process.argv.includes('--apply');
const PUBLIC_URL = process.env.PROPUESTA_BASE_URL || 'https://propuestas.eventosbarcelona.com';

if (!TOKEN || !LOC || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Falta env: GHL_API_KEY, GHL_LOCATION_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const GHL = 'https://services.leadconnectorhq.com';
const GHL_HEAD = {
  Authorization: `Bearer ${TOKEN}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json'
};

function isComplete(a) {
  const realEmail = a.email && !a.email.endsWith('@placeholder.eventosbarcelona.local');
  const hasPhone = !!(a.telefono && a.telefono.trim());
  const hasContent = !!(a.bio_show || (Array.isArray(a.fotos_urls) && a.fotos_urls.length) || a.video1);
  return realEmail && hasPhone && hasContent;
}

async function fetchAllArtistas() {
  let all = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/artistas?ghl_contact_id=not.is.null&select=id,token,nombre,nombre_artistico,email,telefono,bio_show,fotos_urls,video1,ghl_contact_id&order=created_at.asc&limit=${PAGE}&offset=${from}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const rows = await r.json();
    all = all.concat(rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function ghlFetch(method, path, body, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`${GHL}${path}`, {
      method,
      headers: GHL_HEAD,
      body: body ? JSON.stringify(body) : undefined
    });
    if (r.status !== 429) return r;
    // Rate-limited: exponential backoff
    const wait = Math.min(8000, 600 * Math.pow(2, i));
    await new Promise(res => setTimeout(res, wait));
  }
  // Final try (will surface 429 if still rate-limited)
  return fetch(`${GHL}${path}`, {
    method,
    headers: GHL_HEAD,
    body: body ? JSON.stringify(body) : undefined
  });
}

async function syncOne(a) {
  const formUrl = a.token
    ? `${PUBLIC_URL}/formulario-artistas.html?token=${a.token}`
    : null;
  const status = isComplete(a) ? 'completa' : 'incompleta';
  const oppositeTag = `perfil:${status === 'completa' ? 'incompleta' : 'completa'}`;
  const targetTag = `perfil:${status}`;

  const errors = [];

  // 1. PUT website
  if (formUrl) {
    try {
      const r = await ghlFetch('PUT', `/contacts/${a.ghl_contact_id}`, { website: formUrl });
      if (!r.ok) {
        const txt = (await r.text()).slice(0, 80);
        // Skip silently if contact doesn't exist (stale test row)
        if (r.status === 400 && /Contact not found/i.test(txt)) {
          return { status, errors: [], skipped: 'contact-not-found' };
        }
        errors.push(`website ${r.status}: ${txt}`);
      }
    } catch (e) { errors.push(`website err: ${e.message}`); }
  }

  // 2. Remove opposite tag (best-effort, no retry)
  try {
    await fetch(`${GHL}/contacts/${a.ghl_contact_id}/tags`, {
      method: 'DELETE',
      headers: GHL_HEAD,
      body: JSON.stringify({ tags: [oppositeTag] })
    });
  } catch (_) { /* ignore */ }

  // 3. Add target tag
  try {
    const r = await ghlFetch('POST', `/contacts/${a.ghl_contact_id}/tags`, { tags: [targetTag] });
    if (!r.ok) errors.push(`tag ${r.status}: ${(await r.text()).slice(0, 80)}`);
  } catch (e) { errors.push(`tag err: ${e.message}`); }

  return { status, errors };
}

async function batch(items, n, fn, delayMs = 0) {
  const out = [];
  for (let i = 0; i < items.length; i += n) {
    const slice = items.slice(i, i + n);
    const r = await Promise.all(slice.map(fn));
    out.push(...r);
    if (delayMs && i + n < items.length) {
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
  return out;
}

(async () => {
  console.log(`=== Sync artistas → GHL (${APPLY ? 'APPLY' : 'dry-run'}) ===\n`);
  const artistas = await fetchAllArtistas();
  console.log(`Artistas con ghl_contact_id: ${artistas.length}`);

  let completas = 0, incompletas = 0, sinToken = 0;
  const sample = [];
  for (const a of artistas) {
    const c = isComplete(a);
    if (c) completas++; else incompletas++;
    if (!a.token) sinToken++;
    if (sample.length < 5) sample.push({
      nombre: a.nombre_artistico || a.nombre,
      email: a.email,
      complete: c,
      token: !!a.token
    });
  }
  console.log(`  completa:    ${completas}`);
  console.log(`  incompleta:  ${incompletas}`);
  console.log(`  sin token:   ${sinToken}\n`);
  console.log('Sample:');
  for (const s of sample) console.log(`  ${s.complete ? '✓' : '·'} ${s.nombre} | ${s.email} | token=${s.token}`);

  if (!APPLY) {
    console.log('\n(dry-run — para escribir, correr con --apply)');
    return;
  }

  console.log('\nAplicando a GHL (batches de 2, 350ms delay, retry 429)...');
  let ok = 0, fail = 0, skipped = 0, processed = 0;
  await batch(artistas, 2, async (a) => {
    const r = await syncOne(a);
    processed++;
    if (r.skipped) {
      skipped++;
    } else if (r.errors.length) {
      fail++;
      if (fail <= 5) console.error(`  FAIL ${a.nombre || a.id}:`, r.errors.join(' | '));
    } else {
      ok++;
    }
    if (processed % 50 === 0) console.log(`  ${processed}/${artistas.length} (ok=${ok} skip=${skipped} fail=${fail})`);
    return r;
  }, 350);

  console.log(`\nDone. ok=${ok}  skipped=${skipped}  fail=${fail}`);
})().catch(e => { console.error(e); process.exit(1); });
