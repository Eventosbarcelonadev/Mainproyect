/**
 * Datos del dashboard de resultados (/dashboard): Search Console + GA4 + GHL + Bing.
 * Lo usan el cron (api/dashboard-cron.js) y el script local (scripts/dashboard-resultados-data.mjs).
 *
 * Solo devuelve cifras agregadas: nada de nombres, emails ni URLs con parámetros de los leads.
 *
 * Fuentes:
 *   - Search Console, propiedad https://www.eventosbarcelona.com/, dataState "final".
 *     Meses: del INICIO al último mes cerrado con datos finales (como mucho los 6 últimos).
 *     Últimas semanas (gscRecent): semana a semana del sitio y las keywords en tres ventanas de
 *     14 días: BASE (antes de los artículos en otros medios), la quincena anterior y la última,
 *     que acaba el último domingo con datos finales.
 *     Inglés: páginas /en/ (impresiones, clics, posición) y las keywords de KEYWORDS_EN.
 *   - GA4, propiedad 324831331, sesiones por canal (sessionDefaultChannelGroup); en inglés,
 *     las sesiones que entran por una página /en/ (landingPage).
 *   - GHL, oportunidades del pipeline Clientes por fecha de creación (createdAt).
 *     El evento generate_lead de GA4 NO se usa: está inflado (oct 2026).
 *   - Bing Webmaster Tools, GetRankAndTrafficStats (clics e impresiones diarios en Bing). Bing solo
 *     guarda desde el 6-jun-2025 y en 2025 le faltan días: se guarda cuántos días tiene cada mes
 *     para no comparar contra un mes incompleto. Las citas en Copilot (AI Performance) no tienen
 *     API: van a mano en data/bing-ai-citas.json.
 */
import { tokenGoogle, clienteGoogle } from './google.js';

export const SITE = 'https://www.eventosbarcelona.com/';
const GA4_PROPERTY = 'properties/324831331';
const INICIO = '2026-06';
const MAX_MESES = 6;
// Las dos semanas antes de publicar los artículos en otros medios (28 y 29 de septiembre)
export const BASE = ['2026-09-14', '2026-09-27'];

// Keywords que se siguen (cluster de dinero + marca). Comparación sin tildes y en minúsculas.
export const KEYWORDS = [
  'agencia de eventos barcelona', 'agencias de eventos barcelona', 'agencia de eventos en barcelona',
  'empresa de eventos barcelona', 'empresas de eventos barcelona', 'organizacion de eventos barcelona',
  'eventos corporativos barcelona', 'agencia de eventos corporativos', 'agencia de eventos',
  'productora de eventos barcelona', 'espectaculos para eventos corporativos', 'artistas para eventos',
  'eventos mice', 'eventos barcelona',
];
// En inglés: las que tienen impresiones reales (90 días a 18-oct-2026), en cualquier página
export const KEYWORDS_EN = [
  'event agency barcelona', 'corporate events barcelona', 'event management barcelona', 'corporate event agency spain',
  'event agency spain', 'event companies barcelona', 'events companies barcelona', 'corporate events',
  'corporate event planner', 'corporate event entertainment', 'event entertainment', 'mice events',
  'event venues barcelona', 'dmc barcelona',
  // Fórmula Hire/Book (Xavi, 21-oct-2026): las que tienen datos en Search Console
  'hire artists for events barcelona', 'hire shows for events in barcelona', 'corporate entertainment spain',
  'events dj', 'burlesque show barcelona', 'master of ceremonies',
];
// Familia Hire/Book: todas las búsquedas en inglés con "hire" o "book". Las de muy poco volumen (p. ej.
// "corporate entertainment agency barcelona") Google las anonimiza y no salen por separado en Search
// Console, así que la familia entera es la mejor medida de la fórmula de títulos del 21-oct-2026.
const HIRE_BOOK = /\b(hire|hiring|book|booking)\b/;
const CASTELLANO = /[áéíóúñ]|\b(de|para|en|del|la|el|los|las|eventos|contratar)\b/;
const EN_PAGE = { dimension: 'page', operator: 'includingRegex', expression: '^https://www\\.eventosbarcelona\\.com/en(/|$)' };

const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const lastDay = m => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
export const prevYear = m => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`;
export const addDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const nextMonth = m => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7); };

// Meses cerrados con datos finales: del INICIO al último cuyo último día ya tiene datos
export function mesesHasta(ultimoFinal) {
  const out = [];
  for (let m = INICIO; lastDay(m) <= ultimoFinal; m = nextMonth(m)) out.push(m);
  return out.slice(-MAX_MESES);
}

// Ejecuta fn sobre items con n en paralelo, manteniendo el orden
async function enParalelo(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

function group(q) {
  const k = norm(q);
  if (/eventosbarcelona|^eventos barcelona$|eventos bcn/.test(k)) return 'marca';
  if (/(agencia|agencias|empresa|empresas|organizac|organizador|productora|produccion).{0,25}evento|evento.{0,25}(agencia|empresa)|eventos corporativos|corporate event|event (agency|management|production)|\bmice\b|\bdmc\b/.test(k)) return 'agencia';
  if (/espectacul|show|artista|bailar|danza|music|grupo|banda|\bdj\b|mago|flamenco|percusi|laser|mapping|\bled\b|burlesque|cantante|rumba|acrobat|circo|violin|saxo|fuego|drone/.test(k)) return 'espectaculos';
  if (/alquiler|sonido|iluminaci|pantalla|escenario|audiovisual|rental/.test(k)) return 'alquiler';
  return 'otras';
}

const pagina = url => (url.replace(SITE.slice(0, -1), '').split(/[?#]/)[0]) || '/';

export async function recogerDatos({ env, sa, hoy = new Date(), meses, log = () => {} }) {
  const token = await tokenGoogle(sa, ['https://www.googleapis.com/auth/webmasters.readonly', 'https://www.googleapis.com/auth/analytics.readonly']);
  const g = clienteGoogle(token);
  const gsc = (s, e, dimensions, filtros) => g.gsc(SITE, { startDate: s, endDate: e, dimensions, dataState: 'final', ...(filtros ? { dimensionFilterGroups: [{ filters: filtros }] } : {}) });

  // Último día con datos finales en Search Console (suelen ir 2 o 3 días por detrás)
  const hoyS = hoy.toISOString().slice(0, 10);
  const ultimoFinal = (await gsc(addDays(hoyS, -20), hoyS, ['date'])).map(r => r.keys[0]).sort().pop();
  const M = meses && meses.length ? meses : mesesHasta(ultimoFinal);
  log(`meses ${M.join(', ')} · datos finales hasta ${ultimoFinal}\n`);

  // ---------- Search Console por mes ----------
  async function gscMonth(m) {
    const s = `${m}-01`, e = lastDay(m);
    const [[tot], queries, pages] = await Promise.all([gsc(s, e, []), gsc(s, e, ['query']), gsc(s, e, ['page'])]);
    const groups = {}; let top10 = 0;
    for (const r of queries) {
      const gr = groups[group(r.keys[0])] ||= { clicks: 0, impressions: 0 };
      gr.clicks += r.clicks; gr.impressions += r.impressions;
      if (r.position <= 10) top10 += r.impressions;
    }
    const kw = {};
    for (const k of KEYWORDS) kw[k] = { clicks: 0, impressions: 0, posW: 0 };
    for (const r of queries) {
      const x = kw[norm(r.keys[0])];
      if (x) { x.clicks += r.clicks; x.impressions += r.impressions; x.posW += r.position * r.impressions; }
    }
    for (const k of KEYWORDS) { const x = kw[k]; x.position = x.impressions ? +(x.posW / x.impressions).toFixed(1) : null; delete x.posW; }
    const pageAgg = {};
    for (const r of pages) {
      const p = pagina(r.keys[0]).replace(/\/+$/, '') || '/';
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

  // Páginas en inglés (/en/) por mes
  async function gscMonthEn(m) {
    const s = `${m}-01`, e = lastDay(m);
    const [[tot], queries] = await Promise.all([gsc(s, e, [], [EN_PAGE]), gsc(s, e, ['query'], [EN_PAGE])]);
    return {
      range: [s, e],
      clicks: tot ? tot.clicks : 0, impressions: tot ? tot.impressions : 0, position: tot ? +tot.position.toFixed(1) : null,
      top10Impressions: queries.filter(r => r.position <= 10).reduce((a, r) => a + r.impressions, 0),
    };
  }

  // Keywords en una ventana: posición, impresiones, clics y la página que más impresiones se lleva
  async function gscKeywordWindow(s, e) {
    const [queries, qp] = await Promise.all([gsc(s, e, ['query']), gsc(s, e, ['query', 'page'])]);
    const kw = {};
    for (const k of [...KEYWORDS, ...KEYWORDS_EN]) kw[k] = { clicks: 0, impressions: 0, posW: 0, pages: {} };
    for (const r of queries) {
      const x = kw[norm(r.keys[0])];
      if (x) { x.clicks += r.clicks; x.impressions += r.impressions; x.posW += r.position * r.impressions; }
    }
    for (const r of qp) {
      const x = kw[norm(r.keys[0])];
      if (!x) continue;
      const a = x.pages[pagina(r.keys[1])] ||= { impressions: 0, posW: 0 }; a.impressions += r.impressions; a.posW += r.position * r.impressions;
    }
    for (const x of Object.values(kw)) {
      x.position = x.impressions ? +(x.posW / x.impressions).toFixed(1) : null; delete x.posW;
      const [page, v] = Object.entries(x.pages).sort((a, b) => b[1].impressions - a[1].impressions)[0] || [];
      x.page = page ? { url: page, position: +(v.posW / v.impressions).toFixed(1), share: x.impressions ? +(v.impressions / x.impressions).toFixed(2) : 0 } : null;
      delete x.pages;
    }
    const hb = queries.filter(r => HIRE_BOOK.test(norm(r.keys[0])) && !CASTELLANO.test(r.keys[0].toLowerCase()));
    const hbImp = hb.reduce((a, r) => a + r.impressions, 0);
    const hireBook = { queries: hb.length, impressions: hbImp, clicks: hb.reduce((a, r) => a + r.clicks, 0),
      position: hbImp ? +(hb.reduce((a, r) => a + r.position * r.impressions, 0) / hbImp).toFixed(1) : null,
      top10Queries: hb.filter(r => r.position <= 10).length };
    return { range: [s, e], keywords: kw, hireBook };
  }

  // Últimas 8 semanas de lunes a domingo y tres ventanas de 14 días que acaban el último domingo con datos
  async function gscRecent() {
    const end = addDays(ultimoFinal, -new Date(`${ultimoFinal}T00:00:00Z`).getUTCDay());
    const desde = addDays(end, -55);
    const [byDate, byDateQuery, base, prev, now] = await Promise.all([
      gsc(desde, end, ['date']), gsc(desde, end, ['date', 'query']),
      gscKeywordWindow(...BASE), gscKeywordWindow(addDays(end, -27), addDays(end, -14)), gscKeywordWindow(addDays(end, -13), end),
    ]);
    const weeks = [];
    for (let s = desde; s <= end; s = addDays(s, 7)) {
      const e = addDays(s, 6), inW = r => r.keys[0] >= s && r.keys[0] <= e;
      const d = byDate.filter(inW);
      const imp = d.reduce((a, r) => a + r.impressions, 0);
      weeks.push({
        range: [s, e],
        clicks: d.reduce((a, r) => a + r.clicks, 0), impressions: imp,
        position: imp ? +(d.reduce((a, r) => a + r.position * r.impressions, 0) / imp).toFixed(1) : null,
        // impresiones en primera página: posición diaria de la búsqueda ≤ 10
        top10Impressions: byDateQuery.filter(r => inW(r) && r.position <= 10).reduce((a, r) => a + r.impressions, 0),
      });
    }
    return { lastFinal: ultimoFinal, end, weeks, base, prev, now };
  }

  // ---------- GA4 ----------
  async function ga4Month(m, soloEn) {
    const s = `${m}-01`, e = lastDay(m);
    const j = await g.ga4(GA4_PROPERTY, {
      dateRanges: [{ startDate: s, endDate: e }], dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
      ...(soloEn ? { dimensionFilter: { filter: { fieldName: 'landingPage', stringFilter: { matchType: 'BEGINS_WITH', value: '/en/' } } } } : {}),
    });
    const channels = {}; let sessions = 0, users = 0;
    for (const row of j.rows || []) {
      const se = +row.metricValues[0].value;
      channels[row.dimensionValues[0].value] = se; sessions += se; users += +row.metricValues[1].value;
    }
    return { range: [s, e], sessions, users, channels };
  }

  const data = {
    generatedAt: new Date().toISOString(), site: SITE, ga4Property: GA4_PROPERTY.split('/')[1], months: M,
    keywords: KEYWORDS, keywordsEn: KEYWORDS_EN, base: BASE,
    gsc: {}, gscPrevYear: {}, ga4: {}, ga4PrevYear: {}, en: { gsc: {}, gscPrevYear: {}, ga4: {}, ga4PrevYear: {} },
  };
  const tareas = M.flatMap(m => [
    async () => { data.gsc[m] = await gscMonth(m); },
    async () => { data.gscPrevYear[m] = await gscMonth(prevYear(m)); },
    async () => { data.en.gsc[m] = await gscMonthEn(m); },
    async () => { data.en.gscPrevYear[m] = await gscMonthEn(prevYear(m)); },
    async () => { data.ga4[m] = await ga4Month(m); },
    async () => { data.ga4PrevYear[m] = await ga4Month(prevYear(m)); },
    async () => { data.en.ga4[m] = await ga4Month(m, true); },
    async () => { data.en.ga4PrevYear[m] = await ga4Month(prevYear(m), true); },
  ]);
  const [, recent, ghl, bing] = await Promise.all([
    enParalelo(tareas, 4, t => t()).then(r => { log('Search Console y GA4 por mes ok\n'); return r; }),
    gscRecent().then(r => { log(`últimas semanas ok (hasta ${r.end})\n`); return r; }),
    ghlLeads(env, M).then(r => { log('GHL ok\n'); return r; }),
    bingTraffic(env, M).then(r => { log('Bing ok\n'); return r; }),
  ]);
  data.gscRecent = recent; data.ghl = ghl; data.bing = bing;
  return data;
}

// Lo que se guarda en el índice de informes para listarlos sin abrir cada uno
export function resumenInforme(D) {
  return { generado: D.generatedAt, meses: [D.months[0], D.months[D.months.length - 1]], datosHasta: D.gscRecent.end };
}

async function bingTraffic(env, months) {
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

async function ghlLeads(env, months) {
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
  // Contactos de 4 en 4: la API de GHL admite unas 100 peticiones cada 10 segundos
  const contactos = await enParalelo(inRange, 4, async o => {
    try {
      const r = await fetch(`https://services.leadconnectorhq.com/contacts/${o.contactId}`, { headers: H });
      return r.ok ? (await r.json()).contact : null;
    } catch (e) { return null; } // contacto borrado: se cuenta igual
  });
  inRange.forEach((o, i) => {
    const contact = contactos[i];
    const x = out[o.createdAt.slice(0, 7)];
    const ccf = {}; ((contact && contact.customFields) || []).forEach(f => { ccf[defs[f.id] || f.id] = f.value; });
    const ocf = {}; (o.customFields || []).forEach(f => { ocf[defs[f.id] || f.id] = f.fieldValueString || f.fieldValue || f.value; });
    x.total++;
    x.entry[entryChannel({ source: o.source, contactSource: contact ? contact.source : '' })]++;
    x.idioma[((contact && contact.tags) || []).includes('lang:en') ? 'en' : 'es']++;
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
  });
  return { months: out, locationId: env.GHL_LOCATION_ID, firstOpportunity: opps.map(o => o.createdAt).sort()[0] || null };
}
