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
    const raw = req.body;
    console.log('Webhook received:', JSON.stringify(raw));

    // Parse fields from various Elementor formats
    let fields = {};

    // Elementor form-urlencoded: Vercel may flatten "form_fields[field_1]" as a string key
    // or parse it as nested object depending on content-type
    if (raw.form_fields && typeof raw.form_fields === 'object') {
      fields = raw.form_fields;
    } else {
      // Check for flattened keys like "form_fields[field_1]"
      const flatKeys = Object.keys(raw).filter(k => k.startsWith('form_fields['));
      if (flatKeys.length > 0) {
        flatKeys.forEach(k => {
          const match = k.match(/form_fields\[(.+)\]/);
          if (match) fields[match[1]] = raw[k];
        });
      } else if (Array.isArray(raw.fields)) {
        raw.fields.forEach(f => { fields[f.id] = f.value; });
      } else if (raw.fields && typeof raw.fields === 'object') {
        fields = raw.fields;
      } else {
        fields = raw;
      }
    }

    console.log('Parsed fields:', JSON.stringify(fields));

    // Map fields — Elementor uses field IDs from the form builder
    // The contact form has: Elemento #1 through #6 + "ciudad"
    // Typical order: nombre, empresa/email, correo/telefono, telefono/fecha, mensaje, etc.
    // We also check by common field names and labels
    const allValues = Object.values(fields);
    const allKeys = Object.keys(fields);

    // Smart field detection: find email by pattern
    let emailValue = '';
    let otherFields = {};
    for (const [key, val] of Object.entries(fields)) {
      const v = String(val || '');
      if (!emailValue && v.includes('@') && v.includes('.')) {
        emailValue = v;
      } else {
        otherFields[key] = v;
      }
    }

    // Smart phone detection: find phone by pattern (starts with + or 6/7/9, mostly digits)
    let phoneValue = '';
    for (const [key, val] of Object.entries(otherFields)) {
      const v = String(val || '').replace(/\s/g, '');
      if (!phoneValue && /^(\+?\d{7,15})$/.test(v)) {
        phoneValue = val;
        delete otherFields[key];
        break;
      }
    }

    // The remaining fields: first is likely nombre, then empresa, then mensaje (longest)
    const remaining = Object.entries(otherFields);
    let nombre = '';
    let empresa = '';
    let mensaje = '';
    let fecha = '';

    for (const [key, val] of remaining) {
      const v = String(val || '');
      const k = key.toLowerCase();

      // Check by key name first
      if (k.includes('nombre') || k.includes('name') || k === 'field_1') {
        nombre = v;
      } else if (k.includes('empresa') || k.includes('company') || k === 'field_2') {
        empresa = v;
      } else if (k.includes('email') || k.includes('correo')) {
        if (!emailValue) emailValue = v;
      } else if (k.includes('telefono') || k.includes('phone') || k.includes('tel')) {
        if (!phoneValue) phoneValue = v;
      } else if (k.includes('mensaje') || k.includes('message') || k.includes('comentario')) {
        mensaje = v;
      } else if (k.includes('fecha') || k.includes('date')) {
        fecha = v;
      } else if (k === 'ciudad' || k.includes('city')) {
        // skip ciudad for now
      } else if (v.length > 50) {
        // Long text is probably the message
        mensaje = v;
      } else if (!nombre) {
        nombre = v;
      } else if (!empresa) {
        empresa = v;
      }
    }

    // Also try explicit field mapping for the "Escríbenos" form
    // Fields: Nombre, Empresa, Correo email, Teléfono, Mensaje
    if (!nombre) nombre = fields.field_1 || '';
    if (!empresa) empresa = fields.field_2 || '';
    if (!emailValue) emailValue = fields.field_3 || '';
    if (!phoneValue) phoneValue = fields.field_4 || '';
    if (!mensaje) mensaje = fields.field_5 || fields.field_6 || '';

    const formName = raw.form_name || raw.form_id || raw['form_name'] || 'elementor-form';
    const pageUrl = raw.page_url || raw.referrer || raw['referrer'] || '';

    console.log('Mapped:', { nombre, empresa, emailValue, phoneValue, mensaje, fecha, formName });

    // Only proceed if we have at least an email or phone
    if (!emailValue && !phoneValue) {
      console.log('No email or phone found, skipping GHL');
      return res.status(200).json({ success: true, skipped: true });
    }

    const lang = (raw.lang === 'en') ? 'en' : 'es';

    // Detectar si el submit viene del mini-form de inscripción (artistas/proveedores)
    // de /unete-al-equipo/. En ese caso NO crear opp en pipeline Clientes ni asumir
    // contact_type=Cliente — el form-artistas.html completo creará la opp correcta
    // (Artistas o Proveedores) al terminar.
    const isInscripcion = /unete-al-equipo|join-our-team|inscripcion|artist|proveedor|equipo/i
      .test(`${pageUrl} ${formName}`);

    const tags = isInscripcion ? [] : ['new_lead'];

    // 1. Create/update contact in GHL
    const contactBody = {
      locationId: LOC,
      firstName: nombre,
      email: emailValue,
      phone: phoneValue,
      companyName: empresa,
      tags: tags,
      source: `Web Elementor - ${formName}`,
      customFields: [
        { key: 'contact_origen', field_value: 'form' },
        { key: 'contact_idioma', field_value: lang === 'en' ? 'English' : 'Español' },
        // contact_type y contact_score se setean en el flow correspondiente
        // (lead-cliente.js para Cliente, lead-artista.js para Artista/Proveedor).
        // En este webhook genérico solo los rellenamos cuando sabemos que es Cliente.
        ...(isInscripcion ? [] : [
          { key: 'contact_type', field_value: 'Cliente' },
          { key: 'contact_score', field_value: 'COLD' }
        ])
      ]
    };

    const contactRes = await fetch(`${API}/contacts/upsert`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(contactBody)
    });
    const contactData = await contactRes.json();
    console.log('GHL contact response:', JSON.stringify(contactData));

    if (!contactData.contact?.id) {
      console.error('Failed to create contact:', JSON.stringify(contactData));
      // Return 200 anyway so Elementor shows success to the user
      return res.status(200).json({ success: false, error: 'contact creation failed' });
    }

    const contactId = contactData.contact.id;
    const isExistingContact = !(contactData.new === true || contactData.isNew === true);

    // Spec: si contacto ya existía, notificar a Xavi (workflow GHL)
    if (isExistingContact) await triggerNotifyXavi(contactId);

    // 2. Create opportunity en pipeline Clientes — solo si NO es inscripción
    // (los flows de artistas/proveedores crean su propia opp en su pipeline).
    let oppData = {};
    if (!isInscripcion) {
      const oppBody = {
        locationId: LOC,
        pipelineId: PIPELINE,
        pipelineStageId: STAGE,
        contactId: contactId,
        name: `${nombre || 'Lead'} — ${formName}`,
        status: 'open',
        monetaryValue: 0
      };

      const oppRes = await fetch(`${API}/opportunities/`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(oppBody)
      });
      oppData = await oppRes.json();
    }

    // 3. Holded sync (non-blocking)
    try {
      const holdedBody = {
        name: empresa || nombre || '',
        email: emailValue,
        phone: phoneValue,
        type: 'client',
        tags: [],
        notes: [
          mensaje ? `Mensaje: ${mensaje}` : '',
          fecha ? `Fecha: ${fecha}` : '',
          pageUrl ? `Página: ${pageUrl}` : ''
        ].filter(Boolean).join('\n')
      };

      await fetch('https://api.holded.com/api/invoicing/v1/contacts', {
        method: 'POST',
        headers: { 'key': process.env.HOLDED_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(holdedBody)
      });
    } catch (holdedErr) {
      console.error('Holded sync error:', holdedErr.message);
    }

    // Always return 200 so Elementor shows success message
    return res.status(200).json({
      success: true,
      contactId: contactId,
      opportunityId: oppData.opportunity?.id || null
    });

  } catch (err) {
    console.error('Webhook Elementor error:', err.message);
    // Return 200 anyway so user sees success in the form
    return res.status(200).json({ success: false, error: err.message });
  }
}
