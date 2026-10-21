/**
 * HTML del dashboard de resultados (/dashboard) a partir de los datos de lib/dashboard/datos.js.
 * Lo usan el cron (api/dashboard-cron.js), la página (api/dashboard.js) y el script local.
 *
 * Cada cifra enlaza a su fuente filtrada por el mismo periodo: Search Console, Google Analytics 4 o GHL.
 * Bing Webmaster Tools no admite fechas en la URL: sus enlaces abren el informe y el periodo se elige allí.
 * Solo lleva cifras agregadas. Las citas en Copilot salen de data/bing-ai-citas.json (a mano, sin API).
 */
const MES = { '01': 'enero', '02': 'febrero', '03': 'marzo', '04': 'abril', '05': 'mayo', '06': 'junio', '07': 'julio', '08': 'agosto', '09': 'septiembre', '10': 'octubre', '11': 'noviembre', '12': 'diciembre' };
const mesNombre = m => MES[m.slice(5, 7)];
const mesCorto = m => mesNombre(m).slice(0, 3);
const prevYear = m => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`;
const ymd = s => s.replace(/-/g, '');
const lastDay = m => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
const addDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dia = s => Number(s.slice(8, 10));
const fechaLarga = s => `${dia(s)} de ${MES[s.slice(5, 7)]} de ${s.slice(0, 4)}`;
const rangoCorto = ([s, e]) => s.slice(0, 7) === e.slice(0, 7) ? `${dia(s)}–${dia(e)} ${mesCorto(e)}` : `${dia(s)} ${mesCorto(s)}–${dia(e)} ${mesCorto(e)}`;
const rangoLargo = ([s, e]) => s.slice(0, 7) === e.slice(0, 7) ? `del ${dia(s)} al ${dia(e)} de ${MES[e.slice(5, 7)]}` : `del ${dia(s)} de ${MES[s.slice(5, 7)]} al ${dia(e)} de ${MES[e.slice(5, 7)]}`;

// Números a la española: punto de millar también en 4 cifras (1.066), coma decimal.
const n0 = v => (v === null || v === undefined) ? '–' : Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const n1 = v => (v === null || v === undefined) ? '–' : v.toFixed(1).replace('.', ',');
const pct = (v, d = 2) => (v * 100).toFixed(d).replace('.', ',') + ' %';
const delta = (a, b) => (b ? Math.round((a - b) / b * 100) : null);

const SITE = 'https://www.eventosbarcelona.com/';
const SITE_ENC = encodeURIComponent(SITE);
const gscRange = (s, e, { query, page } = {}) => {
  let u = `https://search.google.com/search-console/performance/search-analytics?resource_id=${SITE_ENC}&start_date=${ymd(s)}&end_date=${ymd(e)}&metrics=CLICKS%2CIMPRESSIONS%2CCTR%2CPOSITION`;
  if (query) u += `&query=!${encodeURIComponent(query)}&breakdown=query`;
  if (page) u += `&page=*${encodeURIComponent(page)}&breakdown=page`;
  return u;
};
const gscUrl = (m, query) => gscRange(`${m}-01`, lastDay(m), { query });
const gscEnUrl = m => gscRange(`${m}-01`, lastDay(m), { page: `${SITE}en/` });
const bingUrl = `https://www.bing.com/webmasters/searchperf?siteUrl=${SITE_ENC}`;
const bingAiUrl = `https://www.bing.com/webmasters/aiperformance?siteUrl=${SITE_ENC}`;
const link = (url, txt, title) => `<a class="src" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(title)}">${txt}</a>`;
// <wbr> tras cada / y - para que en móvil las URLs largas partan por ahí y no a mitad de palabra
const urlLab = u => u === '/' ? '/ (home)' : u === '/en/' ? '/en/ (home en inglés)' : esc(u).replace(/([/-])/g, '$1<wbr>');
const posClass = p => p === null ? 'nd' : p <= 10 ? 'p-top' : p <= 20 ? 'p-mid' : 'p-low';
const KWLAB = { 'organizacion de eventos barcelona': 'organización de eventos barcelona', 'espectaculos para eventos corporativos': 'espectáculos para eventos corporativos' };
const flecha = d => d === null ? '<span class="nd">–</span>' : `<b class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲ ' : d < 0 ? '▼ ' : ''}${d === 0 ? 'igual' : n1(Math.abs(d))}</b>`;
const srcName = { gsc: 'Search Console', gscen: 'Search Console (páginas en inglés)', ga4: 'Google Analytics 4', ga4en: 'Google Analytics 4', ghl: 'GoHighLevel', bing: 'Bing Webmaster Tools', bingai: 'Bing Webmaster Tools (AI Performance)', calc: 'Cálculo' };
const fechaDe = iso => { const d = new Date(iso); return `${d.getUTCDate()} de ${MES[String(d.getUTCMonth() + 1).padStart(2, '0')]} de ${d.getUTCFullYear()}`; };

const CSS = `*{box-sizing:border-box}
:root{--ink:#0a2540;--gold:#c99a3a;--gold-txt:#7a5a15;--bg:#faf8f4;--line:#e8e2d5;--card:#fff;--green:#17663a;--amber:#8a5300;--red:#b42318;--muted:#5b6473;--link:#0a2540}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1140px;margin:0 auto;padding:44px 28px}
.kicker{color:var(--gold-txt);font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:700}
h1{font-size:34px;margin:8px 0 6px;letter-spacing:-.02em;line-height:1.2}
.sub-h{color:var(--muted);font-size:15px;max-width:72ch;margin:0}
.badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.badges span{background:var(--ink);color:#fff;padding:7px 13px;border-radius:3px;font-size:11px;letter-spacing:.05em;text-transform:uppercase;font-weight:600}
h2{font-size:23px;margin:46px 0 6px;letter-spacing:-.015em;border-left:4px solid var(--gold);padding-left:14px}
h3{font-size:17px;margin:30px 0 6px}
.h2-sub{color:var(--muted);margin:0 0 14px;max-width:78ch;font-size:14px}
a.src{color:var(--link);text-decoration:underline dotted;text-decoration-color:#9aa6b4;text-underline-offset:3px}
a.src:hover,a.src:focus-visible{text-decoration:underline solid;text-decoration-color:var(--ink)}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:24px 0 8px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:5px;padding:16px 18px;min-width:0}
.k-lab{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700}
.k-val{font-size:30px;font-weight:800;line-height:1.15;margin-top:4px;font-variant-numeric:tabular-nums}
.k-sub{font-size:12px;color:var(--muted);margin-top:4px}
.t-scroll{overflow-x:auto;margin:12px 0;-webkit-overflow-scrolling:touch}
.tbl{width:100%;border-collapse:collapse;font-size:13px;background:var(--card);border:1px solid var(--line)}
.tbl th{background:var(--ink);color:#fff;padding:10px 13px;text-align:left;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;font-weight:600;white-space:nowrap}
.tbl th.num{text-align:right}
.tbl td{padding:9px 13px;border-bottom:1px solid var(--line);vertical-align:top}
.tbl td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.tbl td.num>a.src,.tbl td.num>span{font-size:14px;font-weight:700}
.tbl tr.sec td{background:#f2efe7;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:var(--ink);padding:7px 13px}
.tbl tr.strong td{font-weight:700}
.tbl .lab{font-weight:600}
.tbl small.hint{display:block;color:var(--muted);font-size:11.5px;font-weight:400}
.tbl small.yoy{display:block;font-size:11px;color:var(--muted);margin-top:2px}
.tbl small.yoy a.src{color:var(--muted)}
.tbl td.srcname{font-size:12px;white-space:nowrap}
.tbl td.pag{font-size:13px;min-width:200px;overflow-wrap:anywhere}
b.up{color:var(--green)}b.down{color:var(--red)}
.p-top{color:var(--green)}.p-mid{color:var(--amber)}.p-low{color:var(--muted)}
.nd{color:#6b7280;font-style:italic;font-size:11px}
.charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:14px 0}
.chart{background:var(--card);border:1px solid var(--line);border-radius:5px;padding:18px 20px;min-width:0}
.c-title{font-size:13px;color:var(--muted);margin-bottom:14px}
.c-title b{color:var(--ink)}
.bars{display:flex;gap:10px;align-items:flex-end;height:170px;border-bottom:2px solid var(--ink)}
.bar{flex:1 1 0;display:flex;flex-direction:column;height:100%;min-width:0}
.b-col{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end;align-items:center}
.b-num{font-size:12px;font-weight:700;text-align:center;white-space:nowrap;margin-bottom:4px;font-variant-numeric:tabular-nums}
.b-fill{width:100%;max-width:64px;background:linear-gradient(to top,var(--ink),#3a5a7a);border-radius:3px 3px 0 0;min-height:3px}
.bar.current .b-fill{background:linear-gradient(to top,#8a6416,var(--gold))}
.b-lab{margin-top:6px;font-size:11px;color:var(--muted);text-align:center;font-weight:700}
.callout{background:#fff8e1;border:1px solid #f0e0a0;border-left:6px solid var(--gold);padding:14px 18px;margin:16px 0;border-radius:4px;font-size:14px}
.callout.info{background:#f0f7fa;border-color:#c9dae2;border-left-color:#3d7a95}
.callout ul{margin:6px 0 0;padding-left:18px}
.callout li{margin:4px 0}
.nav-inf{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:13px;color:var(--muted);margin-top:14px}
.nav-inf a{color:var(--ink);font-weight:600}
.archivado{background:var(--ink);color:#fff;padding:12px 16px;font-size:14px;text-align:center}
.archivado a{color:#f3d58a;font-weight:700}
.lista{list-style:none;padding:0;margin:20px 0;display:grid;gap:10px}
.lista li{background:var(--card);border:1px solid var(--line);border-radius:5px;padding:14px 18px;display:flex;flex-wrap:wrap;gap:4px 16px;align-items:baseline;justify-content:space-between}
.lista a{font-weight:700;color:var(--ink);font-size:16px}
.lista small{color:var(--muted);font-size:13px}
.lista .tag{background:var(--gold);color:var(--ink);font-size:11px;font-weight:700;padding:2px 8px;border-radius:3px;text-transform:uppercase;letter-spacing:.05em;margin-left:8px}
footer{margin-top:56px;padding-top:22px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;text-align:center}
footer code{background:#f2efe7;padding:1px 5px;border-radius:2px;font-size:11.5px;word-break:break-all}
@media(max-width:820px){
  .wrap{padding:30px 16px}
  h1{font-size:26px}
  h2{font-size:20px}
  .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .charts{grid-template-columns:minmax(0,1fr)}
  .k-val{font-size:24px}
}
@media print{body{background:#fff}.chart,.callout,.kpi{break-inside:avoid}}
/* RIDER VISUAL · responsive (2026-10-06): primera columna fija y con ancho mínimo en las tablas anchas.
   En móvil la tabla se desplaza dentro de .t-scroll; sin esto la keyword se partía en 3 líneas y se perdía al deslizar. */
.tbl th:first-child,.tbl td:first-child{position:sticky;left:0;z-index:1;background:var(--card);min-width:190px}
.tbl th:first-child{background:var(--ink)}
.tbl.citadas{max-width:640px}
.tbl.citadas td:first-child{overflow-wrap:anywhere}
.tbl tr.sec td:first-child{background:#f2efe7}
@media(max-width:820px){.tbl th:first-child,.tbl td:first-child{min-width:150px;box-shadow:2px 0 0 var(--line)}}`;

function pagina(title, desc, cuerpo) {
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#161413">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Eventos Barcelona">
<meta property="og:locale" content="es_ES">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="https://propuestas.eventosbarcelona.com/og-eventos-barcelona.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="https://propuestas.eventosbarcelona.com/dashboard">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="https://propuestas.eventosbarcelona.com/og-eventos-barcelona.jpg">
<meta name="robots" content="noindex, nofollow">
<style>
${CSS}
</style>
</head>
<body>
<div class="wrap">
${cuerpo}
<footer>Scale IT para Eventos Barcelona · <b>propuestas.eventosbarcelona.com/dashboard</b></footer>
</div>
</body>
</html>
`;
  if (/—/.test(html)) throw new Error('La página contiene un guion largo (U+2014)');
  return html;
}

export function renderDashboard(D, CITAS) {
  const M = D.months;
  const R = D.gscRecent;
  const ga4Url = m => {
    const params = encodeURIComponent(`_u..nav=maui&_u.date00=${ymd(`${m}-01`)}&_u.date01=${ymd(lastDay(m))}`);
    return `https://analytics.google.com/analytics/web/#/p${D.ga4Property}/reports/explorer?params=${params}&r=lifecycle-traffic-acquisition-v2&ruid=lifecycle-traffic-acquisition-v2,life-cycle,acquisition&collectionId=life-cycle`;
  };
  const ghlUrl = `https://app.gohighlevel.com/v2/location/${D.ghl.locationId}/opportunities/list`;
  const srcUrl = { gsc: m => gscUrl(m), gscen: m => gscEnUrl(m), ga4: m => ga4Url(m), ga4en: m => ga4Url(m), ghl: () => ghlUrl, bing: () => bingUrl, bingai: () => bingAiUrl };
  const genTxt = fechaDe(D.generatedAt);
  const rango = `${mesNombre(M[0])} a ${mesNombre(M[M.length - 1])} de ${M[M.length - 1].slice(0, 4)}`;
  const L = m => D.ghl.months[m];

  // ---------- 1. Tabla mes a mes (también la de inglés) ----------
  const ch = (m, k, prev) => ((prev ? D.ga4PrevYear : D.ga4)[m].channels[k] || 0);
  const chEn = (m, k, prev) => ((prev ? D.en.ga4PrevYear : D.en.ga4)[m].channels[k] || 0);
  function cell(r, m) {
    const v = r.get(m, false), p = r.get(m, true);
    const url = srcUrl[r.src] ? srcUrl[r.src](m) : null;
    const main = url && v !== null ? link(url, r.fmt(v), `Abrir ${srcName[r.src]}: ${mesNombre(m)} ${m.slice(0, 4)}`) : `<span>${r.fmt(v)}</span>`;
    const pm = prevYear(m);
    let sub = '';
    if (['gsc', 'gscen', 'ga4', 'ga4en'].includes(r.src) || (r.src === 'bing' && D.bing.prevYear[m].complete)) {
      const d = r.noDelta ? null : delta(v, p);
      const dTxt = d === null ? '' : ` <b class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '+' : ''}${d} %</b>`;
      sub = `<small class="yoy">${link(srcUrl[r.src](pm), `${pm.slice(0, 4)}: ${r.fmt(p)}`, `Abrir ${srcName[r.src]}: ${mesNombre(pm)} ${pm.slice(0, 4)}`)}${dTxt}</small>`;
    } else if (r.src === 'bing') {
      sub = `<small class="yoy nd">${pm.slice(0, 4)}: mes incompleto</small>`;
    } else if (r.src === 'bingai' && (CITAS.notas_mes || {})[m]) {
      sub = `<small class="yoy nd">${esc(CITAS.notas_mes[m])}</small>`;
    } else if (r.src === 'ghl' || r.src === 'bingai') {
      sub = `<small class="yoy nd">${pm.slice(0, 4)}: sin datos</small>`;
    }
    return `<td class="num">${main}${sub}</td>`;
  }
  const tablaFilas = (rows, cls) => `<div class="t-scroll"><table class="tbl ${cls}">
<thead><tr><th>Métrica</th>${M.map(m => `<th class="num">${mesNombre(m)}</th>`).join('')}<th>Fuente</th></tr></thead>
<tbody>
${rows.map(r => r.sec ? `<tr class="sec"><td colspan="${M.length + 2}">${r.sec}</td></tr>` :
  `<tr><td><span class="lab">${r.lab}</span><small class="hint">${r.hint}</small></td>${M.map(m => cell(r, m)).join('')}<td class="srcname">${r.src === 'calc' ? 'Cálculo' : link(srcUrl[r.src](M[M.length - 1]), (r.src.startsWith('bing') ? 'Bing Webmaster' : r.src.startsWith('gsc') ? 'Search Console' : srcName[r.src]) + ' ↗', `Abrir ${srcName[r.src]}`)}</td></tr>`).join('\n')}
</tbody></table></div>`;

  const ROWS = [
    { sec: 'Google · Search Console' },
    { lab: 'Impresiones en Google', hint: 'veces que la web salió en resultados', src: 'gsc', get: (m, p) => (p ? D.gscPrevYear : D.gsc)[m].impressions, fmt: n0 },
    { lab: 'Clics desde Google', hint: 'visitas que llegaron desde esos resultados', src: 'gsc', get: (m, p) => (p ? D.gscPrevYear : D.gsc)[m].clicks, fmt: n0 },
    { lab: 'CTR', hint: 'clics por cada 100 impresiones', src: 'gsc', get: (m, p) => (p ? D.gscPrevYear : D.gsc)[m].ctr, fmt: v => pct(v), noDelta: true },
    { lab: 'Posición media', hint: 'de todas las búsquedas, más bajo es mejor', src: 'gsc', get: (m, p) => (p ? D.gscPrevYear : D.gsc)[m].position, fmt: n1, noDelta: true },
    { sec: 'Bing y Copilot · Bing Webmaster Tools' },
    { lab: 'Citas en Copilot', hint: 'veces que Copilot citó una página de EB en su respuesta', src: 'bingai', get: (m, p) => (p ? null : (CITAS.meses[m] ?? null)), fmt: n0 },
    { lab: 'Impresiones en Bing', hint: 'veces que la web salió en resultados de Bing', src: 'bing', get: (m, p) => (p ? D.bing.prevYear : D.bing.months)[m].impressions, fmt: n0 },
    { lab: 'Clics desde Bing', hint: 'visitas que llegaron desde esos resultados', src: 'bing', get: (m, p) => (p ? D.bing.prevYear : D.bing.months)[m].clicks, fmt: n0 },
    { sec: 'Visitas · Google Analytics 4' },
    { lab: 'Visitas totales', hint: 'sesiones de todos los canales', src: 'ga4', get: (m, p) => (p ? D.ga4PrevYear : D.ga4)[m].sessions, fmt: n0 },
    { lab: 'Visitas desde Google', hint: 'canal Organic Search', src: 'ga4', get: (m, p) => ch(m, 'Organic Search', p), fmt: n0 },
    { lab: 'Visitas desde ChatGPT y otras IA', hint: 'canal AI Assistant', src: 'ga4', get: (m, p) => ch(m, 'AI Assistant', p), fmt: n0 },
    { lab: 'Visitas directas', hint: 'canal Direct', src: 'ga4', get: (m, p) => ch(m, 'Direct', p), fmt: n0 },
    { sec: 'Leads · GoHighLevel' },
    { lab: 'Leads nuevos', hint: 'oportunidades creadas en el pipeline Clientes', src: 'ghl', get: (m, p) => (p ? null : L(m).total), fmt: n0 },
    { lab: 'Leads por cada 100 visitas', hint: 'cálculo: leads / visitas totales × 100', src: 'calc', get: (m, p) => (p ? null : L(m).total / D.ga4[m].sessions * 100), fmt: n1 },
  ];
  const tablaMeses = tablaFilas(ROWS, 'mes');

  const ROWS_EN = [
    { sec: 'Google · páginas en inglés (/en/)' },
    { lab: 'Impresiones en Google', hint: 'veces que salió una página en inglés', src: 'gscen', get: (m, p) => (p ? D.en.gscPrevYear : D.en.gsc)[m].impressions, fmt: n0 },
    { lab: 'Impresiones en primera página', hint: 'búsquedas en las que salió entre los 10 primeros', src: 'gscen', get: (m, p) => (p ? D.en.gscPrevYear : D.en.gsc)[m].top10Impressions, fmt: n0 },
    { lab: 'Clics desde Google', hint: 'visitas que llegaron a una página en inglés', src: 'gscen', get: (m, p) => (p ? D.en.gscPrevYear : D.en.gsc)[m].clicks, fmt: n0 },
    { lab: 'Posición media', hint: 'de las páginas en inglés, más bajo es mejor', src: 'gscen', get: (m, p) => (p ? D.en.gscPrevYear : D.en.gsc)[m].position, fmt: n1, noDelta: true },
    { lab: 'Peso del inglés', hint: 'impresiones en inglés sobre el total de la web', src: 'calc', get: (m, p) => (p ? null : D.en.gsc[m].impressions / D.gsc[m].impressions), fmt: v => pct(v, 0) },
    { sec: 'Visitas · Google Analytics 4' },
    { lab: 'Visitas que entran en inglés', hint: 'sesiones que empiezan en una página /en/', src: 'ga4en', get: (m, p) => (p ? D.en.ga4PrevYear : D.en.ga4)[m].sessions, fmt: n0 },
    { lab: 'de ellas, desde Google', hint: 'canal Organic Search', src: 'ga4en', get: (m, p) => chEn(m, 'Organic Search', p), fmt: n0 },
    { lab: 'de ellas, desde ChatGPT y otras IA', hint: 'canal AI Assistant', src: 'ga4en', get: (m, p) => chEn(m, 'AI Assistant', p), fmt: n0 },
    { sec: 'Leads · GoHighLevel' },
    { lab: 'Leads en inglés', hint: 'contactos con la etiqueta lang:en', src: 'ghl', get: (m, p) => (p ? null : L(m).idioma.en), fmt: n0 },
  ];
  const tablaEn = tablaFilas(ROWS_EN, 'mes en');

  // ---------- 2. Gráficos ----------
  function chart(title, srcKey, vals, fmt, unit) {
    const max = Math.max(...vals.map(v => v.v ?? 0), 1);
    return `<div class="chart"><div class="c-title"><b>${title}</b> · ${unit}</div>
<div class="bars">${vals.map((x, i) => `<div class="bar${i === vals.length - 1 ? ' current' : ''}"><div class="b-col"><div class="b-num">${x.url && x.v !== null ? link(x.url, fmt(x.v), `Abrir ${srcName[srcKey]}`) : fmt(x.v)}</div><div class="b-fill" style="height:${Math.max(2, Math.round((x.v ?? 0) / max * 100))}%"></div></div><div class="b-lab">${mesCorto(x.m)}</div></div>`).join('')}</div></div>`;
  }
  const charts = `<div class="charts">
${chart('Impresiones en Google', 'gsc', M.map(m => ({ m, v: D.gsc[m].impressions, url: gscUrl(m) })), n0, 'Search Console')}
${chart('Clics desde Google', 'gsc', M.map(m => ({ m, v: D.gsc[m].clicks, url: gscUrl(m) })), n0, 'Search Console')}
${chart('Visitas totales', 'ga4', M.map(m => ({ m, v: D.ga4[m].sessions, url: ga4Url(m) })), n0, 'Google Analytics 4')}
${chart('Leads nuevos', 'ghl', M.map(m => ({ m, v: L(m).total, url: ghlUrl })), n0, 'GoHighLevel')}
</div>`;
  const chartsIa = `<div class="charts">
${chart('Citas en Copilot', 'bingai', M.map(m => ({ m, v: CITAS.meses[m] ?? null, url: bingAiUrl })), n0, 'Bing Webmaster Tools')}
${chart('Visitas desde ChatGPT y otras IA', 'ga4', M.map(m => ({ m, v: ch(m, 'AI Assistant', false), url: ga4Url(m) })), n0, 'Google Analytics 4')}
</div>`;
  const tablaCitadas = `<div class="t-scroll"><table class="tbl citadas">
<thead><tr><th>Página citada por Copilot</th><th class="num">Citas</th></tr></thead>
<tbody>${CITAS.paginas.top.map(x => `<tr><td>${link(SITE.replace(/\/$/, '') + x.url, urlLab(x.url), 'Abrir la página')}</td><td class="num">${link(bingAiUrl, n0(x.citas), 'Abrir AI Performance en Bing Webmaster Tools')}</td></tr>`).join('\n')}</tbody></table></div>`;
  const [pIni, pFin] = CITAS.paginas.periodo;

  // ---------- 3. Keywords en las últimas semanas (base, quincena anterior y última) ----------
  const VENT = ['base', 'prev', 'now'];
  const kwCambio = (k, a, b) => (R[a].keywords[k].position !== null && R[b].keywords[k].position !== null) ? +(R[a].keywords[k].position - R[b].keywords[k].position).toFixed(1) : null;
  const cuenta = (lista, a, b, signo) => lista.filter(k => Math.sign(kwCambio(k, a, b) || 0) === signo && kwCambio(k, a, b) !== null).length;
  const top10 = (lista, w) => lista.filter(k => R[w].keywords[k].position !== null && R[w].keywords[k].position <= 10).length;
  const posCell = (w, k, label) => {
    const x = R[w].keywords[k];
    return `<td class="num">${x.position === null ? '<span class="nd">sin datos</span>' : link(gscRange(...R[w].range, { query: label }), `<span class="${posClass(x.position)}">${n1(x.position)}</span>`, `Abrir Search Console: "${label}", ${rangoLargo(R[w].range)}`)}<small class="yoy">${n0(x.impressions)} imp · ${n0(x.clicks)} clics</small></td>`;
  };
  const pagCell = k => {
    const p = R.now.keywords[k].page, b = R.prev.keywords[k].page;
    if (!p) return '<td class="pag"><span class="nd">sin datos</span></td>';
    const antes = b && b.url !== p.url ? `<small class="yoy">quincena anterior: ${urlLab(b.url)}, posición ${n1(b.position)}</small>` : '';
    return `<td class="pag">${link(SITE.replace(/\/$/, '') + p.url, urlLab(p.url), 'Abrir la página')}<small class="yoy">posición ${n1(p.position)} · ${Math.round(p.share * 100)} % de las impresiones</small>${antes}</td>`;
  };
  const tablaVentanas = lista => `<div class="t-scroll"><table class="tbl kw">
<thead><tr><th>Keyword</th><th class="num">${rangoCorto(R.base.range)}<br>antes de los artículos</th><th class="num">${rangoCorto(R.prev.range)}<br>quincena anterior</th><th class="num">${rangoCorto(R.now.range)}<br>última quincena</th><th class="num">Cambio en<br>la quincena</th><th>Página que sale ahora</th></tr></thead>
<tbody>${[...lista].sort((a, b) => R.now.keywords[b].impressions - R.now.keywords[a].impressions).map(k => {
    const label = KWLAB[k] || k;
    return `<tr><td>${esc(label)}</td>${VENT.map(w => posCell(w, k, label)).join('')}<td class="num">${flecha(kwCambio(k, 'prev', 'now'))}</td>${pagCell(k)}</tr>`;
  }).join('\n')}</tbody></table></div>`;
  const resumenVentanas = lista => `Frente a la quincena anterior mejoran ${cuenta(lista, 'prev', 'now', 1)} de ${lista.length} y empeoran ${cuenta(lista, 'prev', 'now', -1)}. Frente a antes de los artículos (${rangoLargo(R.base.range)}) mejoran ${cuenta(lista, 'base', 'now', 1)}. En primera página hay ${top10(lista, 'now')}; antes de los artículos había ${top10(lista, 'base')}.`;

  const ARTICULOS = '2026-09-28'; // semana en la que se publicaron los artículos en otros medios
  const semCell = (w, txt) => `<td class="num">${link(gscRange(...w.range), txt, `Abrir Search Console: ${rangoLargo(w.range)}`)}</td>`;
  const tablaSemanas = `<div class="t-scroll"><table class="tbl sem">
<thead><tr><th>Semana</th><th class="num">Clics</th><th class="num">Impresiones al día</th><th class="num">Posición media</th><th class="num">Impresiones en primera página</th></tr></thead>
<tbody>${R.weeks.map(w => `<tr${w.range[0] === ARTICULOS ? ' class="strong"' : ''}><td>${rangoCorto(w.range)}${w.range[0] === ARTICULOS ? '<small class="hint">se publican los artículos en otros medios</small>' : ''}</td>${semCell(w, n0(w.clicks))}${semCell(w, n0(w.impressions / 7))}${semCell(w, n1(w.position))}${semCell(w, n0(w.top10Impressions))}</tr>`).join('\n')}
</tbody></table></div>`;
  const W0 = R.weeks[0], WL = R.weeks[R.weeks.length - 1];

  // ---------- 4. Keywords mes a mes ----------
  const kwImp = k => M.reduce((a, m) => a + D.gsc[m].keywords[k].impressions, 0);
  const tablaKw = `<div class="t-scroll"><table class="tbl kw">
<thead><tr><th>Keyword</th>${M.map(m => `<th class="num">${mesNombre(m)}</th>`).join('')}<th class="num">${mesCorto(M[M.length - 2])} → ${mesCorto(M[M.length - 1])}</th></tr></thead>
<tbody>${[...D.keywords].sort((a, b) => kwImp(b) - kwImp(a)).map(k => {
    const first = D.gsc[M[M.length - 2]].keywords[k].position, last = D.gsc[M[M.length - 1]].keywords[k].position;
    const d = (first !== null && last !== null) ? +(first - last).toFixed(1) : null;
    const label = KWLAB[k] || k;
    return `<tr><td>${esc(label)}<small class="hint">${n0(kwImp(k))} impresiones en ${M.length} meses${k === 'eventos barcelona' ? ' · marca y búsqueda de ocio' : ''}</small></td>${M.map(m => {
      const x = D.gsc[m].keywords[k];
      return `<td class="num">${x.position === null ? '<span class="nd">sin datos</span>' : link(gscUrl(m, label), `<span class="${posClass(x.position)}">${n1(x.position)}</span>`, `Abrir Search Console: "${label}", ${mesNombre(m)}`)}<small class="yoy">${n0(x.impressions)} imp · ${n0(x.clicks)} clics</small></td>`;
    }).join('')}<td class="num">${flecha(d)}</td></tr>`;
  }).join('\n')}</tbody></table></div>`;

  // ---------- 5. Leads ----------
  const LROWS = [
    ['Leads nuevos', m => L(m).total, true],
    ['Entrada por formulario web', m => L(m).entry.formulario],
    ['Entrada por email (hola@, Xavi, info@)', m => L(m).entry.email],
    ['Otras entradas (manual, Holded)', m => L(m).entry.otros],
    ['Leads en inglés', m => L(m).idioma.en],
    ['"¿Cómo nos conoció?": Google', m => L(m).comoNosConocio.google],
    ['"¿Cómo nos conoció?": la web', m => L(m).comoNosConocio.web],
    ['"¿Cómo nos conoció?": otro', m => L(m).comoNosConocio.otro],
    ['"¿Cómo nos conoció?": sin respuesta', m => L(m).comoNosConocio.sinRespuesta],
    ['Estado hoy: propuesta enviada o en negociación', m => (L(m).stages.propuesta_enviada || 0) + (L(m).stages.negociacion || 0)],
    ['Estado hoy: ganados', m => L(m).stages.won || 0],
    ['Estado hoy: perdidos', m => (L(m).stages.lost || 0)],
  ];
  const tablaLeads = `<div class="t-scroll"><table class="tbl">
<thead><tr><th>Leads (GoHighLevel)</th>${M.map(m => `<th class="num">${mesNombre(m)}</th>`).join('')}</tr></thead>
<tbody>${LROWS.map(([lab, f, strong]) => `<tr${strong ? ' class="strong"' : ''}><td>${lab}</td>${M.map(m => `<td class="num">${link(ghlUrl, n0(f(m)), 'Abrir oportunidades en GoHighLevel')}</td>`).join('')}</tr>`).join('\n')}
</tbody></table></div>`;

  // ---------- Página ----------
  const f = M[M.length - 2], l = M[M.length - 1]; // los resúmenes comparan el último mes con el anterior
  const sumLeads = M.reduce((a, m) => a + L(m).total, 0);
  const kpi = (lab, val, sub, url, srcK) => `<div class="kpi"><div class="k-lab">${lab}</div><div class="k-val">${url ? link(url, val, `Abrir ${srcName[srcK]}`) : val}</div><div class="k-sub">${sub}</div></div>`;
  const proximo = fechaLarga(addDays(D.generatedAt.slice(0, 10), 14));
  const enPeso = n => Math.round(D.en.gsc[n].impressions / D.gsc[n].impressions * 100);

  const cuerpo = `<header>
<div class="kicker">Eventos Barcelona · Resultados</div>
<h1>Resultados de ${rango}</h1>
<p class="sub-h">Impresiones y clics en Google y Bing, citas en Copilot, visitas por canal, posiciones de las keywords principales, inglés y leads, mes a mes. Las keywords llegan además semana a semana hasta el ${fechaLarga(R.end)}. Cada cifra es un enlace que abre ese mismo dato en su fuente.</p>
<div class="badges"><span>Informe del ${genTxt}</span><span>Search Console</span><span>Bing Webmaster Tools</span><span>Google Analytics 4</span><span>GoHighLevel</span></div>
<div class="nav-inf">Se actualiza solo cada dos semanas (próximo, hacia el ${proximo}). <a href="/dashboard/historico">Ver informes anteriores</a></div>
</header>

<div class="kpis">
${kpi(`Impresiones ${mesCorto(l)}`, n0(D.gsc[l].impressions), `${mesCorto(f)}: ${n0(D.gsc[f].impressions)}`, gscUrl(l), 'gsc')}
${kpi(`Clics desde Google ${mesCorto(l)}`, n0(D.gsc[l].clicks), `${mesCorto(f)}: ${n0(D.gsc[f].clicks)}`, gscUrl(l), 'gsc')}
${kpi(`Visitas ${mesCorto(l)}`, n0(D.ga4[l].sessions), `${mesCorto(f)}: ${n0(D.ga4[f].sessions)}`, ga4Url(l), 'ga4')}
${kpi(`Leads ${mesCorto(l)}`, n0(L(l).total), `${mesCorto(f)}: ${n0(L(f).total)}`, ghlUrl, 'ghl')}
</div>

<h2>Mes a mes</h2>
<p class="h2-sub">Debajo de cada cifra, el mismo mes del año anterior y la variación. Pulsa cualquier número para abrirlo en su fuente.</p>
${tablaMeses}

<h2>Cómo se relacionan</h2>
<p class="h2-sub">De la búsqueda al lead: cuántas veces aparece la web en Google, cuántos entran, cuántas visitas llegan en total y cuántos leads se crean. El último mes va resaltado.</p>
${charts}

<h2>Asistentes de IA</h2>
<p class="h2-sub">Dos señales distintas. Las citas en Copilot cuentan las veces que el asistente de Microsoft usó una página de EB en su respuesta, aunque nadie hiciera clic. Las visitas desde ChatGPT y otras IA son las personas que sí hicieron clic en una de esas respuestas y llegaron a la web.</p>
${chartsIa}
<p class="h2-sub">Páginas que más cita Copilot entre el ${dia(pIni)} de ${MES[pIni.slice(5, 7)]} y el ${fechaLarga(pFin)}:</p>
${tablaCitadas}

<h2>Keywords en las últimas semanas</h2>
<p class="h2-sub">Posición media en Google de cada búsqueda en tres periodos de 14 días: ${rangoLargo(R.base.range)}, las dos semanas antes de publicar los artículos en otros medios; la quincena anterior, y la última quincena con datos definitivos (${rangoLargo(R.now.range)}). ${resumenVentanas(D.keywords)} Ordenadas por impresiones de la última quincena.</p>
${tablaVentanas(D.keywords)}
<p class="h2-sub">La última columna es la página de EB que Google enseña para esa búsqueda (la que se lleva más impresiones) y su posición. Cuando Google cambia de página respecto a la quincena anterior, debajo sale la de antes.</p>

<h3>Semana a semana</h3>
<p class="h2-sub">Toda la web, de lunes a domingo. La posición media mezcla todas las búsquedas: cuando vuelven a contar búsquedas en las que la web sale en la página 3 o más abajo, la media empeora aunque EB no baje. La mejor señal es la última columna, las impresiones en primera página: ${n0(W0.top10Impressions)} la semana del ${rangoCorto(W0.range)} y ${n0(WL.top10Impressions)} la del ${rangoCorto(WL.range)}.</p>
${tablaSemanas}

<h2>Posiciones de las keywords principales</h2>
<p class="h2-sub">Mes a mes. Ordenadas de más a menos impresiones entre ${mesNombre(M[0])} y ${mesNombre(M[M.length - 1])}. Posición media en Google de cada búsqueda en el mes (1 es el primer resultado). Verde: primera página. Ámbar: segunda página. Gris: más abajo. Debajo, impresiones y clics de esa búsqueda.</p>
${tablaKw}

<h2>Inglés</h2>
<p class="h2-sub">Páginas en inglés (las que empiezan por /en/). En ${mesNombre(l)} son el ${enPeso(l)} % de las impresiones de la web; en ${mesNombre(M[0])}, el ${enPeso(M[0])} %. Debajo de cada cifra, el mismo mes del año anterior.</p>
${tablaEn}
<h3>Keywords en inglés</h3>
<p class="h2-sub">Las búsquedas en inglés con impresiones reales, en los mismos tres periodos. ${resumenVentanas(D.keywordsEn)} Ojo con la última columna: a veces Google enseña una página en castellano para una búsqueda en inglés.</p>
${tablaVentanas(D.keywordsEn)}

<h2>Leads</h2>
<p class="h2-sub">Un lead es una oportunidad nueva en el pipeline Clientes de GoHighLevel, contada por su fecha de creación. El estado es el de hoy.</p>
${tablaLeads}

<div class="callout info"><b>Cómo leer estos datos</b>
<ul>
<li><b>Search Console</b>: datos finales de la propiedad ${esc(D.site)}. Google los cierra con 2 o 3 días de retraso, por eso las semanas acaban en el último domingo cerrado. La posición media mezcla todas las búsquedas, así que conviene mirar las keywords una a una.</li>
<li><b>Citas en Copilot</b>: informe AI Performance de Bing Webmaster Tools, en fase de pruebas. Bing avisa de que es una muestra y de que las cifras pueden ajustarse. No tiene API, así que se copia a mano; los meses sin copiar salen sin dato. Bing Webmaster no admite fechas en el enlace: el periodo se elige al abrirlo.</li>
<li><b>Bing</b>: clics e impresiones en el buscador Bing. Bing solo guarda datos desde junio de 2025 y a varios meses de ese año les faltan días, así que solo se compara con el año anterior cuando el mes está completo.</li>
<li><b>Visitas</b>: sesiones de Google Analytics 4 por canal. Las visitas directas pueden incluir las del propio equipo.</li>
<li><b>Leads</b>: GoHighLevel tiene datos desde el ${fechaLarga(D.ghl.firstOpportunity.slice(0, 10))}; antes no hay comparación posible. No se usa el evento de leads de Google Analytics porque cuenta de más.</li>
<li><b>Origen de cada lead</b>: los UTM llegan vacíos en ${n0(M.reduce((a, m) => a + L(m).total - L(m).utmInformado, 0))} de ${n0(sumLeads)} leads, así que todavía no se puede decir cuántos vienen de Google y cuántos de ChatGPT. "¿Cómo nos conoció?" solo está contestado en ${n0(M.reduce((a, m) => a + L(m).total - L(m).comoNosConocio.sinRespuesta, 0))}.</li>
<li><b>Artículos en otros medios</b>: se publicaron el 28 y 29 de septiembre. Las tablas de keywords los toman como referencia con las dos semanas anteriores (${rangoLargo(R.base.range)}).</li>
</ul></div>`;

  return pagina(`Resultados ${rango} · Eventos Barcelona`, 'Impresiones y clics en Google y Bing, citas en Copilot, visitas por canal, posiciones de las keywords, inglés y leads. Cada cifra enlaza a su fuente.', cuerpo);
}

// Lista de informes guardados, del más reciente al más antiguo
export function renderHistorico(indice) {
  const items = indice.map((x, i) => `<li><span><a href="/dashboard/${esc(x.fecha)}">Informe del ${fechaLarga(x.fecha)}</a>${i === 0 ? '<span class="tag">Último</span>' : ''}</span><small>${x.meses ? `${mesNombre(x.meses[0])} a ${mesNombre(x.meses[1])} de ${x.meses[1].slice(0, 4)}` : ''}${x.datosHasta ? ` · Search Console hasta el ${fechaLarga(x.datosHasta)}` : ''}</small></li>`).join('\n');
  const cuerpo = `<header>
<div class="kicker">Eventos Barcelona · Resultados</div>
<h1>Informes anteriores</h1>
<p class="sub-h">Cada informe se guarda tal y como se generó, para poder comparar. Se crea uno nuevo solo cada dos semanas, los miércoles.</p>
<div class="nav-inf"><a href="/dashboard">Ir al último informe</a></div>
</header>
${indice.length ? `<ul class="lista">\n${items}\n</ul>` : '<p class="h2-sub">Todavía no hay informes guardados.</p>'}`;
  return pagina('Informes anteriores · Eventos Barcelona', 'Informes de resultados de Eventos Barcelona guardados cada dos semanas.', cuerpo);
}

// Aviso que se inserta al abrir un informe que no es el último
export function avisoArchivado(fecha, ultimo) {
  return `<div class="archivado" style="background:#0a2540;color:#fff;padding:12px 16px;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;text-align:center">Informe guardado del ${fechaLarga(fecha)}. <a href="/dashboard" style="color:#f3d58a;font-weight:700">Ver el último (${fechaLarga(ultimo)})</a> · <a href="/dashboard/historico" style="color:#f3d58a;font-weight:700">Todos los informes</a></div>`;
}

export function renderMensaje(titulo, texto) {
  return pagina(`${titulo} · Eventos Barcelona`, texto, `<header><div class="kicker">Eventos Barcelona · Resultados</div><h1>${esc(titulo)}</h1><p class="sub-h">${esc(texto)}</p><div class="nav-inf"><a href="/dashboard/historico">Ver informes guardados</a></div></header>`);
}
