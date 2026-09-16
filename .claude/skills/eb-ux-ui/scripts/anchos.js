#!/usr/bin/env node
// Gate de publicación: ninguna página puede desbordar a lo ancho, y todas
// llevan el <head> estándar (favicon, og:image, viewport).
//
// Uso: node anchos.js <base> [ruta…]
//   node .claude/skills/eb-ux-ui/scripts/anchos.js https://propuestas.eventosbarcelona.com
//   node .claude/skills/eb-ux-ui/scripts/anchos.js http://127.0.0.1:8777 /index.html
//
// Sin rutas descubre todos los .html del repo y prueba cada uno en los siete
// anchos de abajo. Sale con código 1 si alguna página falla, para poder
// encadenarlo antes de un push.
//
// Los 768 y 834 no son caprichosos: son los anchos de tablet y de ventana a
// media pantalla, donde una rejilla de dos columnas con breakpoint en 700
// todavía no ha saltado a una y ya no cabe. Es el fallo que nadie ve porque
// nadie prueba ahí.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ANCHOS = [1280, 1024, 834, 768, 430, 390, 360];
const [, , base, ...args] = process.argv;
if (!base) {
  console.error('Uso: node anchos.js <base> [ruta…]');
  process.exit(1);
}

const repo = process.cwd();
// `data/backups` son volcados de contenido de WordPress, no páginas servibles
const rutas = args.length ? args : execSync(
  `find . -name "*.html" -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./wordpress-mcp/*" -not -path "./.claude/*" -not -path "./data/backups/*"`,
  { cwd: repo, encoding: 'utf8' }
).trim().split('\n').filter(Boolean).map(f => f.replace(/^\./, '')).sort();

const puppeteer = require(require.resolve('puppeteer-core', { paths: [repo] }));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Se ejecuta dentro de la página
const sonda = () => {
  const vw = window.innerWidth;
  const culpables = [...document.querySelectorAll('body *')].filter(el => {
    const r = el.getBoundingClientRect();
    if (!(r.width || r.height)) return false;
    if (r.right <= vw + 1 && r.left >= -1) return false;
    if (r.right < 0) return false; // inputs de accesibilidad fuera de pantalla
    // lo que vive dentro de un contenedor con scroll propio no cuenta
    let n = el.parentElement;
    while (n && n !== document.body) {
      if (['auto', 'scroll', 'hidden'].includes(getComputedStyle(n).overflowX)) return false;
      n = n.parentElement;
    }
    return true;
  });
  const imgs = [...document.querySelectorAll('img')];
  return {
    doc: document.documentElement.scrollWidth,
    vw,
    n: culpables.length,
    top: [...new Set(culpables.map(e =>
      e.tagName.toLowerCase() + (e.className && e.className.toString ? '.' + e.className.toString().trim().split(/\s+/)[0] : '')
    ))].slice(0, 3),
    favicon: !!document.querySelector('link[rel~="icon"]'),
    og: !!document.querySelector('meta[property="og:image"]'),
    viewport: !!document.querySelector('meta[name="viewport"]'),
    imgsRotas: imgs.filter(i => i.complete && i.naturalWidth === 0).map(i => (i.currentSrc || i.src).slice(-60)),
  };
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const fallos = new Map();
  const avisos = new Map();
  const head = new Map();

  for (const ancho of ANCHOS) {
    const page = await browser.newPage();
    await page.setViewport({ width: ancho, height: 900 });
    await page.setRequestInterception(true);
    // Nunca escribir en producción desde una verificación
    page.on('request', r => (r.method() === 'GET' || r.method() === 'HEAD') ? r.continue() : r.abort());
    for (const ruta of rutas) {
      try {
        await page.goto(base + ruta, { waitUntil: 'load', timeout: 45000 });
        await page.evaluate(() => document.fonts && document.fonts.ready);
        await sleep(900);
        const r = await page.evaluate(sonda);
        if (!head.has(ruta)) head.set(ruta, r);
        // Falla si el DOCUMENTO crece: eso es scroll horizontal real. Un elemento
        // fuera del viewport sin que el documento crezca suele ser intencional
        // (el drawer del admin vive en left:100% hasta que se abre), así que se
        // anota como aviso y no tumba el gate.
        if (r.doc > r.vw + 1) {
          if (!fallos.has(ruta)) fallos.set(ruta, []);
          fallos.get(ruta).push(`${ancho}px: +${r.doc - r.vw}px (${r.n} elem: ${r.top.join(', ')})`);
        } else if (r.n > 0) {
          if (!avisos.has(ruta)) avisos.set(ruta, new Set());
          r.top.forEach(t => avisos.get(ruta).add(t));
        }
      } catch (e) {
        if (!fallos.has(ruta)) fallos.set(ruta, []);
        fallos.get(ruta).push(`${ancho}px: ${String(e.message).slice(0, 60)}`);
      }
    }
    await page.close();
    console.error(`· ${ancho}px comprobado`);
  }
  await browser.close();

  let mal = 0;
  console.log(`\n== Desbordamiento horizontal (${rutas.length} páginas × ${ANCHOS.join(', ')}) ==`);
  for (const ruta of rutas) {
    if (fallos.has(ruta)) { mal++; console.log(`\nFALLA ${ruta}`); fallos.get(ruta).forEach(l => console.log('   ' + l)); }
  }
  if (!mal) console.log('Ninguna página desborda.');

  if (avisos.size) {
    console.log('\n== Avisos (elemento fuera del viewport, sin scroll en la página) ==');
    for (const [ruta, set] of avisos) console.log(`  ${ruta} · ${[...set].join(', ')}`);
  }

  console.log('\n== <head> estándar ==');
  let sinHead = 0;
  for (const ruta of rutas) {
    const h = head.get(ruta);
    if (!h) continue;
    const falta = [!h.favicon && 'favicon', !h.og && 'og:image', !h.viewport && 'viewport'].filter(Boolean);
    if (falta.length) { sinHead++; console.log(`  ${ruta} · falta ${falta.join(', ')}`); }
    if (h.imgsRotas.length) { sinHead++; console.log(`  ${ruta} · imágenes rotas: ${h.imgsRotas.join(', ')}`); }
  }
  if (!sinHead) console.log('Todas con favicon, og:image y viewport, sin imágenes rotas.');

  console.log(`\nResumen: ${mal} con desbordamiento, ${sinHead} con el head incompleto.`);
  process.exit(mal || sinHead ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
