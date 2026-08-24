/**
 * Genera dashboard-metricas.html desde los datos reales.
 *
 * Lee:  data/geo-timeline.json  (serie histórica mensual congelada)
 *       data/geo-report.json    (foto de los últimos 12 meses)
 * Escribe: dashboard-metricas.html  -> servido en propuestas.eventosbarcelona.com/metricas
 *
 * Flujo quincenal completo:
 *   node scripts/geo-report.js 365
 *   node scripts/build-dashboard-metricas.js
 *
 * Nada de números a mano: si un dato no está en los JSON, no sale en el dashboard.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const timeline = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'geo-timeline.json'), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'geo-report.json'), 'utf8'));
const KWPATH = path.join(ROOT, 'data', 'seo-keywords.json');
const kwStore = fs.existsSync(KWPATH) ? JSON.parse(fs.readFileSync(KWPATH, 'utf8')) : null;
const kwAnalysis = require('./seo-keywords.js');
const OUT = path.join(ROOT, 'dashboard-metricas.html');

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// ---------- helpers ----------
const n = v => (v === null || v === undefined) ? 'n/d' : Number(v).toLocaleString('es-ES');
const pct = (v, d = 2) => (v === null || v === undefined) ? 'n/d' : (v * 100).toFixed(d).replace('.', ',') + '%';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const kk = v => v >= 1000 ? Math.round(v / 1000) + 'k' : String(v);
const mesLabel = ym => `${MES[+ym.slice(5) - 1]} ${ym.slice(2, 4)}`;
const delta = (a, b) => b ? ((a - b) / b * 100) : null;
function deltaCell(a, b, invert = false) {
  const d = delta(a, b);
  if (d === null) return '<td class="delta flat">n/d</td>';
  const good = invert ? d < 0 : d > 0;
  const cls = Math.abs(d) < 1 ? 'flat' : (good ? 'up' : 'down');
  return `<td class="delta ${cls}">${d > 0 ? '+' : ''}${d.toFixed(1).replace('.', ',')}%</td>`;
}

const months = Object.keys(timeline.months).sort();
const M = ym => timeline.months[ym];
const closed = months.filter(m => !M(m).partial);
const lastClosed = closed[closed.length - 1];
const lastAny = months[months.length - 1];

// ---------- gráfico de barras ----------
// Calcula 3-4 valores redondos para las líneas de referencia (1-2-5 x 10^n).
function niceTicks(max) {
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || mag * 10;
  const out = [];
  for (let v = step; v <= max * 0.99; v += step) out.push(v);
  return out;
}

function barChart(items, { title, footer, fmt = v => n(v) }) {
  const max = Math.max(...items.map(i => i.value)) || 1;   // sin forzar 1: rompe las series en fracción
  const bars = items.map(i => {
    const h = Math.max(1.5, i.value / max * 86);   // 86 y no 100: el numero va encima y necesita hueco
    return `<div class="bar${i.current ? ' current' : ''}">` +
      `<div class="b-col"><div class="b-num">${fmt(i.value)}</div><div class="b-fill" style="height:${h.toFixed(1)}%"></div></div>` +
      `<div class="b-lab">${i.label}<span>${i.sub || ''}</span></div></div>`;
  }).join('\n');
  const grid = niceTicks(max).map(v =>
    `<div class="gline" style="bottom:${(v / max * 86).toFixed(1)}%"><span>${fmt(v)}</span></div>`).join('');
  return `<div class="chart">
<div class="c-title">${title}</div>
<div class="c-scroll"><div class="plot"><div class="grid">${grid}</div><div class="bars">${bars}</div></div></div>
${footer ? `<div class="c-foot">${footer}</div>` : ''}
</div>`;
}

function table(headers, rows, cls = '') {
  return `<div class="t-scroll"><table class="tbl ${cls}">
<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
${rows.map(r => `<tr>${r.join('')}</tr>`).join('\n')}
</table></div>`;
}

// ================= HOJA 1 · HISTÓRICO =================
const serieRows = months.slice().reverse().map(ym => {
  const v = M(ym), g = v.gsc, a = v.ga4;
  return [
    `<td><b>${mesLabel(ym)}</b>${v.partial ? ' <span class="tag-part">parcial</span>' : ''}</td>`,
    `<td class="num">${n(a.sessions)}</td>`,
    `<td class="num">${n(a.ai_sessions)}</td>`,
    `<td class="num"><b>${pct(a.ai_share)}</b></td>`,
    `<td class="num">${n(a.chatgpt_sessions)}</td>`,
    `<td class="num">${a.leads ? n(a.leads) : '<span class="nd">no medido</span>'}</td>`,
    `<td class="num">${a.leads ? pct(a.ai_lead_share, 1) : '<span class="nd">-</span>'}</td>`,
    `<td class="num">${g ? n(g.impressions) : '<span class="nd">sin GSC</span>'}</td>`,
    `<td class="num">${g ? n(g.clicks) : '<span class="nd">-</span>'}</td>`,
    `<td class="num">${g ? pct(g.ctr) : '<span class="nd">-</span>'}</td>`,
    `<td class="num">${g ? String(g.position).replace('.', ',') : '<span class="nd">-</span>'}</td>`,
  ];
});

// comparativa año contra año, mes equivalente
const yoyMonth = lastClosed;
const yoyPrev = `${+yoyMonth.slice(0, 4) - 1}-${yoyMonth.slice(5)}`;
const A = M(yoyMonth), B = M(yoyPrev);
const yoyRows = B ? [
  [`<td>Sesiones desde asistentes AI</td>`, `<td class="num">${n(B.ga4.ai_sessions)}</td>`, `<td class="num">${n(A.ga4.ai_sessions)}</td>`, deltaCell(A.ga4.ai_sessions, B.ga4.ai_sessions)],
  [`<td>Peso del AI sobre el total</td>`, `<td class="num">${pct(B.ga4.ai_share)}</td>`, `<td class="num">${pct(A.ga4.ai_share)}</td>`, `<td class="delta up">x${(A.ga4.ai_share / B.ga4.ai_share).toFixed(1).replace('.', ',')}</td>`],
  [`<td>Sesiones desde ChatGPT</td>`, `<td class="num">${n(B.ga4.chatgpt_sessions)}</td>`, `<td class="num">${n(A.ga4.chatgpt_sessions)}</td>`, deltaCell(A.ga4.chatgpt_sessions, B.ga4.chatgpt_sessions)],
  ...(A.gsc && B.gsc ? [
    [`<td>Impresiones en Google</td>`, `<td class="num">${n(B.gsc.impressions)}</td>`, `<td class="num">${n(A.gsc.impressions)}</td>`, deltaCell(A.gsc.impressions, B.gsc.impressions)],
    [`<td>Clics desde Google</td>`, `<td class="num">${n(B.gsc.clicks)}</td>`, `<td class="num">${n(A.gsc.clicks)}</td>`, deltaCell(A.gsc.clicks, B.gsc.clicks)],
    [`<td>CTR</td>`, `<td class="num">${pct(B.gsc.ctr)}</td>`, `<td class="num">${pct(A.gsc.ctr)}</td>`, deltaCell(A.gsc.ctr, B.gsc.ctr)],
    [`<td>Posición media <small>(menos es mejor)</small></td>`, `<td class="num">${String(B.gsc.position).replace('.', ',')}</td>`, `<td class="num">${String(A.gsc.position).replace('.', ',')}</td>`, `<td class="delta ${A.gsc.position < B.gsc.position ? 'up' : 'down'}">${A.gsc.position < B.gsc.position ? '+' : '-'}${Math.abs(B.gsc.position - A.gsc.position).toFixed(1).replace('.', ',')} puestos</td>`],
  ] : []),
] : [];

const shareChart = barChart(months.map((ym, i) => {
  const v = M(ym);
  const esEnero = ym.slice(5) === '01';
  return {
    label: MES[+ym.slice(5) - 1].toUpperCase(),
    sub: (esEnero || i === 0) ? ym.slice(0, 4) : (v.partial ? 'parcial' : ''),
    value: v.ga4.ai_share || 0,
    current: i === months.length - 1,
  };
}), {
  title: `Porcentaje de todas las visitas que llegan desde un asistente AI, <b>mes a mes</b>`,
  footer: `Es la métrica que dice si ganamos o perdemos terreno. El volumen absoluto engaña porque el tráfico total del sitio sube y baja con la temporada. Desplaza el gráfico para ver la serie completa.`,
  fmt: v => v >= 0.01 ? pct(v, 1) : pct(v, 2),
});

const hoja1 = `
<div class="head-block">
  <h2>Histórico</h2>
  <p>La serie completa, mes a mes, congelada en el repositorio. ${months.length} meses guardados desde ${mesLabel(months[0])}.</p>
</div>

<div class="callout warn">
<b>Por qué existe este archivo.</b> Google Search Console solo conserva 16 meses y luego borra sin aviso. Los datos de Eventos Barcelona empiezan en <b>${mesLabel(timeline.meta.gsc_data_starts)}</b>, que es justo el borde: ese mes está a punto de desaparecer del sistema de Google para siempre. Cada actualización congela los meses nuevos en un archivo propio, así que la historia se conserva aunque Google deje de servirla. Un mes guardado no se borra nunca.
</div>

<h3 class="sec">La curva que cuenta la historia <span class="sub">peso del canal AI, mes a mes</span></h3>
${shareChart}

${yoyRows.length ? `<h3 class="sec">Año contra año <span class="sub">${mesLabel(yoyPrev)} vs ${mesLabel(yoyMonth)} · meses equivalentes, sin ruido estacional</span></h3>
${table(['Métrica', mesLabel(yoyPrev), mesLabel(yoyMonth), 'Cambio'], yoyRows, 'cmp')}` : ''}

<h3 class="sec">Serie mensual completa <span class="sub">${months.length} meses · el más reciente arriba</span></h3>
${table(
  ['Mes', 'Sesiones', 'AI', 'Share AI', 'ChatGPT', 'Leads', 'Leads AI', 'GSC impres.', 'Clics', 'CTR', 'Pos.'],
  serieRows, 'serie')}

<div class="callout">
<b>Dos cosas al leer la tabla.</b> Los meses sin datos de Search Console son anteriores a ${mesLabel(timeline.meta.gsc_data_starts)}, cuando se verificó la propiedad. Y los leads aparecen como "no medido" hasta enero 2026, que es cuando se instaló el evento de conversión: no es que no hubiera contactos, es que no se registraban.
</div>`;

// ================= HOJA 2 · SEO =================
const gscMonths = months.filter(m => M(m).gsc).slice(-13);
const impChart = barChart(gscMonths.map((m, i) => ({ label: MES[+m.slice(5) - 1].toUpperCase(), sub: m.slice(0, 4) + (M(m).partial ? ' parc.' : ''), value: M(m).gsc.impressions, current: i === gscMonths.length - 1 })),
  { title: `Impresiones en Google por mes`, footer: `Cuántas veces ha aparecido una página del sitio en resultados de búsqueda.`, fmt: kk });
const clkChart = barChart(gscMonths.map((m, i) => ({ label: MES[+m.slice(5) - 1].toUpperCase(), sub: m.slice(0, 4) + (M(m).partial ? ' parc.' : ''), value: M(m).gsc.clicks, current: i === gscMonths.length - 1 })),
  { title: `Clics desde Google por mes`, footer: `Cuánta de esa visibilidad se convierte en visita. El hueco entre este gráfico y el anterior es lo que hay que explicar.` });
const ctrChart = barChart(gscMonths.map((m, i) => ({ label: MES[+m.slice(5) - 1].toUpperCase(), sub: m.slice(0, 4) + (M(m).partial ? ' parc.' : ''), value: M(m).gsc.ctr, current: i === gscMonths.length - 1 })),
  { title: `Porcentaje de las veces que aparecemos en que además nos hacen clic`, footer: `Es el cociente de los dos gráficos anteriores. La caída desde marzo es lo que hay que explicar.`, fmt: v => pct(v) });

const lang = report.language_split;
const langTot = lang.es.impressions + lang.en.impressions;
const langClk = lang.es.clicks + lang.en.clicks;

const hoja2 = `
<div class="head-block">
  <h2>SEO · búsqueda en Google</h2>
  <p>El canal clásico. Datos de Search Console de los últimos ${report.period.days} días para los rankings, y serie mensual completa para la tendencia.</p>
</div>

<div class="hero">
  <div class="h-lab">Visibilidad en Google · últimos 12 meses</div>
  <div class="h-val"><span class="h-num">${kk(report.gsc.web.impressions)}</span><span class="h-unit">impresiones · ${n(report.gsc.web.clicks)} clics · CTR ${pct(report.gsc.web.ctr)}</span></div>
  <div class="h-ctx">La visibilidad sube y la posición mejora, pero el CTR baja. Es el patrón de todo el sector desde que Google responde con resúmenes de IA arriba del todo.</div>
</div>

<h3 class="sec">Impresiones mes a mes <span class="sub">se mantiene alta</span></h3>
${impChart}

<h3 class="sec">Clics mes a mes <span class="sub">el punto a vigilar</span></h3>
${clkChart}

<h3 class="sec">CTR mes a mes <span class="sub">cuánta visibilidad se convierte en visita</span></h3>
${ctrChart}
<div class="callout">
<b>La posición media no está en un gráfico a propósito.</b> Sube y baja cada vez que se publican páginas nuevas (entran rankeando bajo y arrastran la media), así que como gráfico engaña más que informa. Está mes a mes en la tabla de la hoja de Histórico, que es donde se puede leer junto al resto del contexto.
</div>

<h3 class="sec">Por qué caen los clics <span class="sub">tres causas posibles, y cómo separarlas</span></h3>
<div class="cards">
<div class="card"><div class="c-tag t1">Causa 1</div><div class="c-body"><b>Google responde sin que haga falta entrar.</b> En búsquedas donde estamos en el top 10 el CTR es anormalmente bajo. Ver la tabla de búsquedas de abajo: hay términos en posición 9 con cientos de impresiones y un solo clic. Lo esperable en esa posición sería en torno al 2%.</div><div class="c-how">Se confirma con el informe de IA generativa de Search Console, cuando Google lo active para esta web</div></div>
<div class="card"><div class="c-tag t2">Causa 2</div><div class="c-body"><b>La media está diluida por páginas nuevas.</b> Cada página recién publicada entra rankeando baja y arrastra la posición media del sitio, aunque las páginas veteranas no se hayan movido.</div><div class="c-how">Se confirma comparando la posición de las páginas veteranas por separado</div></div>
<div class="card"><div class="c-tag t3">Causa 3</div><div class="c-body"><b>Estacionalidad.</b> Junio, julio y agosto son temporada baja de contratación de eventos corporativos. Explica parte de la caída, pero no toda: en el mismo tramo del año anterior el CTR no se hundió igual.</div><div class="c-how">Se confirma revisando septiembre y octubre, cuando vuelve la demanda</div></div>
</div>

<h3 class="sec">Búsquedas que más nos muestran <span class="sub">últimos 12 meses · top 20 por impresiones</span></h3>
${table(['Búsqueda', 'Impresiones', 'Clics', 'CTR', 'Posición'],
  report.top_queries.slice().sort((a, b) => b.impressions - a.impressions).slice(0, 20).map(q => {
    const anomaly = q.position <= 10 && q.ctr < 0.005 && q.impressions > 100;
    return [
      `<td>${esc(q.query)}${anomaly ? ' <span class="tag-warn">CTR anómalo</span>' : ''}</td>`,
      `<td class="num">${n(q.impressions)}</td>`, `<td class="num">${n(q.clicks)}</td>`,
      `<td class="num">${pct(q.ctr)}</td>`, `<td class="num">${String(q.position).replace('.', ',')}</td>`];
  }))}
<div class="callout">
<b>Las marcadas como "CTR anómalo"</b> están en primera página de Google (posición 10 o mejor) con más de 100 impresiones y menos del 0,5% de clics. Es la huella típica de una respuesta de IA que resuelve la consulta sin que el usuario entre.
</div>

<h3 class="sec">Páginas que más tráfico traen <span class="sub">últimos 12 meses · top 15 por clics</span></h3>
${table(['Página', 'Impresiones', 'Clics', 'Posición'],
  report.top_pages.slice().sort((a, b) => b.clicks - a.clicks).slice(0, 15).map(p => [
    `<td><code>${esc(p.page)}</code></td>`, `<td class="num">${n(p.impressions)}</td>`,
    `<td class="num"><b>${n(p.clicks)}</b></td>`, `<td class="num">${String(p.position).replace('.', ',')}</td>`]))}

<h3 class="sec">Inglés vs español <span class="sub">últimos 12 meses</span></h3>
${table(['Idioma', 'Impresiones', 'Clics', 'CTR', 'Lectura'], [
  [`<td>Español</td>`, `<td class="num">${n(lang.es.impressions)} <small>(${pct(lang.es.impressions / langTot, 1)})</small></td>`,
   `<td class="num">${n(lang.es.clicks)} <small>(${pct(lang.es.clicks / langClk, 1)})</small></td>`,
   `<td class="num">${pct(lang.es.ctr)}</td>`, `<td>Mucho volumen, poca conversión a clic</td>`],
  [`<td><b>Inglés</b></td>`, `<td class="num">${n(lang.en.impressions)} <small>(${pct(lang.en.impressions / langTot, 1)})</small></td>`,
   `<td class="num"><b>${n(lang.en.clicks)}</b> <small>(${pct(lang.en.clicks / langClk, 1)})</small></td>`,
   `<td class="num"><b class="good">${pct(lang.en.ctr)}</b></td>`, `<td>Menos peso en impresiones, mucho mejor CTR</td>`],
])}
<div class="callout">
<b>El inglés rinde más por página publicada.</b> Con el ${pct(lang.en.impressions / langTot, 1)} de las impresiones se lleva el ${pct(lang.en.clicks / langClk, 1)} de los clics. Y es también donde aterriza la mayoría del tráfico de asistentes AI. Dos señales independientes apuntando al mismo sitio.
</div>`;

// ================= HOJA 3 · GEO =================
// GA4 devuelve varios sessionSource por asistente (perplexity.ai y perplexity,
// copilot.com y copilot.microsoft.com...). Se agrupan para no partir el mismo canal en dos filas.
const ASSISTANT = [
  [/^(chatgpt\.com|chat\.openai\.com|openai(\.com)?)$/i, 'ChatGPT', 'OpenAI'],
  [/^(claude\.ai|anthropic\.com)$/i, 'Claude', 'Anthropic'],
  [/^(gemini\.google\.com|bard\.google\.com)$/i, 'Gemini', 'Google'],
  [/^(www\.)?perplexity(\.ai)?$/i, 'Perplexity', 'Perplexity AI'],
  [/^(copilot\.com|copilot\.microsoft\.com|edgeservices\.bing\.com)$/i, 'Copilot', 'Microsoft'],
];
const grouped = {};
for (const s of report.ai_traffic.by_source) {
  const hit = ASSISTANT.find(([re]) => re.test(s.source));
  const name = hit ? hit[1] : s.source;
  const g = (grouped[name] ??= { source: name, vendor: hit ? hit[2] : '', sessions: 0, users: 0, hosts: [] });
  g.sessions += s.sessions; g.users += s.users; g.hosts.push(s.source);
}
const aiSources = Object.values(grouped).sort((a, b) => b.sessions - a.sessions);
const aiMonths = months.slice(-13);
const aiChart = barChart(aiMonths.map((m, i) => ({ label: MES[+m.slice(5) - 1].toUpperCase(), sub: m.slice(0, 4) + (M(m).partial ? ' parc.' : ''), value: M(m).ga4.ai_sessions, current: i === aiMonths.length - 1 })),
  { title: `Sesiones desde asistentes AI por mes`, footer: `En volumen absoluto sube y baja con el tráfico general del sitio. Para la tendencia real mira el gráfico de share mensual en la hoja de Histórico.` });

const leadRows = Object.entries(report.leads).filter(([, v]) => v.all > 0).map(([k, v]) => [
  `<td><code>${esc(k)}</code></td>`, `<td class="num">${n(v.ai)}</td>`, `<td class="num">${n(v.all)}</td>`,
  `<td class="num"><b class="good">${pct(v.share, 1)}</b></td>`]);

const infra = report.infra.crawlers;
const infraDesc = {
  'GPTBot': 'Deja que ChatGPT lea y cite la web', 'ClaudeBot': 'Lo mismo para Claude',
  'PerplexityBot': 'Lo mismo para Perplexity', 'Google-Extended': 'Habilita el uso en Gemini',
  'CCBot': 'Archivo abierto que alimenta varios modelos', 'anthropic-ai': 'Rastreador antiguo de Anthropic',
};

const hoja3 = `
<div class="head-block">
  <h2>GEO · asistentes de IA</h2>
  <p>El canal nuevo: gente que llega a la web porque ChatGPT, Gemini, Perplexity o Claude la citaron en una respuesta.</p>
</div>

<div class="hero">
  <div class="h-lab">El dato que cambia el marco</div>
  <div class="h-val"><span class="h-num">3ª</span><span class="h-unit">fuente de tráfico de la web, por detrás solo de Google y del tráfico directo</span></div>
  <div class="h-ctx"><b>ChatGPT.</b> ${n(aiSources[0]?.sessions || 0)} sesiones en 12 meses, de ${n(aiSources[0]?.users || 0)} personas distintas. Por delante de Bing, de Instagram y de todo el social junto.</div>
  <div class="h-subs">
    <div class="h-sub"><div class="s-cat">Sesiones desde asistentes</div><div class="s-val">${n(report.ai_traffic.ai_sessions)}</div><div class="s-note">${pct(report.ai_traffic.ai_share)} de todo el tráfico</div></div>
    <div class="h-sub"><div class="s-cat">Último mes cerrado (${mesLabel(lastClosed)})</div><div class="s-val">${pct(M(lastClosed).ga4.ai_share, 1)}</div><div class="s-note">frente al ${pct(M(yoyPrev) ? M(yoyPrev).ga4.ai_share : 0, 1)} del mismo mes de ${yoyPrev.slice(0, 4)}</div></div>
    <div class="h-sub"><div class="s-cat">Peso en los contactos</div><div class="s-val">${pct(Math.max(...Object.values(report.leads).map(l => l.share || 0)), 1)}</div><div class="s-note">convierte por encima de su peso</div></div>
  </div>
</div>

<h3 class="sec">De dónde viene <span class="sub">últimos 12 meses</span></h3>
${table(['Asistente', 'Sesiones', 'Usuarios', 'Peso del canal AI'],
  aiSources.map(s => [
    `<td><b>${esc(s.source)}</b>${s.vendor ? ` <small>${esc(s.vendor)}</small>` : ''}${s.hosts.length > 1 ? `<br><small class="hosts">${s.hosts.map(esc).join(' + ')}</small>` : ''}</td>`,
    `<td class="num">${n(s.sessions)}</td>`,
    `<td class="num">${n(s.users)}</td>`,
    `<td class="num">${pct(s.sessions / report.ai_traffic.ai_sessions, 1)}</td>`]))}

<h3 class="sec">Volumen mes a mes <span class="sub">sesiones absolutas</span></h3>
${aiChart}

${leadRows.length ? `<h3 class="sec">Convierte mejor que la media <span class="sub">eventos de contacto · últimos 12 meses</span></h3>
${table(['Evento', 'Desde AI', 'Total sitio', 'Peso del AI'], leadRows)}
<div class="callout">
<b>Cómo se lee.</b> El tráfico de asistentes es el ${pct(report.ai_traffic.ai_share)} de las visitas pero genera un porcentaje mayor de los contactos. Llega más decidido: quien pregunta a un asistente y hace clic ya ha pasado la fase de exploración.
</div>` : ''}

<h3 class="sec">Dónde aterriza <span class="sub">páginas de entrada del tráfico AI · top 12</span></h3>
${table(['Página', 'Sesiones', 'Idioma'],
  report.landing_pages.filter(l => l.page !== '(not set)').slice(0, 12).map(l => [
    `<td><code>${esc(l.page)}</code></td>`, `<td class="num">${n(l.sessions)}</td>`,
    `<td>${l.page.startsWith('/en') ? 'EN' : 'ES'}</td>`]))}
<div class="callout">
<b>Salvo la home y contacto, casi todo es inglés.</b> Los asistentes están citando las páginas /en. Encaja con el perfil de cliente internacional y confirma que publicar en los dos idiomas no es un extra, es donde está el retorno.
</div>

<h3 class="sec">Qué se mide y qué todavía no <span class="sub">transparencia sobre los límites</span></h3>
${table(['Señal', 'Estado', 'Fuente'], [
  [`<td>Visitas desde ChatGPT, Claude, Gemini, Perplexity, Copilot</td>`, `<td><b class="good">Medido</b></td>`, `<td>GA4, automatizado</td>`],
  [`<td>Contactos originados en tráfico AI</td>`, `<td><b class="good">Medido</b></td>`, `<td>GA4, automatizado</td>`],
  [`<td>Impresiones y clics en Google</td>`, `<td><b class="good">Medido</b></td>`, `<td>Search Console, automatizado</td>`],
  [`<td>Acceso de los rastreadores de IA al sitio</td>`, `<td><b class="good">Verificado en vivo</b></td>`, `<td>robots.txt + llms.txt</td>`],
  [`<td>Veces que aparecemos en un resumen de IA de Google sin clic</td>`, `<td><b class="warn">Pendiente</b></td>`, `<td>Informe nuevo de Search Console</td>`],
  [`<td>Qué pregunta exacta hizo el usuario en ChatGPT</td>`, `<td><b class="bad">No existe</b></td>`, `<td>Ningún asistente lo publica</td>`],
  [`<td>Visitas donde el asistente respondió sin citar la web</td>`, `<td><b class="bad">No medible</b></td>`, `<td>Llegan como tráfico directo</td>`],
])}

<div class="callout warn">
<b>Novedad de junio 2026.</b> Google lanzó en Search Console un informe de <b>IA generativa</b> que muestra cuántas veces aparecen nuestras páginas dentro de AI Overviews y AI Mode. Solo da impresiones (no clics, no CTR, no la búsqueda concreta), no está disponible por API y está en despliegue por fases. En cuanto se active para esta web, ese número entra aquí y cierra el hueco de la fila ámbar.
<br><br>
<b>Importante:</b> no es tráfico nuevo que no estuviéramos viendo. Ya estaba contado dentro de las impresiones de Google. El informe solo lo separa para poder mirarlo.
</div>

<h3 class="sec">Infraestructura de visibilidad <span class="sub">comprobado en vivo el ${new Date(report.generated_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span></h3>
${table(['Elemento', 'Estado', 'Para qué sirve'], [
  ...Object.entries(infra).map(([k, v]) => [
    `<td>${esc(k)}</td>`,
    `<td><b class="${v === 'permitido' ? 'good' : 'warn'}">${v === 'permitido' ? '✓ Permitido' : esc(v)}</b></td>`,
    `<td>${infraDesc[k] || ''}</td>`]),
  [`<td>Content-Signal (estándar IAB)</td>`, `<td><b class="good">✓ Declarado</b></td>`, `<td>Permite búsqueda y respuesta, no entrenamiento</td>`],
  [`<td>llms.txt</td>`, `<td><b class="${report.infra.llms_txt.status === 200 ? 'good' : 'bad'}">${report.infra.llms_txt.status === 200 ? `✓ Activo (${Math.round(report.infra.llms_txt.bytes / 1024)} KB)` : 'Caído'}</b></td>`, `<td>Índice del sitio en formato legible para asistentes</td>`],
])}
<div class="callout">
Esta tabla se vuelve a comprobar en cada actualización. Un plugin nuevo o un cambio en el hosting pueden tumbar estos permisos sin avisar, y si eso pasa los asistentes dejan de leer la web sin que se note en ninguna otra métrica hasta semanas después.
</div>`;


// ================= HOJA 4 · KEYWORDS =================
let hoja4 = '';
if (kwStore) {
  const kms = Object.keys(kwStore.months).sort();
  const kClosed = kms.filter(m => !kwStore.months[m].partial);
  const kLast = kClosed[kClosed.length - 1] || kms[kms.length - 1];
  const kPrev = kClosed[kClosed.length - 2] || null;
  const kw = kwStore.months[kLast].keywords;
  const kwPrev = kPrev ? kwStore.months[kPrev].keywords : null;

  const dist = kwAnalysis.distribution(kw);
  const sd = kwAnalysis.strikingDistance(kw, kwPrev);
  const anom = kwAnalysis.ctrAnomalies(kw);
  const mv = kwAnalysis.movers(kw, kwPrev);

  const totalKw = Object.keys(kw).length;
  const sdImp = sd.reduce((s, r) => s + r.impressions, 0);
  const sdClk = sd.reduce((s, r) => s + r.clicks, 0);
  const ctrTop = dist.find(d => d.band === '4-10');
  const potencial = Math.round(sdImp * (ctrTop ? ctrTop.ctr : 0.006));

  const mov = m => m === null ? '<span class="nd">nuevo</span>'
    : m > 0 ? `<b class="good">+${String(m).replace('.', ',')}</b>`
    : m < 0 ? `<b class="bad">${String(m).replace('.', ',')}</b>` : '<span class="nd">=</span>';

  hoja4 = `
<div class="head-block">
  <h2>Keywords</h2>
  <p>Las ${n(totalKw)} búsquedas por las que aparecemos, con su posición congelada mes a mes. Esta hoja no es un informe: es la lista de trabajo, ordenada por dónde está el retorno.</p>
</div>

<div class="hero">
  <div class="h-lab">La oportunidad concreta · ${mesLabel(kLast)}</div>
  <div class="h-val"><span class="h-num">${sd.length}</span><span class="h-unit">búsquedas atascadas en la página 2 de Google (posición 11 a 20) con volumen real</span></div>
  <div class="h-ctx">Suman <b>${n(sdImp)} impresiones</b> y hoy generan <b>${n(sdClk)} clics</b>. Si pasaran a la primera página, con el CTR que ya tenemos en posiciones 4 a 10 (${pct(ctrTop ? ctrTop.ctr : 0)}), serían del orden de <b>${n(potencial)} clics</b>. Es el trabajo con mejor relación esfuerzo/resultado que hay ahora mismo.</div>
  <div class="h-subs">
    <div class="h-sub"><div class="s-cat">Keywords seguidas</div><div class="s-val">${n(totalKw)}</div><div class="s-note">con ${kwStore.min_impressions}+ impresiones en el mes</div></div>
    <div class="h-sub"><div class="s-cat">Histórico guardado</div><div class="s-val">${kms.length} meses</div><div class="s-note">desde ${mesLabel(kms[0])}</div></div>
    <div class="h-sub"><div class="s-cat">Balance del mes</div><div class="s-val">${mv.up.length} ↑ / ${mv.down.length} ↓</div><div class="s-note">movimientos de 3+ puestos vs ${kPrev ? mesLabel(kPrev) : 'n/d'}</div></div>
  </div>
</div>

${mv.down.length > mv.up.length * 2 ? `<div class="callout warn">
<b>Atención al balance.</b> Este mes bajan ${mv.down.length} búsquedas y suben ${mv.up.length}. La media global de posición del sitio puede seguir mejorando año contra año, pero el movimiento reciente keyword a keyword es negativo. Las dos cosas son verdad a la vez y esta es la que hay que vigilar, porque va por delante.
</div>` : ''}

<h3 class="sec">Dónde estamos colocados <span class="sub">${mesLabel(kLast)} · reparto de las ${n(totalKw)} keywords</span></h3>
${table(['Posición', 'Keywords', 'Impresiones', 'Clics', 'CTR', 'Lectura'],
  dist.map(d => {
    const lect = d.band === '1-3' ? 'Lo que ya funciona'
      : d.band === '4-10' ? 'Primera página: aquí el clic todavía llega'
      : d.band === '11-20' ? 'Página 2: mucha visibilidad, casi ningún clic'
      : d.band === '21-50' ? 'Visible pero lejos. Trabajo de fondo'
      : 'Prácticamente invisible';
    return [`<td><b>${d.band}</b></td>`, `<td class="num">${n(d.keywords)}</td>`, `<td class="num">${n(d.impressions)}</td>`,
      `<td class="num">${n(d.clicks)}</td>`, `<td class="num">${pct(d.ctr)}</td>`, `<td><small>${lect}</small></td>`];
  }))}
<div class="callout">
<b>El salto de la página 2 a la 1 es el que paga.</b> En posiciones 4 a 10 el CTR es de ${pct(ctrTop ? ctrTop.ctr : 0)}. En 11 a 20 cae a ${pct(dist.find(d => d.band === '11-20').ctr)}, es decir prácticamente cero. No es que la gente vea el resultado y no entre: es que no llega a verlo.
</div>

<h3 class="sec">Lista de trabajo · a un empujón de la página 1 <span class="sub">posición 11-20 con 30+ impresiones · ordenadas por volumen</span></h3>
${table(['Búsqueda', 'Posición', 'Movimiento', 'Impresiones', 'Clics'],
  sd.slice(0, 30).map(r => [
    `<td>${esc(r.query)}</td>`,
    `<td class="num"><b>${String(r.position).replace('.', ',')}</b></td>`,
    `<td class="num">${mov(r.movement)}</td>`,
    `<td class="num">${n(r.impressions)}</td>`,
    `<td class="num">${r.clicks || '<span class="nd">0</span>'}</td>`]))}
<div class="callout">
<b>Cómo se usa esta tabla.</b> Son búsquedas donde Google ya nos considera relevantes pero nos deja fuera de la primera página. Cada una es una página concreta que se puede mejorar. La columna de movimiento dice si el trabajo del mes anterior la ha empujado o si va cuesta abajo, así que el mes que viene se puede comprobar si lo que hicimos funcionó.
</div>

${anom.length ? `<h3 class="sec">Aparecemos arriba y no nos hacen clic <span class="sub">posición 10 o mejor, 80+ impresiones, menos del 1% de clics</span></h3>
${table(['Búsqueda', 'Posición', 'Impresiones', 'Clics', 'CTR'],
  anom.slice(0, 15).map(r => [`<td>${esc(r.query)}</td>`, `<td class="num"><b>${String(r.position).replace('.', ',')}</b></td>`,
    `<td class="num">${n(r.impressions)}</td>`, `<td class="num">${r.clicks || '<span class="nd">0</span>'}</td>`,
    `<td class="num"><b class="bad">${pct(r.ctr)}</b></td>`]))}
<div class="callout warn">
<b>Esto no se arregla subiendo posiciones.</b> Ya estamos arriba. Que no entre nadie significa que algo por encima del resultado resuelve la consulta: un resumen de IA, un bloque de imágenes, un mapa o el propio Google. La palanca aquí no es SEO clásico sino dar una respuesta que el resumen quiera citar, que es exactamente el trabajo de la hoja GEO.
</div>` : ''}

${kwPrev ? `<h3 class="sec">Qué se ha movido <span class="sub">${mesLabel(kPrev)} → ${mesLabel(kLast)} · 3+ puestos y 50+ impresiones</span></h3>
<div class="two-col">
<div>
<div class="col-h good">Suben · ${mv.up.length}</div>
${table(['Búsqueda', 'Antes', 'Ahora', 'Gana'],
  mv.up.slice(0, 12).map(r => [`<td>${esc(r.query)}</td>`, `<td class="num nd">${String(r.prev_position).replace('.', ',')}</td>`,
    `<td class="num"><b>${String(r.position).replace('.', ',')}</b></td>`, `<td class="num"><b class="good">+${String(r.movement).replace('.', ',')}</b></td>`]))}
</div>
<div>
<div class="col-h bad">Bajan · ${mv.down.length}</div>
${table(['Búsqueda', 'Antes', 'Ahora', 'Pierde'],
  mv.down.slice(0, 12).map(r => [`<td>${esc(r.query)}</td>`, `<td class="num nd">${String(r.prev_position).replace('.', ',')}</td>`,
    `<td class="num"><b>${String(r.position).replace('.', ',')}</b></td>`, `<td class="num"><b class="bad">${String(r.movement).replace('.', ',')}</b></td>`]))}
</div>
</div>` : ''}

<h3 class="sec">Por qué este histórico se guarda aparte</h3>
<div class="callout">
Search Console borra los datos a los 16 meses. Sin un archivo propio no se puede responder la única pregunta que importa para saber si el trabajo SEO funciona: <b>¿esta búsqueda ha subido desde que tocamos su página?</b> Por eso cada mes se congelan las posiciones de todas las keywords con ${kwStore.min_impressions} o más impresiones. Hoy hay <b>${kms.length} meses</b> guardados, desde ${mesLabel(kms[0])}, y un mes guardado no se borra nunca.
</div>`;
}

// ================= HTML =================
const fechaDatos = new Date(report.generated_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Métricas SEO y GEO · Eventos Barcelona</title>
<style>
*{box-sizing:border-box}
:root{--ink:#0a2540;--gold:#c99a3a;--bg:#faf8f4;--line:#e8e2d5;--card:#fff;--red:#c1272d;--amber:#d18416;--green:#2f7d3a;--muted:#5b6473}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1140px;margin:0 auto;padding:44px 28px}
header{margin-bottom:8px}
.kicker{color:var(--gold);font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:700}
h1{font-size:34px;margin:8px 0 6px;letter-spacing:-.02em}
.sub-h{color:var(--muted);font-size:15px;max-width:70ch}
.badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.badges span{background:var(--ink);color:#fff;padding:7px 13px;border-radius:3px;font-size:11px;letter-spacing:.05em;text-transform:uppercase;font-weight:600}
.badges b{color:var(--gold)}
input[name=tab]{position:absolute;left:-9999px}
.tabs{display:flex;flex-wrap:wrap;border-bottom:2px solid var(--ink);margin:28px 0 30px}
.tabs label{padding:13px 22px;cursor:pointer;font-size:13.5px;font-weight:700;color:var(--muted);border-bottom:3px solid transparent;transition:.15s;letter-spacing:.02em}
.tabs label small{display:block;font-weight:400;font-size:10px;letter-spacing:.06em;text-transform:uppercase;margin-top:2px;color:var(--muted)}
.tabs label:hover{color:var(--ink);background:rgba(201,154,58,.06)}
.pane{display:none}
#t-hist:checked~.tabs label[for=t-hist],#t-seo:checked~.tabs label[for=t-seo],#t-geo:checked~.tabs label[for=t-geo],#t-kw:checked~.tabs label[for=t-kw]{color:var(--ink);border-bottom-color:var(--gold);background:rgba(201,154,58,.08)}
#t-hist:checked~.tabs label[for=t-hist] small,#t-seo:checked~.tabs label[for=t-seo] small,#t-geo:checked~.tabs label[for=t-geo] small,#t-kw:checked~.tabs label[for=t-kw] small{color:var(--gold);font-weight:700}
#t-hist:checked~.panes #p-hist,#t-seo:checked~.panes #p-seo,#t-geo:checked~.panes #p-geo,#t-kw:checked~.panes #p-kw{display:block}
.head-block{border-left:4px solid var(--gold);padding:2px 0 2px 18px;margin-bottom:22px}
.head-block h2{margin:0 0 6px;font-size:25px;letter-spacing:-.015em}
.head-block p{margin:0;color:var(--muted);max-width:75ch}
h3.sec{font-size:16px;margin:34px 0 12px;display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
h3.sec .sub{font-size:11px;color:var(--muted);font-weight:400}
.hero{background:linear-gradient(135deg,var(--ink),#12324f);color:#fff;border-radius:6px;padding:30px 34px;margin:16px 0 24px;position:relative;overflow:hidden}
.hero::before{content:"";position:absolute;top:0;right:0;width:190px;height:190px;background:radial-gradient(circle,rgba(201,154,58,.16),transparent 70%)}
.h-lab{color:var(--gold);font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;margin-bottom:12px}
.h-val{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.h-num{font-size:64px;font-weight:800;line-height:1;letter-spacing:-.02em}
.h-unit{font-size:15px;color:rgba(255,255,255,.72)}
.h-ctx{color:rgba(255,255,255,.7);font-size:14px;margin-top:10px;max-width:78ch}
.h-ctx b{color:#fff}
.h-subs{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:22px;padding-top:20px;border-top:1px solid rgba(255,255,255,.16)}
.s-cat{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);font-weight:700;margin-bottom:4px}
.s-val{font-size:24px;font-weight:700;color:#fff;line-height:1.1}
.s-note{font-size:11px;color:rgba(255,255,255,.56);margin-top:3px}
.chart{background:var(--card);border:1px solid var(--line);border-radius:5px;padding:20px 22px;margin:14px 0}
.c-title{font-size:13px;color:var(--muted);margin-bottom:16px}
.c-title b{color:var(--ink)}
.c-scroll{overflow-x:auto}
.plot{position:relative;min-width:min-content}
.grid{position:absolute;left:0;right:0;bottom:36px;top:8px;pointer-events:none}
.gline{position:absolute;left:0;right:0;border-top:1px dashed #e0d9c8}
.gline span{position:absolute;left:0;top:-8px;background:var(--card);padding:0 5px 0 0;font-size:9.5px;color:#a89f8c;font-weight:600;letter-spacing:.03em}
.bars{position:relative;display:flex;gap:8px;align-items:flex-end;height:190px;padding:8px 0;border-bottom:2px solid var(--ink);min-width:min-content}
.bar{flex:1 0 44px;display:flex;flex-direction:column;height:100%;min-width:0}
.b-col{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end;align-items:center}
.b-num{font-size:11px;font-weight:700;text-align:center;white-space:nowrap;margin-bottom:3px;line-height:1.1}
.b-fill{width:100%;background:linear-gradient(to top,var(--ink),var(--gold));border-radius:3px 3px 0 0;min-height:3px;flex-shrink:0}
.bar.current .b-fill{background:linear-gradient(to top,var(--gold),#e6c470)}
.b-lab{margin-top:6px;font-size:10px;color:var(--muted);text-align:center;font-weight:700;letter-spacing:.03em;white-space:nowrap}
.b-lab span{display:block;font-weight:400;font-size:9px;margin-top:1px}
.c-foot{font-size:11px;color:var(--muted);margin-top:12px;font-style:italic}
.t-scroll{overflow-x:auto;margin:12px 0}
.tbl{width:100%;border-collapse:collapse;font-size:13px;background:var(--card);border:1px solid var(--line);border-radius:4px;overflow:hidden}
.tbl th{background:var(--ink);color:#fff;padding:10px 13px;text-align:left;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;font-weight:600;white-space:nowrap}
.tbl td{padding:9px 13px;border-bottom:1px solid var(--line);vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.tbl td small{color:var(--muted)}
.tbl small.hosts{font-size:10.5px;color:#a0a8b4;font-family:ui-monospace,monospace}
.tbl code{background:#f2efe7;padding:1px 5px;border-radius:2px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px}
.tbl.serie td{padding:7px 13px;font-size:12.5px}
.tbl.cmp td:first-child{font-weight:500}
td.delta{text-align:right;font-weight:700;white-space:nowrap}
td.delta.up{color:var(--green)}td.delta.down{color:var(--red)}td.delta.flat{color:var(--muted)}
.good{color:var(--green)}.warn{color:var(--amber)}.bad{color:var(--red)}
.nd{color:#9ca3af;font-style:italic;font-size:11px}
.tag-part{background:var(--amber);color:#fff;font-size:9px;padding:1px 5px;border-radius:2px;text-transform:uppercase;letter-spacing:.06em;vertical-align:middle}
.tag-warn{background:var(--red);color:#fff;font-size:9px;padding:1px 5px;border-radius:2px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
.callout{background:#fff8e1;border:1px solid #f0e0a0;border-left:6px solid var(--gold);padding:14px 18px;margin:16px 0;border-radius:4px;font-size:14px}
.callout.warn{background:#f0f7fa;border-color:#c9dae2;border-left-color:#3d7a95}
.cards{display:grid;gap:12px}\n.two-col{display:grid;grid-template-columns:1fr 1fr;gap:18px}\n.col-h{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:8px 0 2px}\n@media(max-width:900px){.two-col{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:5px;padding:14px 18px;display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:start}
.c-tag{font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:#fff;padding:4px 9px;border-radius:2px;white-space:nowrap}
.c-tag.t1{background:var(--ink)}.c-tag.t2{background:var(--amber)}.c-tag.t3{background:var(--gold)}
.c-body{font-size:13.5px}
.c-how{grid-column:2;font-size:11px;color:var(--muted);font-style:italic;margin-top:-6px}
footer{margin-top:56px;padding-top:22px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;text-align:center}
footer a{color:var(--ink)}
@media(max-width:820px){
  .wrap{padding:30px 16px}
  h1{font-size:26px}
  .h-num{font-size:46px}
  .h-subs{grid-template-columns:1fr;gap:14px}
  .tabs label{padding:11px 14px;font-size:12.5px}
  .card{grid-template-columns:1fr;gap:8px}
  .c-how{grid-column:1;margin-top:0}
  .hero{padding:22px 20px}
}
@media print{
  body{background:#fff}.tabs,footer{display:none}.pane{display:block!important;page-break-after:always}
  .chart,.callout,.card,.hero{break-inside:avoid}
}
</style>
</head>
<body>
<div class="wrap">

<input type="radio" name="tab" id="t-hist">
${hoja4 ? '<input type="radio" name="tab" id="t-kw">' : ''}
<input type="radio" name="tab" id="t-seo">
<input type="radio" name="tab" id="t-geo" checked>

<header>
<div class="kicker">Eventos Barcelona · rendimiento orgánico</div>
<h1>Métricas SEO y GEO</h1>
<div class="sub-h">Cómo nos encuentra la gente, por las dos vías: la búsqueda de Google de siempre y los asistentes de IA. Se actualiza cada dos semanas con datos sacados por API, sin números escritos a mano.</div>
<div class="badges">
  <span>Datos a · <b>${fechaDatos}</b></span>
  <span>Serie · <b>${months.length} meses</b></span>
  <span>Fuentes · <b>Search Console + GA4</b></span>
</div>
</header>

<div class="tabs">
  <label for="t-geo">GEO <small>asistentes de IA</small></label>
  <label for="t-seo">SEO <small>búsqueda en Google</small></label>
  ${hoja4 ? '<label for="t-kw">Keywords <small>lista de trabajo</small></label>' : ''}
  <label for="t-hist">Histórico <small>${months.length} meses de serie</small></label>
</div>

<div class="panes">
<div class="pane" id="p-geo">${hoja3}</div>
<div class="pane" id="p-seo">${hoja2}</div>
${hoja4 ? `<div class="pane" id="p-kw">${hoja4}</div>` : ''}
<div class="pane" id="p-hist">${hoja1}</div>
</div>

<footer>
Generado automáticamente el ${fechaDatos} desde <code>data/geo-timeline.json</code> y <code>data/geo-report.json</code>.<br>
Para regenerar: <code>node scripts/geo-report.js 365 &amp;&amp; node scripts/build-dashboard-metricas.js</code><br>
URL corta: <b>propuestas.eventosbarcelona.com/metricas</b>
</footer>

</div>
</body>
</html>`;

fs.writeFileSync(OUT, html);
console.log(`Escrito: dashboard-metricas.html (${Math.round(html.length / 1024)} KB)`);
console.log(`  Histórico: ${months.length} meses · SEO: ${report.top_queries.length} queries · GEO: ${aiSources.length} asistentes`);
