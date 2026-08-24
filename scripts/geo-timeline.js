/**
 * GEO Timeline — serie histórica mensual de SEO + GEO (Eventos Barcelona)
 *
 * Por qué existe: Google Search Console solo conserva 16 meses y GA4 tiene retención
 * limitada. Lo que no se congele hoy se pierde. Este script mantiene
 * `data/geo-timeline.json` como archivo propio, independiente de las APIs.
 *
 * Modos:
 *   node scripts/geo-timeline.js backfill   # reconstruye toda la serie disponible
 *   node scripts/geo-timeline.js update     # refresca solo los últimos 3 meses (quincenal)
 *   node scripts/geo-timeline.js show       # imprime la serie guardada, sin tocar APIs
 *
 * Regla de oro: los meses ya guardados NUNCA se borran, aunque la API deje de servirlos.
 * Un mes solo se sobrescribe si la API todavía lo devuelve con datos.
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const KEY_FILE = path.join(__dirname, '..', '.secrets', 'ga4-reader.json');
const GA4_PROPERTY = 'properties/324831331';
const SITE_URL = 'https://www.eventosbarcelona.com/';
const STORE = path.join(__dirname, '..', 'data', 'geo-timeline.json');

const AI_SOURCES = [
  'chatgpt.com', 'chat.openai.com', 'openai', 'openai.com',
  'claude.ai', 'anthropic.com', 'gemini.google.com', 'bard.google.com',
  'perplexity.ai', 'perplexity', 'www.perplexity.ai',
  'copilot.microsoft.com', 'copilot.com', 'edgeservices.bing.com',
  'you.com', 'poe.com', 'deepseek.com', 'grok.com', 'x.ai', 'phind.com',
];
const AI_REGEX = '^(' + AI_SOURCES.map(s => s.replace(/\./g, '\\.')).join('|') + ')$';

const MODE = (process.argv[2] || 'update').toLowerCase();
const today = () => new Date().toISOString().slice(0, 10);

function loadStore() {
  if (!fs.existsSync(STORE)) return { site: SITE_URL, months: {}, meta: {} };
  return JSON.parse(fs.readFileSync(STORE, 'utf8'));
}

function monthKeys(fromYM, toYM) {
  const out = [];
  let [y, m] = fromYM.split('-').map(Number);
  const [ty, tm] = toYM.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const todayStr = today();
  return { start: `${ym}-01`, end: last > todayStr ? todayStr : last, isPartial: last > todayStr };
}

async function ga4ByMonth(analytics, from, to, extraFilter, metric = 'sessions') {
  const req = {
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: [{ name: 'yearMonth' }],
    metrics: [{ name: metric }],
    orderBys: [{ dimension: { dimensionName: 'yearMonth' } }],
    limit: 200,
  };
  if (extraFilter) req.dimensionFilter = extraFilter;
  const res = await analytics.properties.runReport({ property: GA4_PROPERTY, requestBody: req });
  const map = {};
  for (const r of res.data.rows || []) {
    const ym = r.dimensionValues[0].value;            // "202608"
    map[`${ym.slice(0, 4)}-${ym.slice(4)}`] = +r.metricValues[0].value;
  }
  return map;
}

const aiFilter = { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'FULL_REGEXP', value: AI_REGEX } } };
const chatgptFilter = { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'EXACT', value: 'chatgpt.com' } } };
const leadFilter = { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'generate_lead' } } };
const aiLeadFilter = { andGroup: { expressions: [aiFilter, leadFilter] } };

async function main() {
  const store = loadStore();

  if (MODE === 'show') {
    printSeries(store);
    return;
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly', 'https://www.googleapis.com/auth/webmasters.readonly'],
  });
  const analytics = google.analyticsdata({ version: 'v1beta', auth });
  const webmasters = google.webmasters({ version: 'v3', auth });

  // Rango a consultar
  const now = new Date();
  const curYM = now.toISOString().slice(0, 7);
  let fromYM;
  if (MODE === 'backfill') {
    fromYM = '2024-01';
  } else {
    const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - 2);
    fromYM = d.toISOString().slice(0, 7);
  }
  const from = `${fromYM}-01`;
  const to = today();

  console.log(`\nGEO Timeline · modo ${MODE}`);
  console.log(`Consultando ${from} -> ${to}\n`);

  // --- GA4: 5 queries agregadas por mes (no una por mes) ---
  const [gaTotal, gaAi, gaChatgpt, gaLeads, gaAiLeads] = await Promise.all([
    ga4ByMonth(analytics, from, to, null),
    ga4ByMonth(analytics, from, to, aiFilter),
    ga4ByMonth(analytics, from, to, chatgptFilter),
    ga4ByMonth(analytics, from, to, leadFilter, 'eventCount'),
    ga4ByMonth(analytics, from, to, aiLeadFilter, 'eventCount'),
  ]);

  // --- GSC: una sola query por día, agregada aquí ---
  const gsc = {};
  try {
    const res = await webmasters.searchanalytics.query({
      siteUrl: SITE_URL,
      requestBody: { startDate: from, endDate: to, type: 'web', dimensions: ['date'], rowLimit: 25000 },
    });
    for (const r of res.data.rows || []) {
      const ym = r.keys[0].slice(0, 7);
      (gsc[ym] ??= { impressions: 0, clicks: 0, posSum: 0, days: 0 });
      gsc[ym].impressions += r.impressions;
      gsc[ym].clicks += r.clicks;
      gsc[ym].posSum += r.position;
      gsc[ym].days++;
    }
  } catch (e) {
    console.log(`  aviso GSC: ${e.message.slice(0, 80)}`);
  }

  // --- Upsert por mes ---
  let added = 0, updated = 0, preserved = 0;
  for (const ym of monthKeys(fromYM, curYM)) {
    const { isPartial } = monthBounds(ym);
    const sessions = gaTotal[ym] ?? null;
    const g = gsc[ym];

    // Si la API ya no devuelve nada para ese mes pero lo tenemos guardado, se conserva.
    if (sessions === null && !g) {
      if (store.months[ym]) { preserved++; }
      continue;
    }

    const aiSessions = gaAi[ym] ?? 0;
    const snapshot = {
      month: ym,
      partial: isPartial || undefined,
      captured_at: today(),
      ga4: {
        sessions,
        ai_sessions: aiSessions,
        chatgpt_sessions: gaChatgpt[ym] ?? 0,
        ai_share: sessions ? +(aiSessions / sessions).toFixed(4) : null,
        leads: gaLeads[ym] ?? 0,
        ai_leads: gaAiLeads[ym] ?? 0,
        ai_lead_share: (gaLeads[ym] ?? 0) ? +((gaAiLeads[ym] ?? 0) / gaLeads[ym]).toFixed(4) : null,
      },
      gsc: g ? {
        impressions: g.impressions,
        clicks: g.clicks,
        ctr: g.impressions ? +(g.clicks / g.impressions).toFixed(5) : 0,
        position: +(g.posSum / g.days).toFixed(1),
      } : (store.months[ym]?.gsc ?? null),   // no pisar con null lo ya guardado
    };

    if (store.months[ym]) { updated++; } else { added++; }
    store.months[ym] = snapshot;
  }

  store.site = SITE_URL;
  store.meta = {
    last_run: new Date().toISOString(),
    last_mode: MODE,
    note: 'Archivo propio. GSC solo sirve 16 meses y GA4 tiene retención limitada: los meses guardados aquí no se borran nunca aunque la API deje de devolverlos.',
    gsc_data_starts: Object.keys(store.months).filter(m => store.months[m].gsc).sort()[0] || null,
    ga4_data_starts: Object.keys(store.months).sort()[0] || null,
  };

  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(store, null, 2));
  console.log(`Meses nuevos: ${added} · actualizados: ${updated} · conservados sin tocar: ${preserved}`);
  console.log(`Guardado: data/geo-timeline.json\n`);

  printSeries(store);
}

function pct(v) { return v === null || v === undefined ? '  n/d' : (v * 100).toFixed(2) + '%'; }

function printSeries(store) {
  const months = Object.keys(store.months).sort();
  if (!months.length) { console.log('Serie vacía. Ejecuta: node scripts/geo-timeline.js backfill'); return; }

  console.log('mes       sesiones   AI  share    ChatGPT  leads  leadsAI   GSC imp  clics    CTR   pos');
  console.log('-'.repeat(92));
  for (const m of months) {
    const s = store.months[m], a = s.ga4, g = s.gsc;
    console.log(
      `${m}${s.partial ? '*' : ' '} ` +
      `${String(a.sessions ?? '-').padStart(8)} ${String(a.ai_sessions).padStart(4)} ${pct(a.ai_share).padStart(7)}  ` +
      `${String(a.chatgpt_sessions).padStart(7)} ${String(a.leads).padStart(6)} ${String(a.ai_leads).padStart(7)}  ` +
      (g ? `${String(g.impressions).padStart(8)} ${String(g.clicks).padStart(6)} ${pct(g.ctr).padStart(6)} ${String(g.position).padStart(5)}` : '       sin datos GSC')
    );
  }
  console.log('-'.repeat(92));
  console.log('* mes parcial');

  // Deltas contra 3 y 12 meses atrás
  const done = months.filter(m => !store.months[m].partial);
  const last = done[done.length - 1];
  for (const back of [3, 12]) {
    const prev = done[done.length - 1 - back];
    if (!prev || !last) continue;
    const A = store.months[last], B = store.months[prev];
    const d = (x, y) => (y ? ((x - y) / y * 100).toFixed(1) + '%' : 'n/d');
    console.log(`\n${last} vs ${prev} (${back} meses):`);
    console.log(`  Sesiones AI      ${B.ga4.ai_sessions} -> ${A.ga4.ai_sessions}   ${d(A.ga4.ai_sessions, B.ga4.ai_sessions)}`);
    console.log(`  Share AI         ${pct(B.ga4.ai_share)} -> ${pct(A.ga4.ai_share)}`);
    if (A.gsc && B.gsc) {
      console.log(`  Impresiones GSC  ${B.gsc.impressions} -> ${A.gsc.impressions}   ${d(A.gsc.impressions, B.gsc.impressions)}`);
      console.log(`  Clics GSC        ${B.gsc.clicks} -> ${A.gsc.clicks}   ${d(A.gsc.clicks, B.gsc.clicks)}`);
    }
  }
  console.log(`\nCobertura: ${months[0]} -> ${months[months.length - 1]} (${months.length} meses guardados)`);
  if (store.meta?.gsc_data_starts) console.log(`GSC congelado desde: ${store.meta.gsc_data_starts}`);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
