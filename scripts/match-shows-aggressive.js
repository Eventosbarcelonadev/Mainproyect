/**
 * Cross-match shows → artistas — versión AGRESIVA.
 *
 * v1 (match-shows-to-artistas.js) era conservadora: solo 8/226 linkeados.
 * Esta versión baja el umbral, añade match por disciplina/categoría/keyword
 * y resuelve empates eligiendo el artista con menos shows ya asignados
 * (para que no se acumule todo en uno).
 *
 * Uso:
 *   node scripts/match-shows-aggressive.js              # dry-run
 *   node scripts/match-shows-aggressive.js --apply       # aplica
 */

require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const APPLY = process.argv.includes('--apply');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const HEAD = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};

const STOP = new Set([
  'show', 'shows', 'de', 'la', 'el', 'los', 'las', 'y', 'a', 'en', 'con',
  'del', 'al', 'para', 'por', 'un', 'una', 'unos', 'unas',
  'eventos', 'evento', 'corporativos', 'corporativo', 'fiesta', 'fiestas',
  'espectaculo', 'espectaculos', 'profesionales', 'artista', 'artistas',
  'banda', 'bandas', 'grupo', 'grupos', 'cantante', 'cantantes'
]);

// Disciplina keywords: si aparecen en show + en artista, es match fuerte.
// Cubrimos sinónimos español/inglés y variantes.
const DISCIPLINE_KEYWORDS = [
  ['flamenco'], ['ballet'], ['breakdance', 'break', 'bboy', 'bgirl', 'breakdancer'],
  ['hiphop', 'hip-hop', 'hip'], ['salsa'], ['tango'], ['bossa', 'bossanova'],
  ['jazz'], ['samba'], ['rumba'], ['reggaeton'], ['bachata'],
  ['piano', 'pianista'], ['violin', 'violinista', 'violinist'],
  ['saxo', 'saxofon', 'saxofonista', 'sax'],
  ['arpa', 'arpista', 'harp'], ['cello', 'chelo', 'chelista'],
  ['trompeta', 'trompetista'], ['guitarra', 'guitarrista', 'guitar'],
  ['contrabajo', 'contrabass', 'bass'], ['percusion', 'percusionista', 'drum', 'drummer'],
  ['dj', 'djs'], ['cantante', 'cantantes', 'singer', 'voz', 'vocal'],
  ['opera', 'lirico'], ['acrobata', 'acrobatas', 'acrobacia', 'acrobat'],
  ['malabar', 'malabaris', 'malabaristas', 'juggler'],
  ['fuego', 'fire'], ['zancudo', 'zancudos', 'stilt'],
  ['mago', 'magos', 'ilusionista', 'magician'],
  ['caricatur', 'caricaturista'], ['silueta', 'siluetista'],
  ['pole'], ['aereo', 'aerea', 'aerial'],
  ['burlesque', 'burles'], ['cabaret'],
  ['violinist', 'pianist', 'guitarist'], ['percussionist'],
  ['bodypaint', 'body', 'painter'], ['fakir'],
  ['hula', 'hoop'], ['mariachi', 'mariachis'],
  ['polinesia', 'polinesias', 'polinesio'], ['hawaiano', 'hawaii', 'hula'],
  ['bellydance', 'belly'], ['danza', 'dancer', 'bailarin', 'bailarina', 'bailarines', 'bailarinas', 'baile'],
  ['gaudi'], ['halloween'], ['gatsby'],
  ['laser', 'lasers'], ['light', 'luz', 'luces'],
  ['arena', 'sand'], ['mapping', 'projection'],
  ['cocktail', 'maquillaje'], ['tarot', 'tarotista']
];

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function tokens(s) {
  return norm(s).split(' ').filter(t => t.length >= 3 && !STOP.has(t));
}

function disciplinesIn(text) {
  const t = norm(text);
  const found = new Set();
  for (const group of DISCIPLINE_KEYWORDS) {
    for (const kw of group) {
      if (t.includes(kw)) {
        found.add(group[0]);
        break;
      }
    }
  }
  return found;
}

function score(show, artist) {
  const showName = norm(show.name);
  const showFull = `${show.name || ''} ${show.subcategory || ''} ${show.category || ''} ${show.description || ''}`;
  const showDisc = disciplinesIn(showFull);
  const showToks = new Set(tokens(show.name));

  const names = [artist.nombre, artist.nombre_artistico, artist.compania]
    .filter(Boolean).map(norm).filter(Boolean);
  const artistFull = `${(artist.bio_show || '')} ${names.join(' ')} ${(artist.disciplinas || []).join(' ')}`;
  const artistDisc = disciplinesIn(artistFull);

  let best = 0;
  let how = '';

  // 1) Substring exacto del nombre del artista en el show name
  for (const n of names) {
    if (n.length >= 6 && showName.includes(n)) {
      best = Math.max(best, 0.95);
      how = `nombre artista en show: "${n}"`;
    }
    if (showName.length >= 6 && n.includes(showName)) {
      best = Math.max(best, 0.95);
      how = `nombre show en artista: "${showName}"`;
    }
  }

  // 2) Token overlap entre nombre del show y nombre del artista
  for (const n of names) {
    const aToks = new Set(tokens(n));
    const inter = [...showToks].filter(t => aToks.has(t));
    if (inter.length) {
      const r = inter.length / Math.max(showToks.size, aToks.size);
      const lenBoost = Math.min(1, inter.reduce((s, t) => s + t.length, 0) / 8);
      const sc = 0.4 + r * 0.3 + lenBoost * 0.2;
      if (sc > best) {
        best = sc;
        how = `tokens compartidos: ${inter.join(',')} (r=${(r * 100 | 0)}%)`;
      }
    }
  }

  // 3) Disciplina match (categoria/keyword)
  if (showDisc.size && artistDisc.size) {
    const sharedDisc = [...showDisc].filter(d => artistDisc.has(d));
    if (sharedDisc.length) {
      const sc = 0.55 + Math.min(0.15, sharedDisc.length * 0.05);
      if (sc > best) {
        best = sc;
        how = `disciplina: ${sharedDisc.join(',')}`;
      }
    }
  }

  return { score: best, how, sharedDisc: showDisc };
}

async function fetchAll(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HEAD });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function patchShow(id, artista_id) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...HEAD, Prefer: 'return=minimal' },
    body: JSON.stringify({ artista_id })
  });
  if (!r.ok) throw new Error(`PATCH ${id} → ${r.status} ${await r.text()}`);
}

(async () => {
  console.log(`=== Match shows → artistas AGRESIVO (${APPLY ? 'APPLY' : 'dry-run'}) ===\n`);

  const shows = await fetchAll('shows?select=id,name,category,subcategory,description,artista_id&limit=500');
  const artistas = await fetchAll('artistas?select=id,nombre,nombre_artistico,compania,bio_show,disciplinas&limit=500');
  console.log(`Shows: ${shows.length}  ·  Artistas: ${artistas.length}`);

  // Pre-compute disciplines per artist for tie-break: artists with broader catalog get diversified load
  const artistLoad = new Map(artistas.map(a => [a.id, 0]));

  let alreadyLinked = 0;
  const decisions = [];

  // Sort shows: ones with many discipline cues first (better signal), generic shows last
  const sortedShows = [...shows].sort((a, b) => {
    const da = disciplinesIn(`${a.name || ''} ${a.subcategory || ''} ${a.category || ''}`).size;
    const db = disciplinesIn(`${b.name || ''} ${b.subcategory || ''} ${b.category || ''}`).size;
    return db - da;
  });

  for (const sh of sortedShows) {
    if (sh.artista_id) {
      alreadyLinked++;
      artistLoad.set(sh.artista_id, (artistLoad.get(sh.artista_id) || 0) + 1);
      continue;
    }
    const cands = artistas
      .map(a => ({ a, ...score(sh, a) }))
      .filter(c => c.score >= 0.5)
      .sort((x, y) => {
        if (y.score !== x.score) return y.score - x.score;
        // Tie-break: prefer artist with less load
        const lx = artistLoad.get(x.a.id) || 0;
        const ly = artistLoad.get(y.a.id) || 0;
        return lx - ly;
      });

    if (!cands.length) {
      decisions.push({ show: sh, decision: 'no-match' });
      continue;
    }

    const top = cands[0];
    // Aggressive: apply if score >= 0.5
    decisions.push({ show: sh, decision: 'auto', top, totalCands: cands.length });
    artistLoad.set(top.a.id, (artistLoad.get(top.a.id) || 0) + 1);
  }

  const auto = decisions.filter(d => d.decision === 'auto');
  const none = decisions.filter(d => d.decision === 'no-match');

  console.log(`\nResumen:`);
  console.log(`  ya linkeados:   ${alreadyLinked}`);
  console.log(`  nuevos auto:    ${auto.length}`);
  console.log(`  sin match:      ${none.length}\n`);

  console.log('Top 30 nuevos auto-links:');
  for (const d of auto.slice(0, 30)) {
    const aname = d.top.a.nombre_artistico || d.top.a.nombre || d.top.a.compania || '';
    console.log(`  ${(d.show.id || '').padEnd(35)} → ${aname.padEnd(35)} | ${d.top.how} | ${d.top.score.toFixed(2)}`);
  }

  console.log('\nDistribución de carga (top 10 artistas con más shows post-match):');
  const loadArr = [...artistLoad.entries()]
    .map(([id, n]) => ({ id, n, a: artistas.find(x => x.id === id) }))
    .filter(x => x.n)
    .sort((a, b) => b.n - a.n);
  for (const x of loadArr.slice(0, 10)) {
    const aname = x.a?.nombre_artistico || x.a?.nombre || x.a?.compania || '(?)';
    console.log(`  ${aname.padEnd(40)} ${x.n} shows`);
  }

  console.log(`\nSin match — ${none.length} shows quedan sin artista. Sample 15:`);
  for (const d of none.slice(0, 15)) {
    console.log(`  ${(d.show.id || '').padEnd(35)} | ${d.show.name}`);
  }

  if (!APPLY) {
    console.log('\n(dry-run — para escribir, correr con --apply)');
    return;
  }

  console.log('\nAplicando auto-links a Supabase...');
  let ok = 0, err = 0;
  for (const d of auto) {
    try {
      await patchShow(d.show.id, d.top.a.id);
      ok++;
      if (ok % 30 === 0) console.log(`  ${ok}/${auto.length}`);
    } catch (e) {
      err++;
      console.error(`  FAIL ${d.show.id}: ${e.message}`);
    }
  }
  console.log(`\nApplied: ${ok}  ·  errors: ${err}`);
})().catch(e => { console.error(e); process.exit(1); });
