/**
 * Genera dashboard-resultados.html (servido en /dashboard) desde data/dashboard-resultados.json.
 *
 *   NODE_PATH=<carpeta con googleapis> node scripts/dashboard-resultados-data.js
 *   node scripts/build-dashboard-resultados.js
 *
 * Cada cifra enlaza a su fuente filtrada por el mismo periodo: Search Console, Google Analytics 4 o GHL.
 * La página es pública: solo lleva cifras agregadas.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'dashboard-resultados.json'), 'utf8'));
const OUT = path.join(ROOT, 'dashboard-resultados.html');

const MES = { '01': 'enero', '02': 'febrero', '03': 'marzo', '04': 'abril', '05': 'mayo', '06': 'junio', '07': 'julio', '08': 'agosto', '09': 'septiembre', '10': 'octubre', '11': 'noviembre', '12': 'diciembre' };
const mesNombre = m => MES[m.slice(5, 7)];
const mesCorto = m => mesNombre(m).slice(0, 3);
const prevYear = m => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`;
const ymd = s => s.replace(/-/g, '');
const lastDay = m => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Números a la española: punto de millar también en 4 cifras (1.066), coma decimal.
const n0 = v => (v === null || v === undefined) ? '–' : Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const n1 = v => (v === null || v === undefined) ? '–' : v.toFixed(1).replace('.', ',');
const pct = (v, d = 2) => (v * 100).toFixed(d).replace('.', ',') + ' %';
const delta = (a, b) => (b ? Math.round((a - b) / b * 100) : null);

// Enlaces a las fuentes, con el periodo exacto
const SITE_ENC = encodeURIComponent(D.site);
const gscUrl = (m, query) => {
  const s = `${m}-01`, e = lastDay(m);
  let u = `https://search.google.com/search-console/performance/search-analytics?resource_id=${SITE_ENC}&start_date=${ymd(s)}&end_date=${ymd(e)}&metrics=CLICKS%2CIMPRESSIONS%2CCTR%2CPOSITION`;
  if (query) u += `&query=!${encodeURIComponent(query)}&breakdown=query`;
  return u;
};
const ga4Url = m => {
  const s = `${m}-01`, e = lastDay(m);
  const params = encodeURIComponent(`_u..nav=maui&_u.date00=${ymd(s)}&_u.date01=${ymd(e)}`);
  return `https://analytics.google.com/analytics/web/#/p${D.ga4Property}/reports/explorer?params=${params}&r=lifecycle-traffic-acquisition-v2&ruid=lifecycle-traffic-acquisition-v2,life-cycle,acquisition&collectionId=life-cycle`;
};
const ghlUrl = `https://app.gohighlevel.com/v2/location/${D.ghl.locationId}/opportunities/list`;
const link = (url, txt, title) => `<a class="src" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(title)}">${txt}</a>`;

const M = D.months;
const gen = new Date(D.generatedAt);
const genTxt = `${gen.getUTCDate()} de ${MES[String(gen.getUTCMonth() + 1).padStart(2, '0')]} de ${gen.getUTCFullYear()}`;
const rango = `${mesNombre(M[0])} a ${mesNombre(M[M.length - 1])} de ${M[0].slice(0, 4)}`;

// ---------- 1. Tabla mes a mes ----------
const ch = (m, k, prev) => ((prev ? D.ga4PrevYear : D.ga4)[m].channels[k] || 0);
const ROWS = [
  { sec: 'Google · Search Console' },
  { lab: 'Impresiones en Google', hint: 'veces que la web salió en resultados', src: 'gsc', get: (m, p) => (p ? D.gscPrevYear : D.gsc)[m].impressions, fmt: n0 },
  { lab: 'Clics desde Google', hint: 'visitas que llegaron desde esos resultados', src: 'gsc', get: (m, p) => (p ? D.gscPrevYear : D.gsc)[m].clicks, fmt: n0 },
  { lab: 'CTR', hint: 'clics por cada 100 impresiones', src: 'gsc', get: (m, p) => (p ? D.gscPrevYear : D.gsc)[m].ctr, fmt: v => pct(v), noDelta: true },
  { lab: 'Posición media', hint: 'de todas las búsquedas, más bajo es mejor', src: 'gsc', get: (m, p) => (p ? D.gscPrevYear : D.gsc)[m].position, fmt: n1, noDelta: true },
  { sec: 'Visitas · Google Analytics 4' },
  { lab: 'Visitas totales', hint: 'sesiones de todos los canales', src: 'ga4', get: (m, p) => (p ? D.ga4PrevYear : D.ga4)[m].sessions, fmt: n0 },
  { lab: 'Visitas desde Google', hint: 'canal Organic Search', src: 'ga4', get: (m, p) => ch(m, 'Organic Search', p), fmt: n0 },
  { lab: 'Visitas desde ChatGPT y otras IA', hint: 'canal AI Assistant', src: 'ga4', get: (m, p) => ch(m, 'AI Assistant', p), fmt: n0 },
  { lab: 'Visitas directas', hint: 'canal Direct', src: 'ga4', get: (m, p) => ch(m, 'Direct', p), fmt: n0 },
  { sec: 'Leads · GoHighLevel' },
  { lab: 'Leads nuevos', hint: 'oportunidades creadas en el pipeline Clientes', src: 'ghl', get: (m, p) => (p ? null : D.ghl.months[m].total), fmt: n0 },
  { lab: 'Leads por cada 100 visitas', hint: 'cálculo: leads / visitas totales × 100', src: 'calc', get: (m, p) => (p ? null : D.ghl.months[m].total / D.ga4[m].sessions * 100), fmt: n1 },
];
const srcName = { gsc: 'Search Console', ga4: 'Google Analytics 4', ghl: 'GoHighLevel', calc: 'Cálculo' };
function cell(r, m) {
  const v = r.get(m, false), p = r.get(m, true);
  const url = r.src === 'gsc' ? gscUrl(m) : r.src === 'ga4' ? ga4Url(m) : r.src === 'ghl' ? ghlUrl : null;
  const main = url ? link(url, r.fmt(v), `Abrir ${srcName[r.src]}: ${mesNombre(m)} ${m.slice(0, 4)}`) : `<span>${r.fmt(v)}</span>`;
  let sub = '';
  if (r.src === 'gsc' || r.src === 'ga4') {
    const pm = prevYear(m);
    const purl = r.src === 'gsc' ? gscUrl(pm) : ga4Url(pm);
    const d = r.noDelta ? null : delta(v, p);
    const dTxt = d === null ? '' : ` <b class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '+' : ''}${d} %</b>`;
    sub = `<small class="yoy">${link(purl, `${pm.slice(0, 4)}: ${r.fmt(p)}`, `Abrir ${srcName[r.src]}: ${mesNombre(pm)} ${pm.slice(0, 4)}`)}${dTxt}</small>`;
  } else if (r.src === 'ghl') {
    sub = '<small class="yoy nd">2025: sin datos</small>';
  }
  return `<td class="num">${main}${sub}</td>`;
}
const tablaMeses = `<div class="t-scroll"><table class="tbl mes">
<thead><tr><th>Métrica</th>${M.map(m => `<th class="num">${mesNombre(m)}</th>`).join('')}<th>Fuente</th></tr></thead>
<tbody>
${ROWS.map(r => r.sec ? `<tr class="sec"><td colspan="${M.length + 2}">${r.sec}</td></tr>` :
  `<tr><td><span class="lab">${r.lab}</span><small class="hint">${r.hint}</small></td>${M.map(m => cell(r, m)).join('')}<td class="srcname">${r.src === 'calc' ? 'Cálculo' : link(r.src === 'gsc' ? gscUrl(M[M.length - 1]) : r.src === 'ga4' ? ga4Url(M[M.length - 1]) : ghlUrl, srcName[r.src] + ' ↗', `Abrir ${srcName[r.src]}`)}</td></tr>`).join('\n')}
</tbody></table></div>`;

// ---------- 2. Gráficos relacionados ----------
function chart(title, srcKey, vals, fmt, unit) {
  const max = Math.max(...vals.map(v => v.v), 1);
  return `<div class="chart"><div class="c-title"><b>${title}</b> · ${unit}</div>
<div class="bars">${vals.map((x, i) => `<div class="bar${i === vals.length - 1 ? ' current' : ''}"><div class="b-col"><div class="b-num">${x.url ? link(x.url, fmt(x.v), `Abrir ${srcName[srcKey]}`) : fmt(x.v)}</div><div class="b-fill" style="height:${Math.max(2, Math.round(x.v / max * 100))}%"></div></div><div class="b-lab">${mesCorto(x.m)}</div></div>`).join('')}</div></div>`;
}
const charts = `<div class="charts">
${chart('Impresiones en Google', 'gsc', M.map(m => ({ m, v: D.gsc[m].impressions, url: gscUrl(m) })), n0, 'Search Console')}
${chart('Clics desde Google', 'gsc', M.map(m => ({ m, v: D.gsc[m].clicks, url: gscUrl(m) })), n0, 'Search Console')}
${chart('Visitas totales', 'ga4', M.map(m => ({ m, v: D.ga4[m].sessions, url: ga4Url(m) })), n0, 'Google Analytics 4')}
${chart('Leads nuevos', 'ghl', M.map(m => ({ m, v: D.ghl.months[m].total, url: ghlUrl })), n0, 'GoHighLevel')}
</div>`;

// ---------- 3. Keywords ----------
const posClass = p => p === null ? 'nd' : p <= 10 ? 'p-top' : p <= 20 ? 'p-mid' : 'p-low';
const KWLAB = { 'organizacion de eventos barcelona': 'organización de eventos barcelona', 'espectaculos para eventos corporativos': 'espectáculos para eventos corporativos' };
const kwRows = D.keywords.map(k => {
  const first = D.gsc[M[0]].keywords[k].position, last = D.gsc[M[M.length - 1]].keywords[k].position;
  const d = (first !== null && last !== null) ? +(first - last).toFixed(1) : null;
  const dTxt = d === null ? '<span class="nd">–</span>' : `<b class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲ ' : d < 0 ? '▼ ' : ''}${n1(Math.abs(d))}</b>`;
  const label = KWLAB[k] || k;
  return `<tr><td>${esc(label)}${k === 'eventos barcelona' ? ' <small class="hint">marca y búsqueda de ocio</small>' : ''}</td>${M.map(m => {
    const x = D.gsc[m].keywords[k];
    return `<td class="num">${x.position === null ? '<span class="nd">sin datos</span>' : link(gscUrl(m, label), `<span class="${posClass(x.position)}">${n1(x.position)}</span>`, `Abrir Search Console: "${label}", ${mesNombre(m)}`)}<small class="yoy">${n0(x.impressions)} imp · ${n0(x.clicks)} clics</small></td>`;
  }).join('')}<td class="num">${dTxt}</td></tr>`;
}).join('\n');
const tablaKw = `<div class="t-scroll"><table class="tbl kw">
<thead><tr><th>Keyword</th>${M.map(m => `<th class="num">${mesNombre(m)}</th>`).join('')}<th class="num">${mesCorto(M[0])} → ${mesCorto(M[M.length - 1])}</th></tr></thead>
<tbody>${kwRows}</tbody></table></div>`;

// ---------- 4. Leads ----------
const L = m => D.ghl.months[m];
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

// ---------- Cabecera y resumen ----------
const f = M[0], l = M[M.length - 1];
const sumLeads = M.reduce((a, m) => a + L(m).total, 0);
const totalSesiones = M.reduce((a, m) => a + D.ga4[m].sessions, 0);
const kpi = (lab, val, sub, url, srcK) => `<div class="kpi"><div class="k-lab">${lab}</div><div class="k-val">${url ? link(url, val, `Abrir ${srcName[srcK]}`) : val}</div><div class="k-sub">${sub}</div></div>`;

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Resultados ${rango} · Eventos Barcelona</title>
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#161413">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Eventos Barcelona">
<meta property="og:locale" content="es_ES">
<meta property="og:title" content="Resultados ${rango} · Eventos Barcelona">
<meta property="og:description" content="Impresiones y clics en Google, visitas por canal, posiciones de las keywords y leads, mes a mes. Cada cifra enlaza a su fuente.">
<meta property="og:image" content="https://propuestas.eventosbarcelona.com/og-eventos-barcelona.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="https://propuestas.eventosbarcelona.com/dashboard">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Resultados ${rango} · Eventos Barcelona">
<meta name="twitter:description" content="Impresiones, clics, visitas, keywords y leads, mes a mes, con la fuente de cada cifra.">
<meta name="twitter:image" content="https://propuestas.eventosbarcelona.com/og-eventos-barcelona.jpg">
<meta name="robots" content="noindex, nofollow">
<style>
*{box-sizing:border-box}
:root{--ink:#0a2540;--gold:#c99a3a;--gold-txt:#7a5a15;--bg:#faf8f4;--line:#e8e2d5;--card:#fff;--green:#17663a;--amber:#8a5300;--red:#b42318;--muted:#5b6473;--link:#0a2540}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1140px;margin:0 auto;padding:44px 28px}
.kicker{color:var(--gold-txt);font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:700}
h1{font-size:34px;margin:8px 0 6px;letter-spacing:-.02em;line-height:1.2}
.sub-h{color:var(--muted);font-size:15px;max-width:72ch;margin:0}
.badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.badges span{background:var(--ink);color:#fff;padding:7px 13px;border-radius:3px;font-size:11px;letter-spacing:.05em;text-transform:uppercase;font-weight:600}
h2{font-size:23px;margin:46px 0 6px;letter-spacing:-.015em;border-left:4px solid var(--gold);padding-left:14px}
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
.legend{display:flex;flex-wrap:wrap;gap:16px;font-size:12px;color:var(--muted);margin:6px 0 0}
.callout{background:#fff8e1;border:1px solid #f0e0a0;border-left:6px solid var(--gold);padding:14px 18px;margin:16px 0;border-radius:4px;font-size:14px}
.callout.info{background:#f0f7fa;border-color:#c9dae2;border-left-color:#3d7a95}
.callout ul{margin:6px 0 0;padding-left:18px}
.callout li{margin:4px 0}
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
.tbl tr.sec td:first-child{background:#f2efe7}
@media(max-width:820px){.tbl th:first-child,.tbl td:first-child{min-width:150px;box-shadow:2px 0 0 var(--line)}}
</style>
</head>
<body>
<div class="wrap">
<header>
<div class="kicker">Eventos Barcelona · Resultados</div>
<h1>Resultados de ${rango}</h1>
<p class="sub-h">Impresiones y clics en Google, visitas por canal, posiciones de las keywords principales y leads, mes a mes. Cada cifra es un enlace que abre ese mismo dato en su fuente y con el mismo periodo.</p>
<div class="badges"><span>Datos del ${genTxt}</span><span>Search Console</span><span>Google Analytics 4</span><span>GoHighLevel</span></div>
</header>

<div class="kpis">
${kpi(`Impresiones ${mesCorto(l)}`, n0(D.gsc[l].impressions), `${mesCorto(f)}: ${n0(D.gsc[f].impressions)}`, gscUrl(l), 'gsc')}
${kpi(`Clics desde Google ${mesCorto(l)}`, n0(D.gsc[l].clicks), `${mesCorto(f)}: ${n0(D.gsc[f].clicks)}`, gscUrl(l), 'gsc')}
${kpi(`Visitas ${mesCorto(l)}`, n0(D.ga4[l].sessions), `${n0(totalSesiones)} en los ${M.length} meses`, ga4Url(l), 'ga4')}
${kpi(`Leads ${mesCorto(l)}`, n0(L(l).total), `${n0(sumLeads)} en los ${M.length} meses`, ghlUrl, 'ghl')}
</div>

<h2>Mes a mes</h2>
<p class="h2-sub">Debajo de cada cifra, el mismo mes de ${Number(M[0].slice(0, 4)) - 1} y la variación. Pulsa cualquier número para abrirlo en su fuente.</p>
${tablaMeses}

<h2>Cómo se relacionan</h2>
<p class="h2-sub">De la búsqueda al lead: cuántas veces aparece la web en Google, cuántos entran, cuántas visitas llegan en total y cuántos leads se crean. El último mes va resaltado.</p>
${charts}

<h2>Posiciones de las keywords principales</h2>
<p class="h2-sub">Posición media en Google de cada búsqueda en el mes (1 es el primer resultado). Verde: primera página. Ámbar: segunda página. Gris: más abajo. Debajo, impresiones y clics de esa búsqueda.</p>
${tablaKw}

<h2>Leads</h2>
<p class="h2-sub">Un lead es una oportunidad nueva en el pipeline Clientes de GoHighLevel, contada por su fecha de creación. El estado es el de hoy.</p>
${tablaLeads}

<div class="callout info"><b>Cómo leer estos datos</b>
<ul>
<li><b>Search Console</b>: datos finales de la propiedad ${esc(D.site)}. La posición media mezcla todas las búsquedas, así que conviene mirar las keywords una a una.</li>
<li><b>Visitas</b>: sesiones de Google Analytics 4 por canal. En ${mesNombre(l)} las visitas directas se disparan (${n0(ch(l, 'Direct', false))}); pueden incluir visitas del propio equipo.</li>
<li><b>Leads</b>: GoHighLevel tiene datos desde el ${new Date(D.ghl.firstOpportunity).getUTCDate()} de ${MES[D.ghl.firstOpportunity.slice(5, 7)]} de ${D.ghl.firstOpportunity.slice(0, 4)}; antes no hay comparación posible. No se usa el evento de leads de Google Analytics porque cuenta de más.</li>
<li><b>Origen de cada lead</b>: los UTM llegan vacíos en ${n0(M.reduce((a, m) => a + L(m).total - L(m).utmInformado, 0))} de ${n0(sumLeads)} leads, así que todavía no se puede decir cuántos vienen de Google y cuántos de ChatGPT. "¿Cómo nos conoció?" solo está contestado en ${n0(M.reduce((a, m) => a + L(m).total - L(m).comoNosConocio.sinRespuesta, 0))}.</li>
<li><b>Artículos en otros medios</b>: se publicaron el 28 y 29 de septiembre. Su efecto no entra en estos meses.</li>
</ul></div>

<footer>
Generado el ${genTxt} desde <code>data/dashboard-resultados.json</code>.<br>
Para regenerar: <code>node scripts/dashboard-resultados-data.js &amp;&amp; node scripts/build-dashboard-resultados.js</code><br>
Scale IT para Eventos Barcelona · <b>propuestas.eventosbarcelona.com/dashboard</b>
</footer>
</div>
</body>
</html>
`;

if (/—/.test(html)) throw new Error('La página contiene un guion largo (U+2014)');
fs.writeFileSync(OUT, html);
console.log(`Escrito ${path.relative(ROOT, OUT)} (${Math.round(html.length / 1024)} KB)`);
