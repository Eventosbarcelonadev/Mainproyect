export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const API = 'https://services.leadconnectorhq.com';
  const TOKEN = process.env.GHL_API_KEY;
  const LOC = process.env.GHL_LOCATION_ID;
  const PIPELINE = process.env.GHL_PIPELINE_CLIENTES;
  const STAGE = process.env.GHL_STAGE_NEW_LEAD;
  const WORKFLOW_NOTIFY = process.env.GHL_WORKFLOW_NOTIFY_EXISTING_LEAD;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const SITE_URL = process.env.SITE_URL || 'https://eventos-barcelona.vercel.app';
  const HEADERS = {
    'Authorization': `Bearer ${TOKEN}`,
    'Version': '2021-07-28',
    'Content-Type': 'application/json'
  };

  const triggerNotifyXavi = async (contactId) => {
    if (!WORKFLOW_NOTIFY || !contactId) return;
    try {
      await fetch(`${API}/contacts/${contactId}/workflow/${WORKFLOW_NOTIFY}`, { method: 'POST', headers: HEADERS });
    } catch (e) { console.error('Notify Xavi workflow error:', e.message); }
  };

  // Heurística para clasificar leads cliente en High/Mid/Low.
  // Señales: presupuesto, nº asistentes, dominio email, empresa, cargo decision-maker.
  // Reemplazable por LLM más adelante si compensa el coste por lead.
  const computeClienteScore = (data) => {
    let s = 0;
    const presupuesto = String(data.presupuesto || '').toLowerCase();
    if (/100\.?000|200\.?000|500\.?000|millón|millon|\bm\b|\+/.test(presupuesto)) s += 3;
    else if (/50\.?000|20\.?000-?50|30\.?000|40\.?000/.test(presupuesto)) s += 2;
    else if (/5\.?000|10\.?000|15\.?000/.test(presupuesto)) s += 1;
    const asistentes = parseInt(String(data.numAsistentes || '').replace(/[^\d]/g, ''), 10) || 0;
    if (asistentes >= 500) s += 2;
    else if (asistentes >= 200) s += 1;
    const email = String(data.email || '').toLowerCase();
    if (email && !/@(gmail|yahoo|hotmail|outlook|live|icloud|aol|protonmail)\./.test(email)) s += 1;
    if (data.empresa) s += 1;
    if (/director|cmo|ceo|head|chief|gerente|founder|presidente|owner/.test(String(data.cargo || '').toLowerCase())) s += 1;
    if (s >= 5) return 'HOT';
    if (s >= 2) return 'WARM';
    return 'COLD';
  };

  try {
    const data = req.body;
    const isPartial = data.partial === true;
    const lang = (data.lang === 'en') ? 'en' : 'es';

    // Partial submit: lead abandonó el form tras el paso 1 (datos de contacto)
    if (isPartial) {
      const contactBody = {
        locationId: LOC,
        firstName: data.nombre || '',
        email: data.email || '',
        phone: data.telefono || '',
        companyName: data.empresa || '',
        website: data.webEmpresa || '',
        tags: ['new_lead', 'missing_info'],
        customFields: [
          { key: 'contact_type', field_value: 'Cliente' },
          { key: 'contact_origen', field_value: 'form' },
          { key: 'contact_idioma', field_value: lang === 'en' ? 'English' : 'Español' },
          { key: 'contact_score', field_value: 'COLD' }
        ]
      };

      const contactRes = await fetch(`${API}/contacts/upsert`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(contactBody)
      });
      const contactData = await contactRes.json();

      if (!contactData.contact?.id) {
        return res.status(500).json({ error: 'Failed to create partial contact', details: contactData });
      }

      const contactId = contactData.contact.id;

      // Solo crear oportunidad si el contacto es nuevo (evita duplicar en reintentos).
      // La opp se crea en stage New Lead (el pipeline ya no tiene "Missing Info"
      // — Xavi pidió que todo aterrice en New Lead). El nombre es solo el del
      // cliente/empresa, sin sufijo "Info incompleta". Si el lead nunca completa
      // el flow extendido, queda en New Lead para que Xavi/Ramiro la trabajen.
      let oppId = null;
      if (contactData.new === true || contactData.isNew === true) {
        const oppBody = {
          locationId: LOC,
          pipelineId: PIPELINE,
          pipelineStageId: STAGE,
          contactId: contactId,
          name: data.empresa || data.nombre || 'Lead',
          status: 'open',
          monetaryValue: 0
        };

        const oppRes = await fetch(`${API}/opportunities/`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(oppBody)
        });
        const oppData = await oppRes.json();
        oppId = oppData.opportunity?.id || null;
      }

      return res.status(200).json({
        success: true,
        partial: true,
        contactId: contactId,
        opportunityId: oppId
      });
    }

    const tags = ['new_lead'];
    const score = computeClienteScore(data);

    // 1. Create/update contact
    const contactBody = {
      locationId: LOC,
      firstName: data.nombre || '',
      email: data.email || '',
      phone: data.telefono || '',
      companyName: data.empresa || '',
      website: data.webEmpresa || '',
      tags: tags,
      customFields: [
        { key: 'contact_type', field_value: 'Cliente' },
        { key: 'contact_origen', field_value: 'form' },
        { key: 'contact_idioma', field_value: lang === 'en' ? 'English' : 'Español' },
        { key: 'contact_score', field_value: score },
        { key: 'url_propuesta', field_value: '' }
      ]
    };

    // Save proposal to Supabase and get URL
    let proposalId = null;
    let proposalUrl = '';
    if (SUPABASE_URL && SUPABASE_KEY) {
      try {
        // Build proposal data with auto-matched shows encoded
        const proposalData = btoa(encodeURIComponent(JSON.stringify(data)));
        const langParam = lang === 'en' ? '&lang=en' : '';
        const adminUrl = `${SITE_URL}/propuesta.html?mode=auto&data=${proposalData}${langParam}`;

        // Save to Supabase
        const proposalRow = {
          status: 'revision',
          client_name: data.nombre || '',
          client_company: data.empresa || '',
          client_email: data.email || '',
          client_phone: data.telefono || '',
          event_name: `${data.tipoEvento || 'Evento'} — ${data.empresa || data.nombre || 'Cliente'}`,
          event_type: data.tipoEvento || '',
          event_date: data.fechaEvento || '',
          event_guests: parseInt(data.numAsistentes) || 0,
          event_location: data.ubicacion || '',
          category: 'shows',
          concept_title: '',
          concept_text: '',
          shows: JSON.stringify([])
        };

        const spRes = await fetch(`${SUPABASE_URL}/rest/v1/proposals`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(proposalRow)
        });
        const spData = await spRes.json();
        if (spData[0]?.id) {
          proposalId = spData[0].id;
          proposalUrl = adminUrl;
        }
      } catch (e) {
        console.error('Proposal save error:', e.message);
      }
    }

    // Add proposal URL to contact custom fields
    contactBody.customFields.find(f => f.key === 'url_propuesta').field_value = proposalUrl;

    const contactRes = await fetch(`${API}/contacts/upsert`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(contactBody)
    });
    const contactData = await contactRes.json();

    if (!contactData.contact?.id) {
      return res.status(500).json({ error: 'Failed to create contact', details: contactData });
    }

    const contactId = contactData.contact.id;
    const isExistingContact = !(contactData.new === true || contactData.isNew === true);

    // Spec: si contacto ya existía, notificar a Xavi (workflow GHL)
    if (isExistingContact) await triggerNotifyXavi(contactId);

    // Lead completó el formulario inteligente → quitar tag missing_info
    // (lo había puesto un partial submit previo o el webhook-elementor).
    try {
      await fetch(`${API}/contacts/${contactId}/tags`, {
        method: 'DELETE',
        headers: HEADERS,
        body: JSON.stringify({ tags: ['missing_info'] })
      });
    } catch (e) { console.error('Remove missing_info tag error:', e.message); }

    // 2. Find existing open opportunity for this contact (created by partial submit
    //    o reintento). Si existe, actualizar en lugar de crear duplicada.
    let existingOppId = null;
    try {
      const searchRes = await fetch(
        `${API}/opportunities/search?location_id=${LOC}&contact_id=${contactId}&pipeline_id=${PIPELINE}&status=open`,
        { method: 'GET', headers: HEADERS }
      );
      const searchData = await searchRes.json();
      const opps = searchData.opportunities || [];
      if (opps.length) existingOppId = opps[0].id;
    } catch (searchErr) {
      console.error('Opportunity search error:', searchErr.message);
    }

    // Vincular campos del form a custom fields del Opportunity (pipeline Clientes).
    // Los picklists tienen valores fijos en GHL — si el form manda algo distinto,
    // GHL ignora el valor pero no falla.
    const oppCustomFields = [];
    if (data.tipoEvento) oppCustomFields.push({ key: 'tipo_de_evento', field_value: [data.tipoEvento] });
    if (data.fechaEvento) oppCustomFields.push({ key: 'fecha_evento', field_value: data.fechaEvento });
    if (data.numAsistentes) oppCustomFields.push({ key: 'numero_asistentes', field_value: parseInt(data.numAsistentes, 10) || 0 });
    if (data.ubicacion) oppCustomFields.push({ key: 'ciudad_evento', field_value: data.ubicacion });
    if (data.formatoShow) oppCustomFields.push({ key: 'formato_espectaculo', field_value: data.formatoShow });
    const estilos = [...(data.categorias || []), ...(data.subcategorias || [])];
    if (estilos.length) oppCustomFields.push({ key: 'estilos_artisticos', field_value: estilos });
    oppCustomFields.push({ key: 'produccion_tecnica_necesaria', field_value: data.necesitaProduccion ? 'si' : 'no' });
    if (data.comentarios) oppCustomFields.push({ key: 'comentarios_adicionales', field_value: data.comentarios });
    if (data.presupuesto) oppCustomFields.push({ key: 'presupuesto', field_value: String(data.presupuesto) });
    if (data.comoNosConocio) oppCustomFields.push({ key: 'como_nos_conocio', field_value: data.comoNosConocio });

    const oppBody = {
      locationId: LOC,
      pipelineId: PIPELINE,
      pipelineStageId: STAGE,
      contactId: contactId,
      name: data.empresa || data.nombre || 'Lead',
      status: 'open',
      monetaryValue: 0,
      customFields: oppCustomFields
    };

    const oppRes = await fetch(
      existingOppId ? `${API}/opportunities/${existingOppId}` : `${API}/opportunities/`,
      {
        method: existingOppId ? 'PUT' : 'POST',
        headers: HEADERS,
        body: JSON.stringify(oppBody)
      }
    );
    const oppData = await oppRes.json();

    // 5. Create contact in Holded
    let holdedId = null;
    try {
      const holdedBody = {
        name: data.empresa || data.nombre || '',
        email: data.email || '',
        phone: data.telefono || '',
        type: 'client',
        tags: [],
        notes: [
          data.cargo ? `Cargo: ${data.cargo}` : '',
          data.webEmpresa ? `Web: ${data.webEmpresa}` : '',
          data.tipoEvento ? `Evento: ${data.tipoEvento}` : '',
          data.formatoShow ? `Formato: ${data.formatoShow}` : '',
          data.categorias?.length ? `Categorías: ${data.categorias.join(', ')}` : '',
          data.fechaEvento ? `Fecha: ${data.fechaEvento}` : '',
          data.numAsistentes ? `Asistentes: ${data.numAsistentes}` : '',
          data.ubicacion ? `Ubicación: ${data.ubicacion}` : '',
          data.presupuesto ? `Presupuesto: ${data.presupuesto}` : '',
          data.comentarios ? `Comentarios: ${data.comentarios}` : ''
        ].filter(Boolean).join('\n'),
        contactPersons: data.nombre ? [{
          name: data.nombre,
          email: data.email || '',
          phone: data.telefono || '',
          jobTitle: data.cargo || ''
        }] : []
      };

      const holdedRes = await fetch('https://api.holded.com/api/invoicing/v1/contacts', {
        method: 'POST',
        headers: { 'key': process.env.HOLDED_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(holdedBody)
      });
      const holdedData = await holdedRes.json();
      holdedId = holdedData.id || null;
    } catch (holdedErr) {
      // Holded sync is non-blocking — log but don't fail the request
      console.error('Holded sync error:', holdedErr.message);
    }

    return res.status(200).json({
      success: true,
      contactId: contactId,
      opportunityId: oppData.opportunity?.id || null,
      holdedId: holdedId,
      proposalId: proposalId,
      proposalUrl: proposalUrl
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
