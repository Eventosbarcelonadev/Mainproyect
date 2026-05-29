// Validar una propuesta. Llamado desde:
//   - Workflow GHL cuando Xavi marca opportunity.validar_propuesta="validada por Xavi"
//     → body: { opportunityId } o { contactId } (legacy)
//   - Botón "Validar" en /admin (panel interno) → body: { proposalId }
//   - Botón "Aprobar presupuesto" en vista cliente de la propuesta
//     → body: { proposalId, clientConfirm: true } → solo añade tag `Won`
//       al contacto y devuelve (sin tocar opp, status ni tag `proposal`).
//
// Efectos (modo normal):
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
    const clientConfirm = !!req.body?.clientConfirm;

    if (!contactId && !opportunityId && !proposalId) {
      return res.status(400).json({ error: 'opportunityId, contactId or proposalId required' });
    }

    // Modo "cliente aprueba": solo añadir tag `Won` al contacto de la propuesta.
    if (clientConfirm) {
      if (!proposalId) return res.status(400).json({ error: 'proposalId required for clientConfirm' });
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/proposals?id=eq.${encodeURIComponent(proposalId)}&select=id,ghl_contact_id,ghl_opportunity_id,client_email&limit=1`,
        { headers: sbHeaders }
      );
      const p = (await r.json())[0];
      if (!p) return res.status(404).json({ error: 'Proposal not found', proposalId });

      // Si no hay ghl_contact_id, intentar resolverlo por email en GHL
      // (backfill: propuestas creadas antes de tener el FK guardado).
      let cId = p.ghl_contact_id;
      if (!cId && p.client_email) {
        try {
          const s = await fetch(
            `${GHL_API}/contacts/search/duplicate?locationId=${LOC}&email=${encodeURIComponent(p.client_email)}`,
            { headers: HEADERS }
          );
          const sd = await s.json();
          cId = sd.contact?.id || null;
          if (cId) {
            await fetch(`${SUPABASE_URL}/rest/v1/proposals?id=eq.${p.id}`, {
              method: 'PATCH',
              headers: sbHeaders,
              body: JSON.stringify({ ghl_contact_id: cId, updated_at: new Date().toISOString() })
            });
          }
        } catch (e) { console.error('clientConfirm: contact lookup failed', e.message); }
      }
      if (!cId) return res.status(400).json({ error: 'No contact match for client email', email: p.client_email || null });

      const tagRes = await fetch(`${GHL_API}/contacts/${cId}/tags`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ tags: ['Won'] })
      });
      if (!tagRes.ok) {
        const text = await tagRes.text();
        return res.status(502).json({ error: 'GHL tag failed', status: tagRes.status, detail: text.slice(0, 300) });
      }
      return res.status(200).json({
        success: true,
        clientConfirm: true,
        proposalId: p.id,
        contactId: cId,
        opportunityId: p.ghl_opportunity_id || null
      });
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

      // La URL validada (que va al CLIENTE) tiene que ser distinta a la del
      // generador (que es para XAVI):
      // - Quitar admin=1 → modo cliente, no editable. Spec Xavi 2026-05-29:
      //   "la propuesta validada debería ser la definitiva, no se debería
      //    poder editar y es la que aparece en el campo de propuesta validada".
      // - Agregar &lang= si la propuesta tiene lang guardado (para que el
      //   cliente la vea en el idioma correcto sin depender del redirect auto).
      const buildClientUrl = (sourceUrl, lang) => {
        if (!sourceUrl) return '';
        try {
          const u = new URL(sourceUrl);
          u.searchParams.delete('admin');
          if (lang === 'en' || lang === 'es') u.searchParams.set('lang', lang);
          return u.toString();
        } catch {
          // Fallback string-replace si por alguna razón sourceUrl no es URL válida
          let out = String(sourceUrl).replace(/[?&]admin=1/g, '').replace(/\?&/, '?');
          if (lang === 'en' || lang === 'es') {
            out += (out.includes('?') ? '&' : '?') + 'lang=' + lang;
          }
          return out;
        }
      };
      const urlValidada = buildClientUrl(urlGenerador, proposal.lang);

      const customFields = [
        { id: OPP_VALIDAR_PROPUESTA, field_value: 'validada por Xavi' }
      ];
      if (urlValidada) {
        customFields.push({ id: OPP_URL_PROPUESTA_VALIDADA, field_value: urlValidada });
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
