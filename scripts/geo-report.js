/**
 * GEO Report — medición de visibilidad en motores generativos (Eventos Barcelona)
 *
 * Junta las 3 capas que HOY sí son medibles por API:
 *   1. GA4  · referrals desde asistentes AI (ChatGPT, Claude, Gemini, Perplexity, Copilot...)
 *            tendencia mensual, landing pages citadas, leads atribuidos
 *   2. GSC  · totales de Search como denominador + páginas top (contexto)
 *   3. Infra · robots.txt (AI crawlers) y llms.txt vivos
 *
 * NO cubre el informe "IA generativa" de Search Console: Google lo expone SOLO en la UI,
 * ni Search Analytics API ni el export a BigQuery lo devuelven (verificado 2026-08-24).
 * Ese dato se copia a mano. Ver docs/medicion-geo.md
 *
 * Uso:
 *   node scripts/geo-report.js [dias]      # default 365
 *
 * Salidas: data/geo-report.json + data/geo-ai-landing-pages.csv
 * Al terminar invoca geo-timeline.js update para congelar el mes en la serie histórica.
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const https = require('https');

const KEY_FILE = path.join(__dirname, '..', '.secrets', 'ga4-reader.json');
const GA4_PROPERTY = 'properties/324831331';
const SITE_URL = 'https://www.eventosbarcelona.com/';
const DAYS = parseInt(process.argv[2] || '365', 10);
const OUT_DIR = path.join(__dirname, '..', 'data');

// Hosts de asistentes AI. Ampliar aqui cuando aparezca uno nuevo.
const AI_SOURCES = [
  'chatgpt.com', 'chat.openai.com', 'openai', 'openai.com',
  'claude.ai', 'anthropic.com',
  'gemini.google.com', 'bard.google.com',
  'perplexity.ai', 'perplexity', 'www.perplexity.ai',
  'copilot.microsoft.com', 'copilot.com', 'edgeservices.bing.com',
  'you.com', 'poe.com', 'deepseek.com', 'grok.com', 'x.ai', 'phind.com',
];
const AI_REGEX = '^(' + AI_SOURCES.map(s => s.replace(/\./g, '\\.')).join('|') + ')$';

const LEAD_EVENTS = ['generate_lead', 'contact_elementor', 'click_mail', 'click_telefono'];

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function fetchStatus(url) {
  return new Promise(resolve => {
    https.get(url, { timeout: 12000 }, res => {
      let len = 0;
      res.on('data', c => { len += c.length; });
      res.on('end', () => resolve({ status: res.statusCode, bytes: len }));
    }).on('error', () => resolve({ status: 0, bytes: 0 }))
      .on('timeout', function () { this.destroy(); resolve({ status: 0, bytes: 0 }); });
  });
}

function fetchBody(url) {
  return new Promise(resolve => {
    https.get(url, { timeout: 12000 }, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', () => resolve({ status: 0, body: '' }))
      .on('timeout', function () { this.destroy(); resolve({ status: 0, body: '' }); });
  });
}

function csvSafe(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function runGa4(analytics, body) {
  const res = await analytics.properties.runReport({
    property: GA4_PROPERTY,
    requestBody: { dateRanges: [{ startDate: daysAgo(DAYS), endDate: daysAgo(1) }], ...body },
  });
  return res.data.rows || [];
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: [
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/webmasters.readonly',
    ],
  });
  const analytics = google.analyticsdata({ version: 'v1beta', auth });
  const webmasters = google.webmasters({ version: 'v3', auth });

  const aiFilter = {
    filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'FULL_REGEXP', value: AI_REGEX } },
  };

  console.log(`\nGEO Report · ${SITE_URL}`);
  console.log(`Periodo: ${daysAgo(DAYS)} -> ${daysAgo(1)} (${DAYS} dias)\n`);

  // ---------- 1. GA4: share de trafico AI ----------
  const allSources = await runGa4(analytics, {
    dimensions: [{ name: 'sessionSource' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 500,
  });
  const aiSet = new Set(AI_SOURCES);
  let totalSessions = 0;
  const bySource = [];
  for (const r of allSources) {
    const src = r.dimensionValues[0].value;
    const sessions = +r.metricValues[0].value;
    totalSessions += sessions;
    if (aiSet.has(src)) bySource.push({ source: src, sessions, users: +r.metricValues[1].value });
  }
  const aiSessions = bySource.reduce((a, b) => a + b.sessions, 0);
  const aiShare = totalSessions ? aiSessions / totalSessions : 0;

  console.log('=== 1. Trafico desde asistentes AI ===');
  console.log(`Sesiones totales: ${totalSessions}`);
  console.log(`Sesiones AI:      ${aiSessions}  (${(aiShare * 100).toFixed(2)}%)\n`);
  bySource.forEach(s => console.log('  ' + s.source.padEnd(26) + String(s.sessions).padStart(6) + ' sesiones  ' + String(s.users).padStart(5) + ' usuarios'));

  // ---------- 2. Tendencia mensual ----------
  const monthly = (await runGa4(analytics, {
    dimensions: [{ name: 'yearMonth' }],
    metrics: [{ name: 'sessions' }],
    dimensionFilter: aiFilter,
    orderBys: [{ dimension: { dimensionName: 'yearMonth' } }],
  })).map(r => ({ month: r.dimensionValues[0].value, sessions: +r.metricValues[0].value }));

  console.log('\n=== 2. Tendencia mensual (sesiones AI) ===');
  const peak = Math.max(1, ...monthly.map(m => m.sessions));
  monthly.forEach(m => console.log(`  ${m.month}  ${String(m.sessions).padStart(4)}  ${'#'.repeat(Math.round(m.sessions / peak * 34))}`));

  // ---------- 3. Landing pages citadas ----------
  const landings = (await runGa4(analytics, {
    dimensions: [{ name: 'landingPage' }],
    metrics: [{ name: 'sessions' }],
    dimensionFilter: aiFilter,
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 100,
  })).map(r => ({ page: r.dimensionValues[0].value, sessions: +r.metricValues[0].value }));

  console.log('\n=== 3. Landing pages que reciben trafico AI (top 15) ===');
  landings.slice(0, 15).forEach(l => console.log('  ' + String(l.sessions).padStart(5) + '  ' + l.page));

  // ---------- 4. Leads atribuidos a trafico AI ----------
  const evAi = await runGa4(analytics, {
    dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }],
    dimensionFilter: aiFilter, limit: 100,
  });
  const evAll = await runGa4(analytics, {
    dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }], limit: 100,
  });
  const pick = (rows, name) => { const r = rows.find(x => x.dimensionValues[0].value === name); return r ? +r.metricValues[0].value : 0; };

  console.log('\n=== 4. Eventos de lead · AI vs total ===');
  const leads = {};
  for (const ev of LEAD_EVENTS) {
    const ai = pick(evAi, ev), all = pick(evAll, ev);
    leads[ev] = { ai, all, share: all ? ai / all : 0 };
    console.log(`  ${ev.padEnd(20)} AI ${String(ai).padStart(5)} / total ${String(all).padStart(6)}  (${(leads[ev].share * 100).toFixed(1)}% del total)`);
  }
  console.log(`\n  Nota: share de sesiones AI = ${(aiShare * 100).toFixed(2)}%. Si el share de leads lo supera, el trafico AI sobre-indexa en conversion.`);

  // ---------- 5. GSC: denominador Search ----------
  console.log('\n=== 5. Google Search (denominador) ===');
  const gsc = {};
  for (const type of ['web', 'image']) {
    const res = await webmasters.searchanalytics.query({
      siteUrl: SITE_URL,
      requestBody: { startDate: daysAgo(DAYS), endDate: daysAgo(2), type, rowLimit: 1 },
    });
    const row = (res.data.rows || [])[0] || {};
    gsc[type] = { impressions: row.impressions || 0, clicks: row.clicks || 0, ctr: row.ctr || 0, position: row.position || 0 };
    console.log(`  ${type.padEnd(6)} impresiones ${String(gsc[type].impressions).padStart(8)}  clics ${String(gsc[type].clicks).padStart(6)}  CTR ${(gsc[type].ctr * 100).toFixed(2)}%`);
  }
  console.log('  (el informe "IA generativa" de GSC NO se expone por API: copiar a mano desde la UI)');

  // Top queries + top paginas + split de idioma (para el dashboard)
  const gscQuery = (dims, limit) => webmasters.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: { startDate: daysAgo(DAYS), endDate: daysAgo(2), type: 'web', dimensions: dims, rowLimit: limit },
  }).then(r => r.data.rows || []);

  const topQueries = (await gscQuery(['query'], 50)).map(r => ({
    query: r.keys[0], impressions: r.impressions, clicks: r.clicks,
    ctr: +(r.ctr).toFixed(5), position: +(r.position).toFixed(1),
  }));
  const gscPages = await gscQuery(['page'], 500);
  const topPages = gscPages.slice(0, 40).map(r => ({
    page: r.keys[0].replace('https://www.eventosbarcelona.com', '') || '/',
    impressions: r.impressions, clicks: r.clicks, position: +(r.position).toFixed(1),
  }));
  const lang = { es: { impressions: 0, clicks: 0 }, en: { impressions: 0, clicks: 0 } };
  for (const r of gscPages) {
    const path0 = r.keys[0].replace('https://www.eventosbarcelona.com', '');
    const t = path0.startsWith('/en') ? lang.en : lang.es;
    t.impressions += r.impressions; t.clicks += r.clicks;
  }
  for (const k of ['es', 'en']) lang[k].ctr = lang[k].impressions ? +(lang[k].clicks / lang[k].impressions).toFixed(5) : 0;
  console.log(`  ES imp ${lang.es.impressions} clics ${lang.es.clicks} CTR ${(lang.es.ctr*100).toFixed(2)}%  |  EN imp ${lang.en.impressions} clics ${lang.en.clicks} CTR ${(lang.en.ctr*100).toFixed(2)}%`);

  // ---------- 6. Infra GEO viva ----------
  console.log('\n=== 6. Infraestructura GEO ===');
  const robots = await fetchBody(SITE_URL + 'robots.txt');
  const llms = await fetchStatus(SITE_URL + 'llms.txt');
  const crawlers = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot', 'anthropic-ai'];
  const crawlerState = {};
  for (const c of crawlers) {
    const block = new RegExp(`User-agent:\\s*${c}\\b[\\s\\S]*?(?=\\nUser-agent:|\\n#|$)`, 'i').exec(robots.body || '');
    const allowed = block ? /Allow:\s*\//i.test(block[0]) && !/Disallow:\s*\/\s*$/im.test(block[0]) : null;
    crawlerState[c] = allowed === null ? 'no declarado (hereda *)' : allowed ? 'permitido' : 'bloqueado';
    console.log(`  ${c.padEnd(18)} ${crawlerState[c]}`);
  }
  const contentSignal = (/Content-Signal:\s*(.+)/i.exec(robots.body || '') || [])[1] || 'ausente';
  console.log(`  Content-Signal     ${contentSignal.trim()}`);
  console.log(`  llms.txt           HTTP ${llms.status} (${llms.bytes} bytes)`);

  // ---------- Persistir ----------
  const out = {
    generated_at: new Date().toISOString(),
    site: SITE_URL,
    period: { start: daysAgo(DAYS), end: daysAgo(1), days: DAYS },
    ai_traffic: { total_sessions: totalSessions, ai_sessions: aiSessions, ai_share: aiShare, by_source: bySource },
    monthly_trend: monthly,
    landing_pages: landings,
    leads,
    gsc,
    top_queries: topQueries,
    top_pages: topPages,
    language_split: lang,
    infra: { crawlers: crawlerState, content_signal: contentSignal.trim(), llms_txt: llms },
    gsc_generative_ai: {
      note: 'Rellenar a mano desde Search Console > Rendimiento > IA generativa (solo UI, sin API)',
      available: null, impressions: null, top_pages: [],
    },
  };
  fs.writeFileSync(path.join(OUT_DIR, 'geo-report.json'), JSON.stringify(out, null, 2));

  const csv = ['landing_page,sessions'];
  landings.forEach(l => csv.push([csvSafe(l.page), l.sessions].join(',')));
  fs.writeFileSync(path.join(OUT_DIR, 'geo-ai-landing-pages.csv'), csv.join('\n'));

  console.log('\nEscrito: data/geo-report.json + data/geo-ai-landing-pages.csv');

  // Alimentar la serie histórica. GSC solo guarda 16 meses: lo que no se congele se pierde.
  try {
    const { execFileSync } = require('child_process');
    execFileSync(process.execPath, [path.join(__dirname, 'geo-timeline.js'), 'update'], { stdio: 'inherit' });
  } catch (e) {
    console.log(`  aviso: no se pudo actualizar la serie histórica (${e.message.slice(0, 60)})`);
    console.log('  ejecuta a mano: node scripts/geo-timeline.js update');
  }
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
