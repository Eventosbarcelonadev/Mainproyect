/**
 * Audit completo de pares ES↔EN entre shows activos.
 *
 * Heurística: dentro de cada subcategory, busca pares con palabras solapadas
 * (Jaccard stemmed >= 0.30). A cada par le calcula un score de confianza ES↔EN
 * sumando señales:
 *   +2 mismo set de artistas (indicador fuerte)
 *   +1 mismo base_price (o diferencia <10%)
 *   +1 uno de los nombres tiene tokens "claramente EN" (catalan, dancers, live...)
 *       y el otro "claramente ES" (catalana, bailarines, banda en vivo...)
 *   +1 misma subcategory
 *
 * Output: tres listados — alta (>=4), media (2-3), baja (<2).
 *
 * Uso: node scripts/audit-es-en-shows.js
 */
require('dotenv').config();

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Faltan SUPABASE_URL/SUPABASE_SERVICE_KEY'); process.exit(1); }

const STOP = new Set(['de','la','el','y','en','a','o','del','con','para','un','una','las','los','of','the','and','in','to','for','an','at','on','by']);
const EN_WORDS = new Set(['catalan','english','live','classic','tribute','sound','soul','funk','party','vibes','vibe','swing','jazz','dancers','band','show','dancer','duo','trio','live','flute','female','male','dance','singer','singers','sing','street','urban','warriors','golden','dreams','warrior','dream','jungle','glow','dark','black','white','red','blue','silver','crystal','butterfly','butterflies','queen','king','prince','princess','master','tech','glass','mirror','smoke','fire','water','wind','earth','disco','funky','rock','pop','beat','beats','sound','sounds','live','classic','classics','indoor','outdoor','elegant','elegance','sparkle','sparkles','gatsby','candy','cotton','aquatic','laser','drone','drones','mapping','painting','painter','roller','swing','jazz','blues','reggae','salsa','rumba']);
const ES_WORDS = new Set(['catalana','catalanes','catalanas','bailarines','bailarinas','bailaores','bailaoras','baile','baila','musica','musicos','musical','cantante','cantantes','banda','bandas','grupo','grupos','espectaculo','show','tradicional','flamenco','moderno','clasico','clasica','clasicos','danza','danzas','danzadanza','luces','luz','agua','fuego','viento','tierra','reina','rey','principe','princesa','maestro','vidrio','espejo','humo','agua','tierra','oro','plata','blanco','negro','rojo','azul','dorado','dorada','dorados','doradas','plateado','plateada','vivo','viva','vivos','luminoso','luminosa','equilibristas','acrobata','acrobatas','aereo','aerea','aereos','aereas','baile','baila','arpa','arpista','guitarrista','guitarra','violin','violinista','flauta','flautista','clarinete','clarinetista','saxofonista','saxofon','percusion','percusionista','percusionistas','bateria','baterista','pianista','piano','arpa','arpista','cantaor','cantaora','tenor','soprano','barítono','barbero','peluquero','peluquera','barbera','maquillaje','maquillador','maquilladora','fotografo','fotografa','videografo','videografa','disenador','disenadora','escenografo','escenografa']);

function stem(t) { if (t.length < 4) return t; return t.replace(/(es|as|os|s)$/, '').replace(/(a|o)$/, ''); }
function tokens(name) {
  return String(name || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(t => t && t.length > 1 && !STOP.has(t));
}
function jaccard(a, b) {
  const A = new Set(a.map(stem)), B = new Set(b.map(stem));
  const inter = [...A].filter(x => B.has(x)).length;
  const uni = new Set([...A, ...B]).size;
  return uni === 0 ? 0 : inter / uni;
}
function hasENWords(toks) { return toks.some(t => EN_WORDS.has(t)); }
function hasESWords(toks) { return toks.some(t => ES_WORDS.has(t)); }
function sameArtistas(a, b) {
  const sa = new Set((a.show_artistas || []).map(x => x.artista_id));
  const sb = new Set((b.show_artistas || []).map(x => x.artista_id));
  if (!sa.size || !sb.size) return null;
  const inter = [...sa].filter(x => sb.has(x)).length;
  if (inter === 0) return false;
  return inter === sa.size && inter === sb.size;
}
function pricesClose(a, b) {
  if (!a.base_price || !b.base_price) return null;
  if (a.base_price === b.base_price) return 'iguales';
  const diff = Math.abs(a.base_price - b.base_price);
  const max = Math.max(a.base_price, b.base_price);
  if (diff / max <= 0.20) return 'cercanos';
  return 'distintos';
}

async function main() {
  const url = `${SUPABASE_URL}/rest/v1/shows?status=eq.active&select=id,name,name_en,category,subcategory,description,description_en,base_price,price_note,show_artistas(artista_id,artista:artista_id(nombre))`;
  const r = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!r.ok) { console.error(r.status, await r.text()); process.exit(1); }
  const shows = await r.json();
  console.log(`Total shows activos: ${shows.length}\n`);

  // Group by subcategory
  const groups = new Map();
  for (const s of shows) {
    const k = (s.subcategory || '').trim() || '(sin subcat)';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }

  const candidates = [];
  for (const [sub, list] of groups) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const ta = tokens(a.name), tb = tokens(b.name);
        const jac = jaccard(ta, tb);
        if (jac < 0.30) continue;

        let conf = 0;
        const reasons = [];
        const sameArts = sameArtistas(a, b);
        if (sameArts === true) { conf += 2; reasons.push('mismos artistas'); }
        else if (sameArts === false) reasons.push('artistas distintos (no es ES↔EN)');
        const priceCmp = pricesClose(a, b);
        if (priceCmp === 'iguales') { conf += 1; reasons.push('mismo precio'); }
        else if (priceCmp === 'cercanos') { conf += 0.5; reasons.push('precio cercano'); }
        // ES vs EN tokens
        const aHasEs = hasESWords(ta), aHasEn = hasENWords(ta);
        const bHasEs = hasESWords(tb), bHasEn = hasENWords(tb);
        if ((aHasEs && bHasEn && !aHasEn && !bHasEs) || (aHasEn && bHasEs && !aHasEs && !bHasEn)) {
          conf += 1; reasons.push('uno ES, otro EN por vocabulario');
        }
        // Bonus subcat (siempre +1 porque ya estamos agrupando)
        conf += 1; reasons.push('misma subcategoría');

        candidates.push({ sub, a, b, jac, conf, reasons });
      }
    }
  }

  candidates.sort((x, y) => y.conf - x.conf || y.jac - x.jac);

  const alta = candidates.filter(c => c.conf >= 4);
  const media = candidates.filter(c => c.conf >= 2 && c.conf < 4);
  const baja = candidates.filter(c => c.conf < 2);

  function fmt(cands, label) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`${label}: ${cands.length} pares`);
    console.log('='.repeat(70));
    for (const c of cands) {
      console.log(`\n[${c.sub}]  conf=${c.conf}  jac=${c.jac.toFixed(2)}  (${c.reasons.join(', ')})`);
      console.log(`  ES candidato: "${c.a.name}" (${c.a.id})  ${c.a.base_price || '—'}€  EN=${c.a.name_en || '∅'}`);
      console.log(`    artistas: ${(c.a.show_artistas || []).map(x => x.artista?.nombre).join(', ') || '—'}`);
      console.log(`  EN candidato: "${c.b.name}" (${c.b.id})  ${c.b.base_price || '—'}€  EN=${c.b.name_en || '∅'}`);
      console.log(`    artistas: ${(c.b.show_artistas || []).map(x => x.artista?.nombre).join(', ') || '—'}`);
      if (c.conf >= 4) {
        // Heurística para decidir cuál es ES y cuál EN: el que tenga palabras EN va archived
        const aIsEn = hasENWords(tokens(c.a.name)) && !hasESWords(tokens(c.a.name));
        const bIsEn = hasENWords(tokens(c.b.name)) && !hasESWords(tokens(c.b.name));
        let esId, enId;
        if (aIsEn && !bIsEn) { esId = c.b.id; enId = c.a.id; }
        else if (bIsEn && !aIsEn) { esId = c.a.id; enId = c.b.id; }
        else { esId = c.a.id; enId = c.b.id; }
        console.log(`  → comando sugerido:`);
        console.log(`    node scripts/merge-es-en-shows.js --es ${esId} --en ${enId} --apply`);
      }
    }
  }

  fmt(alta, '🟢 ALTA confianza ES↔EN (recomendado mergear)');
  fmt(media, '🟡 MEDIA confianza (revisar caso a caso)');
  if (baja.length <= 20) fmt(baja, '⚪ BAJA confianza (probablemente NO son ES↔EN, ignorar)');
  else console.log(`\n⚪ BAJA confianza: ${baja.length} pares (no listados por brevedad)`);

  console.log(`\n\nRESUMEN: alta=${alta.length}  media=${media.length}  baja=${baja.length}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
