// Validar una propuesta. Llamado desde:
//   - Workflow GHL cuando Xavi marca validacion_propuesta=true → body: { contactId }
//   - Botón en /admin (panel interno) → body: { proposalId }
//
// Efectos:
//   1. Marca la propuesta como `approved` en Supabase
//   2. Copia url_propuesta → url_propuesta_validada en GHL custom field
//   3. Setea validacion_propuesta = "Propuesta validada (por Xavi)" en GHL
//   4. Añade tag `proposal` al contacto en GHL

const GHL_API = 'https://services.leadconnectorhq.com';
const URL_PROPUESTA_VALIDADA_FIELD_ID = 'R1XtZUYECtUKmvPeKoXD';
const VALIDACION_PROPUESTA_FIELD_ID = 'T51SwWMj4QrQyu6wz3yU';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const TOKEN = process.env.GHL_API_KEY;
  const LOC = process.env.GHL_LOCATION_ID;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!TOKEN || !LOC || !SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Missing env config' });
  }

  const HEADERS = {
    'Authorization': `Bearer ${TOKEN}`,
    'Version': '2021-07-28',
    'Content-Type': 'application/json'
  };

  try {
    let contactId = req.body?.contactId || req.body?.contact_id || null;
    const proposalId = req.body?.proposalId || req.body?.proposal_id || null;

    if (!contactId && !proposalId) {
      return res.status(400).json({ error: 'contactId or proposalId required' });
    }

    // 1. Resolve proposal — by id (admin panel) or by ghl_contact_id (GHL workflow)
    let proposal;
    if (proposalId) {
      const spRes = await fetch(
        `${SUPABASE_URL}/rest/v1/proposals?id=eq.${encodeURIComponent(proposalId)}&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      proposal = (await spRes.json())[0];
      if (!proposal) return res.status(404).json({ error: 'Proposal not found', proposalId });
      contactId = contactId || proposal.ghl_contact_id;
    } else {
      const spRes = await fetch(
        `${SUPABASE_URL}/rest/v1/proposals?ghl_contact_id=eq.${encodeURIComponent(contactId)}&order=created_at.desc&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      proposal = (await spRes.json())[0];
      if (!proposal) return res.status(404).json({ error: 'No proposal found for contact', contactId });
    }

    // 2. Get contact from GHL to read url_propuesta custom field (may be missing if workflow path)
    let urlPropuesta = '';
    if (contactId) {
      const contactRes = await fetch(`${GHL_API}/contacts/${contactId}`, { headers: HEADERS });
      const contactData = await contactRes.json();
      const contact = contactData.contact;
      if (contact) {
        const urlPropuestaField = (contact.customFields || []).find((f) => f.key === 'url_propuesta');
        urlPropuesta = urlPropuestaField?.field_value || urlPropuestaField?.value || '';
      }
    }

    // 3. Mark proposal as approved
    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/proposals?id=eq.${proposal.id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: 'Xavi (GHL)',
          updated_at: new Date().toISOString()
        })
      }
    );

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      return res.status(500).json({ error: 'Failed to update proposal', details: errText });
    }

    // 4. Update GHL contact: url_propuesta_validada + validacion_propuesta + tag `proposal`
    let ghlSync = { ok: false };
    if (contactId) {
      const customFields = [
        { id: VALIDACION_PROPUESTA_FIELD_ID, field_value: ['Propuesta validada (por Xavi)'] }
      ];
      if (urlPropuesta) {
        customFields.push({ id: URL_PROPUESTA_VALIDADA_FIELD_ID, field_value: urlPropuesta });
      }
      const ghlRes = await fetch(`${GHL_API}/contacts/${contactId}`, {
        method: 'PUT',
        headers: HEADERS,
        body: JSON.stringify({ customFields })
      });
      ghlSync = { ok: ghlRes.ok, status: ghlRes.status };

      // Tag `proposal` (idempotente — POST de tag existente no falla)
      try {
        await fetch(`${GHL_API}/contacts/${contactId}/tags`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({ tags: ['proposal'] })
        });
      } catch (tagErr) {
        console.error('Tag proposal error:', tagErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      proposalId: proposal.id,
      contactId,
      urlPropuesta,
      ghlSync
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
