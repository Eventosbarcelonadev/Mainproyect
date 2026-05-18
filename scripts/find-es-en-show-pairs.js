/**
 * Detecta pares ES↔EN candidatos a mergear en la tabla `shows`.
 *
 * Estrategia: dentro de cada subcategory, busca pares (a, b) donde el set de
 * palabras significativas del nombre tenga overlap >= 50% (uno contiene casi
 * las mismas palabras que el otro, en cualquier orden o idioma).
 *
 * Output: lista de pares con score, listos para revisar manualmente.
 *
 * Uso:
 *   node scripts/find-es-en-show-pairs.js
 */
require('dotenv').config();

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en .env');
  process.exit(1);
}

const STOP = new Set(['de','la','el','y','en','a','o','del','con','para','un','una','las','los','of','the','and','in','to','for','an','at','on','by','con']);

function stem(t) {
  if (t.length < 4) return t;
  return t.replace(/(es|as|os|s)$/, '').replace(/(a|o)$/, '');
}
function tokens(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(t => t && t.length > 1 && !STOP.has(t))
    .map(stem);
}

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter(x => B.has(x)).length;
  const uni = new Set([...A, ...B]).size;
  return uni === 0 ? 0 : inter / uni;
}

async function main() {
  const url = `${SUPABASE_URL}/rest/v1/shows?status=eq.active&select=id,name,name_en,category,subcategory,description,description_en,base_price`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  if (!res.ok) {
    console.error('Error SB:', res.status, await res.text());
    process.exit(1);
  }
  const shows = await res.json();
  console.log(`Total shows activos: ${shows.length}`);

  // Group by subcategory (vacíos van a un bucket "(sin subcat)")
  const groups = new Map();
  for (const s of shows) {
    const k = (s.subcategory || '').trim() || '(sin subcat)';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }

  const pairs = [];
  for (const [sub, list] of groups) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const ta = tokens(a.name), tb = tokens(b.name);
        const score = jaccard(ta, tb);
        if (score >= 0.30) {
          pairs.push({ sub, a, b, score, ta, tb });
        }
      }
    }
  }

  pairs.sort((x, y) => y.score - x.score);

  console.log(`\nPares candidatos a mergear (Jaccard stemmed >= 0.30): ${pairs.length}\n`);
  for (const p of pairs) {
    console.log(`[${p.sub}] score=${p.score.toFixed(2)}`);
    console.log(`  A: "${p.a.name}" (${p.a.id})  base=${p.a.base_price || '—'}€  EN=${p.a.name_en || '∅'}`);
    console.log(`  B: "${p.b.name}" (${p.b.id})  base=${p.b.base_price || '—'}€  EN=${p.b.name_en || '∅'}`);
    console.log('');
  }

  // Sospechosos por nombre suelto: contiene palabras evidentemente EN
  const EN_HINTS = ['catalan','english','live','classic','tribute','sound','soul','funk','party','vibes','vibe','swing','jazz','dancers','band','show','duo','trio'];
  const enLooking = shows.filter(s => {
    const t = tokens(s.name);
    return t.some(w => EN_HINTS.includes(w)) && !s.name_en;
  });
  console.log(`\nShows con nombre que parece EN pero sin name_en poblado: ${enLooking.length}`);
  console.log('(estos podrían tener un par ES en otra subcat o ser EN-only)');
  for (const s of enLooking.slice(0, 40)) {
    console.log(`  - ${s.name}  (${s.id})  [${s.subcategory || '—'}]`);
  }
  if (enLooking.length > 40) console.log(`  ... +${enLooking.length - 40} más`);
}

main().catch(e => { console.error(e); process.exit(1); });
