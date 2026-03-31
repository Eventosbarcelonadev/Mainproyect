export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const API = 'https://services.leadconnectorhq.com';
  const TOKEN = process.env.GHL_API_KEY;
  const LOC = process.env.GHL_LOCATION_ID;
  const PIPELINE = process.env.GHL_PIPELINE_ARTISTAS;
  const STAGE = process.env.GHL_STAGE_SOLICITUD_RECIBIDA;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const HEADERS = {
    'Authorization': `Bearer ${TOKEN}`,
    'Version': '2021-07-28',
    'Content-Type': 'application/json'
  };

  try {
    const data = req.body;
    const isUpdate = !!data._token; // Form sends _token when pre-filled

    // Determine contact type based on selected disciplines
    const disciplinas = data.disciplinas || [];
    const hasProveedor = disciplinas.includes('Proveedores');
    const hasArtista = disciplinas.some(d => d !== 'Proveedores' && d !== 'Otro');
    const tipoContacto = hasProveedor && hasArtista ? 'Artista/Proveedor'
      : hasProveedor ? 'Proveedor' : 'Artista';

    // Build tags
    const tags = [
      hasProveedor && !hasArtista ? 'tipo:proveedor' : hasProveedor ? 'tipo:artista/proveedor' : 'tipo:artista',
      'origen:web-formulario'
    ];

    // Discipline tags
    const catTagMap = {
      'Danza': 'cat:danza',
      'Musica': 'cat:musica',
      'Circo': 'cat:circo',
      'WOW Effect': 'cat:wow-effect',
      'Proveedores': 'cat:proveedor'
    };
    if (Array.isArray(disciplinas)) {
      disciplinas.forEach(d => {
        if (catTagMap[d]) tags.push(catTagMap[d]);
      });
    }

    // Format tag
    const formatTagMap = {
      'Show de escenario': 'formato:escenario',
      'Itinerante': 'formato:itinerante'
    };
    if (data.formatoShow && formatTagMap[data.formatoShow]) {
      tags.push(formatTagMap[data.formatoShow]);
    }

    // 1. Create/update contact
    const contactBody = {
      locationId: LOC,
      firstName: data.nombre || '',
      email: data.email || '',
      phone: data.telefono || '',
      city: data.ciudad || '',
      tags: tags,
      customFields: [
        { key: 'tipo_contacto', field_value: tipoContacto },
        { key: 'disciplina_artistica', field_value: (data.disciplinas || []).join(', ') },
        { key: 'subcategorias_artista', field_value: (data.subcategorias || []).join(', ') },
        { key: 'formato_show_artista', field_value: data.formatoShow || '' },
        { key: 'nombre_artistico', field_value: data.nombreArtistico || '' },
        { key: 'nombre_compania', field_value: data.compania || '' },
        { key: 'bio_show', field_value: data.bioShow || '' },
        { key: 'show_unico', field_value: (data.showUnico || []).join(', ') },
        { key: 'link_video_1', field_value: data.video1 || '' },
        { key: 'link_video_2', field_value: data.video2 || '' },
        { key: 'link_web_rrss', field_value: data.webRrss || '' },
        { key: 'rider_tecnico', field_value: data.riderTecnico || '' },
        { key: 'rango_cache', field_value: data.rangoCache || '' },
        { key: 'num_artistas_show', field_value: data.numArtistas || '' },
        { key: 'duracion_show', field_value: data.duracionShow || '' },
        { key: 'fotos_urls', field_value: (data.fotosUrls || []).join('\n') },
        { key: 'shows_adicionales', field_value: data.showsAdicionales || '' },
        { key: 'acepto_privacidad', field_value: data.aceptoPrivacidad ? 'Si' : 'No' },
        { key: 'acepto_visibilidad', field_value: data.aceptoVisibilidad ? 'Si' : 'No' }
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

    // 2. Create opportunity in Artistas pipeline (only for NEW submissions, not updates)
    let oppId = null;
    if (!isUpdate) {
      const oppBody = {
        locationId: LOC,
        pipelineId: PIPELINE,
        pipelineStageId: STAGE,
        contactId: contactId,
        name: `${data.nombreArtistico || data.compania || data.nombre || tipoContacto} — ${disciplinas.join(', ')}`,
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

    // 3. Create contact in Holded (as supplier/proveedor) — only for new submissions
    let holdedId = null;
    if (!isUpdate) {
      try {
        const holdedBody = {
          name: data.nombreArtistico || data.compania || data.nombre || '',
          email: data.email || '',
          phone: data.telefono || '',
          type: 'supplier',
          tags: tags,
          notes: [
            data.disciplinas?.length ? `Disciplinas: ${data.disciplinas.join(', ')}` : '',
            data.subcategorias?.length ? `Subcategorías: ${data.subcategorias.join(', ')}` : '',
            data.formatoShow ? `Formato: ${data.formatoShow}` : '',
            data.bioShow ? `Bio: ${data.bioShow}` : '',
            data.rangoCache ? `Caché: ${data.rangoCache}` : '',
            data.numArtistas ? `Nº artistas: ${data.numArtistas}` : '',
            data.duracionShow ? `Duración: ${data.duracionShow}` : '',
            data.video1 ? `Video 1: ${data.video1}` : '',
            data.video2 ? `Video 2: ${data.video2}` : '',
            data.webRrss ? `Web/RRSS: ${data.webRrss}` : ''
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
        console.error('Holded sync error:', holdedErr.message);
      }
    }

    // 4. Upsert to Supabase (always — creates or updates by email)
    let supabaseToken = data._token || null;
    if (SUPABASE_URL && SUPABASE_KEY) {
      try {
        const supabaseRow = {
          nombre: data.nombre || '',
          nombre_artistico: data.nombreArtistico || '',
          compania: data.compania || '',
          email: data.email || '',
          telefono: data.telefono || '',
          ciudad: data.ciudad || '',
          disciplinas: data.disciplinas || [],
          subcategorias: data.subcategorias || [],
          formato_show: data.formatoShow || '',
          bio_show: data.bioShow || '',
          show_unico: data.showUnico || [],
          video1: data.video1 || '',
          video2: data.video2 || '',
          web_rrss: data.webRrss || '',
          rider_tecnico: data.riderTecnico || '',
          fotos_urls: data.fotosUrls || [],
          rango_cache: data.rangoCache || '',
          num_artistas: data.numArtistas || '',
          duracion_show: data.duracionShow || '',
          shows_adicionales: data.showsAdicionales ? JSON.parse(data.showsAdicionales || '[]') : [],
          acepto_privacidad: data.aceptoPrivacidad || false,
          acepto_visibilidad: data.aceptoVisibilidad || false,
          ghl_contact_id: contactId,
          holded_id: holdedId,
          origen: isUpdate ? 'actualizacion-formulario' : 'web-formulario'
        };

        // Upsert by email — on conflict update all fields
        const sbRes = await fetch(
          `${SUPABASE_URL}/rest/v1/artistas`,
          {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates,return=representation'
            },
            body: JSON.stringify(supabaseRow)
          }
        );
        const sbData = await sbRes.json();
        if (Array.isArray(sbData) && sbData[0]?.token) {
          supabaseToken = sbData[0].token;
        }
      } catch (sbErr) {
        console.error('Supabase sync error:', sbErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      contactId: contactId,
      opportunityId: oppId,
      holdedId: holdedId,
      supabaseToken: supabaseToken,
      updated: isUpdate
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
