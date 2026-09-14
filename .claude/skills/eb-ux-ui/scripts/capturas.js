#!/usr/bin/env node
// Capturas medidas en escritorio (1440) y móvil (390) con escrituras bloqueadas.
//
// Uso: node capturas.js <base> <carpeta> <ruta> [ruta…]
//   node .claude/skills/eb-ux-ui/scripts/capturas.js https://propuestas.eventosbarcelona.com ./shots \
//     "/propuesta.html?id=ca5e1a51" "/admin.html#shows/active"
//
// Por cada ruta y viewport guarda <carpeta>/<vista>-<n>.png e imprime:
// alto de página, desbordamiento horizontal y errores de JS.
const fs = require('fs');
const path = require('path');

const [,, base, out, ...rutas] = process.argv;
if (!base || !out || !rutas.length) {
  console.error('Uso: node capturas.js <base> <carpeta> <ruta> [ruta…]');
  process.exit(1);
}
const puppeteer = require(require.resolve('puppeteer-core', { paths: [process.cwd()] }));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const vistas = [['desk', { width: 1440, height: 900 }], ['mob', { width: 390, height: 844, isMobile: true, hasTouch: true }]];
  for (const [i, ruta] of rutas.entries()) {
    for (const [vista, vp] of vistas) {
      const page = await browser.newPage();
      await page.setViewport(vp);
      await page.setRequestInterception(true);
      // Nunca escribir en producción desde una captura
      page.on('request', r => (r.method() === 'GET' || r.method() === 'HEAD') ? r.continue() : (console.log('  BLOQUEADO', r.method(), r.url()), r.abort()));
      const errores = [];
      page.on('pageerror', e => errores.push(e.message.slice(0, 160)));
      await page.goto(base + ruta, { waitUntil: 'networkidle2', timeout: 90000 }).catch(e => errores.push('goto: ' + e.message));
      await page.evaluate(() => document.fonts && document.fonts.ready);
      // Scroll para disparar carga diferida y volver arriba
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 800) { scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); } scrollTo(0, 0); });
      await sleep(1500);
      const m = await page.evaluate(() => ({ alto: document.documentElement.scrollHeight, anchoDoc: document.documentElement.scrollWidth, viewport: innerWidth }));
      const file = path.join(out, `${vista}-${i + 1}.png`);
      await page.screenshot({ path: file });
      console.log(`${vista} ${ruta} · alto ${m.alto}px · ${m.anchoDoc > m.viewport ? `DESBORDA (${m.anchoDoc}px)` : 'sin desbordamiento'}${errores.length ? ' · ERRORES: ' + errores.join(' | ') : ''} → ${file}`);
      await page.close();
    }
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
