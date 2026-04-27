// Consolidated admin API. Hobby Vercel limita 12 funciones — antes había 6
// endpoints separados. Este handler los unifica via ?action=...
//
// GET  /api/admin?action=list-artistas&q=&disciplina=&limit=&offset=
// GET  /api/admin?action=list-proposals&status=&q=&limit=&offset=
// GET  /api/admin?action=get-artista-detail&id=<uuid>
// POST /api/admin?action=link-show-to-artista  body: {showId, artistaId|null}
// GET  /api/admin?action=shows-pending&status=pending_review|active|archived
// POST /api/admin?action=review-show  body: {id, action: approve|archive|edit, patch?}
// POST /api/admin?action=edit-show  body: {id, patch: {name?, description?, ...}}
// POST /api/admin?action=toggle-favorite  body: {id, is_favorite: bool}
// POST /api/admin?action=add-artista  body: {nombre, nombre_artistico?, compania?, email?, telefono?, ciudad?, tipo, disciplinas?[], bio_show?}
// POST /api/admin?action=edit-artista  body: {id, patch: {nombre?, ...}}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clampInt(raw, def, min, max) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function parseTotal(headerValue, fallback) {
  if (!headerValue) return fallback;
  const m = /\/(\d+|\*)$/.exec(headerValue);
  if (m && m[1] !== '*') return parseInt(m[1], 10);
  return fallback;
}

async function listArtistas(req, res, env) {
  const q = (req.query.q || '').trim();
  const disciplina = (req.query.disciplina || '').trim();
  const tipo = (req.query.tipo || '').trim();
  const limit = clampInt(req.query.limit, 50, 1, 200);
  const offset = clampInt(req.query.offset, 0, 0, 1e6);

  const params = ['select=*,shows(count)', 'order=created_at.desc'];

  if (q) {
    const safe = q.replace(/[(),]/g, ' ').trim();
    const enc = encodeURIComponent(`*${safe}*`);
    params.push(`or=(nombre.ilike.${enc},nombre_artistico.ilike.${enc},compania.ilike.${enc},email.ilike.${enc})`);
  }

  if (disciplina) {
    if (disciplina.toLowerCase() === 'sin disciplina' || disciplina === '__none__') {
      params.push('or=(disciplinas.is.null,disciplinas.eq.{})');
    } else {
      params.push(`disciplinas=cs.{${encodeURIComponent(disciplina)}}`);
    }
  }

  if (tipo && ['artista', 'proveedor', 'venue'].includes(tipo)) {
    params.push(`tipo=eq.${tipo}`);
  }

  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/artistas?${params.join('&')}`, {
    headers: {
      apikey: env.SUPABASE_KEY,
      Authorization: `Bearer ${env.SUPABASE_KEY}`,
      'Range-Unit': 'items',
      Range: `${offset}-${offset + limit - 1}`,
      Prefer: 'count=exact'
    }
  });
  if (!r.ok) return res.status(r.status).json({ error: await r.text() });

  const rows = await r.json();
  const total = parseTotal(r.headers.get('content-range'), rows.length);
  return res.status(200).json({ success: true, count: rows.length, total, limit, offset, artistas: rows });
}

async function listProposals(req, res, env) {
  const status = (req.query.status || '').trim();
  const q = (req.query.q || '').trim();
  const limit = clampInt(req.query.limit, 50, 1, 200);
  const offset = clampInt(req.query.offset, 0, 0, 1e6);

  const params = [
    'select=id,status,client_name,client_company,client_email,client_phone,event_name,event_type,event_date,event_guests,event_location,category,concept_title,shows,global_margin,ghl_contact_id,ghl_opportunity_id,created_at,updated_at,approved_at',
    'order=created_at.desc'
  ];

  if (status && ['revision', 'approved'].includes(status)) {
    params.push(`status=eq.${encodeURIComponent(status)}`);
  }
  if (q) {
    const safe = q.replace(/[(),]/g, ' ').trim();
    const enc = encodeURIComponent(`*${safe}*`);
    params.push(`or=(client_name.ilike.${enc},client_company.ilike.${enc},client_email.ilike.${enc},event_name.ilike.${enc})`);
  }

  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/proposals?${params.join('&')}`, {
    headers: {
      apikey: env.SUPABASE_KEY,
      Authorization: `Bearer ${env.SUPABASE_KEY}`,
      'Range-Unit': 'items',
      Range: `${offset}-${offset + limit - 1}`,
      Prefer: 'count=exact'
    }
  });
  if (!r.ok) return res.status(r.status).json({ error: await r.text() });

  const rows = await r.json();
  const total = parseTotal(r.headers.get('content-range'), rows.length);
  return res.status(200).json({ success: true, count: rows.length, total, limit, offset, proposals: rows });
}

async function getArtistaDetail(req, res, env) {
  const id = (req.query.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Missing id' });
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'id must be a UUID' });

  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/artistas?id=eq.${encodeURIComponent(id)}&select=*,shows(*)`,
    { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` } }
  );
  if (!r.ok) return res.status(r.status).json({ error: await r.text() });
  const rows = await r.json();
  if (!rows.length) return res.status(404).json({ error: 'Artista not found' });
  return res.status(200).json({ success: true, artista: rows[0] });
}

async function linkShowToArtista(req, res, env) {
  const { showId, artistaId } = req.body || {};
  if (!showId) return res.status(400).json({ error: 'Missing showId' });

  const headers = {
    apikey: env.SUPABASE_KEY,
    Authorization: `Bearer ${env.SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  if (artistaId) {
    if (!UUID_RE.test(artistaId)) {
      return res.status(400).json({ error: 'artistaId must be a UUID' });
    }
    const ar = await fetch(
      `${env.SUPABASE_URL}/rest/v1/artistas?id=eq.${encodeURIComponent(artistaId)}&select=id`,
      { headers }
    );
    if (!ar.ok) return res.status(ar.status).json({ error: await ar.text() });
    const arRows = await ar.json();
    if (!arRows.length) return res.status(400).json({ error: 'Artista not found', hint: artistaId });
  }

  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(showId)}&select=*,artista:artista_id(id,nombre,nombre_artistico,compania,email,telefono,fotos_urls)`,
    {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ artista_id: artistaId || null })
    }
  );
  if (!r.ok) return res.status(r.status).json({ error: await r.text() });
  const rows = await r.json();
  if (!rows.length) return res.status(404).json({ error: 'Show not found', hint: showId });
  return res.status(200).json({ success: true, show: rows[0] });
}

// ---- artistas ADD/EDIT ----
const GHL_API = 'https://services.leadconnectorhq.com';
function ghlHeaders(env) {
  return {
    Authorization: `Bearer ${env.GHL_TOKEN}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json'
  };
}

async function ghlUpsertContact(env, body) {
  const r = await fetch(`${GHL_API}/contacts/upsert`, {
    method: 'POST',
    headers: ghlHeaders(env),
    body: JSON.stringify({ locationId: env.GHL_LOC, ...body })
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`GHL upsert ${r.status}: ${txt.slice(0, 160)}`);
  }
  const d = await r.json();
  return d.contact?.id || null;
}

async function ghlPutContact(env, id, body) {
  const r = await fetch(`${GHL_API}/contacts/${id}`, {
    method: 'PUT',
    headers: ghlHeaders(env),
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`GHL put ${r.status}: ${txt.slice(0, 160)}`);
  }
}

async function ghlAddTag(env, id, tag) {
  await fetch(`${GHL_API}/contacts/${id}/tags`, {
    method: 'POST', headers: ghlHeaders(env),
    body: JSON.stringify({ tags: [tag] })
  }).catch(() => {});
}
async function ghlDelTag(env, id, tag) {
  await fetch(`${GHL_API}/contacts/${id}/tags`, {
    method: 'DELETE', headers: ghlHeaders(env),
    body: JSON.stringify({ tags: [tag] })
  }).catch(() => {});
}

async function addArtista(req, res, env) {
  const { nombre, nombre_artistico, compania, email, telefono, ciudad, tipo, disciplinas, bio_show } = req.body || {};
  if (!nombre && !compania && !nombre_artistico) {
    return res.status(400).json({ error: 'Debe haber al menos nombre, nombre_artistico o compania' });
  }
  const tipoSafe = ['artista', 'proveedor', 'venue'].includes(tipo) ? tipo : 'artista';
  const tipoTag = `tipo:${tipoSafe}`;

  // 1. Create GHL contact (upsert: dedupe by email if provided)
  let ghlContactId = null;
  try {
    const fullName = [nombre, nombre_artistico].filter(Boolean).join(' / ').trim();
    const ghlBody = {
      firstName: nombre || nombre_artistico || compania || '',
      lastName: '',
      companyName: compania || '',
      email: email || '',
      phone: telefono || '',
      city: ciudad || '',
      tags: [tipoTag, 'follow_up', 'origen:admin']
    };
    if (!email) delete ghlBody.email;
    ghlContactId = await ghlUpsertContact(env, ghlBody);
  } catch (e) {
    return res.status(500).json({ error: 'GHL contact failed: ' + e.message });
  }

  // 2. Insert in Supabase
  const row = {
    nombre: nombre || '',
    nombre_artistico: nombre_artistico || '',
    compania: compania || '',
    email: email || `no-email-${ghlContactId}@placeholder.eventosbarcelona.local`,
    telefono: telefono || '',
    ciudad: ciudad || '',
    disciplinas: Array.isArray(disciplinas) ? disciplinas : [],
    bio_show: bio_show || '',
    tipo: tipoSafe,
    ghl_contact_id: ghlContactId,
    origen: 'admin-create'
  };
  const sbRes = await fetch(`${env.SUPABASE_URL}/rest/v1/artistas?on_conflict=ghl_contact_id`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_KEY,
      Authorization: `Bearer ${env.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(row)
  });
  if (!sbRes.ok) return res.status(sbRes.status).json({ error: await sbRes.text() });
  const created = await sbRes.json();
  const artista = Array.isArray(created) ? created[0] : created;
  return res.status(200).json({ success: true, artista });
}

async function editArtista(req, res, env) {
  const { id, patch } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing id' });
  if (!patch || typeof patch !== 'object') return res.status(400).json({ error: 'Missing patch' });

  // 1. Fetch current row to detect tipo change
  const curR = await fetch(
    `${env.SUPABASE_URL}/rest/v1/artistas?id=eq.${encodeURIComponent(id)}&select=*`,
    { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` } }
  );
  if (!curR.ok) return res.status(curR.status).json({ error: await curR.text() });
  const curRows = await curR.json();
  if (!curRows.length) return res.status(404).json({ error: 'Artista not found' });
  const cur = curRows[0];

  const allowed = ['nombre', 'nombre_artistico', 'compania', 'email', 'telefono', 'ciudad', 'tipo', 'disciplinas', 'bio_show'];
  const update = {};
  for (const k of allowed) if (k in patch) update[k] = patch[k];
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'patch is empty' });

  if ('tipo' in update && !['artista', 'proveedor', 'venue'].includes(update.tipo)) {
    return res.status(400).json({ error: 'tipo invalid' });
  }
  // Don't downgrade real email back to placeholder
  if (update.email === '') update.email = cur.email;

  // 2. Patch Supabase
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/artistas?id=eq.${encodeURIComponent(id)}&select=*`,
    {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_KEY,
        Authorization: `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(update)
    }
  );
  if (!r.ok) return res.status(r.status).json({ error: await r.text() });
  const rows = await r.json();
  const artista = rows[0];

  // 3. Sync to GHL (best-effort)
  const ghlErrors = [];
  if (cur.ghl_contact_id) {
    try {
      const ghlBody = {};
      if ('nombre' in update) ghlBody.firstName = update.nombre || '';
      if ('compania' in update) ghlBody.companyName = update.compania || '';
      if ('email' in update && update.email && !update.email.endsWith('@placeholder.eventosbarcelona.local')) ghlBody.email = update.email;
      if ('telefono' in update) ghlBody.phone = update.telefono || '';
      if ('ciudad' in update) ghlBody.city = update.ciudad || '';
      if (Object.keys(ghlBody).length) await ghlPutContact(env, cur.ghl_contact_id, ghlBody);
    } catch (e) { ghlErrors.push('contact: ' + e.message); }

    if ('tipo' in update && update.tipo !== cur.tipo) {
      try {
        await ghlDelTag(env, cur.ghl_contact_id, `tipo:${cur.tipo}`);
        await ghlAddTag(env, cur.ghl_contact_id, `tipo:${update.tipo}`);
      } catch (e) { ghlErrors.push('tipo-tag: ' + e.message); }
    }
  }

  return res.status(200).json({ success: true, artista, ghlErrors: ghlErrors.length ? ghlErrors : undefined });
}

async function showsPending(req, res, env) {
  const status = req.query.status || 'pending_review';
  const url = `${env.SUPABASE_URL}/rest/v1/shows?status=eq.${encodeURIComponent(status)}`
    + `&select=*,artista:artista_id(id,nombre,nombre_artistico,compania,email,telefono,fotos_urls)`
    + `&order=submitted_at.desc.nullslast`;

  const r = await fetch(url, {
    headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` }
  });
  if (!r.ok) {
    const txt = await r.text();
    if (/column.*does not exist/i.test(txt)) {
      return res.status(409).json({
        error: 'Migración shows↔artista no aplicada',
        hint: 'Correr scripts/apply-shows-artista-migration.js y pegar el SQL en Supabase'
      });
    }
    return res.status(r.status).json({ error: txt });
  }
  const rows = await r.json();
  return res.status(200).json({ success: true, count: rows.length, shows: rows });
}

async function editShow(req, res, env) {
  const { id, patch } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing id' });
  if (!patch || typeof patch !== 'object') return res.status(400).json({ error: 'Missing patch' });

  const allowed = [
    'name', 'category', 'subcategory', 'description', 'base_price', 'price_note', 'video_url', 'image_url',
    'name_en', 'description_en', 'subcategory_en', 'price_note_en'
  ];
  const update = {};
  for (const k of allowed) if (k in patch) update[k] = patch[k];
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'patch is empty' });

  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(id)}&select=*,artista:artista_id(id,nombre,nombre_artistico,compania,email,telefono,fotos_urls)`,
    {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_KEY,
        Authorization: `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(update)
    }
  );
  if (!r.ok) return res.status(r.status).json({ error: await r.text() });
  const rows = await r.json();
  if (!rows.length) return res.status(404).json({ error: 'Show not found' });
  return res.status(200).json({ success: true, show: rows[0] });
}

async function toggleFavorite(req, res, env) {
  const { id, is_favorite } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing id' });
  if (typeof is_favorite !== 'boolean') return res.status(400).json({ error: 'is_favorite must be boolean' });

  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(id)}&select=id,is_favorite`,
    {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_KEY,
        Authorization: `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({ is_favorite })
    }
  );
  if (!r.ok) {
    const txt = await r.text();
    if (/column.*is_favorite.*does not exist/i.test(txt)) {
      return res.status(409).json({
        error: 'Columna is_favorite no existe',
        hint: 'Pega en Supabase: ALTER TABLE shows ADD COLUMN is_favorite boolean NOT NULL DEFAULT false;'
      });
    }
    return res.status(r.status).json({ error: txt });
  }
  const rows = await r.json();
  if (!rows.length) return res.status(404).json({ error: 'Show not found' });
  return res.status(200).json({ success: true, show: rows[0] });
}

async function reviewShow(req, res, env) {
  const { id, action, patch } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing id' });
  if (!['approve', 'archive', 'edit'].includes(action)) {
    return res.status(400).json({ error: 'action must be approve|archive|edit' });
  }

  const now = new Date().toISOString();
  const update = { reviewed_at: now, reviewed_by: 'admin' };
  if (action === 'approve') update.status = 'active';
  if (action === 'archive') update.status = 'archived';
  if (action === 'edit' && patch && typeof patch === 'object') {
    const allowed = ['name', 'category', 'subcategory', 'description', 'base_price', 'price_note', 'video_url', 'image_url'];
    for (const k of allowed) if (k in patch) update[k] = patch[k];
  }

  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_KEY,
        Authorization: `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(update)
    }
  );
  if (!r.ok) return res.status(r.status).json({ error: await r.text() });
  const rows = await r.json();
  return res.status(200).json({ success: true, show: rows[0] });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_KEY: process.env.SUPABASE_SERVICE_KEY,
    GHL_TOKEN: process.env.GHL_API_KEY,
    GHL_LOC: process.env.GHL_LOCATION_ID
  };
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const action = (req.query.action || '').trim();

  try {
    if (req.method === 'GET') {
      if (action === 'list-artistas') return listArtistas(req, res, env);
      if (action === 'list-proposals') return listProposals(req, res, env);
      if (action === 'get-artista-detail') return getArtistaDetail(req, res, env);
      if (action === 'shows-pending') return showsPending(req, res, env);
    }
    if (req.method === 'POST') {
      if (action === 'link-show-to-artista') return linkShowToArtista(req, res, env);
      if (action === 'review-show') return reviewShow(req, res, env);
      if (action === 'edit-show') return editShow(req, res, env);
      if (action === 'toggle-favorite') return toggleFavorite(req, res, env);
      if (action === 'add-artista') return addArtista(req, res, env);
      if (action === 'edit-artista') return editArtista(req, res, env);
    }
    return res.status(400).json({
      error: 'Unknown action',
      hint: 'GET list-artistas|list-proposals|get-artista-detail|shows-pending | POST link-show-to-artista|review-show|edit-show|toggle-favorite|add-artista|edit-artista'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
