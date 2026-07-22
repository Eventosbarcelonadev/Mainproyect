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

  // De `origen` (referrer/UTM/fromParam) → slug corto legible para popular
  // contact.source y tag GHL. Ej. "danza/flamenco" → "flamenco".
  // Sirve para que Xavi vea de qué página de la web vino el lead sin tener
  // que pedir info al cliente. Replica el comportamiento del form viejo
  // (Elementor + WP) donde el formName ya identificaba la página.
  const buildOriginLabel = (origen) => {
    if (!origen || typeof origen !== 'object') return '';
    // Prioridad: fromParam explícito > último slug del path del referrer > utm_campaign > utm_source
    if (origen.fromParam) return String(origen.fromParam).trim();
    if (origen.referrerSlug) {
      const last = origen.referrerSlug.split('/').filter(Boolean).pop();
      if (last) return last;
    }
    if (origen.utm_campaign) return String(origen.utm_campaign).trim();
    if (origen.utm_source) return String(origen.utm_source).trim();
    return '';
  };
  const buildSource = (origen, baseLabel) => {
    const slug = buildOriginLabel(origen);
    return slug ? `${baseLabel} · ${slug}` : baseLabel;
  };
  const buildOriginNote = (origen) => {
    if (!origen || typeof origen !== 'object') return '';
    const lines = ['📍 Origen del lead'];
    if (origen.referrer) lines.push(`Referrer: ${origen.referrer}`);
    if (origen.referrerSlug) lines.push(`Página: ${origen.referrerSlug}`);
    if (origen.landingUrl) lines.push(`Landing: ${origen.landingUrl}`);
    const utms = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
      .filter(k => origen[k]).map(k => `${k}=${origen[k]}`);
    if (utms.length) lines.push(`UTM: ${utms.join(', ')}`);
    if (origen.fromParam) lines.push(`From: ${origen.fromParam}`);
    return lines.length > 1 ? lines.join('\n') : '';
  };
  // Custom fields UTM estructurados en GHL (creados 2026-07-22 via A15).
  // Cada key coincide con el fieldKey del custom field (contact.<key>) creado
  // por API — GHL acepta `key` en el mismo formato que los picklists (contact_*).
  const buildUtmCustomFields = (origen) => {
    if (!origen || typeof origen !== 'object') return [];
    const fields = [];
    const map = {
      utm_source: 'utm_source',
      utm_medium: 'utm_medium',
      utm_campaign: 'utm_campaign',
      utm_term: 'utm_term',
      utm_content: 'utm_content',
      landingUrl: 'landing_page'
    };
    for (const [srcKey, ghlKey] of Object.entries(map)) {
      const val = origen[srcKey];
      if (val) fields.push({ key: ghlKey, field_value: String(val) });
    }
    return fields;
  };
  const postContactNote = async (contactId, body) => {
    if (!contactId || !body) return;
    try {
      await fetch(`${API}/contacts/${contactId}/notes`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ body })
      });
    } catch (e) { console.error('Note post error:', e.message); }
  };
  const addContactTag = async (contactId, tag) => {
    if (!contactId || !tag) return;
    try {
      await fetch(`${API}/contacts/${contactId}/tags`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ tags: [tag] })
      });
    } catch (e) { console.error('Tag add error:', e.message); }
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
      const originSlug = buildOriginLabel(data.origen);
      const partialSourceLabel = buildSource(data.origen, 'Form Cliente - Partial');
      const partialTags = ['new_lead', `lang:${lang}`];
      if (originSlug) partialTags.push(`pagina:${originSlug}`);
      const contactBody = {
        locationId: LOC,
        firstName: data.nombre || '',
        email: data.email || '',
        phone: data.telefono || '',
        companyName: data.empresa || '',
        website: data.webEmpresa || '',
        tags: partialTags,
        source: partialSourceLabel,
        customFields: [
          { key: 'contact_type', field_value: 'Cliente' },
          { key: 'contact_idioma', field_value: lang === 'en' ? 'English' : 'Español' },
          { key: 'contact_score', field_value: 'COLD' },
          ...(data.cargo ? [{ key: 'cargo', field_value: data.cargo }] : []),
          ...buildUtmCustomFields(data.origen)
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
          monetaryValue: 0,
          source: partialSourceLabel
        };

        const oppRes = await fetch(`${API}/opportunities/`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(oppBody)
        });
        const oppData = await oppRes.json();
        oppId = oppData.opportunity?.id || null;
      }

      // Nota timeline con el origen completo (referrer + UTMs) para que Xavi
      // pueda ver de qué página vino el lead sin tener que preguntar.
      const noteBody = buildOriginNote(data.origen);
      if (noteBody) await postContactNote(contactId, noteBody);

      return res.status(200).json({
        success: true,
        partial: true,
        contactId: contactId,
        opportunityId: oppId
      });
    }

    const originSlug = buildOriginLabel(data.origen);
    const sourceLabel = buildSource(data.origen, 'Form Cliente');
    const tags = ['new_lead', `lang:${lang}`];
    if (originSlug) tags.push(`pagina:${originSlug}`);
    const score = computeClienteScore(data);

    // 1. Create/update contact
    // url_generador_propuesta vive ahora en OPPORTUNITY (no en contact) — spec 2026-05-12.
    const contactBody = {
      locationId: LOC,
      firstName: data.nombre || '',
      email: data.email || '',
      phone: data.telefono || '',
      companyName: data.empresa || '',
      website: data.webEmpresa || '',
      tags: tags,
      source: sourceLabel,
      customFields: [
        { key: 'contact_type', field_value: 'Cliente' },
        { key: 'contact_idioma', field_value: lang === 'en' ? 'English' : 'Español' },
        { key: 'contact_score', field_value: score },
        ...(data.cargo ? [{ key: 'cargo', field_value: data.cargo }] : []),
        ...buildUtmCustomFields(data.origen)
      ]
    };

    // La URL del generador se construye SOLO desde `data` (no depende del id
    // de la propuesta). Por eso se calcula ANTES y fuera del try de Supabase:
    // si el insert falla, la URL igual tiene que llegar a la opportunity.
    // Bug 2026-07-13 (Sanjeev De): proposalUrl estaba atado a spData[0]?.id,
    // así que cualquier fallo de Supabase dejaba la opp sin url_generador.
    const proposalData = btoa(encodeURIComponent(JSON.stringify(data)));
    const langParam = lang === 'en' ? '&lang=en' : '';
    const proposalUrl = `${SITE_URL}/propuesta.html?mode=auto&data=${proposalData}${langParam}`;

    // Save proposal to Supabase
    let proposalId = null;
    if (SUPABASE_URL && SUPABASE_KEY) {
      try {

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
        } else {
          console.error('Proposal save: sin id en la respuesta', JSON.stringify(spData).slice(0, 200));
        }
      } catch (e) {
        console.error('Proposal save error:', e.message);
      }
    }

    // (url_generador_propuesta se añade al opportunity más abajo, no al contact)

    // Upsert del contacto CON REINTENTO. Si esto falla, abajo se hace early
    // return y el lead se queda sin url_generador_propuesta en la opportunity
    // (la propuesta ya quedó creada en Supabase → huérfana). Un fallo
    // transitorio de GHL (429/5xx) rompía el lead entero, en silencio.
    // Bug 2026-07-13 (Sanjeev De). 3 intentos con backoff.
    let contactData = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const contactRes = await fetch(`${API}/contacts/upsert`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(contactBody)
        });
        contactData = await contactRes.json();
        if (contactData?.contact?.id) break;
        console.error(`contacts/upsert intento ${attempt + 1} sin id:`, contactRes.status, JSON.stringify(contactData).slice(0, 200));
      } catch (e) {
        console.error(`contacts/upsert intento ${attempt + 1} error:`, e.message);
      }
      if (attempt < 2) await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }

    if (!contactData?.contact?.id) {
      // Devolvemos la URL igual: aunque GHL falle, el lead ya tiene su
      // propuesta en Supabase y Xavi puede abrirla con este link.
      console.error('contacts/upsert falló tras 3 intentos — lead sin sync GHL');
      return res.status(500).json({
        error: 'Failed to create contact',
        details: contactData,
        proposalId,
        proposalUrl
      });
    }

    const contactId = contactData.contact.id;
    const isExistingContact = !(contactData.new === true || contactData.isNew === true);

    // Spec: si contacto ya existía, notificar a Xavi (workflow GHL)
    if (isExistingContact) await triggerNotifyXavi(contactId);

    // Guardrail: si el contacto ya existía, forzar PUT explícito de contact_type
    // a Cliente. Cubre el caso en que el lead había llegado antes como Artista
    // o Proveedor y GHL no propaga el override via upsert.
    if (isExistingContact) {
      try {
        await fetch(`${API}/contacts/${contactId}`, {
          method: 'PUT',
          headers: HEADERS,
          body: JSON.stringify({
            source: sourceLabel,
            customFields: [
              { key: 'contact_type', field_value: 'Cliente' }
            ]
          })
        });
      } catch (e) { console.error('Force PUT contact_type=Cliente error:', e.message); }
    }

    // Tag pagina:<slug> (idempotente — GHL ignora duplicados de tag).
    if (originSlug) await addContactTag(contactId, `pagina:${originSlug}`);

    // Nota timeline con el origen completo. Aparece en el feed del contacto
    // para que Xavi vea de qué página vino el lead sin tener que preguntar.
    const originNote = buildOriginNote(data.origen);
    if (originNote) await postContactNote(contactId, originNote);


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
    // Los picklists tienen valores fijos en GHL (todos en ES) — si el form viene
    // en EN, traducimos al string exacto del picklist para que GHL lo acepte.
    const TIPO_EVENTO_EN_TO_ES = {
      'Gala dinner': 'Cena de gala',
      'Cocktail / Welcome drink': 'Cocktail / Welcom drink',
      'Product launch': 'Lanzamiento de producto',
      'Convention / Conference': 'Convencion / Congreso',
      'Awards ceremony': 'Entrega de premios',
      'Corporate Family Day': 'Family Day corporativo',
      'Themed party': 'Fiesta tematica',
      'Company party': 'Fiesta de empresa',
      'Other': 'Otro'
    };
    const FORMATO_EN_TO_ES = {
      'Stage show': 'Show de escenario',
      'Ambient / strolling': 'Ambient / entre mesas',
      'Full event management': 'Gestión integral'
    };
    const tipoEventoNorm = TIPO_EVENTO_EN_TO_ES[data.tipoEvento] || data.tipoEvento;
    const formatoNorm = FORMATO_EN_TO_ES[data.formatoShow] || data.formatoShow;

    const oppCustomFields = [];
    if (tipoEventoNorm) oppCustomFields.push({ key: 'tipo_de_evento', field_value: [tipoEventoNorm] });
    if (data.fechaEvento) oppCustomFields.push({ key: 'fecha_evento', field_value: data.fechaEvento });
    if (data.numAsistentes) oppCustomFields.push({ key: 'numero_asistentes', field_value: parseInt(data.numAsistentes, 10) || 0 });
    if (data.ubicacion) oppCustomFields.push({ key: 'ciudad_evento', field_value: data.ubicacion });
    if (formatoNorm) oppCustomFields.push({ key: 'formato_espectaculo', field_value: formatoNorm });
    // estilos_artisticos pasó de CHECKBOX → LARGE_TEXT (2026-05-13) para que
    // el template de propuesta {{opportunity.estilos_artisticos}} lo muestre como lista.
    const estilos = [...(data.categorias || []), ...(data.subcategorias || [])];
    if (estilos.length) oppCustomFields.push({ key: 'estilos_artisticos', field_value: estilos.join('\n') });
    oppCustomFields.push({ key: 'produccion_tecnica_necesaria', field_value: data.necesitaProduccion ? 'si' : 'no' });
    if (data.comentarios) oppCustomFields.push({ key: 'comentarios_adicionales', field_value: data.comentarios });
    if (data.comoNosConocio) oppCustomFields.push({ key: 'como_nos_conocio', field_value: data.comoNosConocio });
    if (proposalUrl) oppCustomFields.push({ key: 'url_generador_propuesta', field_value: proposalUrl });

    // presupuesto del form ("< 5.000€", "5.000 - 10.000€", "€10,000 - €25,000"...) →
    // opp.monetaryValue (no es un custom field). Promedio del rango si tiene 2 números.
    // Acepta tanto "." (ES) como "," (EN) como separador de miles.
    const parseBudget = (s) => {
      const nums = (String(s || '').match(/\d[\d.,]*/g) || [])
        .map(x => parseInt(x.replace(/[.,]/g, ''), 10))
        .filter(Boolean);
      if (!nums.length) return 0;
      if (nums.length === 1) return nums[0];
      return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
    };
    const monetaryValue = parseBudget(data.presupuesto);

    // PUT /opportunities/{id} NO acepta locationId/pipelineId/contactId
    // (devuelve 422 "property locationId should not exist"). Por eso los
    // bodies de POST y PUT son distintos.
    const oppName = data.empresa || data.nombre || 'Lead';
    const oppBodyPost = {
      locationId: LOC,
      pipelineId: PIPELINE,
      pipelineStageId: STAGE,
      contactId: contactId,
      name: oppName,
      status: 'open',
      monetaryValue: monetaryValue,
      source: sourceLabel,
      customFields: oppCustomFields
    };
    const oppBodyPut = {
      pipelineStageId: STAGE,
      name: oppName,
      status: 'open',
      monetaryValue: monetaryValue,
      customFields: oppCustomFields
    };

    const oppRes = await fetch(
      existingOppId ? `${API}/opportunities/${existingOppId}` : `${API}/opportunities/`,
      {
        method: existingOppId ? 'PUT' : 'POST',
        headers: HEADERS,
        body: JSON.stringify(existingOppId ? oppBodyPut : oppBodyPost)
      }
    );
    const oppData = await oppRes.json();
    if (!oppRes.ok) {
      console.error('Opportunity', existingOppId ? 'PUT' : 'POST', 'failed:', oppRes.status, JSON.stringify(oppData).slice(0, 300));
    }
    const opportunityId = oppData.opportunity?.id || existingOppId || null;

    // Linkear ghl_contact_id/opportunity_id en la fila de proposals.
    // validate-proposal.js los necesita para resolver desde workflow GHL.
    if (proposalId && SUPABASE_URL && SUPABASE_KEY) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/proposals?id=eq.${encodeURIComponent(proposalId)}`, {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ghl_contact_id: contactId,
            ghl_opportunity_id: opportunityId
          })
        });
      } catch (e) { console.error('Link proposal→ghl error:', e.message); }
    }

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
      opportunityId: opportunityId,
      holdedId: holdedId,
      proposalId: proposalId,
      proposalUrl: proposalUrl
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
