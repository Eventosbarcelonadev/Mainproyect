// Helper: crea automáticamente un show vinculado al artista cuando llega
// vía form web (1 artista = 1 show, Xavi 2026-05-26). Replica el patrón
// de autoCreateShowForArtista de api/admin.js — duplicado intencional
// porque las serverless functions de Vercel no comparten imports.
async function autoCreateShowForArtistaPublic(SB_URL, SB_KEY, artista) {
  if (!artista || !artista.id) return { error: 'artista without id' };
  const hdr = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
  const displayName = artista.nombre_artistico || artista.compania || artista.nombre || 'Show sin nombre';
  const slug = String(displayName).toLowerCase()
    .normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'show';

  // Si el artista YA tiene show vinculado (porque hizo update u otro intento),
  // no creamos otro. Devolver el existente.
  try {
    const existCheck = await fetch(
      `${SB_URL}/rest/v1/show_artistas?artista_id=eq.${encodeURIComponent(artista.id)}&select=show_id&limit=1`,
      { headers: hdr }
    );
    if (existCheck.ok) {
      const rows = await existCheck.json();
      if (rows.length) return { skipped: 'already_linked', show_id: rows[0].show_id };
    }
    const legacyCheck = await fetch(
      `${SB_URL}/rest/v1/shows?artista_id=eq.${encodeURIComponent(artista.id)}&select=id&limit=1`,
      { headers: hdr }
    );
    if (legacyCheck.ok) {
      const rows = await legacyCheck.json();
      if (rows.length) return { skipped: 'already_linked_legacy', show_id: rows[0].id };
    }
  } catch (e) { /* sigue al insert */ }

  // Dedup slug
  let showId = slug;
  try {
    const ex = await fetch(
      `${SB_URL}/rest/v1/shows?id=like.${encodeURIComponent(slug + '*')}&select=id`,
      { headers: hdr }
    );
    if (ex.ok) {
      const taken = new Set((await ex.json()).map(r => r.id));
      if (taken.has(showId)) {
        let n = 2;
        while (taken.has(`${slug}-${n}`)) n++;
        showId = `${slug}-${n}`;
      }
    }
  } catch (e) { /* sigue con slug */ }

  // Categoría derivada de disciplinas (mismo mapping que admin)
  const DISC_MAP = {
    danza: 'danza', musica: 'musica', 'música': 'musica',
    circo: 'circo', wow: 'wow', 'wow effect': 'wow', proveedores: null
  };
  let category = null;
  if (Array.isArray(artista.disciplinas) && artista.disciplinas.length) {
    const first = String(artista.disciplinas[0]).toLowerCase().trim();
    if (first in DISC_MAP) category = DISC_MAP[first];
  }

  // Propagar fotos del artista al show recién creado (sino la card queda vacía)
  const artistaFotos = Array.isArray(artista.fotos_urls) ? artista.fotos_urls.filter(Boolean) : [];

  const row = {
    id: showId,
    name: displayName,
    category,
    base_price: 0,
    status: 'pending_review',
    artista_id: artista.id,
    submitted_at: new Date().toISOString(),
    image_url: artistaFotos[0] || null,
    image_urls: artistaFotos.length ? artistaFotos : null
  };
  let r = await fetch(`${SB_URL}/rest/v1/shows`, {
    method: 'POST',
    headers: { ...hdr, Prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  // Fallback: si la migración category-nullable no se aplicó, retry con 'shows'
  if (!r.ok && row.category == null) {
    const txt = await r.clone().text();
    if (/category.*not.*null|23502/i.test(txt)) {
      row.category = 'shows';
      r = await fetch(`${SB_URL}/rest/v1/shows`, {
        method: 'POST',
        headers: { ...hdr, Prefer: 'return=representation' },
        body: JSON.stringify(row)
      });
    }
  }
  if (!r.ok) return { error: 'create_show_failed: ' + (await r.text()).slice(0, 160) };
  const show = (await r.json())[0];

  // Vincular en show_artistas (idempotente)
  try {
    await fetch(`${SB_URL}/rest/v1/show_artistas`, {
      method: 'POST',
      headers: { ...hdr, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ show_id: show.id, artista_id: artista.id, posicion: 1, source: 'lead-artista-web' })
    });
  } catch (e) { /* legacy artista_id ya garantiza el vínculo */ }

  return { ok: true, show_id: show.id, name: show.name, status: show.status, category: show.category };
}

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

  // De `origen` (referrer/UTM/fromParam capturado en el form) → slug corto
  // legible para popular contact.source y un tag. Replica el comportamiento del
  // form viejo (Elementor + WP) que identificaba la página por formName.
  const buildOriginLabel = (origen) => {
    if (!origen || typeof origen !== 'object') return '';
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
    // Normalizamos categorías EN → ES (los GHL custom fields esperan ES)
    const CATEGORIA_PROVEEDOR_EN_TO_ES = {
      'Sound / AV': 'Audiovisuales',
      'Audio / AV': 'Audiovisuales',
      'Lighting': 'Iluminación',
      'Tents / Risers / Staging': 'Producción técnica',
      'Technical production': 'Producción técnica',
      'Technology': 'Producción técnica',
      'Catering': 'Catering',
      'Decor / Florist': 'Decoración',
      'Decor': 'Decoración',
      'Florist': 'Floristería',
      'Photography / Video': 'Foto/Vídeo',
      'Photo / Video': 'Foto/Vídeo',
      'Furniture': 'Mobiliario',
      'Styling / Makeup': 'Otros',
      'Venues / Spaces': 'Espacios',
      'Venues': 'Espacios',
      'Transport / Logistics': 'Transporte',
      'Transport': 'Transporte',
      'Security': 'Seguridad',
      'Hostessing': 'Hostessing',
      'Branding': 'Branding',
      'Other': 'Otros'
    };
    const FORMATO_EN_TO_ES = {
      'Stage show': 'Show de escenario',
      'Strolling': 'Ambient / entre mesas',
      'Ambient / strolling': 'Ambient / entre mesas',
      'Full event management': 'Gestión integral'
    };
    const disciplinasRaw = data.disciplinas || [];
    const disciplinas = disciplinasRaw.map(d => CATEGORIA_PROVEEDOR_EN_TO_ES[d] || d);
    const hasProveedor = disciplinasRaw.includes('Proveedores') || disciplinas.includes('Proveedores');
    const tipoContacto = hasProveedor ? 'Proveedor' : 'Artista';

    // Tag por tipo: new_artist o new_supplier (brief 2026-05-08).
    // En isUpdate (artista actualiza su perfil) no añadir tags nuevos.
    const originSlug = buildOriginLabel(data.origen);
    const baseSourceLabel = tipoContacto === 'Proveedor' ? 'Form Proveedor' : 'Form Artista';
    const sourceLabel = buildSource(data.origen, baseSourceLabel);
    const tags = isUpdate
      ? [`lang:${lang}`]
      : [tipoContacto === 'Proveedor' ? 'new_supplier' : 'new_artist', `lang:${lang}`];
    if (!isUpdate && originSlug) tags.push(`pagina:${originSlug}`);
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
      source: sourceLabel,
      customFields: [
        { key: 'contact_type', field_value: tipoContacto },
        { key: 'contact_idioma', field_value: lang === 'en' ? 'English' : 'Español' },
        { key: 'contact_score', field_value: score },
        { key: 'nombre_artista', field_value: data.nombreArtistico || data.compania || '' },
        { key: 'categoria_artista', field_value: disciplinas.join(', ') },
        { key: 'subcategoria_artista', field_value: (data.subcategorias || []).join(', ') },
        { key: 'acepto_politica_privacidad', field_value: data.aceptoPrivacidad ? 'Sí' : 'No' },
        { key: 'acepto_visibilidad_web_rrss', field_value: data.aceptoVisibilidad ? 'Sí' : 'No' }
        // descripcion_del_espectaculo y formato_del_show no son fields del contact en
        // GHL (sí del opportunity como `comentarios_adicionales` y `formato_espectaculo`).
        // bioShow se persiste en Supabase artistas y va al opp en oppCustomFields abajo.
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

    // Guardrail: si el contacto ya existía, forzar PUT explícito de contact_type
    // al tipo correcto (Artista/Proveedor). Cubre el caso en que el upsert no
    // propaga el override si el contacto venía como Cliente.
    if (isExistingContact && !isUpdate) {
      try {
        await fetch(`${API}/contacts/${contactId}`, {
          method: 'PUT',
          headers: HEADERS,
          body: JSON.stringify({
            source: sourceLabel,
            customFields: [
              { key: 'contact_type', field_value: tipoContacto }
            ]
          })
        });
      } catch (e) { console.error('Force PUT contact_type error:', e.message); }
    }

    // Tag pagina:<slug> + nota timeline con origen completo (solo en submits nuevos,
    // no en updates del propio artista). Permite a Xavi ver de qué página vino el
    // lead sin tener que preguntar — replica el comportamiento del form WP viejo.
    if (!isUpdate) {
      if (originSlug) await addContactTag(contactId, `pagina:${originSlug}`);
      const originNote = buildOriginNote(data.origen);
      if (originNote) await postContactNote(contactId, originNote);
    }


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
      const formatoNorm = FORMATO_EN_TO_ES[data.formatoShow] || data.formatoShow;
      if (formatoNorm) oppCustomFields.push({ key: 'formato_espectaculo', field_value: formatoNorm });

      const resumenLines = [
        (data.nombreArtistico || data.compania) ? `Nombre artístico/Compañía: ${data.nombreArtistico || data.compania}` : '',
        data.nombre ? `Contacto: ${data.nombre}` : '',
        data.email ? `Email: ${data.email}` : '',
        data.telefono ? `Teléfono: ${data.telefono}` : '',
        data.ciudad ? `Ciudad: ${data.ciudad}` : '',
        disciplinas.length ? `${isProveedor ? 'Categoría proveedor' : 'Disciplinas'}: ${disciplinas.join(', ')}` : '',
        (Array.isArray(data.subcategorias) && data.subcategorias.length) ? `Subcategorías: ${data.subcategorias.join(', ')}` : '',
        formatoNorm ? `Formato: ${formatoNorm}` : '',
        data.bioShow ? `Bio/Descripción: ${data.bioShow}` : '',
        data.duracionShow ? `Duración: ${data.duracionShow}` : '',
        data.numArtistas ? `Nº artistas: ${data.numArtistas}` : '',
        data.rangoCache ? `Rango caché: ${data.rangoCache}` : '',
        data.video1 ? `Vídeo 1: ${data.video1}` : '',
        data.video2 ? `Vídeo 2: ${data.video2}` : '',
        data.webRrss ? `Web/RRSS: ${data.webRrss}` : '',
        data.riderTecnico ? `Rider técnico: ${data.riderTecnico}` : '',
        (Array.isArray(data.fotosUrls) && data.fotosUrls.length) ? `Fotos: ${data.fotosUrls.length} subida(s)` : '',
        (Array.isArray(data.showUnico) && data.showUnico.length) ? `Show único: ${data.showUnico.join(', ')}` : ''
      ].filter(Boolean);
      const resumen = resumenLines.join('\n');
      if (resumen) oppCustomFields.push({ key: 'comentarios_adicionales', field_value: resumen });

      const oppBody = {
        locationId: LOC,
        pipelineId: isProveedor ? PIPELINE_PROVEEDORES : PIPELINE_ARTISTAS,
        pipelineStageId: isProveedor ? STAGE_PROVEEDORES : STAGE_ARTISTAS,
        contactId: contactId,
        name: `${data.nombreArtistico || data.compania || data.nombre || tipoContacto} — ${disciplinas.join(', ')}`,
        status: 'open',
        monetaryValue: 0,
        source: sourceLabel,
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

    // 4. Upsert to Supabase (always — creates or updates by email).
    // IMPORTANTE: artistas tiene unique constraint en email. Sin
    // ?on_conflict=email, el merge-duplicates no sabe sobre qué columna
    // hacer el upsert y Postgres responde 409 duplicate key. Bug Xavi QA
    // 2026-05-28: leads pasaban por la thank-you pero nunca llegaban a
    // Supabase porque el error se tragaba silenciosamente.
    let supabaseToken = data._token || null;
    let artistaId = null;
    let supabaseError = null;
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

        // Upsert by email — on conflict update all fields.
        // ?on_conflict=email es CRÍTICO: sin él, Postgres devuelve 409 cuando
        // el email ya existe y el lead nunca llega a Supabase (solo a GHL).
        const sbRes = await fetch(
          `${SUPABASE_URL}/rest/v1/artistas?on_conflict=email`,
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
        const sbData = await sbRes.json().catch(() => null);
        if (!sbRes.ok) {
          supabaseError = `Supabase ${sbRes.status}: ${sbData ? (sbData.message || sbData.error || JSON.stringify(sbData)) : 'no body'}`;
          console.error('Supabase upsert failed:', supabaseError);
        } else if (Array.isArray(sbData) && sbData[0]) {
          if (sbData[0].token) supabaseToken = sbData[0].token;
          if (sbData[0].id) artistaId = sbData[0].id;
        }
      } catch (sbErr) {
        supabaseError = sbErr.message;
        console.error('Supabase sync error:', sbErr.message);
      }
    }

    // 4b. Auto-crear show vinculado al artista (Xavi 2026-05-26: 1 artista = 1 show).
    //     Solo para tipo=Artista (no proveedor), solo en submits nuevos
    //     (no en updates), y solo si artistaId existe (Supabase upsert OK).
    let autoShow = null;
    if (artistaId && !isUpdate && tipoContacto === 'Artista') {
      try {
        autoShow = await autoCreateShowForArtistaPublic(
          SUPABASE_URL, SUPABASE_KEY,
          { id: artistaId, nombre: data.nombre, nombre_artistico: data.nombreArtistico, compania: data.compania, disciplinas: data.disciplinas }
        );
      } catch (e) {
        console.error('Auto-show error:', e.message);
        autoShow = { error: e.message };
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

    // Si el upsert a Supabase falló, devolver error claro. El contact GHL
    // ya está creado, pero sin Supabase el artista no aparece en /admin —
    // es un fail funcional desde el punto de vista del usuario.
    if (supabaseError) {
      return res.status(500).json({
        success: false,
        error: 'No se pudo guardar en la base de datos: ' + supabaseError,
        contactId: contactId,
        opportunityId: oppId,
        ghl_created: true
      });
    }

    return res.status(200).json({
      success: true,
      contactId: contactId,
      opportunityId: oppId,
      holdedId: holdedId,
      supabaseToken: supabaseToken,
      artistaId: artistaId,
      autoShow: autoShow,
      updated: isUpdate
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
