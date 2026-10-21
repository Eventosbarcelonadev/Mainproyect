// GET /api/admin?action=dashboard-gsc → Search Console en directo para el panel /dashboard
// (dashboard-gsc.html, que imita el informe de Rendimiento de Search Console).
//
// Parámetros: start, end (AAAA-MM-DD) · dim: date|query|page|country|device (vacío = totales)
// · filters: JSON [{dimension, operator, expression}] · type: web|image|video|news · limit (1-25000)
// · seguidas=1 recorre todas las consultas del periodo en el servidor y devuelve solo las keywords
// seguidas (KEYWORDS y KEYWORDS_EN de lib/dashboard/datos.js) y la familia hire/book en inglés: así la
// respuesta es pequeña aunque el periodo tenga cientos de miles de consultas · listas=1 devuelve las listas.
// Solo para el equipo (sesión o ADMIN_API_TOKEN). Necesita GOOGLE_SA_JSON_B64 en Vercel.
import { esEquipo } from '../sesion-admin.js';
import { tokenGoogle } from './google.js';
import { SITE, KEYWORDS, KEYWORDS_EN } from './datos.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIMS = new Set(['date', 'query', 'page', 'country', 'device']);
const OPS = new Set(['contains', 'notContains', 'equals', 'notEquals', 'includingRegex', 'excludingRegex']);
const TIPOS = new Set(['web', 'image', 'video', 'news']);
let cacheToken = { valor: null, caduca: 0 };
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
// Familia hire/book: búsquedas en inglés con "hire" o "book" (misma regla que el informe quincenal)
const HIRE_BOOK = /\b(hire|hiring|book|booking)\b/;
const CASTELLANO = /[áéíóúñ]|\b(de|para|en|del|la|el|los|las|eventos|contratar)\b/;

function resumenSeguidas(filas) {
  const kw = {};
  for (const k of [...KEYWORDS, ...KEYWORDS_EN]) kw[k] = { clicks: 0, impressions: 0, pw: 0 };
  const hb = { queries: 0, top10: 0, clicks: 0, impressions: 0, pw: 0 };
  for (const r of filas) {
    const q = r.keys[0], x = kw[norm(q)];
    if (x) { x.clicks += r.clicks; x.impressions += r.impressions; x.pw += r.position * r.impressions; }
    if (HIRE_BOOK.test(norm(q)) && !CASTELLANO.test(q.toLowerCase())) {
      hb.queries++; if (r.position <= 10) hb.top10++;
      hb.clicks += r.clicks; hb.impressions += r.impressions; hb.pw += r.position * r.impressions;
    }
  }
  const fin = x => ({ clicks: x.clicks, impressions: x.impressions, ctr: x.impressions ? x.clicks / x.impressions : null, position: x.impressions ? +(x.pw / x.impressions).toFixed(2) : null });
  return {
    keywords: KEYWORDS, keywordsEn: KEYWORDS_EN, consultas: filas.length,
    kw: Object.fromEntries(Object.entries(kw).map(([k, x]) => [k, fin(x)])),
    hireBook: { queries: hb.queries, top10: hb.top10, ...fin(hb) },
  };
}

function json(res, status, cuerpo, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache ? 'private, max-age=600' : 'no-store');
  res.end(JSON.stringify(cuerpo));
}

async function token(env) {
  if (cacheToken.valor && Date.now() < cacheToken.caduca) return cacheToken.valor;
  const sa = JSON.parse(Buffer.from(env.GOOGLE_SA_JSON_B64, 'base64').toString('utf8'));
  cacheToken = { valor: await tokenGoogle(sa, ['https://www.googleapis.com/auth/webmasters.readonly']), caduca: Date.now() + 50 * 60 * 1000 };
  return cacheToken.valor;
}

export async function consultaGsc(req, res, env = process.env) {
  if (!(await esEquipo(req))) return json(res, 401, { error: 'Hay que iniciar sesión en /login' });
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  if (q.listas === '1') return json(res, 200, { keywords: KEYWORDS, keywordsEn: KEYWORDS_EN, site: SITE }, true);
  if (!env.GOOGLE_SA_JSON_B64) return json(res, 503, { error: 'Falta GOOGLE_SA_JSON_B64 en las variables de Vercel', falta: 'GOOGLE_SA_JSON_B64' });

  const start = String(q.start || ''), end = String(q.end || '');
  if (!FECHA.test(start) || !FECHA.test(end) || start > end) return json(res, 400, { error: 'Fechas no válidas' });
  const dim = String(q.dim || '');
  if (dim && !DIMS.has(dim)) return json(res, 400, { error: 'Dimensión no válida' });
  const tipo = String(q.type || 'web');
  if (!TIPOS.has(tipo)) return json(res, 400, { error: 'Tipo de búsqueda no válido' });
  let filtros = [];
  try { filtros = q.filters ? JSON.parse(q.filters) : []; } catch (e) { return json(res, 400, { error: 'Filtros no válidos' }); }
  if (!Array.isArray(filtros) || filtros.length > 6 || filtros.some(f => !f || !DIMS.has(f.dimension) || f.dimension === 'date' || !OPS.has(f.operator) || typeof f.expression !== 'string' || f.expression.length > 300)) {
    return json(res, 400, { error: 'Filtros no válidos' });
  }
  const limit = Math.min(25000, Math.max(1, parseInt(q.limit, 10) || 1000));
  const seguidas = q.seguidas === '1';

  try {
    const t = await token(env);
    const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`;
    const body = {
      startDate: start, endDate: end, type: tipo, dataState: 'all',
      dimensions: dim ? [dim] : [],
      ...(filtros.length ? { dimensionFilterGroups: [{ filters: filtros.map(f => ({ dimension: f.dimension, operator: f.operator, expression: f.expression })) }] } : {}),
    };
    if (seguidas) body.dimensions = ['query'];
    const filas = [];
    for (let startRow = 0, vueltas = 0; vueltas < (seguidas ? 12 : 1); vueltas++, startRow += 25000) {
      const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, rowLimit: seguidas ? 25000 : limit, startRow }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return json(res, r.status === 429 ? 429 : 502, { error: `Search Console ${r.status}: ${(j.error && j.error.message) || ''}`.slice(0, 300) });
      const lote = j.rows || [];
      filas.push(...lote);
      if (!seguidas || lote.length < 25000) break;
    }
    if (seguidas) return json(res, 200, resumenSeguidas(filas), true);
    return json(res, 200, { rows: filas.map(r => ({ keys: r.keys || [], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })) }, true);
  } catch (e) {
    console.error('dashboard-gsc', e);
    return json(res, 500, { error: e.message });
  }
}
