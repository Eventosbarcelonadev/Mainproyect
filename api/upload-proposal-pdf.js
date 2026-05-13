// POST /api/upload-proposal-pdf
// Body: { proposalId, contactId?, pdfBase64 }
//
// 1. Sube el PDF (generado cliente-side con html2pdf) al bucket Supabase
//    `propuestas-pdf` con path Propuesta_{contactId|proposalId}_{timestamp}.pdf
// 2. Escribe el link público en custom field contact.url_propuesta_pdf
//    + añade nota en el contacto con el enlace (timeline visible).
// 3. Patchea pdf_url en proposals (auditoría).

const SUPABASE_BUCKET = 'propuestas-pdf';
// IDs custom fields (regenerados 2026-05-13 — ver memoria project_ghl_spec)
const CONTACT_URL_PROPUESTA_PDF = 'Ksk2gVtDGy8Ftc9Bu1cC';
const OPP_URL_PROPUESTA_PDF     = '65bFezateOokNxACijCW';

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
    const { proposalId, contactId: contactIdInput, opportunityId: oppIdInput, pdfBase64 } = req.body || {};
    if (!pdfBase64) return res.status(400).json({ error: 'pdfBase64 required' });
    if (!proposalId && !contactIdInput) {
      return res.status(400).json({ error: 'proposalId or contactId required' });
    }

    // Resolver contactId/opportunityId desde la propuesta si no vienen en body
    let contactId = contactIdInput || null;
    let opportunityId = oppIdInput || null;
    if ((!contactId || !opportunityId) && proposalId) {
      const r = await fetch(
        `${SB_URL}/rest/v1/proposals?id=eq.${encodeURIComponent(proposalId)}&select=ghl_contact_id,ghl_opportunity_id&limit=1`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );
      const rows = await r.json();
      contactId = contactId || rows[0]?.ghl_contact_id || null;
      opportunityId = opportunityId || rows[0]?.ghl_opportunity_id || null;
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

    // 2. Escribir url_propuesta_pdf en contact + opp + nota timeline
    let ghlSync = { ok: false, reason: 'no_contact_id' };
    const ghlHeaders = {
      Authorization: `Bearer ${GHL_TOKEN}`,
      Version: '2021-07-28',
      'Content-Type': 'application/json'
    };
    if (contactId) {
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
