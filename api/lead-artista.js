export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const API = 'https://services.leadconnectorhq.com';
  const TOKEN = process.env.GHL_API_KEY;
  const LOC = process.env.GHL_LOCATION_ID;
  const PIPELINE_ARTISTAS = process.env.GHL_PIPELINE_ARTISTAS;
  const STAGE_ARTISTAS = process.env.GHL_STAGE_SOLICITUD_RECIBIDA;
  const PIPELINE_PROVEEDORES = process.env.GHL_PIPELINE_PROVEEDORES;
  const STAGE_PROVEEDORES = process.env.GHL_STAGE_PROVEEDOR_NUEVO;
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

  // Heurística para clasificar artistas/proveedores en High/Mid/Low por completitud
  // y profesionalidad del perfil. Reemplazable por LLM más adelante.
  const computeArtistaScore = (data) => {
    let s = 0;
    if (data.nombreArtistico || data.compania) s += 1;
    if (typeof data.bioShow === 'string' && data.bioShow.length > 100) s += 1;
    if (data.video1) s += 1;
    if (data.video2) s += 1;
    if (data.rangoCache) s += 1;
    if (data.formatoShow) s += 1;
    if (data.duracionShow) s += 1;
    if (Array.isArray(data.fotosUrls) && data.fotosUrls.length >= 2) s += 1;
    if (data.webRrss) s += 1;
    if (data.aceptoVisibilidad) s += 1;
    if (s >= 7) return 'HOT';
    if (s >= 4) return 'WARM';
    return 'COLD';
  };

  try {
    const data = req.body;
    const isUpdate = !!data._token; // Form sends _token when pre-filled
    const lang = (data.lang === 'en') ? 'en' : 'es';

    // Determine contact type based on selected disciplines
    const disciplinas = data.disciplinas || [];
    const hasProveedor = disciplinas.includes('Proveedores');
    const tipoContacto = hasProveedor ? 'Proveedor' : 'Artista';

    // Tag por tipo: new_artist o new_supplier (brief 2026-05-08).
    // En isUpdate (artista actualiza su perfil) no añadir tags nuevos.
    const tags = isUpdate ? [] : [tipoContacto === 'Proveedor' ? 'new_supplier' : 'new_artist'];
    const score = computeArtistaScore(data);

    // 1. Create/update contact
    //    url_supabase se setea con PUT tras el upsert a Supabase (apunta al panel /admin).
    const contactBody = {
      locationId: LOC,
      firstName: data.nombre || '',
      email: data.email || '',
      phone: data.telefono || '',
      city: data.ciudad || '',
      tags: tags,
      customFields: [
        { key: 'contact_type', field_value: tipoContacto },
        { key: 'contact_origen', field_value: 'form' },
        { key: 'contact_idioma', field_value: lang === 'en' ? 'English' : 'Español' },
        { key: 'contact_score', field_value: score },
        { key: 'nombre_artista', field_value: data.nombreArtistico || data.compania || '' },
        { key: 'categoria_artista', field_value: disciplinas.join(', ') },
        { key: 'subcategoria_artista', field_value: (data.subcategorias || []).join(', ') },
        { key: 'descripcion_del_espectaculo', field_value: data.bioShow || '' },
        { key: 'formato_del_show', field_value: data.formatoShow ? [data.formatoShow] : [] },
        { key: 'acepto_politica_privacidad', field_value: data.aceptoPrivacidad ? 'Sí' : 'No' },
        { key: 'acepto_visibilidad_web_rrss', field_value: data.aceptoVisibilidad ? 'Sí' : 'No' }
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

    // 2. Create opportunity in Artistas o Proveedores pipeline según tipoContacto
    let oppId = null;
    if (!isUpdate) {
      const isProveedor = tipoContacto === 'Proveedor';

      // Custom fields del Opportunity (compartidos entre Artistas y Proveedores).
      // categoria_artista vs categoria_proveedor según el tipo.
      const oppCustomFields = [];
      if (data.nombreArtistico || data.compania) {
        oppCustomFields.push({ key: 'nombre_artistico', field_value: data.nombreArtistico || data.compania });
      }
      if (disciplinas.length) {
        oppCustomFields.push({
          key: isProveedor ? 'categoria_proveedor' : 'categoria_artista',
          field_value: disciplinas.join(', ')
        });
      }
      if (data.formatoShow) oppCustomFields.push({ key: 'formato_espectaculo', field_value: data.formatoShow });
      if (data.bioShow) oppCustomFields.push({ key: 'comentarios_adicionales', field_value: data.bioShow });

      const oppBody = {
        locationId: LOC,
        pipelineId: isProveedor ? PIPELINE_PROVEEDORES : PIPELINE_ARTISTAS,
        pipelineStageId: isProveedor ? STAGE_PROVEEDORES : STAGE_ARTISTAS,
        contactId: contactId,
        name: `${data.nombreArtistico || data.compania || data.nombre || tipoContacto} — ${disciplinas.join(', ')}`,
        status: 'open',
        monetaryValue: 0,
        customFields: oppCustomFields
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
