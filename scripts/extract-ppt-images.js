/**
 * Extrae imágenes de shows desde las 4 PPTs de catálogo (Presentaciones viejas/)
 * para los shows que NO tienen image_url en Supabase.
 *
 * NO sube nada ni escribe en Supabase. Solo:
 *   - descomprime cada PPT
 *   - mapea slide -> título -> show de Supabase (match normalizado + fuzzy para typos)
 *   - elige la imagen de show más grande del slide (filtrando chrome: logos/fondos repetidos)
 *   - copia la imagen elegida a /tmp/shows-preview/<categoria>/<show_id>__<nombre>.<ext>
 *   - escribe /tmp/shows-preview/manifest.json para el paso posterior de upload
 *
 * Uso: node scripts/extract-ppt-images.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config();

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const PPT_DIR = path.join(__dirname, '..', 'Presentaciones viejas');
const PPTS = {
  danza: 'Propuestas DANZA GLOBAL.pptx',
  musica: 'Propuestas MUSICA Global_02.2024.pptx',
  circo: 'Propuestas CIRCO GLOBAL (1).pptx',
  wow: 'Propuestas PERFORMANCE GLOBAL.pptx',
};
const WORK = '/tmp/ppt_extract';
const PREVIEW = '/tmp/shows-preview';

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
// distancia de edición simple para resolver typos (ODISSEY/ODYSSEY)
function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[m][n];
}

function parsePpt(category) {
  const dst = path.join(WORK, category);
  execSync(`rm -rf "${dst}" && mkdir -p "${dst}"`);
  execSync(`unzip -q "${path.join(PPT_DIR, PPTS[category])}" -d "${dst}"`);
  const slidesDir = path.join(dst, 'ppt', 'slides');
  const slidesF = fs.readdirSync(slidesDir).filter(f => /^slide\d+\.xml$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));

  const imgFreq = {};
  const slides = [];
  for (const f of slidesF) {
    const xml = fs.readFileSync(path.join(slidesDir, f), 'utf8');
    const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1].trim()).filter(Boolean);
    // título: línea en MAYÚSCULAS, descartando encabezados genéricos
    const title = texts.find(t => t.length > 2 && t === t.toUpperCase()
      && /[A-ZÁÉÍÓÚÑ]/.test(t)
      && !/PROPUESTAS|CONDICIONES|CLIENTES|GENERALES/.test(t));
    let rels = '';
    try { rels = fs.readFileSync(path.join(slidesDir, '_rels', f + '.rels'), 'utf8'); } catch (e) {}
    const imgs = [...rels.matchAll(/(image\d+\.[a-z]+)/gi)].map(m => m[1]);
    imgs.forEach(i => { imgFreq[i] = (imgFreq[i] || 0) + 1; });
    slides.push({ slide: f, title, imgs });
  }
  // chrome = imagen repetida en muchos slides (logo, fondo, divisores)
  const threshold = Math.max(4, Math.round(slidesF.length * 0.15));
  const chrome = new Set(Object.entries(imgFreq).filter(([, v]) => v >= threshold).map(([k]) => k));
  const mediaDir = path.join(dst, 'ppt', 'media');
  return { slides, chrome, mediaDir, slideCount: slidesF.length, threshold };
}

async function fetchShows() {
  const r = await fetch(`${SB}/rest/v1/shows?select=id,name,category,image_url&order=category,name`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error('Supabase ' + r.status + ' ' + await r.text());
  return r.json();
}

(async () => {
  const allShows = await fetchShows();
  const noImg = allShows.filter(s => !s.image_url || !String(s.image_url).trim());
  console.log(`Shows sin imagen: ${noImg.length} / ${allShows.length}\n`);

  execSync(`rm -rf "${PREVIEW}" && mkdir -p "${PREVIEW}"`);
  const manifest = [];
  let totalMatched = 0;
  const stillMissing = [];
  const slidesNoShow = [];

  for (const category of Object.keys(PPTS)) {
    const { slides, chrome, mediaDir, slideCount, threshold } = parsePpt(category);
    const catNoImg = noImg.filter(s => s.category === category);
    // índice de shows sin imagen de esta categoría
    const byNorm = {};
    catNoImg.forEach(s => { byNorm[norm(s.name)] = s; });
    const matchedIds = new Set();
    const catDir = path.join(PREVIEW, category);
    fs.mkdirSync(catDir, { recursive: true });

    for (const sl of slides) {
      if (!sl.title) continue;
      const showImgs = sl.imgs.filter(i => !chrome.has(i));
      if (!showImgs.length) continue;
      const nt = norm(sl.title);
      let show = byNorm[nt];
      if (!show) {
        // fuzzy: typo tolerado (<=2 ediciones) sobre shows sin imagen de la categoría
        let best = null, bestD = 99;
        for (const s of catNoImg) {
          const d = lev(nt, norm(s.name));
          if (d < bestD) { bestD = d; best = s; }
        }
        if (best && bestD <= 2) show = best;
      }
      if (!show) { slidesNoShow.push(`[${category}] ${sl.title}`); continue; }
      if (matchedIds.has(show.id)) continue; // ya cubierto por un slide anterior

      // elegir imagen más grande por peso
      const best = showImgs
        .map(i => ({ i, sz: fs.statSync(path.join(mediaDir, i)).size }))
        .sort((a, b) => b.sz - a.sz)[0];
      const ext = path.extname(best.i);
      const safe = norm(show.name).replace(/\s+/g, '-');
      const outName = `${show.id}__${safe}${ext}`;
      const outPath = path.join(catDir, outName);
      fs.copyFileSync(path.join(mediaDir, best.i), outPath);

      manifest.push({
        show_id: show.id, name: show.name, category,
        ppt: PPTS[category], slide: sl.slide,
        src_media: best.i, src_size: best.sz, preview_path: outPath,
      });
      matchedIds.add(show.id);
      totalMatched++;
    }

    const catMissing = catNoImg.filter(s => !matchedIds.has(s.id));
    catMissing.forEach(s => stillMissing.push(`[${category}] ${s.name}`));
    console.log(`${category.padEnd(7)} ${slideCount} slides (chrome>=${threshold}) | sin img: ${catNoImg.length} | recuperados: ${matchedIds.size} | faltan: ${catMissing.length}`);
  }

  fs.writeFileSync(path.join(PREVIEW, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\n=== TOTAL ===`);
  console.log(`Imágenes extraídas: ${totalMatched} / ${noImg.length} shows sin imagen`);
  console.log(`Preview en: ${PREVIEW}/<categoria>/`);
  console.log(`Manifest: ${PREVIEW}/manifest.json`);

  if (stillMissing.length) {
    console.log(`\nShows sin imagen que NO se recuperaron (${stillMissing.length}):`);
    stillMissing.forEach(s => console.log('  - ' + s));
  }
  if (slidesNoShow.length) {
    console.log(`\nSlides de PPT sin match a show sin-imagen (${slidesNoShow.length}) — pueden ser shows que YA tienen imagen:`);
    slidesNoShow.forEach(s => console.log('  - ' + s));
  }
})().catch(e => { console.error(e); process.exit(1); });
