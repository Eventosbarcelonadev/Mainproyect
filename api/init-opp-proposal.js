// POST /api/init-opp-proposal
// Body: { opportunityId } (también acepta contactId como fallback)
//
// Configura una opportunity recién creada (manual o por workflow) para que tenga
// url_generador_propuesta apuntando al builder de propuesta.
//
// Pasos:
//   1. Resolver contact desde la opp
//   2. Crear (o reusar) una proposal en Supabase con datos básicos extraídos
//      de los custom fields de la opp (tipo_evento, fecha, asistentes, ciudad,
//      formato, estilos, presupuesto)
//   3. PUT opportunity con url_generador_propuesta = propuesta.html?id=<proposalId>
//
// Trigger esperado: workflow GHL "Opportunity Created (Pipeline Clientes)"
// → Webhook POST a este endpoint con body `{ "opportunityId": "{{opportunity.id}}" }`.

const GHL_API = 'https://services.leadconnectorhq.com';
// IDs custom fields opportunity (GHL GET devuelve solo {id, fieldValue} — sin key)
const OPP_URL_GENERADOR_PROPUESTA = 'LJMLhmfJN6W9xHZFXVpB';
const OPP_TIPO_EVENTO            = 'kM1ru1CRbgMCq7rLbCGt';
const OPP_FECHA_EVENTO           = 'vNUbgACM4fzO9te0pdyU';
const OPP_NUMERO_ASISTENTES      = 'zN0Dx77QRdTYZ9MqEKQs';
const OPP_CIUDAD_EVENTO          = 'kERM4ww6ih27aj4aNySH';
const OPP_FORMATO_ESPECTACULO    = 'myX4ePJw0hkrrGi8aTHY';
const OPP_ESTILOS_ARTISTICOS     = 'Y3CacQG4d9rl8T9l0zmS';
// ID custom field contact
const CONTACT_IDIOMA             = 'sz3cgYEWMZ0ysmmFxffE';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const TOKEN = process.env.GHL_API_KEY;
  const LOC = process.env.GHL_LOCATION_ID;
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  const SITE_URL = process.env.SITE_URL || 'https://propuestas.eventosbarcelona.com';

  if (!TOKEN || !LOC || !SB_URL || !SB_KEY) {
    return res.status(500).json({ error: 'Missing env config' });
  }

  const GH = {
    Authorization: `Bearer ${TOKEN}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json'
  };
  const SB = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    const body = req.body || {};
    // GHL workflow webhook default payload trae info del contact en top-level
    // y mete el custom data del workflow en `customData`. Buscar también ahí.
    const cd = body.customData || {};
    const td = body.triggerData || {};
    const opportunityId =
      body.opportunityId ||
      body.opportunity_id ||
      body.opportunityID ||
      body.id ||
      body.opportunity?.id ||
      cd.opportunityId ||
      cd.opportunity_id ||
      cd.id ||
      td.opportunityId ||
      td.opportunity_id ||
      td.id ||
      req.query?.opportunityId ||
      req.query?.id;

    if (!opportunityId) {
      console.error('init-opp-proposal: missing opportunityId.',
        'Body keys:', Object.keys(body),
        '  customData:', JSON.stringify(cd).slice(0, 300),
        '  triggerData:', JSON.stringify(td).slice(0, 300));
      return res.status(400).json({
        error: 'opportunityId required',
        hint: 'En GHL Workflow Webhook activa "Custom Data" y pega { "opportunityId": "{{opportunity.id}}" }',
        receivedKeys: Object.keys(body),
        customDataKeys: Object.keys(cd),
        triggerDataKeys: Object.keys(td)
      });
    }

    // 1. Read opportunity
    const oppRes = await fetch(`${GHL_API}/opportunities/${opportunityId}`, { headers: GH });
    if (!oppRes.ok) return res.status(oppRes.status).json({ error: 'Failed to read opp', status: oppRes.status });
    const oppJson = await oppRes.json();
    const opp = oppJson.opportunity;
    if (!opp) return res.status(404).json({ error: 'Opportunity not found' });

    const contactId = opp.contactId || opp.contact?.id;
    if (!contactId) return res.status(400).json({ error: 'Opportunity has no contact' });

    // 2. Extraer custom fields conocidos (GHL devuelve {id, fieldValue})
    const cf = (opp.customFields || []);
    const cfById = (id) => {
      const f = cf.find(x => x.id === id);
      return f?.fieldValue ?? f?.field_value ?? '';
    };
    const alreadyHasUrl = cfById(OPP_URL_GENERADOR_PROPUESTA);
    const tipoEventoArr = cfById(OPP_TIPO_EVENTO);
    const tipoEvento    = Array.isArray(tipoEventoArr) ? tipoEventoArr[0] : (tipoEventoArr || '');
    const fechaEvento   = cfById(OPP_FECHA_EVENTO);
    const numAsistentes = cfById(OPP_NUMERO_ASISTENTES);
    const ciudadEvento  = cfById(OPP_CIUDAD_EVENTO);

    // 3. Read contact for lang/name/email/phone
    const cRes = await fetch(`${GHL_API}/contacts/${contactId}`, { headers: GH });
    const cJson = await cRes.json();
    const contact = cJson.contact || {};
    const idiomaVal = (contact.customFields || []).find(f => f.id === CONTACT_IDIOMA)?.value;
    const lang = idiomaVal === 'English' ? 'en' : 'es';

    // 4. Buscar proposal existente para esta opp (idempotencia)
    let proposalId = null;
    const findRes = await fetch(
      `${SB_URL}/rest/v1/proposals?ghl_opportunity_id=eq.${encodeURIComponent(opportunityId)}&order=created_at.desc&limit=1&select=id`,
      { headers: SB }
    );
    const found = await findRes.json();
    if (found[0]?.id) proposalId = found[0].id;

    if (!proposalId) {
      // 5. Crear nueva proposal a partir de los customs de la opp
      const proposalRow = {
        status: 'revision',
        lang,
        client_name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.firstName || '',
        client_company: contact.companyName || '',
        client_email: contact.email || '',
        client_phone: contact.phone || '',
        event_name: `${tipoEvento || 'Evento'} — ${contact.companyName || contact.firstName || 'Cliente'}`,
        event_type: tipoEvento,
        event_date: fechaEvento || '',
        event_guests: parseInt(numAsistentes, 10) || 0,
        event_location: ciudadEvento || '',
        category: 'shows',
        concept_title: '',
        concept_text: '',
        shows: JSON.stringify([]),
        ghl_contact_id: contactId,
        ghl_opportunity_id: opportunityId
      };
      const createRes = await fetch(`${SB_URL}/rest/v1/proposals`, {
        method: 'POST',
        headers: { ...SB, Prefer: 'return=representation' },
        body: JSON.stringify(proposalRow)
      });
      const created = await createRes.json();
      if (!createRes.ok || !created[0]?.id) {
        return res.status(500).json({ error: 'Failed to create proposal', details: created });
      }
      proposalId = created[0].id;
    }

    // 6. Generar URL del builder y escribir en opp
    const builderUrl = `${SITE_URL}/propuesta.html?id=${proposalId}&admin=1`;
    if (alreadyHasUrl && alreadyHasUrl === builderUrl) {
      return res.status(200).json({ success: true, proposalId, opportunityId, url: builderUrl, skipped: 'already_set' });
    }

    const putRes = await fetch(`${GHL_API}/opportunities/${opportunityId}`, {
      method: 'PUT',
      headers: GH,
      body: JSON.stringify({
        customFields: [{ id: OPP_URL_GENERADOR_PROPUESTA, field_value: builderUrl }]
      })
    });
    const putOk = putRes.ok;
    if (!putOk) console.error('PUT opp failed:', putRes.status, (await putRes.text()).slice(0, 200));

    return res.status(200).json({
      success: true,
      proposalId,
      opportunityId,
      contactId,
      url: builderUrl,
      ghlPut: { ok: putOk, status: putRes.status }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
