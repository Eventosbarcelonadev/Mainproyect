/**
 * SEO Keywords — congela la posición de cada keyword, mes a mes.
 *
 * Por qué: Search Console borra a los 16 meses. Sin esto no se puede responder
 * "¿esta keyword ha subido desde que trabajamos la página?", que es la única
 * pregunta que dice si el trabajo SEO funciona.
 *
 * Modos:
 *   node scripts/seo-keywords.js backfill   # todo lo que GSC todavía sirve
 *   node scripts/seo-keywords.js update     # últimos 3 meses (quincenal)
 *   node scripts/seo-keywords.js show       # resumen sin tocar APIs
 *   node scripts/seo-keywords.js oportunidades   # la lista de trabajo priorizada
 *
 * Guarda en data/seo-keywords.json. Formato compacto: [impresiones, clics, posición].
 * Un mes guardado no se borra nunca, aunque la API deje de servirlo.
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const KEY_FILE = path.join(__dirname, '..', '.secrets', 'ga4-reader.json');
const SITE_URL = 'https://www.eventosbarcelona.com/';
const STORE = path.join(__dirname, '..', 'data', 'seo-keywords.json');
const MIN_IMPRESSIONS = 5;     // por debajo es ruido y multiplica el tamaño del archivo
const MODE = (process.argv[2] || 'update').toLowerCase();

const today = () => new Date().toISOString().slice(0, 10);

function load() {
  if (!fs.existsSync(STORE)) return { site: SITE_URL, min_impressions: MIN_IMPRESSIONS, months: {}, meta: {} };
  return JSON.parse(fs.readFileSync(STORE, 'utf8'));
}

function monthList(fromYM, toYM) {
  const out = []; let [y, m] = fromYM.split('-').map(Number);
  const [ty, tm] = toYM.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

function bounds(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const t = today();
  return { start: `${ym}-01`, end: last > t ? t : last, partial: last > t };
}

async function fetchMonth(wm, ym) {
  const { start, end, partial } = bounds(ym);
  const res = await wm.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: { startDate: start, endDate: end, type: 'web', dimensions: ['query'], rowLimit: 25000 },
  });
  const kw = {};
  for (const r of res.data.rows || []) {
    if (r.impressions < MIN_IMPRESSIONS) continue;
    kw[r.keys[0]] = [r.impressions, r.clicks, +r.position.toFixed(1)];
  }
  return { kw, partial, total: (res.data.rows || []).length };
}

// ---------- análisis ----------
const POS = k => k[2], IMP = k => k[0], CLK = k => k[1];

function distribution(kw) {
  const bands = [['1-3', 1, 3], ['4-10', 4, 10], ['11-20', 11, 20], ['21-50', 21, 50], ['51+', 51, 1e9]];
  return bands.map(([label, a, b]) => {
    const g = Object.values(kw).filter(k => POS(k) >= a && POS(k) <= b);
    const i = g.reduce((s, k) => s + IMP(k), 0), c = g.reduce((s, k) => s + CLK(k), 0);
    return { band: label, keywords: g.length, impressions: i, clicks: c, ctr: i ? c / i : 0 };
  });
}

function strikingDistance(kw, prev) {
  return Object.entries(kw)
    .filter(([, k]) => POS(k) >= 11 && POS(k) <= 20 && IMP(k) >= 30)
    .map(([q, k]) => {
      const p = prev && prev[q];
      return {
        query: q, impressions: IMP(k), clicks: CLK(k), position: POS(k),
        prev_position: p ? POS(p) : null,
        movement: p ? +(POS(p) - POS(k)).toFixed(1) : null,   // positivo = ha subido
      };
    })
    .sort((a, b) => b.impressions - a.impressions);
}

function ctrAnomalies(kw) {
  return Object.entries(kw)
    .filter(([, k]) => POS(k) <= 10 && IMP(k) >= 80 && (IMP(k) ? CLK(k) / IMP(k) : 0) < 0.01)
    .map(([q, k]) => ({ query: q, impressions: IMP(k), clicks: CLK(k), position: POS(k), ctr: IMP(k) ? CLK(k) / IMP(k) : 0 }))
    .sort((a, b) => b.impressions - a.impressions);
}

function movers(kw, prev, minImp = 50) {
  if (!prev) return { up: [], down: [] };
  const rows = Object.entries(kw)
    .filter(([q, k]) => prev[q] && IMP(k) >= minImp)
    .map(([q, k]) => ({ query: q, impressions: IMP(k), position: POS(k), prev_position: POS(prev[q]), movement: +(POS(prev[q]) - POS(k)).toFixed(1) }))
    .filter(r => Math.abs(r.movement) >= 3);
  return {
    up: rows.filter(r => r.movement > 0).sort((a, b) => b.movement - a.movement),
    down: rows.filter(r => r.movement < 0).sort((a, b) => a.movement - b.movement),
  };
}

async function main() {
  const store = load();

  if (MODE === 'show' || MODE === 'oportunidades') {
    const ms = Object.keys(store.months).sort();
    if (!ms.length) { console.log('Vacío. Ejecuta: node scripts/seo-keywords.js backfill'); return; }
    const closed = ms.filter(m => !store.months[m].partial);
    const last = closed[closed.length - 1] || ms[ms.length - 1];
    const prev = closed[closed.length - 2] || null;
    const kw = store.months[last].keywords, kwPrev = prev ? store.months[prev].keywords : null;
    console.log(`\nKeywords · ${last}${store.months[last].partial ? ' (mes parcial)' : ''} · ${Object.keys(kw).length} keywords con ${MIN_IMPRESSIONS}+ impresiones\n`);

    console.log('=== Distribución por posición ===');
    console.log('rango    keywords  impresiones   clics     CTR');
    for (const d of distribution(kw)) {
      console.log(`${d.band.padEnd(8)} ${String(d.keywords).padStart(8)} ${String(d.impressions).padStart(12)} ${String(d.clicks).padStart(7)}  ${(d.ctr * 100).toFixed(2)}%`);
    }

    if (MODE === 'oportunidades') {
      const sd = strikingDistance(kw, kwPrev);
      const potImp = sd.reduce((s, r) => s + r.impressions, 0);
      console.log(`\n=== A un empujón de la página 1 · posición 11-20 con 30+ impresiones ===`);
      console.log(`${sd.length} keywords · ${potImp} impresiones que hoy casi no dan clic\n`);
      sd.slice(0, 25).forEach(r => console.log(
        `  pos ${String(r.position).padStart(5)} ${r.movement !== null ? (r.movement > 0 ? `(+${r.movement} ↑)` : r.movement < 0 ? `(${r.movement} ↓)` : '( = )').padEnd(10) : ''.padEnd(10)} ${String(r.impressions).padStart(5)} imp · ${String(r.clicks).padStart(2)} clics · ${r.query}`));

      const an = ctrAnomalies(kw);
      console.log(`\n=== Top 10 sin clics · el resultado lo absorbe algo de arriba ===`);
      console.log(`${an.length} keywords\n`);
      an.slice(0, 15).forEach(r => console.log(`  pos ${String(r.position).padStart(4)} · ${String(r.impressions).padStart(5)} imp · ${String(r.clicks).padStart(2)} clics · CTR ${(r.ctr * 100).toFixed(2)}% · ${r.query}`));

      const mv = movers(kw, kwPrev);
      if (kwPrev) {
        console.log(`\n=== Movimiento vs ${prev} (3+ puestos, 50+ impresiones) ===`);
        console.log(`  SUBEN (${mv.up.length}):`);
        mv.up.slice(0, 10).forEach(r => console.log(`    +${String(r.movement).padStart(4)} · ${r.prev_position} -> ${r.position} · ${String(r.impressions).padStart(5)} imp · ${r.query}`));
        console.log(`  BAJAN (${mv.down.length}):`);
        mv.down.slice(0, 10).forEach(r => console.log(`    ${String(r.movement).padStart(5)} · ${r.prev_position} -> ${r.position} · ${String(r.impressions).padStart(5)} imp · ${r.query}`));
      }
    }
    return;
  }

  const auth = new google.auth.GoogleAuth({ keyFile: KEY_FILE, scopes: ['https://www.googleapis.com/auth/webmasters.readonly'] });
  const wm = google.webmasters({ version: 'v3', auth });

  const cur = new Date().toISOString().slice(0, 7);
  let from;
  if (MODE === 'backfill') {
    from = '2025-04';   // GSC no sirve nada anterior para esta propiedad
  } else {
    const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 2);
    from = d.toISOString().slice(0, 7);
  }

  console.log(`\nSEO Keywords · modo ${MODE} · ${from} -> ${cur}\n`);
  let added = 0, updated = 0, empty = 0;
  for (const ym of monthList(from, cur)) {
    const { kw, partial, total } = await fetchMonth(wm, ym);
    const count = Object.keys(kw).length;
    if (!count) {
      if (store.months[ym]) console.log(`  ${ym}  la API ya no lo sirve · se conserva lo guardado (${Object.keys(store.months[ym].keywords).length} keywords)`);
      else { console.log(`  ${ym}  sin datos`); empty++; }
      continue;
    }
    if (store.months[ym]) updated++; else added++;
    store.months[ym] = { captured_at: today(), partial: partial || undefined, keywords: kw };
    console.log(`  ${ym}  ${String(count).padStart(5)} keywords guardadas (de ${total} devueltas)${partial ? ' · mes parcial' : ''}`);
  }

  store.min_impressions = MIN_IMPRESSIONS;
  store.meta = {
    last_run: new Date().toISOString(), last_mode: MODE,
    note: `Solo keywords con ${MIN_IMPRESSIONS}+ impresiones en el mes. GSC borra a los 16 meses: este archivo es el histórico real de posiciones.`,
    months_stored: Object.keys(store.months).length,
    oldest: Object.keys(store.months).sort()[0] || null,
  };
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(store));
  const kb = Math.round(fs.statSync(STORE).size / 1024);
  console.log(`\nNuevos ${added} · actualizados ${updated} · sin datos ${empty}`);
  console.log(`Guardado: data/seo-keywords.json (${kb} KB · ${Object.keys(store.months).length} meses)\n`);
}

module.exports = { distribution, strikingDistance, ctrAnomalies, movers };
if (require.main === module) main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
