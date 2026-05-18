const GHL_API = 'https://services.leadconnectorhq.com';
// Custom field id en el modelo OPPORTUNITY (no contact). Spec 2026-05-12.
const OPP_URL_PROPUESTA_VALIDADA = '40FFHGx5fYeV3VOK0yC4';

async function writeValidatedUrlToGHL(opportunityId, email, validatedUrl) {
  const TOKEN = process.env.GHL_API_KEY;
  const LOC = process.env.GHL_LOCATION_ID;
  if (!TOKEN || !LOC) return { ok: false, reason: 'missing_config' };

  const HEADERS = {
    'Authorization': `Bearer ${TOKEN}`,
    'Version': '2021-07-28',
    'Content-Type': 'application/json'
  };

  // Resolver opportunityId si no viene (fallback por email del contacto)
  let oppId = opportunityId || null;
  if (!oppId && email) {
    const searchRes = await fetch(
      `${GHL_API}/contacts/search/duplicate?locationId=${LOC}&email=${encodeURIComponent(email)}`,
      { headers: HEADERS }
    );
    const searchData = await searchRes.json();
    const contactId = searchData.contact?.id;
    if (!contactId) return { ok: false, reason: 'contact_not_found' };
    const oppSearch = await fetch(
      `${GHL_API}/opportunities/search?location_id=${LOC}&contact_id=${contactId}`,
      { headers: HEADERS }
    );
    const oppData = await oppSearch.json();
    oppId = (oppData.opportunities || [])[0]?.id;
  }
  if (!oppId) return { ok: false, reason: 'opportunity_not_found' };

  const updateRes = await fetch(`${GHL_API}/opportunities/${oppId}`, {
    method: 'PUT',
    headers: HEADERS,
    body: JSON.stringify({
      customFields: [{ id: OPP_URL_PROPUESTA_VALIDADA, field_value: validatedUrl }]
    })
  });
  return { ok: updateRes.ok, status: updateRes.status, opportunityId: oppId };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const baseUrl = process.env.PROPUESTA_BASE_URL
    || (req.headers.host ? `https://${req.headers.host}` : '');

  // Reintenta un write a Supabase eliminando la columna si Postgres responde
  // "column X does not exist" (mientras la migración aún no haya corrido).
  async function sbWriteWithFallback(url, method, headers, row) {
    let body = { ...row };
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
      if (res.ok) return res;
      const text = await res.clone().text();
      const m = text.match(/column "?([a-zA-Z_]+)"? does not exist/i)
            || text.match(/Could not find the '([a-zA-Z_]+)' column/i);
      if (!m || !(m[1] in body)) return res;
      console.warn(`save-proposal: drop "${m[1]}" (column missing)`);
      delete body[m[1]];
    }
    return await fetch(url, { method, headers, body: JSON.stringify(body) });
  }

  try {
    const data = req.body;

    const row = {
      status: data.status || 'revision',
      lang: data.lang === 'en' ? 'en' : 'es',
      client_name: data.client?.name || '',
      client_company: data.client?.company || '',
      client_email: data.client?.email || '',
      client_phone: data.client?.phone || '',
      event_name: data.event?.name || '',
      event_type: data.event?.type || '',
      event_date: data.event?.date || '',
      event_guests: data.event?.guests || 0,
      event_location: data.event?.location || '',
      category: data.category || 'shows',
      concept_title: data.concept?.title || '',
      concept_text: data.concept?.text || '',
      hero_sub: data.heroSub || '',
      hero_image_url: data.heroImageUrl || null,
      shows: JSON.stringify(data.shows || []),
      global_margin: data.globalMargin || 0,
      hide_summary: !!data.hideSummary,
      ghl_contact_id: data.ghlContactId || null,
      ghl_opportunity_id: data.ghlOpportunityId || null
    };

    // If updating existing proposal
    if (data.id) {
      row.updated_at = new Date().toISOString();
      if (data.status === 'approved') {
        row.approved_at = new Date().toISOString();
        row.approved_by = 'admin';
      }

      const updateRes = await sbWriteWithFallback(
        `${SUPABASE_URL}/rest/v1/proposals?id=eq.${data.id}`,
        'PATCH',
        {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        row
      );
      const updated = await updateRes.json();

      let ghlSync;
      if (data.status === 'approved' && baseUrl) {
        const validatedUrl = `${baseUrl}/propuesta.html?id=${data.id}`;
        ghlSync = await writeValidatedUrlToGHL(data.ghlOpportunityId, data.client?.email, validatedUrl);
      }

      return res.status(200).json({ success: true, id: data.id, proposal: updated[0], ghlSync });
    }

    // Create new proposal
    const createRes = await sbWriteWithFallback(
      `${SUPABASE_URL}/rest/v1/proposals`,
      'POST',
      {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      row
    );
    const created = await createRes.json();

    if (!created[0]?.id) {
      return res.status(500).json({ error: 'Failed to create proposal', details: created });
    }

    let ghlSync;
    if (data.status === 'approved' && baseUrl) {
      const validatedUrl = `${baseUrl}/propuesta.html?id=${created[0].id}`;
      ghlSync = await writeValidatedUrlToGHL(data.ghlOpportunityId, data.client?.email, validatedUrl);
    }

    return res.status(200).json({
      success: true,
      id: created[0].id,
      url: `/propuesta.html?id=${created[0].id}`,
      ghlSync
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
