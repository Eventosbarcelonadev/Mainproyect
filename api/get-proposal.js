import { esEquipo } from '../lib/sesion-admin.js';

// La vista cliente no necesita el margen ni los ids de GHL. Se le manda el
// precio final de cada show y de cada extra, con el margen ya aplicado, y
// margen 0: propuesta.html pinta exactamente las mismas cifras (getAdjustedPrice
// con 0 deja el número como está) y el lead no ve cuánto se sube sobre tarifa.
// Los shows sin currentPrice salen en la página con el base_price del catálogo
// activo, igual que hace applyShowOverrides; aquí se resuelven de la misma forma.
async function precioFinalCliente(p, shows, sbGet) {
  const margen = Number(p.global_margin) || 0;
  const conMargen = (v) => Math.round((Number(v) || 0) * (1 + margen / 100));
  const lista = (Array.isArray(shows) ? shows : []).map(s => (s && typeof s === 'object') ? { ...s } : { id: s });

  const sinPrecio = lista.filter(s => !s.currentPrice && s.id).map(s => s.id);
  const tarifa = {};
  if (sinPrecio.length) {
    const ids = sinPrecio.map(id => `"${String(id).replace(/"/g, '')}"`).join(',');
    const filas = await sbGet(`shows?id=in.(${encodeURIComponent(ids)})&status=eq.active&select=id,base_price`);
    for (const f of Array.isArray(filas) ? filas : []) tarifa[f.id] = f.base_price || 0;
  }

  return lista.map(s => {
    const base = s.currentPrice || tarifa[s.id];
    const fuera = { ...s };
    delete fuera.base_price;
    delete fuera.basePrice;
    if (base != null) fuera.currentPrice = conMargen(base);
    if (Array.isArray(s.extras)) fuera.extras = s.extras.map(ex => ({ ...ex, amount: conMargen(ex && ex.amount) }));
    return fuera;
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing proposal ID' });

  try {
    const fetchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/proposals?id=eq.${encodeURIComponent(id)}&select=*`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    const rows = await fetchRes.json();

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const p = rows[0];

    // Format for frontend
    const proposal = {
      id: p.id,
      status: p.status,
      lang: p.lang || 'es',
      client: {
        name: p.client_name,
        company: p.client_company,
        email: p.client_email,
        phone: p.client_phone
      },
      event: {
        name: p.event_name,
        type: p.event_type,
        date: p.event_date,
        guests: p.event_guests,
        location: p.event_location
      },
      category: p.category,
      concept: {
        title: p.concept_title,
        text: p.concept_text
      },
      heroSub: p.hero_sub,
      heroSubEn: p.hero_sub_en || null,
      conceptTitleEn: p.concept_title_en || null,
      conceptTextEn: p.concept_text_en || null,
      heroImageUrl: p.hero_image_url || null,
      shows: typeof p.shows === 'string' ? JSON.parse(p.shows) : p.shows,
      globalMargin: p.global_margin,
      hideSummary: !!p.hide_summary,
      conditions: Array.isArray(p.conditions) ? p.conditions : null,
      createdAt: p.created_at,
      approvedAt: p.approved_at,
      // pdf_url: lo usa el botón "Descargar PDF" de la vista cliente en las
      // propuestas validadas. Sin esto el front lo regeneraba cada vez aunque
      // el PDF ya existiera en Storage. (Xavi 2026-07-17)
      pdf_url: p.pdf_url || null,
      ghl_contact_id: p.ghl_contact_id,
      ghl_opportunity_id: p.ghl_opportunity_id
    };

    if (!(await esEquipo(req))) {
      const sbGet = (path) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      }).then(r => r.json());
      proposal.shows = await precioFinalCliente(p, proposal.shows, sbGet);
      proposal.globalMargin = 0;
      delete proposal.ghl_contact_id;
      delete proposal.ghl_opportunity_id;
    }

    return res.status(200).json({ success: true, proposal });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
