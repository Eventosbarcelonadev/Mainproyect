// Cliente confirma la propuesta desde la página pública. Añade tag `Won`
// al contacto en GHL → workflow GHL se encarga de mover la opp a stage Won.
//
// Body: { proposalId }

const GHL_API = 'https://services.leadconnectorhq.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const TOKEN = process.env.GHL_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Missing env config' });
  }

  const proposalId = req.body?.proposalId || req.body?.proposal_id || null;
  if (!proposalId) return res.status(400).json({ error: 'proposalId required' });

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
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/proposals?id=eq.${encodeURIComponent(proposalId)}&select=id,ghl_contact_id,ghl_opportunity_id,client_email&limit=1`,
      { headers: sbHeaders }
    );
    const proposal = (await r.json())[0];
    if (!proposal) return res.status(404).json({ error: 'Proposal not found', proposalId });

    const contactId = proposal.ghl_contact_id;
    if (!contactId) return res.status(400).json({ error: 'Proposal has no GHL contact' });

    const tagRes = await fetch(`${GHL_API}/contacts/${contactId}/tags`, {
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
      proposalId: proposal.id,
      contactId,
      opportunityId: proposal.ghl_opportunity_id || null
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
