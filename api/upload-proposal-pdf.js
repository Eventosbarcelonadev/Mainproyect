// POST /api/upload-proposal-pdf
// Body: { proposalId, contactId?, pdfBase64 }
//
// Sube el PDF de la propuesta (generado cliente-side con html2pdf) al bucket
// `propuestas-pdf` en Supabase Storage, escribe el link en el custom field
// `url_propuesta_pdf` del contacto en GHL, y opcionalmente dispara la
// validación de la propuesta.
//
// Path: Propuesta_{contactId|proposalId}_{timestamp}.pdf

const URL_PROPUESTA_PDF_FIELD_ID = 'BNeWNg1iyKdIema6VnAG';
const SUPABASE_BUCKET = 'propuestas-pdf';

export const config = {
  api: { bodyParser: { sizeLimit: '12mb' } }
};

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
  if (!SB_URL || !SB_KEY || !GHL_TOKEN) {
    return res.status(500).json({ error: 'Missing env config' });
  }

  try {
    const { proposalId, contactId: contactIdInput, pdfBase64 } = req.body || {};
    if (!pdfBase64) return res.status(400).json({ error: 'pdfBase64 required' });
    if (!proposalId && !contactIdInput) {
      return res.status(400).json({ error: 'proposalId or contactId required' });
    }

    // Resolver contactId desde la propuesta si no viene en body
    let contactId = contactIdInput || null;
    if (!contactId && proposalId) {
      const r = await fetch(
        `${SB_URL}/rest/v1/proposals?id=eq.${encodeURIComponent(proposalId)}&select=ghl_contact_id&limit=1`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );
      const rows = await r.json();
      contactId = rows[0]?.ghl_contact_id || null;
    }

    // 1. Decodificar y subir a Supabase Storage
    const cleanB64 = String(pdfBase64).replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(cleanB64, 'base64');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const stamp = contactId || proposalId || 'sin-contacto';
    const path = `Propuesta_${stamp}_${ts}.pdf`;

    const upRes = await fetch(`${SB_URL}/storage/v1/object/${SUPABASE_BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/pdf',
        'x-upsert': 'true'
      },
      body: buffer
    });
    if (!upRes.ok) {
      const txt = await upRes.text();
      return res.status(500).json({ error: `Storage ${upRes.status}`, details: txt.slice(0, 200) });
    }
    const publicUrl = `${SB_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${path}`;

    // 2. Escribir url_propuesta_pdf en el contacto GHL (si tenemos contactId)
    let ghlSync = { ok: false, reason: 'no_contact_id' };
    if (contactId) {
      const ghlRes = await fetch(`${GHL_API}/contacts/${contactId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GHL_TOKEN}`,
          Version: '2021-07-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customFields: [{ id: URL_PROPUESTA_PDF_FIELD_ID, field_value: publicUrl }]
        })
      });
      ghlSync = { ok: ghlRes.ok, status: ghlRes.status };
    }

    // 3. Guardar también el path/url en la fila de proposals (auditoría)
    if (proposalId) {
      await fetch(`${SB_URL}/rest/v1/proposals?id=eq.${encodeURIComponent(proposalId)}`, {
        method: 'PATCH',
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pdf_url: publicUrl, pdf_path: path })
      }).catch(() => {}); // columna pdf_url puede no existir aún — no bloquear
    }

    return res.status(200).json({
      success: true,
      url: publicUrl,
      path,
      contactId,
      ghlSync
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
