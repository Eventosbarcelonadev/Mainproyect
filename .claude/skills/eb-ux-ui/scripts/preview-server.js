#!/usr/bin/env node
// Preview local "antes" (rama base) frente a "después" (árbol de trabajo) de las páginas de EB.
// Lecturas de /api/* se reenvían a producción; cualquier escritura se bloquea con 403.
//
// Uso (desde la raíz del repo):
//   PORT=4173 REPO=$(pwd) BASE=main node .claude/skills/eb-ux-ui/scripts/preview-server.js
//   open http://localhost:4173/comparar
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = process.env.REPO || process.cwd();
const BASE = process.env.BASE || 'main';
const PROD = process.env.PROD || 'https://propuestas.eventosbarcelona.com';
const PORT = Number(process.env.PORT || 4173);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HERE = __dirname;

const TYPES = { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.css': 'text/css', '.js': 'text/javascript' };

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

async function proxyApi(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    console.log(`BLOQUEADO ${req.method} ${url.pathname}`);
    return send(res, 403, JSON.stringify({ success: false, error: 'Preview local: las escrituras están bloqueadas' }), 'application/json');
  }
  try {
    const r = await fetch(PROD + url.pathname + url.search);
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' });
    res.end(buf);
  } catch (e) {
    send(res, 502, JSON.stringify({ success: false, error: e.message }), 'application/json');
  }
}

async function renderPdf(res, url) {
  const version = url.searchParams.get('v') === 'antes' ? 'antes/' : '';
  const id = url.searchParams.get('id');
  if (!id) return send(res, 400, 'Falta ?id=');
  const lang = url.searchParams.get('lang');
  const puppeteer = require(require.resolve('puppeteer-core', { paths: [REPO] }));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', r => (r.method() === 'GET' || r.method() === 'HEAD') ? r.continue() : r.abort());
    const target = `http://localhost:${PORT}/${version}propuesta.html?id=${encodeURIComponent(id)}&print=1${lang ? `&lang=${lang}` : ''}`;
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction('window.__pdfReady === true', { timeout: 60000 });
    // Mismas opciones que api/generate-proposal-pdf.js
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="propuesta-${id}-${version ? 'antes' : 'despues'}.pdf"`, 'Cache-Control': 'no-store' });
    res.end(Buffer.from(pdf));
  } finally {
    await browser.close();
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/' || p === '/comparar') return send(res, 200, fs.readFileSync(path.join(HERE, 'comparar.html')), TYPES['.html']);
    if (p.startsWith('/api/')) return proxyApi(req, res, url);
    if (p === '/pdf') return await renderPdf(res, url);
    const html = p.match(/^\/(antes\/)?([a-z0-9-]+\.html)$/i);
    if (html) {
      const file = html[2];
      if (!fs.existsSync(path.join(REPO, file))) return send(res, 404, 'No encontrado');
      const body = html[1]
        ? execSync(`git show ${BASE}:${file}`, { cwd: REPO, maxBuffer: 20 * 1024 * 1024 })
        : fs.readFileSync(path.join(REPO, file));
      return send(res, 200, body, TYPES['.html']);
    }
    // Estáticos del repo: solo imágenes/estilos, nunca ficheros ocultos
    const ext = path.extname(p).toLowerCase();
    const file = path.normalize(path.join(REPO, p.replace(/^\/antes\//, '/')));
    if (TYPES[ext] && ext !== '.html' && file.startsWith(REPO + path.sep) && !p.split('/').some(s => s.startsWith('.')) && fs.existsSync(file)) {
      return send(res, 200, fs.readFileSync(file), TYPES[ext]);
    }
    send(res, 404, 'No encontrado');
  } catch (e) {
    console.error(e);
    send(res, 500, String(e.message || e));
  }
});

server.listen(PORT, () => console.log(`Preview en http://localhost:${PORT}/comparar (antes = ${BASE}, después = árbol de trabajo)`));
