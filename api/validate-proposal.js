// Validar una propuesta. Llamado desde:
//   - Workflow GHL cuando Xavi marca opportunity.validar_propuesta="validada por Xavi"
//     → body: { opportunityId } o { contactId } (legacy)
//   - Botón "Validar" en /admin (panel interno) → body: { proposalId }
//
// Efectos:
//   1. Marca la propuesta como `approved` en Supabase
//   2. Copia opportunity.url_generador_propuesta → opportunity.url_propuesta_validada
//   3. Setea opportunity.validar_propuesta = "validada por Xavi" (idempotente)
//   4. Añade tag `proposal` al contacto en GHL
//   5. Actualiza opportunity.monetaryValue con la suma de shows aprobados

const GHL_API = 'https://services.leadconnectorhq.com';
// IDs de custom fields del modelo opportunity (creados en GHL Eventos Barcelona)
const OPP_URL_GENERADOR_PROPUESTA = 'LJMLhmfJN6W9xHZFXVpB';
const OPP_URL_PROPUESTA_VALIDADA = '40FFHGx5fYeV3VOK0yC4';
const OPP_VALIDAR_PROPUESTA = 'KwcgWEA7CXsYH6LwTzKj';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const TOKEN = process.env.GHL_API_KEY;
  const LOC = process.env.GHL_LOCATION_ID;
  const PIPELINE_CLIENTES = process.env.GHL_PIPELINE_CLIENTES;
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

  const sbHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    let contactId = req.body?.contactId || req.body?.contact_id || null;
    let opportunityId = req.body?.opportunityId || req.body?.opportunity_id || null;
    const proposalId = req.body?.proposalId || req.body?.proposal_id || null;

    if (!contactId && !opportunityId && !proposalId) {
      return res.status(400).json({ error: 'opportunityId, contactId or proposalId required' });
    }

    // 1. Resolver propuesta
    let proposal;
    if (proposalId) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/proposals?id=eq.${encodeURIComponent(proposalId)}&limit=1`,
        { headers: sbHeaders }
      );
      proposal = (await r.json())[0];
      if (!proposal) return res.status(404).json({ error: 'Proposal not found', proposalId });
      contactId = contactId || proposal.ghl_contact_id;
      opportunityId = opportunityId || proposal.ghl_opportunity_id;
    } else if (opportunityId) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/proposals?ghl_opportunity_id=eq.${encodeURIComponent(opportunityId)}&order=created_at.desc&limit=1`,
        { headers: sbHeaders }
      );
      proposal = (await r.json())[0];
      if (!proposal) return res.status(404).json({ error: 'No proposal for opportunity', opportunityId });
      contactId = contactId || proposal.ghl_contact_id;
    } else {
      // Solo contactId (workflow legacy) — buscar última propuesta del contacto
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/proposals?ghl_contact_id=eq.${encodeURIComponent(contactId)}&order=created_at.desc&limit=1`,
        { headers: sbHeaders }
      );
      proposal = (await r.json())[0];
      if (!proposal) return res.status(404).json({ error: 'No proposal for contact', contactId });
      opportunityId = proposal.ghl_opportunity_id;
    }

    // 2. Si seguimos sin opportunityId, buscar la opp abierta del contact en pipeline clientes
    if (!opportunityId && contactId && PIPELINE_CLIENTES) {
      const r = await fetch(
        `${GHL_API}/opportunities/search?location_id=${LOC}&contact_id=${contactId}&pipeline_id=${PIPELINE_CLIENTES}`,
        { headers: HEADERS }
      );
      const d = await r.json();
      opportunityId = (d.opportunities || [])[0]?.id || null;
    }

    // 3. Leer opportunity para obtener url_generador_propuesta y calcular nuevo monetaryValue
    let urlGenerador = '';
    if (opportunityId) {
      const r = await fetch(`${GHL_API}/opportunities/${opportunityId}`, { headers: HEADERS });
      const d = await r.json();
      const cf = (d.opportunity?.customFields || []);
      const f = cf.find(x => x.id === OPP_URL_GENERADOR_PROPUESTA);
      urlGenerador = f?.fieldValue || f?.field_value || f?.value || '';
    }

    // 4. Marcar propuesta approved en Supabase
    await fetch(
      `${SUPABASE_URL}/rest/v1/proposals?id=eq.${proposal.id}`,
      {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: 'Xavi',
          updated_at: new Date().toISOString()
        })
      }
    );

    // 5. Update opportunity: url_propuesta_validada + validar_propuesta + monetaryValue
    let oppSync = { ok: false };
    if (opportunityId) {
      // Sumar base_price de los shows aprobados (proposal.shows es JSON con [{id, base_price}, ...])
      let monetaryValue = 0;
      try {
        const shows = typeof proposal.shows === 'string' ? JSON.parse(proposal.shows) : (proposal.shows || []);
        monetaryValue = shows.reduce((s, x) => s + (parseFloat(x.base_price || x.price || 0) || 0), 0);
      } catch (_) {}

      const customFields = [
        { id: OPP_VALIDAR_PROPUESTA, field_value: 'validada por Xavi' }
      ];
      if (urlGenerador) {
        customFields.push({ id: OPP_URL_PROPUESTA_VALIDADA, field_value: urlGenerador });
      }
      const oppBody = { customFields };
      if (monetaryValue > 0) oppBody.monetaryValue = monetaryValue;

      const r = await fetch(`${GHL_API}/opportunities/${opportunityId}`, {
        method: 'PUT',
        headers: HEADERS,
        body: JSON.stringify(oppBody)
      });
      oppSync = { ok: r.ok, status: r.status };
      if (!r.ok) console.error('Opp PUT failed:', r.status, (await r.text()).slice(0, 200));
    }

    // 6. Tag `proposal` al contacto (idempotente)
    if (contactId) {
      try {
        await fetch(`${GHL_API}/contacts/${contactId}/tags`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({ tags: ['proposal'] })
        });
      } catch (tagErr) { console.error('Tag proposal error:', tagErr.message); }
    }

    return res.status(200).json({
      success: true,
      proposalId: proposal.id,
      contactId,
      opportunityId,
      urlValidada: urlGenerador,
      oppSync
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
