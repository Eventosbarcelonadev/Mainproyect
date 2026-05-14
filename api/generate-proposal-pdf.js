// POST /api/generate-proposal-pdf
// Body: { proposalId }
//
// Genera el PDF de una propuesta en el servidor con Chromium headless
// (Puppeteer). A diferencia del antiguo html2pdf cliente-side:
//   - Las imágenes cargan desde un navegador real → sin problemas de CORS.
//   - La paginación la hace el motor del navegador → no corta texto.
//
// Flujo:
//   1. Navega a /propuesta.html?id={proposalId}&print=1 y espera __pdfReady.
//   2. page.pdf() en formato A4.
//   3. Sube el PDF al bucket Supabase `propuestas-pdf`.
//   4. Escribe la URL pública en el custom field contact/opp url_propuesta_pdf
//      + nota en el timeline del contacto.
//   5. Patchea pdf_url / pdf_path en la fila de proposals.

import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const SUPABASE_BUCKET = 'propuestas-pdf';
// IDs custom fields (ver memoria project_ghl_spec)
const CONTACT_URL_PROPUESTA_PDF = 'Ksk2gVtDGy8Ftc9Bu1cC';
const OPP_URL_PROPUESTA_PDF     = '65bFezateOokNxACijCW';

export const config = { maxDuration: 60 };

async function launchBrowser() {
  // En local se puede apuntar a un Chrome instalado vía env var.
  const localPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (localPath) {
    return puppeteer.launch({
      executablePath: localPath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1240, height: 1754, deviceScaleFactor: 2 },
    executablePath: await chromium.executablePath(),
    headless: chromium.headless
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const GHL_API = 'https://services.leadconnectorhq.com';
  const GHL_TOKEN = process.env.GHL_API_KEY;
  if (!SB_URL || !SB_KEY) {
    return res.status(500).json({ error: 'Missing env config' });
  }

  const { proposalId } = req.body || {};
  if (!proposalId) return res.status(400).json({ error: 'proposalId required' });

  // Base URL del deployment (la propia página que renderizamos).
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const baseUrl = process.env.PUBLIC_BASE_URL || `${proto}://${req.headers.host}`;
  const pageUrl = `${baseUrl}/propuesta.html?id=${encodeURIComponent(proposalId)}&print=1`;

  let browser;
  try {
    // 1. Resolver contacto/oportunidad de la propuesta
    const pr = await fetch(
      `${SB_URL}/rest/v1/proposals?id=eq.${encodeURIComponent(proposalId)}&select=ghl_contact_id,ghl_opportunity_id&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const prRows = await pr.json();
    if (!Array.isArray(prRows) || !prRows.length) {
      return res.status(404).json({ error: 'Proposal not found', proposalId });
    }
    const contactId = prRows[0].ghl_contact_id || null;
    const opportunityId = prRows[0].ghl_opportunity_id || null;

    // 2. Render + PDF con Chromium headless
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto(pageUrl, { waitUntil: 'networkidle0', timeout: 45000 });
    await page.waitForFunction('window.__pdfReady === true', { timeout: 30000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true
    });
    await browser.close();
    browser = null;

    // 3. Subir a Supabase Storage
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const stamp = contactId || proposalId;
    const path = `Propuesta_${stamp}_${ts}.pdf`;
    const upRes = await fetch(`${SB_URL}/storage/v1/object/${SUPABASE_BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/pdf',
        'x-upsert': 'true'
      },
      body: pdfBuffer
    });
    if (!upRes.ok) {
      const txt = await upRes.text();
      return res.status(500).json({ error: `Storage ${upRes.status}`, details: txt.slice(0, 200) });
    }
    const publicUrl = `${SB_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${path}`;

    // 4. Escribir url_propuesta_pdf en contact + opp + nota timeline
    let ghlSync = { ok: false, reason: 'no_contact_id' };
    if (contactId && GHL_TOKEN) {
      const ghlHeaders = {
        Authorization: `Bearer ${GHL_TOKEN}`,
        Version: '2021-07-28',
        'Content-Type': 'application/json'
      };
      const ops = [
        fetch(`${GHL_API}/contacts/${contactId}`, {
          method: 'PUT',
          headers: ghlHeaders,
          body: JSON.stringify({
            customFields: [{ id: CONTACT_URL_PROPUESTA_PDF, field_value: publicUrl }]
          })
        }),
        fetch(`${GHL_API}/contacts/${contactId}/notes`, {
          method: 'POST',
          headers: ghlHeaders,
          body: JSON.stringify({
            body: `Propuesta PDF generada: ${publicUrl}\nArchivo: ${path}`
          })
        })
      ];
      if (opportunityId) {
        ops.push(fetch(`${GHL_API}/opportunities/${opportunityId}`, {
          method: 'PUT',
          headers: ghlHeaders,
          body: JSON.stringify({
            customFields: [{ id: OPP_URL_PROPUESTA_PDF, field_value: publicUrl }]
          })
        }));
      }
      const results = await Promise.all(ops);
      ghlSync = {
        ok: results.every(r => r.ok),
        contactFieldStatus: results[0].status,
        noteStatus: results[1].status,
        oppFieldStatus: opportunityId ? results[2].status : null
      };
    }

    // 5. Guardar pdf_url / pdf_path en proposals
    await fetch(`${SB_URL}/rest/v1/proposals?id=eq.${encodeURIComponent(proposalId)}`, {
      method: 'PATCH',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pdf_url: publicUrl, pdf_path: path })
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      url: publicUrl,
      path,
      contactId,
      opportunityId,
      ghlSync
    });
  } catch (err) {
    if (browser) { try { await browser.close(); } catch (_) {} }
    return res.status(500).json({ error: err.message });
  }
}
