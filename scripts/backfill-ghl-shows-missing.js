// One-shot: shows con status='active' en Supabase que nunca llegaron a
// GHL (ghl_show_id IS NULL). Crea el record en custom_objects.shows y
// persiste el ghl_show_id en Supabase.
//
// Uso:
//   node scripts/backfill-ghl-shows-missing.js           # dry-run
//   node scripts/backfill-ghl-shows-missing.js --apply   # ejecuta
require('dotenv').config({ path: '.env' });

const SB = (process.env.SUPABASE_URL || '').trim();
const K = (process.env.SUPABASE_SERVICE_KEY || '').trim();
const GHL_TOKEN = (process.env.GHL_API_KEY || '').trim();
const GHL_LOC = (process.env.GHL_LOCATION_ID || '').trim();
const SITE = (process.env.SITE_URL || 'https://propuestas.eventosbarcelona.com').replace(/\/$/, '');
const APPLY = process.argv.includes('--apply');

const sbHdr = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const ghlHdr = { Authorization: `Bearer ${GHL_TOKEN}`, Version: '2021-07-28', 'Content-Type': 'application/json' };
const GHL = 'https://services.leadconnectorhq.com';
const OBJ = 'custom_objects.shows';

const c = (col, t) => `\x1b[${ {red:31,green:32,yellow:33,blue:34,dim:2,bold:1}[col] }m${t}\x1b[0m`;

(async () => {
  if (!GHL_TOKEN || !GHL_LOC) { console.error('Falta GHL_API_KEY o GHL_LOCATION_ID en .env'); process.exit(1); }

  const r1 = await fetch(SB + '/rest/v1/shows?status=eq.active&ghl_show_id=is.null&select=id,name,description,video_url,image_url,status,base_price,price_note', { headers: sbHdr });
  if (!r1.ok) { console.error(await r1.text()); process.exit(1); }
  const shows = await r1.json();

  console.log(c('blue', `\n=== ${APPLY ? 'APPLY' : 'DRY-RUN'} backfill GHL custom_objects.shows ===\n`));
  console.log(`Shows active sin ghl_show_id: ${c('yellow', shows.length)}\n`);
  shows.forEach(s => console.log('  ·', s.id.padEnd(40), '|', (s.name || '?').slice(0, 40)));

  if (!APPLY) {
    console.log(c('blue', `\n[DRY-RUN] Para aplicar: --apply\n`));
    return;
  }

  console.log(c('blue', `\nSincronizando con GHL...\n`));
  let ok = 0, fail = 0;
  for (const s of shows) {
    const props = {
      nombre_show: s.name || '',
      url_admin: `${SITE}/admin.html?show=${encodeURIComponent(s.id)}`,
      estado_show: s.status || 'active'
    };
    if (s.description) props.descripcion_show = s.description;
    if (s.video_url) props.url_video = s.video_url;
    // OJO: url_imagen en custom_objects.shows está configurado como
    // FILE_UPLOAD en GHL y NO acepta URLs externas → 400 "couldn't validate
    // the mapped field". Por eso lo omitimos. La imagen se ve igual en /admin
    // (image_url está en Supabase), y se podrá actualizar en GHL si cambiamos
    // el campo a TEXT.
    // if (s.image_url) props.url_imagen = s.image_url;

    const g = await fetch(`${GHL}/objects/${OBJ}/records`, {
      method: 'POST',
      headers: ghlHdr,
      body: JSON.stringify({ locationId: GHL_LOC, properties: props })
    });
    const txt = await g.text();
    if (!g.ok) {
      fail++;
      console.log(c('red', '✗'), s.id, '·', g.status, '·', txt.slice(0, 200));
      continue;
    }
    let parsed = null;
    try { parsed = JSON.parse(txt); } catch {}
    const ghlShowId = parsed?.record?.id || parsed?.id;
    if (!ghlShowId) {
      fail++;
      console.log(c('red', '✗'), s.id, '· GHL respondió OK pero sin id:', txt.slice(0, 200));
      continue;
    }
    const patch = await fetch(SB + '/rest/v1/shows?id=eq.' + encodeURIComponent(s.id), {
      method: 'PATCH',
      headers: sbHdr,
      body: JSON.stringify({ ghl_show_id: ghlShowId })
    });
    if (patch.ok) { ok++; console.log(c('green', '+'), s.id, '→', ghlShowId); }
    else { fail++; console.log(c('red', '✗'), s.id, '· SB patch falló', patch.status, (await patch.text()).slice(0, 200)); }
  }
  console.log(c('blue', `\nResultado: ${c('green', ok + ' OK')}, ${fail} fallos.\n`));
})().catch(err => { console.error(err); process.exit(1); });
