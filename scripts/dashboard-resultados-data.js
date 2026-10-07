/**
 * Datos del dashboard de resultados (/dashboard): Search Console + GA4 + GHL, por mes.
 *
 * Uso:
 *   NODE_PATH=<carpeta con googleapis> node scripts/dashboard-resultados-data.js [2026-06 2026-07 ...]
 *   node scripts/build-dashboard-resultados.js
 *
 * Escribe data/dashboard-resultados.json (carpeta ignorada por git). Solo guarda cifras agregadas:
 * nada de nombres, emails ni URLs con parámetros de los leads, porque la página es pública.
 *
 * Fuentes:
 *   - Search Console, propiedad https://www.eventosbarcelona.com/, dataState "final".
 *   - GA4, propiedad 324831331, sesiones por canal (sessionDefaultChannelGroup).
 *   - GHL, oportunidades del pipeline Clientes por fecha de creación (createdAt).
 *     El evento generate_lead de GA4 NO se usa: está inflado (oct 2026).
 *   - Bing Webmaster Tools, GetRankAndTrafficStats (clics e impresiones diarios en Bing), con
 *     BING_WEBMASTER_API_KEY de .env. Bing solo guarda desde el 6-jun-2025 y en 2025 le faltan días:
 *     se guarda cuántos días tiene cada mes para no comparar contra un mes incompleto.
 *     Las citas en Copilot (AI Performance) no tienen API: van a mano en data/bing-ai-citas.json.
 */
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const ROOT = path.join(__dirname, '..');
const KEY_FILE = path.join(ROOT, '.secrets', 'ga4-reader.json');
const SITE = 'https://www.eventosbarcelona.com/';
const GA4_PROPERTY = 'properties/324831331';
const OUT = path.join(ROOT, 'data', 'dashboard-resultados.json');
const MONTHS = process.argv.slice(2).length ? process.argv.slice(2) : ['2026-06', '2026-07', '2026-08', '2026-09'];

// Keywords que se siguen mes a mes (cluster de dinero + marca). Comparación sin tildes y en minúsculas.
const KEYWORDS = [
  'agencia de eventos barcelona', 'agencias de eventos barcelona', 'agencia de eventos en barcelona',
  'empresa de eventos barcelona', 'empresas de eventos barcelona', 'organizacion de eventos barcelona',
  'eventos corporativos barcelona', 'agencia de eventos corporativos', 'agencia de eventos',
  'productora de eventos barcelona', 'espectaculos para eventos corporativos', 'artistas para eventos',
  'eventos mice', 'event agency barcelona', 'corporate events barcelona', 'eventos barcelona',
];

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const lastDay = m => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
const prevYear = m => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`;

function group(q) {
  const k = norm(q);
  if (/eventosbarcelona|^eventos barcelona$|eventos bcn/.test(k)) return 'marca';
  if (/(agencia|agencias|empresa|empresas|organizac|organizador|productora|produccion).{0,25}evento|evento.{0,25}(agencia|empresa)|eventos corporativos|corporate event|event (agency|management|production)|\bmice\b|\bdmc\b/.test(k)) return 'agencia';
  if (/espectacul|show|artista|bailar|danza|music|grupo|banda|\bdj\b|mago|flamenco|percusi|laser|mapping|\bled\b|burlesque|cantante|rumba|acrobat|circo|violin|saxo|fuego|drone/.test(k)) return 'espectaculos';
  if (/alquiler|sonido|iluminaci|pantalla|escenario|audiovisual|rental/.test(k)) return 'alquiler';
  return 'otras';
}

async function gscQuery(wm, startDate, endDate, dimensions) {
  const rows = []; let startRow = 0;
  for (;;) {
    const r = await wm.searchanalytics.query({ siteUrl: SITE, requestBody: { startDate, endDate, dimensions, rowLimit: 25000, startRow, dataState: 'final' } });
    const batch = r.data.rows || []; rows.push(...batch);
    if (batch.length < 25000) break; startRow += 25000;
  }
  return rows;
}

async function gscMonth(wm, m) {
  const s = `${m}-01`, e = lastDay(m);
  const [tot] = await gscQuery(wm, s, e, []);
  const queries = await gscQuery(wm, s, e, ['query']);
  const pages = await gscQuery(wm, s, e, ['page']);
  const groups = {}; let top10 = 0;
  for (const r of queries) {
    const g = groups[group(r.keys[0])] ||= { clicks: 0, impressions: 0 };
    g.clicks += r.clicks; g.impressions += r.impressions;
    if (r.position <= 10) top10 += r.impressions;
  }
  const kw = {};
  for (const k of KEYWORDS) kw[k] = { clicks: 0, impressions: 0, posW: 0 };
  for (const r of queries) {
    const k = norm(r.keys[0]);
    if (kw[k]) { kw[k].clicks += r.clicks; kw[k].impressions += r.impressions; kw[k].posW += r.position * r.impressions; }
  }
  for (const k of KEYWORDS) { const x = kw[k]; x.position = x.impressions ? +(x.posW / x.impressions).toFixed(1) : null; delete x.posW; }
  const pageAgg = {};
  for (const r of pages) {
    const p = (r.keys[0].replace(SITE.slice(0, -1), '').split(/[?#]/)[0].replace(/\/+$/, '')) || '/';
    const a = pageAgg[p] ||= { clicks: 0, impressions: 0 }; a.clicks += r.clicks; a.impressions += r.impressions;
  }
  const topPages = Object.entries(pageAgg).sort((a, b) => b[1].clicks - a[1].clicks || b[1].impressions - a[1].impressions).slice(0, 8).map(([p, v]) => ({ page: p, ...v }));
  return {
    range: [s, e],
    clicks: tot ? tot.clicks : 0, impressions: tot ? tot.impressions : 0,
    ctr: tot ? tot.ctr : 0, position: tot ? +tot.position.toFixed(1) : null,
    top10Impressions: top10, queriesWithImpressions: queries.length, pagesWithImpressions: Object.keys(pageAgg).length,
    groups, keywords: kw, topPages,
  };
}

async function ga4Month(ga, m) {
  const s = `${m}-01`, e = lastDay(m);
  const r = await ga.properties.runReport({ property: GA4_PROPERTY, requestBody: {
    dateRanges: [{ startDate: s, endDate: e }], dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }] } });
  const channels = {}; let sessions = 0, users = 0;
  for (const row of r.data.rows || []) {
    const ch = row.dimensionValues[0].value; const se = +row.metricValues[0].value; const us = +row.metricValues[1].value;
    channels[ch] = se; sessions += se; users += us;
  }
  return { range: [s, e], sessions, users, channels };
}

function readEnv(file) {
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split('\n').filter(l => /^[A-Z_]+=/.test(l))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
}

async function bingTraffic(months) {
  const env = readEnv(path.join(ROOT, '.env'));
  const u = `https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats?siteUrl=${encodeURIComponent(SITE)}&apikey=${env.BING_WEBMASTER_API_KEY}`;
  const r = await fetch(u); const j = await r.json();
  if (!r.ok) throw new Error(`Bing ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  const byMonth = {};
  for (const row of j.d || []) {
    const day = new Date(Number(/\d+/.exec(row.Date)[0])).toISOString().slice(0, 10);
    const x = byMonth[day.slice(0, 7)] ||= { clicks: 0, impressions: 0, days: 0 };
    x.clicks += row.Clicks; x.impressions += row.Impressions; x.days++;
  }
  const pick = m => {
    const x = byMonth[m] || { clicks: 0, impressions: 0, days: 0 };
    return { ...x, complete: x.days === Number(lastDay(m).slice(8)) };
  };
  const out = { months: {}, prevYear: {} };
  for (const m of months) { out.months[m] = pick(m); out.prevYear[m] = pick(prevYear(m)); }
  return out;
}

function entryChannel(o) {
  const s = `${o.source || ''} | ${o.contactSource || ''}`;
  if (/Web Elementor|Form Cliente/i.test(s)) return 'formulario';
  if (/\bhola\b|n8n|EMAIL|Make/i.test(s)) return 'email';
  return 'otros';
}

async function ghlLeads(months) {
  const env = readEnv(path.join(ROOT, '.env'));
  const H = { Authorization: `Bearer ${env.GHL_API_KEY}`, Version: '2021-07-28' };
  const opps = []; let startAfter = null, startAfterId = null;
  for (let i = 0; i < 100; i++) {
    const u = new URL('https://services.leadconnectorhq.com/opportunities/search');
    u.searchParams.set('location_id', env.GHL_LOCATION_ID);
    u.searchParams.set('pipeline_id', env.GHL_PIPELINE_CLIENTES);
    u.searchParams.set('limit', '100');
    if (startAfter) { u.searchParams.set('startAfter', startAfter); u.searchParams.set('startAfterId', startAfterId); }
    const r = await fetch(u, { headers: H }); const j = await r.json();
    if (!r.ok) throw new Error(`GHL ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
    opps.push(...(j.opportunities || []));
    if (!j.meta || !j.meta.nextPageUrl || !(j.opportunities || []).length) break;
    startAfter = j.meta.startAfter; startAfterId = j.meta.startAfterId;
  }
  // Nombres de campos personalizados (oportunidad y contacto)
  const defs = {};
  for (const model of ['opportunity', 'contact']) {
    const r = await fetch(`https://services.leadconnectorhq.com/locations/${env.GHL_LOCATION_ID}/customFields?model=${model}`, { headers: H });
    const j = await r.json(); (j.customFields || []).forEach(f => { defs[f.id] = (f.fieldKey || f.name).replace(/^(contact|opportunity)\./, ''); });
  }
  const stageName = {};
  for (const [k, v] of Object.entries(env)) if (k.startsWith('GHL_STAGE_') && v) stageName[v] = k.replace('GHL_STAGE_', '').toLowerCase();

  const inRange = opps.filter(o => months.includes((o.createdAt || '').slice(0, 7)));
  const out = {};
  for (const m of months) out[m] = { total: 0, entry: { formulario: 0, email: 0, otros: 0 }, idioma: { es: 0, en: 0 },
    comoNosConocio: { google: 0, web: 0, otro: 0, sinRespuesta: 0 }, status: {}, stages: {}, utmInformado: 0, paginasFormulario: {} };
  for (const o of inRange) {
    const m = o.createdAt.slice(0, 7); const x = out[m];
    let contact = null;
    try {
      const r = await fetch(`https://services.leadconnectorhq.com/contacts/${o.contactId}`, { headers: H });
      if (r.ok) contact = (await r.json()).contact;
    } catch (e) { /* contacto borrado: se cuenta igual */ }
    await new Promise(res => setTimeout(res, 120));
    const ccf = {}; ((contact && contact.customFields) || []).forEach(f => { ccf[defs[f.id] || f.id] = f.value; });
    const ocf = {}; (o.customFields || []).forEach(f => { ocf[defs[f.id] || f.id] = f.fieldValueString || f.fieldValue || f.value; });
    const rec = { source: o.source, contactSource: contact ? contact.source : '' };
    x.total++;
    x.entry[entryChannel(rec)]++;
    const tags = (contact && contact.tags) || [];
    x.idioma[tags.includes('lang:en') ? 'en' : 'es']++;
    const c = norm(String(ocf.como_nos_conocio || ''));
    if (!c) x.comoNosConocio.sinRespuesta++;
    else if (/google/.test(c)) x.comoNosConocio.google++;
    else if (/^web|website/.test(c)) x.comoNosConocio.web++;
    else x.comoNosConocio.otro++;
    x.status[o.status] = (x.status[o.status] || 0) + 1;
    const st = stageName[o.pipelineStageId] || 'otra';
    x.stages[st] = (x.stages[st] || 0) + 1;
    if (ccf.utm_source) x.utmInformado++;
    const slug = /Web Elementor · (.+)$/.exec(o.source || '');
    if (slug) x.paginasFormulario[slug[1]] = (x.paginasFormulario[slug[1]] || 0) + 1;
  }
  return { months: out, locationId: env.GHL_LOCATION_ID, firstOpportunity: opps.map(o => o.createdAt).sort()[0] || null };
}

(async () => {
  const auth = new google.auth.GoogleAuth({ keyFile: KEY_FILE, scopes: [
    'https://www.googleapis.com/auth/webmasters.readonly', 'https://www.googleapis.com/auth/analytics.readonly'] });
  const wm = google.webmasters({ version: 'v3', auth });
  const ga = google.analyticsdata({ version: 'v1beta', auth });
  const data = { generatedAt: new Date().toISOString(), site: SITE, ga4Property: GA4_PROPERTY.split('/')[1], months: MONTHS, keywords: KEYWORDS, gsc: {}, gscPrevYear: {}, ga4: {}, ga4PrevYear: {} };
  for (const m of MONTHS) {
    process.stdout.write(`GSC ${m}… `); data.gsc[m] = await gscMonth(wm, m);
    process.stdout.write(`GSC ${prevYear(m)}… `); data.gscPrevYear[m] = await gscMonth(wm, prevYear(m));
    process.stdout.write(`GA4 ${m}… `); data.ga4[m] = await ga4Month(ga, m);
    data.ga4PrevYear[m] = await ga4Month(ga, prevYear(m));
    console.log('ok');
  }
  process.stdout.write('GHL… ');
  data.ghl = await ghlLeads(MONTHS);
  console.log('ok');
  process.stdout.write('Bing… ');
  data.bing = await bingTraffic(MONTHS);
  console.log('ok');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 1));
  console.log(`Escrito ${path.relative(ROOT, OUT)}`);
  for (const m of MONTHS) {
    const g = data.gsc[m], a = data.ga4[m], l = data.ghl.months[m], b = data.bing.months[m];
    console.log(`${m}: imp ${g.impressions} · clics ${g.clicks} · top10 ${g.top10Impressions} · sesiones ${a.sessions} (Google ${a.channels['Organic Search'] || 0}, IA ${a.channels['AI Assistant'] || 0}) · leads ${l.total} · Bing ${b.clicks} clics / ${b.impressions} imp (${b.days} días)`);
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
