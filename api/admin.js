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
    SUPABASE_KEY: process.env.SUPABASE_SERVICE_KEY
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
    }
    return res.status(400).json({
      error: 'Unknown action',
      hint: 'GET list-artistas|list-proposals|get-artista-detail|shows-pending | POST link-show-to-artista|review-show|edit-show|toggle-favorite'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
