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
  const HEADERS = {
    'Authorization': `Bearer ${TOKEN}`,
    'Version': '2021-07-28',
    'Content-Type': 'application/json'
  };

  try {
    const data = req.body;

    // Build tags array
    const tags = ['tipo:cliente', 'origen:web-formulario'];

    // Event type tag
    const eventTagMap = {
      'Cena de gala': 'evento:gala',
      'Cocktail / Welcome drink': 'evento:cocktail',
      'Lanzamiento de producto': 'evento:lanzamiento',
      'Convencion / Congreso': 'evento:convencion',
      'Entrega de premios': 'evento:premios',
      'Family Day corporativo': 'evento:familyday',
      'Fiesta tematica': 'evento:fiesta-tematica',
      'Fiesta de empresa': 'evento:fiesta-empresa',
      'Otro': 'evento:otro'
    };
    if (data.tipoEvento && eventTagMap[data.tipoEvento]) {
      tags.push(eventTagMap[data.tipoEvento]);
    }

    // Format tag
    const formatTagMap = {
      'Show de escenario': 'formato:escenario',
      'Ambient / entre mesas': 'formato:ambient'
    };
    if (data.formatoShow && formatTagMap[data.formatoShow]) {
      tags.push(formatTagMap[data.formatoShow]);
    }

    // Category tags
    const catTagMap = {
      'Danza': 'cat:danza',
      'Musica': 'cat:musica',
      'Circo': 'cat:circo',
      'WOW Effect': 'cat:wow-effect'
    };
    if (data.categorias && Array.isArray(data.categorias)) {
      data.categorias.forEach(cat => {
        if (catTagMap[cat]) tags.push(catTagMap[cat]);
      });
    }

    // Budget tag
    const budgetTagMap = {
      '< 5.000€': 'budget:<5k',
      '5.000 - 10.000€': 'budget:5-10k',
      '10.000 - 25.000€': 'budget:10-25k',
      '> 25.000€': 'budget:25k+'
    };
    if (data.presupuesto && budgetTagMap[data.presupuesto]) {
      tags.push(budgetTagMap[data.presupuesto]);
    }

    // Production tag
    if (data.necesitaProduccion) {
      tags.push('produccion:solicitada');
    }

    // 1. Create/update contact
    const contactBody = {
      locationId: LOC,
      firstName: data.nombre || '',
      email: data.email || '',
      phone: data.telefono || '',
      companyName: data.empresa || '',
      tags: tags,
      customFields: [
        { key: 'tipo_de_evento', field_value: data.tipoEvento || '' },
        { key: 'formato_show', field_value: data.formatoShow || '' },
        { key: 'categorias_artisticas', field_value: (data.categorias || []).join(', ') },
        { key: 'subcategorias_artisticas', field_value: (data.subcategorias || []).join(', ') },
        { key: 'fecha_evento', field_value: data.fechaEvento || '' },
        { key: 'num_asistentes', field_value: data.numAsistentes || '' },
        { key: 'ubicacion_hotel', field_value: data.ubicacion || '' },
        { key: 'presupuesto_aproximado', field_value: data.presupuesto || '' },
        { key: 'necesita_produccion', field_value: data.necesitaProduccion ? 'Si' : 'No' },
        { key: 'como_nos_conocio', field_value: data.comoNosConocio || '' },
        { key: 'comentarios_cliente', field_value: data.comentarios || '' }
      ]
    };

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

    // 2. Create opportunity in pipeline
    const oppBody = {
      locationId: LOC,
      pipelineId: PIPELINE,
      pipelineStageId: STAGE,
      contactId: contactId,
      name: `${data.nombre || 'Lead'} — ${data.tipoEvento || 'Evento'}`,
      status: 'open',
      monetaryValue: 0
    };

    const oppRes = await fetch(`${API}/opportunities/`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(oppBody)
    });
    const oppData = await oppRes.json();

    // 3. Create contact in Holded
    let holdedId = null;
    try {
      const holdedBody = {
        name: data.empresa || data.nombre || '',
        email: data.email || '',
        phone: data.telefono || '',
        type: 'client',
        tags: tags,
        notes: [
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
          phone: data.telefono || ''
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
      holdedId: holdedId
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
