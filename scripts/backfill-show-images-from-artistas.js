// One-shot backfill: shows con image_url=null vinculados a un artista que
// SÍ tiene fotos_urls → copiamos la primera foto del artista al show.
// No pisa shows que ya tienen imagen propia.
//
// Match: vía show_artistas (N:M) Y vía legacy shows.artista_id.
//
// Uso:
//   node scripts/backfill-show-images-from-artistas.js           # dry-run
//   node scripts/backfill-show-images-from-artistas.js --apply   # ejecuta
require('dotenv').config({ path: '.env' });

const SB = process.env.SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_KEY;
const APPLY = process.argv.includes('--apply');
const hdr = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };

const c = (col, t) => `\x1b[${ {red:31,green:32,yellow:33,blue:34,dim:2}[col] }m${t}\x1b[0m`;

(async () => {
  // 1. Shows sin imagen propia
  const r1 = await fetch(
    `${SB}/rest/v1/shows?or=(image_url.is.null,image_url.eq.)&select=id,name,artista_id,image_url,image_urls&limit=5000`,
    { headers: hdr }
  );
  if (!r1.ok) { console.error(await r1.text()); process.exit(1); }
  let shows = (await r1.json()).filter(s => !Array.isArray(s.image_urls) || s.image_urls.filter(Boolean).length === 0);

  // 2. Para cada show, buscar vínculos (legacy + N:M) y resolver fotos del artista
  // Empezamos por una sola query masiva de show_artistas
  const r2 = await fetch(`${SB}/rest/v1/show_artistas?select=show_id,artista_id,posicion`, { headers: hdr });
  const allLinks = r2.ok ? await r2.json() : [];
  const linksByShow = new Map();
  for (const l of allLinks) {
    if (!linksByShow.has(l.show_id)) linksByShow.set(l.show_id, []);
    linksByShow.get(l.show_id).push(l);
  }

  // Resolver artista ids únicos a fotos_urls
  const artistaIds = new Set();
  for (const s of shows) {
    if (s.artista_id) artistaIds.add(s.artista_id);
    (linksByShow.get(s.id) || []).forEach(l => artistaIds.add(l.artista_id));
  }
  if (!artistaIds.size) { console.log('Nada que backfillear (no hay shows sin imagen con artista vinculado)'); return; }

  const r3 = await fetch(
    `${SB}/rest/v1/artistas?id=in.(${[...artistaIds].map(encodeURIComponent).join(',')})&select=id,nombre,nombre_artistico,compania,fotos_urls`,
    { headers: hdr }
  );
  const artistasArr = r3.ok ? await r3.json() : [];
  const artistaById = new Map(artistasArr.map(a => [a.id, a]));

  // 3. Para cada show, calcular qué foto copiar (primer artista con fotos)
  const candidates = []; // {showId, name, fotos}
  for (const s of shows) {
    // Orden: artistas N:M ordenados por posición → luego artista legacy
    const linkedIds = (linksByShow.get(s.id) || [])
      .slice().sort((a, b) => (a.posicion || 99) - (b.posicion || 99))
      .map(l => l.artista_id);
    if (s.artista_id && !linkedIds.includes(s.artista_id)) linkedIds.push(s.artista_id);

    for (const aid of linkedIds) {
      const a = artistaById.get(aid);
      if (!a) continue;
      const fotos = Array.isArray(a.fotos_urls) ? a.fotos_urls.filter(Boolean) : [];
      if (fotos.length) {
        candidates.push({ showId: s.id, name: s.name, artistaName: a.nombre_artistico || a.nombre || a.compania, fotos });
        break;
      }
    }
  }

  console.log(c('blue', `\n=== ${APPLY ? 'APPLY' : 'DRY-RUN'} backfill show images ===\n`));
  console.log(`Shows sin imagen revisados: ${shows.length}`);
  console.log(`Shows que se pueden backfillear: ${c('green', candidates.length)}`);
  console.log('');
  candidates.slice(0, 30).forEach(x => {
    console.log(`  · ${c('yellow', x.showId.padEnd(40))} (${(x.name || '?').slice(0, 30)})  ← ${x.fotos.length} foto${x.fotos.length === 1 ? '' : 's'} de ${x.artistaName || '?'}`);
  });
  if (candidates.length > 30) console.log(c('dim', `  ... ${candidates.length - 30} más`));

  if (!APPLY) {
    console.log(c('blue', `\n[DRY-RUN] No se modificó nada. Para aplicar: --apply\n`));
    return;
  }

  console.log(c('blue', `\nAplicando...`));
  let ok = 0, fail = 0;
  for (const x of candidates) {
    const r = await fetch(`${SB}/rest/v1/shows?id=eq.${encodeURIComponent(x.showId)}`, {
      method: 'PATCH',
      headers: hdr,
      body: JSON.stringify({ image_url: x.fotos[0], image_urls: x.fotos })
    });
    if (r.ok) { ok++; process.stdout.write('.'); }
    else { fail++; console.log('\n', c('red', '✗'), x.showId, '·', (await r.text()).slice(0, 100)); }
  }
  console.log(c('green', `\n\n${ok} shows backfilleados, ${fail} fallos.\n`));
})().catch(err => { console.error(err); process.exit(1); });
