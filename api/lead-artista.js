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
  const PIPELINE_CLIENTES = process.env.GHL_PIPELINE_CLIENTES;
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

  try {
    const data = req.body;
    const isUpdate = !!data._token; // Form sends _token when pre-filled
    const lang = (data.lang === 'en') ? 'en' : 'es';

    // Determine contact type based on selected disciplines
    const disciplinas = data.disciplinas || [];
    const hasProveedor = disciplinas.includes('Proveedores');
    const tipoContacto = hasProveedor ? 'Proveedor' : 'Artista';

    const tags = isUpdate ? [] : ['new_lead'];

    // Build resumen_ia from form data
    const resumenIa = [
      `Categoría: ${tipoContacto}`,
      disciplinas.length ? `Disciplinas: ${disciplinas.join(', ')}` : '',
      data.subcategorias?.length ? `Subcategorías: ${data.subcategorias.join(', ')}` : '',
      data.formatoShow ? `Formato: ${data.formatoShow}` : '',
      data.nombreArtistico ? `Nombre artístico: ${data.nombreArtistico}` : '',
      data.compania ? `Compañía: ${data.compania}` : '',
      data.rangoCache ? `Caché: ${data.rangoCache}` : '',
      data.numArtistas ? `Nº artistas: ${data.numArtistas}` : '',
      data.duracionShow ? `Duración: ${data.duracionShow}` : '',
      data.bioShow ? `Bio: ${data.bioShow}` : ''
    ].filter(Boolean).join(' | ');

    // 1. Create/update contact
    //    url_supabase no se setea aquí — se actualiza con PUT tras conocer el uuid del artista en Supabase
    //    para que apunte al panel admin (`/admin.html?artista=<uuid>`), no a la API REST cruda.
    const contactBody = {
      locationId: LOC,
      firstName: data.nombre || '',
      email: data.email || '',
      phone: data.telefono || '',
      city: data.ciudad || '',
      tags: tags,
      customFields: [
        { key: 'origen', field_value: 'Form' },
        { key: 'idioma', field_value: lang },
        { key: 'resumen_ia', field_value: resumenIa },
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
    const isExistingContact = !(contactData.new === true || contactData.isNew === true);

    // Spec: si form normal + contacto ya existía, notificar a Xavi (workflow GHL).
    // No notificar cuando es auto-update del artista actualizando su propio perfil (isUpdate)
    if (isExistingContact && !isUpdate) await triggerNotifyXavi(contactId);

    // 1b. Pivot from Cliente pipeline if this contact came from the cliente form
    //     (partial submit creates them as Cliente with info_incompleta tag).
    //     Mark any open Clientes opportunity as lost and clean up cliente-only tags.
    if (PIPELINE_CLIENTES) {
      try {
        const oppSearchRes = await fetch(
          `${API}/opportunities/search?location_id=${LOC}&contact_id=${contactId}&pipeline_id=${PIPELINE_CLIENTES}&status=open`,
          { method: 'GET', headers: HEADERS }
        );
        const oppSearchData = await oppSearchRes.json();
        const openClienteOpps = oppSearchData.opportunities || [];

        for (const opp of openClienteOpps) {
          await fetch(`${API}/opportunities/${opp.id}`, {
            method: 'PUT',
            headers: HEADERS,
            body: JSON.stringify({
              status: 'lost',
              name: `${opp.name || 'Lead'} — Cambió a artista`
            })
          });
        }

        // Limpieza pasiva: borrar tags rogue legacy si existen tras pivote cliente→artista
        if (openClienteOpps.length > 0) {
          await fetch(`${API}/contacts/${contactId}/tags`, {
            method: 'DELETE',
            headers: HEADERS,
            body: JSON.stringify({ tags: ['info_incompleta', 'info_completa', 'origen_form', 'tipo:cliente'] })
          });
        }
      } catch (pivotErr) {
        console.error('Cliente→Artista pivot error:', pivotErr.message);
      }
    }

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
        monetaryValue: 0,
        customFields: [
          { key: 'resumen_ia_opo', field_value: resumenIa }
        ]
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
          tags: [],
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
    let artistaId = null;
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
        if (Array.isArray(sbData) && sbData[0]) {
          if (sbData[0].token) supabaseToken = sbData[0].token;
          if (sbData[0].id) artistaId = sbData[0].id;
        }
      } catch (sbErr) {
        console.error('Supabase sync error:', sbErr.message);
      }
    }

    // 5. Update GHL contact with admin panel URL pointing to the artista in Supabase.
    //    Esta URL se usa desde el contacto en GHL para abrir la ficha del artista en /admin.
    if (artistaId) {
      try {
        await fetch(`${API}/contacts/${contactId}`, {
          method: 'PUT',
          headers: HEADERS,
          body: JSON.stringify({
            customFields: [
              { key: 'url_supabase', field_value: `${SITE_URL}/admin.html?artista=${artistaId}` }
            ]
          })
        });
      } catch (urlErr) {
        console.error('GHL url_supabase update error:', urlErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      contactId: contactId,
      opportunityId: oppId,
      holdedId: holdedId,
      supabaseToken: supabaseToken,
      artistaId: artistaId,
      updated: isUpdate
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
