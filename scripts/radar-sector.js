#!/usr/bin/env node
// Radar del sector: recopila la materia prima para comparar el catálogo de
// Eventos Barcelona contra cómo clasifica su oferta la competencia.
//
// Se ejecuta a demanda, cuando Xavi pide ideas o cuando queremos revisar
// huecos de catálogo:
//     node scripts/radar-sector.js
//
// Solo hace la parte mecánica y determinista (bajar y normalizar taxonomías).
// El cruce semántico lo hace una persona o Claude, porque las categorías de EB
// están en español y las del sector en inglés: un match por string daría basura.
//
// No usa credenciales: el catálogo sale del endpoint público /api/catalog-active
// y las taxonomías de los sitemaps públicos. Coste cero.

const UA = 'Mozilla/5.0 (compatible; EventosBarcelonaBot/1.0; +https://eventosbarcelona.com)';
const SALIDA = new URL('../data/radar-materia-prima.json', import.meta.url).pathname;

async function bajar(url, { timeout = 30000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal, redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

function locs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(m => m[1]);
}

// "tribute-lookalikes-and-impersonators/other-tributes" -> "tribute lookalikes and impersonators / other tributes"
function legible(slug) {
  return slug.split('/').map(p => p.replace(/-/g, ' ').trim()).filter(Boolean).join(' / ');
}

async function catalogoEB() {
  const raw = await bajar('https://propuestas.eventosbarcelona.com/api/catalog-active');
  const j = JSON.parse(raw);
  const shows = Array.isArray(j.catalog) ? j.catalog : Object.values(j.catalog).flat();
  const porCategoria = {};
  for (const s of shows) {
    const cat = s.category || 'sin categoria';
    porCategoria[cat] ??= { shows: 0, subcategorias: {} };
    porCategoria[cat].shows++;
    const sub = s.subcategory || '(sin subcategoria)';
    porCategoria[cat].subcategorias[sub] = (porCategoria[cat].subcategorias[sub] || 0) + 1;
  }
  return {
    total: shows.length,
    categorias: Object.entries(porCategoria).map(([nombre, d]) => ({
      nombre,
      shows: d.shows,
      subcategorias: Object.entries(d.subcategorias)
        .sort((a, b) => b[1] - a[1])
        .map(([n, c]) => `${n} (${c})`)
    }))
  };
}

async function scarlett() {
  const xml = await bajar('https://scarlettentertainment.com/sitemap.xml', { timeout: 60000 });
  const urls = locs(xml);
  const categorias = urls
    .filter(u => u.includes('/categories/'))
    .map(u => legible(u.split('/categories/')[1] || ''))
    .filter(Boolean);
  // Los ~24k de /acts/ son SEO programático (mismo acto x ciudad). No los
  // bajamos, pero contamos cuántos hay para saber el tamaño del catálogo.
  const actos = urls.filter(u => u.includes('/acts/')).length;
  return { categorias: [...new Set(categorias)].sort(), actos_publicados: actos, urls_totales: urls.length };
}

// Contraband NO publica taxonomía en sus sitemaps: sus actos cuelgan de
// /project/<nombre>-<tipo>-<ciudad>/ sueltos. Además tiran mucho a UK
// (london, staffordshire, uk), así que sirven como nombres de acto para
// inspiración, no como estructura comparable con la de EB.
async function contraband() {
  const indice = await bajar('https://www.contrabandevents.com/sitemap_index.xml');
  const actos = [];
  const sub_sitemaps = [];
  for (const sm of locs(indice)) {
    if (!/project-sitemap/i.test(sm)) continue;
    try {
      const xml = await bajar(sm, { timeout: 90000 });
      const urls = locs(xml);
      sub_sitemaps.push({ url: sm, urls: urls.length });
      for (const u of urls) {
        const m = u.match(/\/project\/([^/?#]+)/i);
        if (m) actos.push(legible(m[1]));
      }
    } catch (e) {
      sub_sitemaps.push({ url: sm, error: e.message });
    }
  }
  return {
    categorias: [],
    nota: 'Sin taxonomía publicada. Solo nombres de acto, con fuerte sesgo UK.',
    actos: [...new Set(actos)].sort(),
    sub_sitemaps
  };
}

const fuentes = [
  { nombre: 'Eventos Barcelona (catálogo propio)', fn: catalogoEB, clave: 'eb' },
  { nombre: 'Scarlett Entertainment', fn: scarlett, clave: 'scarlett' },
  { nombre: 'Contraband Events', fn: contraband, clave: 'contraband' }
];

const salida = { generado: new Date().toISOString(), fuentes: {}, estado: [] };

for (const f of fuentes) {
  process.stderr.write(`  leyendo ${f.nombre}… `);
  try {
    salida.fuentes[f.clave] = await f.fn();
    const n = salida.fuentes[f.clave].categorias?.length ?? salida.fuentes[f.clave].total;
    salida.estado.push({ nombre: f.nombre, estado: 'ok', encontrados: n });
    process.stderr.write(`ok (${n})\n`);
  } catch (e) {
    salida.estado.push({ nombre: f.nombre, estado: 'fallo', error: e.message });
    process.stderr.write(`FALLO: ${e.message}\n`);
  }
}

const fs = await import('node:fs');
fs.mkdirSync(new URL('../data/', import.meta.url).pathname, { recursive: true });
fs.writeFileSync(SALIDA, JSON.stringify(salida, null, 2));
process.stderr.write(`\nMateria prima en data/radar-materia-prima.json\n`);
