// One-shot backfill: para cada show con CAMPOS VACÍOS vinculado a un artista
// que SÍ tiene esos datos, copiamos del artista al show. No pisa nada que
// el show ya tenga. Campos propagados:
//   - image_url + image_urls ← artista.fotos_urls
//   - description            ← artista.bio_show
//   - video_url              ← artista.video1
//   - subcategory            ← artista.disciplinas[1] (la 0 ya es category)
//
// Uso:
//   node scripts/backfill-show-images-from-artistas.js           # dry-run
//   node scripts/backfill-show-images-from-artistas.js --apply   # ejecuta
require('dotenv').config({ path: '.env' });

const SB = process.env.SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_KEY;
const APPLY = process.argv.includes('--apply');
const hdr = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };

const c = (col, t) => `\x1b[${ {red:31,green:32,yellow:33,blue:34,dim:2,bold:1}[col] }m${t}\x1b[0m`;

const isEmpty = (v) => v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.filter(Boolean).length === 0);

(async () => {
  // 1. Cargar TODOS los show_artistas links + shows con campos relevantes
  const [linksR, showsR] = await Promise.all([
    fetch(`${SB}/rest/v1/show_artistas?select=show_id,artista_id,posicion`, { headers: hdr }),
    fetch(`${SB}/rest/v1/shows?select=id,name,artista_id,image_url,image_urls,description,video_url,subcategory&limit=5000`, { headers: hdr })
  ]);
  if (!linksR.ok || !showsR.ok) { console.error('fetch failed'); process.exit(1); }
  const links = await linksR.json();
  const shows = await showsR.json();

  // Index: show.id → list of artista_ids ordenados por posición (N:M) + legacy
  const artistasByShow = new Map();
  for (const l of links) {
    if (!artistasByShow.has(l.show_id)) artistasByShow.set(l.show_id, []);
    artistasByShow.get(l.show_id).push({ aid: l.artista_id, pos: l.posicion || 99 });
  }
  for (const arr of artistasByShow.values()) arr.sort((a, b) => a.pos - b.pos);
  // Añadir legacy artista_id como último fallback
  for (const s of shows) {
    if (s.artista_id) {
      const arr = artistasByShow.get(s.id) || [];
      if (!arr.find(x => x.aid === s.artista_id)) arr.push({ aid: s.artista_id, pos: 99 });
      artistasByShow.set(s.id, arr);
    }
  }

  // Set de artista_ids únicos
  const artistaIds = new Set();
  for (const arr of artistasByShow.values()) arr.forEach(x => artistaIds.add(x.aid));
  if (!artistaIds.size) { console.log('Nada que backfillear (no hay shows con artista vinculado)'); return; }

  // 2. Cargar todos los artistas relevantes
  const aR = await fetch(
    `${SB}/rest/v1/artistas?id=in.(${[...artistaIds].map(encodeURIComponent).join(',')})&select=id,nombre,nombre_artistico,compania,fotos_urls,bio_show,video1,disciplinas`,
    { headers: hdr }
  );
  const artistasArr = aR.ok ? await aR.json() : [];
  const artistaById = new Map(artistasArr.map(a => [a.id, a]));

  // 3. Para cada show, construir patch
  const plans = []; // {show, patch, sourceArtist}
  for (const s of shows) {
    const linked = (artistasByShow.get(s.id) || []).map(x => artistaById.get(x.aid)).filter(Boolean);
    if (!linked.length) continue;

    // Encontrar el primer artista que aporte cada campo
    const patch = {};
    const sources = {};

    // FOTO
    if (isEmpty(s.image_url) && isEmpty(s.image_urls)) {
      const aWithFotos = linked.find(a => Array.isArray(a.fotos_urls) && a.fotos_urls.filter(Boolean).length);
      if (aWithFotos) {
        const fotos = aWithFotos.fotos_urls.filter(Boolean);
        patch.image_url = fotos[0];
        patch.image_urls = fotos;
        sources.image = aWithFotos.nombre_artistico || aWithFotos.nombre || aWithFotos.compania;
      }
    }
    // BIO → description
    if (isEmpty(s.description)) {
      const aWithBio = linked.find(a => a.bio_show && a.bio_show.trim());
      if (aWithBio) {
        patch.description = aWithBio.bio_show.trim();
        sources.bio = aWithBio.nombre_artistico || aWithBio.nombre || aWithBio.compania;
      }
    }
    // VIDEO → video_url
    if (isEmpty(s.video_url)) {
      const aWithVideo = linked.find(a => a.video1 && a.video1.trim());
      if (aWithVideo) {
        patch.video_url = aWithVideo.video1.trim();
        sources.video = aWithVideo.nombre_artistico || aWithVideo.nombre || aWithVideo.compania;
      }
    }
    // disciplinas[1] → subcategory
    if (isEmpty(s.subcategory)) {
      const aWithSub = linked.find(a => Array.isArray(a.disciplinas) && a.disciplinas.filter(Boolean).length > 1);
      if (aWithSub) {
        patch.subcategory = String(aWithSub.disciplinas.filter(Boolean)[1]).trim();
        sources.subcategory = aWithSub.nombre_artistico || aWithSub.nombre || aWithSub.compania;
      }
    }

    if (Object.keys(patch).length) plans.push({ show: s, patch, sources });
  }

  console.log(c('blue', `\n=== ${APPLY ? 'APPLY' : 'DRY-RUN'} backfill datos del artista → shows ===\n`));
  console.log(`Shows totales: ${shows.length}`);
  console.log(`Shows con campos a completar: ${c('green', plans.length)}`);
  console.log('');
  plans.slice(0, 50).forEach(p => {
    const fields = Object.keys(p.patch).join(', ');
    console.log(`  · ${c('yellow', p.show.id.padEnd(40))} ${c('dim', '←')} ${fields}`);
  });
  if (plans.length > 50) console.log(c('dim', `  ... ${plans.length - 50} más`));

  if (!APPLY) {
    console.log(c('blue', `\n[DRY-RUN] No se modificó nada. Para aplicar: --apply\n`));
    return;
  }

  console.log(c('blue', `\nAplicando...`));
  let ok = 0, fail = 0;
  for (const p of plans) {
    const r = await fetch(`${SB}/rest/v1/shows?id=eq.${encodeURIComponent(p.show.id)}`, {
      method: 'PATCH', headers: hdr, body: JSON.stringify(p.patch)
    });
    if (r.ok) { ok++; process.stdout.write('.'); }
    else { fail++; console.log('\n', c('red', '✗'), p.show.id, '·', (await r.text()).slice(0, 100)); }
  }
  console.log(c('green', `\n\n${ok} shows backfilleados, ${fail} fallos.\n`));
})().catch(err => { console.error(err); process.exit(1); });
