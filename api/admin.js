// Consolidated admin API. Hobby Vercel limita 12 funciones — antes había 6
// endpoints separados. Este handler los unifica via ?action=...
//
// GET  /api/admin?action=list-artistas&q=&disciplina=&limit=&offset=
// GET  /api/admin?action=list-proposals&status=&q=&limit=&offset=
// GET  /api/admin?action=get-artista-detail&id=<uuid>
// POST /api/admin?action=link-show-to-artista  body: {showId, artistaId|null}  (legacy 1:1, delega en set-show-artistas)
// POST /api/admin?action=set-show-artistas     body: {showId, artistas: [{artistaId, posicion?}, ...]}  (N:M; máx 3; sincroniza a GHL)
// GET  /api/admin?action=shows-pending&status=pending_review|active|archived
// POST /api/admin?action=review-show  body: {id, action: approve|archive|edit, patch?}
// POST /api/admin?action=edit-show  body: {id, patch: {name?, description?, ...}}
// POST /api/admin?action=add-show   body: {name, name_en?, category?, subcategory?, description?, base_price?, price_note?, video_url?, ...} -> crea show + record GHL custom_objects.shows
// POST /api/admin?action=upload-show-image  body: {id, dataUrl} -> sube a Storage + APPEND a image_urls (y sincroniza image_url = image_urls[0])
// POST /api/admin?action=set-show-images    body: {id, image_urls: string[]} -> reemplaza el array entero (reorder/delete); sincroniza image_url
// POST /api/admin?action=toggle-favorite  body: {id, is_favorite: bool}
// POST /api/admin?action=add-artista  body: {nombre, nombre_artistico?, compania?, email?, telefono?, ciudad?, tipo, disciplinas?[], bio_show?}
// POST /api/admin?action=edit-artista  body: {id, patch: {nombre?, ...}}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GHL custom_objects.shows + associación show↔contact (ver
// scripts/sync-shows-and-associations-to-ghl.js).
const GHL_SHOWS_OBJECT_KEY = 'custom_objects.shows';
const GHL_SHOW_CONTACT_ASSOCIATION_ID = '6a018a66c4c95715fde952f9';
const GHL_API = 'https://services.leadconnectorhq.com';

// IDs de custom fields GHL (sync admin↔GHL en cada CRUD). Spec en memoria
// project_ghl_spec.md. Si añades un campo nuevo, actualiza también ese memo.
const GHL_CF = {
  // CONTACT
  contact_type: '0LBySc0XI7qKiPQVrQs9',         // SINGLE_OPTIONS: Cliente|Artista|Proveedor
  nombre_artista: 'v69mW7YhrDNMoAx8fw8h',       // TEXT
  categoria_artista: 'O4u824Z7LAxSwSMm0YqE',    // TEXT
  subcategoria_artista: 'A8CeeHJRdvK7YEakH6bV', // TEXT
  shows_vinculados: 'uBESZ2L5JmBqFB9UXyZA',     // LARGE_TEXT
  url_supabase: 'bd9b4HubsMstnWZMfa0G',         // TEXT (link a /admin.html?artista=<id>)
  // custom_objects.shows
  url_admin_show: '2b1BxWzhWb1ucxz1eNnn',       // TEXT (link a /admin.html?show=<slug>)
  estado_show: 'soD73QnfLAvZhaqDFrNu',          // SINGLE_OPTIONS: active|pending_review|archived
  es_favorito: 'gvJdAYNsNPKetTjixmDr'           // CHECKBOX
};

function siteUrl(env) {
  return (env.SITE_URL || process.env.SITE_URL || 'https://propuestas.eventosbarcelona.com').replace(/\/$/, '');
}
function adminUrlArtista(env, artistaId) { return `${siteUrl(env)}/admin.html?artista=${artistaId}`; }
function adminUrlShow(env, showSlug) { return `${siteUrl(env)}/admin.html?show=${showSlug}`; }
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function uniq(arr) { return [...new Set(arr.filter(Boolean))]; }

// Carga los shows vinculados a un artista desde Supabase (vía show_artistas)
// y devuelve {macros, subs, shows_text} listo para customFields GHL.
async function getArtistaShowsForGhl(env, artistaId) {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/show_artistas?artista_id=eq.${encodeURIComponent(artistaId)}`
    + `&select=show:show_id(id,name,category,subcategory)`,
    { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` } }
  );
  if (!r.ok) return { macros: '', subs: '', shows_text: '' };
  const rows = await r.json();
  const shows = rows.map(x => x.show).filter(Boolean);
  const macros = uniq(shows.map(s => capitalize(s.category))).sort().join(', ');
  const subs = uniq(shows.map(s => s.subcategory)).sort().join(', ');
  const shows_text = shows.map(s => `[${(s.category || '').toUpperCase()}] ${s.name}`).join('\n');
  return { macros, subs, shows_text };
}

// Sincroniza un artista a GHL: pisa todos los custom fields (contact_type,
// nombre_artista, categoria, subcategoria, shows_vinculados, url_supabase) y
// añade tag artista_ok. Idempotente. Llamada en add/edit/setShowArtistas.
async function syncArtistaToGhlFull(env, artista) {
  if (!env.GHL_TOKEN || !env.GHL_LOC) return { skipped: 'missing_ghl_config' };
  if (!artista || !artista.ghl_contact_id) return { skipped: 'no_ghl_contact_id' };

  const { macros, subs, shows_text } = await getArtistaShowsForGhl(env, artista.id);
  const nombreLabel = artista.nombre || artista.nombre_artistico || artista.compania || '';
  const tipoLabel = capitalize(artista.tipo || 'artista');
  const customFields = [
    { id: GHL_CF.contact_type, key: 'contact_type', field_value: tipoLabel },
    { id: GHL_CF.nombre_artista, key: 'nombre_artista', field_value: nombreLabel },
    { id: GHL_CF.categoria_artista, key: 'categoria_artista', field_value: macros },
    { id: GHL_CF.subcategoria_artista, key: 'subcategoria_artista', field_value: subs },
    { id: GHL_CF.shows_vinculados, key: 'shows_vinculados', field_value: shows_text },
    { id: GHL_CF.url_supabase, key: 'url_supabase', field_value: adminUrlArtista(env, artista.id) }
  ];
  try {
    await ghlPutContact(env, artista.ghl_contact_id, { customFields });
    if (tipoLabel === 'Artista') await ghlAddTag(env, artista.ghl_contact_id, 'artista_ok');
    else if (tipoLabel === 'Proveedor') await ghlAddTag(env, artista.ghl_contact_id, 'proveedor_ok');
    return { ok: true, shows_count: shows_text ? shows_text.split('\n').length : 0 };
  } catch (e) {
    return { error: e.message };
  }
}

// Re-sync un set de artistas (usado tras setShowArtistas: afectados = prev ∪ next).
async function syncArtistasToGhlBulk(env, artistaIds) {
  const ids = [...new Set(artistaIds)].filter(Boolean);
  if (!ids.length) return [];
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/artistas?id=in.(${ids.map(encodeURIComponent).join(',')})`
    + `&select=id,nombre,nombre_artistico,compania,tipo,ghl_contact_id`,
    { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` } }
  );
  if (!r.ok) return [];
  const arts = await r.json();
  const results = [];
  for (const a of arts) {
    results.push({ artista_id: a.id, nombre: a.nombre, ...(await syncArtistaToGhlFull(env, a)) });
  }
  return results;
}

// Sincroniza url_admin del record custom_objects.shows. Idempotente.
async function syncShowAdminUrl(env, show) {
  if (!env.GHL_TOKEN || !env.GHL_LOC) return { skipped: 'missing_ghl_config' };
  if (!show || !show.ghl_show_id) return { skipped: 'no_ghl_show_id' };
  const props = { url_admin: adminUrlShow(env, show.id) };
  const g = await ghlFetch('PUT', `/objects/${GHL_SHOWS_OBJECT_KEY}/records/${encodeURIComponent(show.ghl_show_id)}?locationId=${encodeURIComponent(env.GHL_LOC)}`, env, {
    properties: props
  });
  return g.ok ? { ok: true } : { error: `GHL ${g.status}: ${g.body.slice(0, 160)}` };
}

async function ghlFetch(method, path, env, body) {
  if (!env.GHL_TOKEN || !env.GHL_LOC) {
    return { ok: false, status: 0, body: '', skipped: 'missing_ghl_config' };
  }
  const r = await fetch(`${GHL_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.GHL_TOKEN}`,
      Version: '2021-07-28',
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const txt = await r.text();
  return { ok: r.ok, status: r.status, body: txt };
}

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
  const includeArchived = String(req.query.archived || '').toLowerCase() === 'true';
  const limit = clampInt(req.query.limit, 50, 1, 200);
  const offset = clampInt(req.query.offset, 0, 0, 1e6);

  const params = ['select=*,shows(count)', 'order=created_at.desc'];
  if (!includeArchived) {
    // Hide archived rows by default (legacy performers replaced by new model 2026-05-18).
    params.push('or=(archived.is.null,archived.eq.false)');
  }

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

  // El select=*,shows(count) cuenta solo vía FK legacy shows.artista_id (artista primario).
  // Añadimos un segundo count vía show_artistas para artistas vinculados N:M (no primarios)
  // y devolvemos el total unión sin duplicar.
  if (rows.length) {
    const ids = rows.map(a => a.id).filter(Boolean);
    if (ids.length) {
      const jr = await fetch(
        `${env.SUPABASE_URL}/rest/v1/show_artistas?artista_id=in.(${ids.map(encodeURIComponent).join(',')})&select=artista_id,show_id`,
        { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` } }
      );
      if (jr.ok) {
        const joinRows = await jr.json();
        const showsByArt = new Map(); // artista_id -> Set<show_id>
        for (const x of joinRows) {
          if (!showsByArt.has(x.artista_id)) showsByArt.set(x.artista_id, new Set());
          showsByArt.get(x.artista_id).add(x.show_id);
        }
        for (const a of rows) {
          const legacyCount = Array.isArray(a.shows) && a.shows[0] && typeof a.shows[0].count === 'number'
            ? a.shows[0].count : 0;
          const nmCount = showsByArt.has(a.id) ? showsByArt.get(a.id).size : 0;
          // Best-effort: el count "real" es la unión, y como la migración inserta en
          // show_artistas TODOS los vínculos (incl. el primario), el N:M es authoritative
          // cuando hay valor. Si N:M está vacío, caemos al legacy (compat con shows que
          // no han pasado por setShowArtistas todavía).
          a.shows = [{ count: nmCount > 0 ? nmCount : legacyCount }];
        }
      }
    }
  }

  return res.status(200).json({ success: true, count: rows.length, total, limit, offset, artistas: rows });
}

async function listProposals(req, res, env) {
  const status = (req.query.status || '').trim();
  const q = (req.query.q || '').trim();
  const limit = clampInt(req.query.limit, 50, 1, 200);
  const offset = clampInt(req.query.offset, 0, 0, 1e6);

  const params = [
    'select=id,status,client_name,client_company,client_email,client_phone,event_name,event_type,event_date,event_guests,event_location,category,concept_title,shows,global_margin,ghl_contact_id,ghl_opportunity_id,created_at,updated_at,approved_at,pdf_url,pdf_path',
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

  const sbHeaders = { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` };

  // Shows legacy (FK shows.artista_id) + shows N:M (show_artistas), unidos sin duplicar.
  // El legacy queda como fallback hasta que se migren todos los shows a join table.
  const [artistaRes, joinRes] = await Promise.all([
    fetch(`${env.SUPABASE_URL}/rest/v1/artistas?id=eq.${encodeURIComponent(id)}&select=*,shows(*)`, { headers: sbHeaders }),
    fetch(`${env.SUPABASE_URL}/rest/v1/show_artistas?artista_id=eq.${encodeURIComponent(id)}&select=posicion,show:show_id(*)`, { headers: sbHeaders })
  ]);
  if (!artistaRes.ok) return res.status(artistaRes.status).json({ error: await artistaRes.text() });
  const rows = await artistaRes.json();
  if (!rows.length) return res.status(404).json({ error: 'Artista not found' });

  const artista = rows[0];
  const legacyShows = Array.isArray(artista.shows) ? artista.shows : [];
  let joinShows = [];
  if (joinRes.ok) {
    const joinRows = await joinRes.json();
    joinShows = joinRows.map(x => x.show).filter(Boolean);
  }
  const byId = new Map();
  for (const s of [...legacyShows, ...joinShows]) {
    if (s && s.id && !byId.has(s.id)) byId.set(s.id, s);
  }
  artista.shows = [...byId.values()];

  return res.status(200).json({ success: true, artista });
}

// Legacy: vincula 1:1. Delega en setShowArtistas pasando 0 o 1 artista.
async function linkShowToArtista(req, res, env) {
  const { showId, artistaId } = req.body || {};
  if (!showId) return res.status(400).json({ error: 'Missing showId' });
  if (artistaId && !UUID_RE.test(artistaId)) {
    return res.status(400).json({ error: 'artistaId must be a UUID' });
  }
  req.body = {
    showId,
    artistas: artistaId ? [{ artistaId, posicion: 1 }] : []
  };
  return setShowArtistas(req, res, env);
}

// Setea el array completo de artistas de un show (N:M):
//   body: { showId, artistas: [{ artistaId, posicion? }, ...] }  // máx 3
// Idempotente. Sincroniza:
//   - show_artistas: borra todo y reinserta en el orden dado (posicion = 1..N)
//   - shows.artista_id: cache de artistas[0].artistaId (compat con el resto)
//   - GHL: crea associations contact↔show para los nuevos, borra las que ya no estén.
//     GHL es best-effort: si falta config o ids, devuelve `ghl_sync.skipped`.
async function setShowArtistas(req, res, env) {
  const { showId } = req.body || {};
  let { artistas } = req.body || {};
  if (!showId) return res.status(400).json({ error: 'Missing showId' });
  if (!Array.isArray(artistas)) return res.status(400).json({ error: 'artistas debe ser array' });
  if (artistas.length > 3) return res.status(400).json({ error: 'Máximo 3 artistas por show' });

  // Normalizar + dedupe + validar UUIDs
  const seen = new Set();
  const clean = [];
  for (const a of artistas) {
    const id = a && a.artistaId;
    if (!id) continue;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: `artistaId inválido: ${id}` });
    if (seen.has(id)) continue;
    seen.add(id);
    clean.push({ artistaId: id, posicion: clean.length + 1 });
  }
  artistas = clean;

  const headers = {
    apikey: env.SUPABASE_KEY,
    Authorization: `Bearer ${env.SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  // 1) Validar que todos los artistas existen y traer sus ghl_contact_id
  let artistasFull = [];
  if (artistas.length) {
    const ids = artistas.map(a => a.artistaId).map(encodeURIComponent).join(',');
    const ar = await fetch(
      `${env.SUPABASE_URL}/rest/v1/artistas?id=in.(${ids})&select=id,nombre,ghl_contact_id`,
      { headers }
    );
    if (!ar.ok) return res.status(ar.status).json({ error: await ar.text() });
    artistasFull = await ar.json();
    if (artistasFull.length !== artistas.length) {
      const missing = artistas.map(a => a.artistaId).filter(id => !artistasFull.find(x => x.id === id));
      return res.status(400).json({ error: 'Artistas no encontrados', hint: missing });
    }
  }

  // 2) Estado actual: traer show + show_artistas para diffear contra GHL
  const cur = await fetch(
    `${env.SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(showId)}`
    + `&select=id,name,ghl_show_id,show_artistas(artista_id,posicion,artista:artista_id(id,ghl_contact_id))`,
    { headers }
  );
  if (!cur.ok) return res.status(cur.status).json({ error: await cur.text() });
  const curRows = await cur.json();
  if (!curRows.length) return res.status(404).json({ error: 'Show not found', hint: showId });
  const show = curRows[0];
  const prevArtistaIds = new Set((show.show_artistas || []).map(sa => sa.artista_id));
  const prevByArtId = new Map((show.show_artistas || []).map(sa => [sa.artista_id, sa]));
  const nextArtistaIds = new Set(artistas.map(a => a.artistaId));

  // 3) Wipe + reinsert show_artistas. PostgREST no tiene tx multi-statement,
  //    así que dos requests concurrentes (doble click, dos pestañas) pueden
  //    chocar en las constraints UNIQUE (show_id, artista_id) y (show_id, posicion).
  //    Estrategia: retry hasta 3 veces con backoff. Cada retry vuelve a hacer
  //    DELETE + INSERT desde cero, así si la primera concurrente ya completó,
  //    la segunda termina con el mismo resultado idempotente.
  const insertRows = artistas.map(a => ({
    show_id: showId, artista_id: a.artistaId, posicion: a.posicion, source: 'admin-ui'
  }));
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const delRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/show_artistas?show_id=eq.${encodeURIComponent(showId)}`,
      { method: 'DELETE', headers }
    );
    if (!delRes.ok) {
      const txt = await delRes.text();
      if (/show_artistas/i.test(txt) && /relation|not exist|could not find/i.test(txt)) {
        return res.status(409).json({
          error: 'Tabla show_artistas no existe',
          hint: 'Aplicar migración supabase/migrations/20260513_show_artistas_join.sql'
        });
      }
      return res.status(delRes.status).json({ error: txt });
    }
    if (!insertRows.length) { lastErr = null; break; }
    const insRes = await fetch(`${env.SUPABASE_URL}/rest/v1/show_artistas`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify(insertRows)
    });
    if (insRes.ok) { lastErr = null; break; }
    const errTxt = await insRes.text();
    lastErr = { status: insRes.status, body: errTxt };
    // Solo retry en duplicate-key (23505) — race condition real.
    if (insRes.status !== 409 || !/23505/.test(errTxt)) break;
    await new Promise(r => setTimeout(r, 100 * attempt));
  }
  if (lastErr) return res.status(lastErr.status).json({ error: lastErr.body });

  // 4) shows.artista_id = primer artista (cache para queries 1:1)
  const primaryId = artistas[0]?.artistaId || null;
  const showSelect = '*'
    + ',artista:artista_id(id,nombre,nombre_artistico,compania,email,telefono,fotos_urls,ghl_contact_id)'
    + ',show_artistas(posicion,artista:artista_id(id,nombre,nombre_artistico,compania,email,telefono,fotos_urls,ghl_contact_id))';
  const patch = await fetch(
    `${env.SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(showId)}&select=${showSelect}`,
    {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ artista_id: primaryId })
    }
  );
  if (!patch.ok) return res.status(patch.status).json({ error: await patch.text() });
  const updatedRows = await patch.json();
  const updated = updatedRows[0];
  if (updated.show_artistas) {
    updated.show_artistas.sort((a, b) => (a.posicion || 99) - (b.posicion || 99));
  }

  // 5) Sync a GHL: añadir associations nuevas, borrar las que ya no existen.
  const ghlByArt = new Map(artistasFull.map(a => [a.id, a]));
  const toAdd = artistas
    .map(a => ghlByArt.get(a.artistaId))
    .filter(a => a && a.ghl_contact_id && !prevArtistaIds.has(a.id));
  const toRemove = (show.show_artistas || [])
    .filter(sa => !nextArtistaIds.has(sa.artista_id) && sa.artista?.ghl_contact_id);

  const ghlSync = await syncShowAssociationsToGhl(env, show, toAdd, toRemove);

  // Re-sync custom field shows_vinculados de TODOS los artistas afectados
  // (prev ∪ next). Sin esto, el contacto GHL del artista quedaría con un
  // shows_vinculados desactualizado tras cambiar su asignación a un show.
  const affectedIds = uniq([
    ...Array.from(prevArtistaIds),
    ...artistas.map(a => a.artistaId)
  ]);
  const ghlContactSync = await syncArtistasToGhlBulk(env, affectedIds);

  return res.status(200).json({ success: true, show: updated, ghl_sync: ghlSync, ghl_contact_sync: ghlContactSync });
}

// Crea / borra associations GHL contact ↔ custom_objects.shows.
// Best-effort: si falta ghl_show_id o ghl_contact_id, se loguea y skipea.
async function syncShowAssociationsToGhl(env, show, toAdd, toRemove) {
  const result = { added: 0, removed: 0, skipped_no_show_id: 0, skipped_no_contact_id: 0, errors: [] };
  if (!env.GHL_TOKEN || !env.GHL_LOC) {
    result.skipped_reason = 'missing_ghl_config';
    return result;
  }
  if (!show.ghl_show_id) {
    result.skipped_no_show_id = (toAdd?.length || 0) + (toRemove?.length || 0);
    result.skipped_reason = 'show_has_no_ghl_show_id';
    return result;
  }

  // Add
  for (const a of toAdd) {
    if (!a.ghl_contact_id) { result.skipped_no_contact_id++; continue; }
    const r = await ghlFetch('POST', '/associations/relations', env, {
      locationId: env.GHL_LOC,
      associationId: GHL_SHOW_CONTACT_ASSOCIATION_ID,
      firstRecordId: a.ghl_contact_id,
      secondRecordId: show.ghl_show_id
    });
    if (r.ok) {
      result.added++;
    } else if (r.status === 400 && /duplicate relation/i.test(r.body)) {
      result.added++; // ya existía → tratamos como ok
    } else {
      result.errors.push({ op: 'add', artista: a.nombre, status: r.status, body: r.body.slice(0, 160) });
    }
  }

  // Remove: GHL no expone "delete by pair" directo. Listamos relations del
  // record show y borramos las que matcheen contactIds a remover.
  if (toRemove.length) {
    const list = await ghlFetch('GET',
      `/associations/relations/${encodeURIComponent(show.ghl_show_id)}?locationId=${encodeURIComponent(env.GHL_LOC)}`,
      env);
    if (!list.ok) {
      result.errors.push({ op: 'list', status: list.status, body: list.body.slice(0, 160) });
    } else {
      let relations = [];
      try { relations = JSON.parse(list.body).relations || []; } catch {}
      // Filtrar solo associations contact↔show de nuestro associationId
      // (el record puede tener otros tipos de relations).
      relations = relations.filter(r => r.associationId === GHL_SHOW_CONTACT_ASSOCIATION_ID);
      const contactsToRemove = new Set(toRemove.map(sa => sa.artista.ghl_contact_id));
      for (const rel of relations) {
        const cid = rel.firstRecordId === show.ghl_show_id ? rel.secondRecordId : rel.firstRecordId;
        if (!contactsToRemove.has(cid)) continue;
        const del = await ghlFetch('DELETE',
          `/associations/relations/${encodeURIComponent(rel.id)}?locationId=${encodeURIComponent(env.GHL_LOC)}`,
          env);
        if (del.ok) result.removed++;
        else result.errors.push({ op: 'remove', relationId: rel.id, status: del.status, body: del.body.slice(0, 160) });
      }
    }
  }

  return result;
}

// ---- artistas ADD/EDIT ----
// GHL_API ya está declarado arriba.
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

  // 1. Create GHL contact (upsert: dedupe by email if provided)
  let ghlContactId = null;
  try {
    const ghlBody = {
      firstName: nombre || nombre_artistico || compania || '',
      lastName: '',
      companyName: compania || '',
      email: email || '',
      phone: telefono || '',
      city: ciudad || '',
      tags: [],
      customFields: [
        { key: 'tipo', field_value: tipoSafe.charAt(0).toUpperCase() + tipoSafe.slice(1) },
        { key: 'origen', field_value: 'Admin' }
      ]
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

  // Sync completo a GHL: custom fields + url_supabase + tag artista_ok/proveedor_ok.
  // Best-effort: no bloquea la respuesta si falla.
  const ghlSync = await syncArtistaToGhlFull(env, artista);

  // Auto-crear show vinculado al artista (Xavi 2026-05-26). 1 artista = 1 show.
  // status=pending_review para que aparezca en la pestaña "Pending review" y
  // Xavi lo edite (poner categoría, precio, etc.) antes de activarlo.
  // Best-effort: si falla, devolvemos el artista igual.
  let autoShow = { skipped: 'tipo_no_artista' };
  if (tipoSafe === 'artista') {
    autoShow = await autoCreateShowForArtista(env, artista);
  }

  return res.status(200).json({ success: true, artista, ghl_sync: ghlSync, auto_show: autoShow });
}

// Crea automáticamente un show vinculado a un artista recién creado.
// Mapea la primera disciplina del artista a category cuando es posible.
// Inserta también la fila show_artistas para que el N:M quede consistente.
async function autoCreateShowForArtista(env, artista) {
  if (!artista || !artista.id) return { error: 'artista without id' };
  const displayName = artista.nombre_artistico || artista.compania || artista.nombre || 'Show sin nombre';
  const sbHdr = { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` };

  // Dedup: si el artista ya tiene un show vinculado (N:M o legacy FK), no crear
  // otro. Causaba duplicados cuando el artista venía de form web + se reabría
  // en /admin (cada path llamaba a su auto-create sin chequear).
  try {
    const linkCheck = await fetch(
      `${env.SUPABASE_URL}/rest/v1/show_artistas?artista_id=eq.${encodeURIComponent(artista.id)}&select=show_id&limit=1`,
      { headers: sbHdr }
    );
    if (linkCheck.ok) {
      const rows = await linkCheck.json();
      if (rows.length) return { skipped: 'already_linked', show_id: rows[0].show_id };
    }
    const legacyCheck = await fetch(
      `${env.SUPABASE_URL}/rest/v1/shows?artista_id=eq.${encodeURIComponent(artista.id)}&select=id&limit=1`,
      { headers: sbHdr }
    );
    if (legacyCheck.ok) {
      const rows = await legacyCheck.json();
      if (rows.length) return { skipped: 'already_linked_legacy', show_id: rows[0].id };
    }
  } catch (e) { /* sigue al insert */ }

  // Mapeo disciplina → category (lowercase de los enum del catálogo).
  const DISCIPLINA_TO_CATEGORY = {
    danza: 'danza',
    musica: 'musica', 'música': 'musica',
    circo: 'circo',
    wow: 'wow', 'wow effect': 'wow',
    proveedores: null
  };
  let category = null;
  if (Array.isArray(artista.disciplinas) && artista.disciplinas.length) {
    const firstLower = String(artista.disciplinas[0]).toLowerCase().trim();
    if (firstLower in DISCIPLINA_TO_CATEGORY) category = DISCIPLINA_TO_CATEGORY[firstLower];
  }

  // Generar id slug único
  const baseSlug = slugifyShowName(displayName);
  let showId = baseSlug;
  try {
    const ex = await fetch(
      `${env.SUPABASE_URL}/rest/v1/shows?id=like.${encodeURIComponent(baseSlug + '*')}&select=id`,
      { headers: sbHdr }
    );
    if (ex.ok) {
      const taken = new Set((await ex.json()).map(r => r.id));
      if (taken.has(showId)) {
        let n = 2;
        while (taken.has(`${baseSlug}-${n}`)) n++;
        showId = `${baseSlug}-${n}`;
      }
    }
  } catch (e) { /* sigue con baseSlug */ }

  // Propagar fotos del artista al show recién creado para que la card del
  // catálogo no quede vacía. image_url = primera foto (legacy single-image).
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

  // Intento 1: con category derivada (puede ser null).
  // Si la migración 20260526_shows_category_nullable no se aplicó todavía,
  // Postgres tira 23502 NOT NULL — reintentamos con 'shows' como fallback.
  let r = await fetch(`${env.SUPABASE_URL}/rest/v1/shows`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_KEY,
      Authorization: `Bearer ${env.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(row)
  });
  if (!r.ok && row.category == null) {
    const txt = await r.clone().text();
    if (/category.*not.*null|23502/i.test(txt)) {
      row.category = 'shows';
      r = await fetch(`${env.SUPABASE_URL}/rest/v1/shows`, {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_KEY,
          Authorization: `Bearer ${env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(row)
      });
    }
  }
  if (!r.ok) {
    return { error: 'create_show_failed: ' + (await r.text()).slice(0, 160) };
  }
  const created = await r.json();
  const show = Array.isArray(created) ? created[0] : created;

  // Vincular en show_artistas (N:M) — posición 1. Idempotente si la fila ya existe.
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/show_artistas`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_KEY,
        Authorization: `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ show_id: show.id, artista_id: artista.id, posicion: 1, source: 'admin-auto-create' })
    });
  } catch (e) { /* no bloquea: la FK legacy shows.artista_id ya quedó */ }

  return { ok: true, show_id: show.id, name: show.name, status: show.status, category: show.category };
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

  const allowed = ['nombre', 'nombre_artistico', 'compania', 'email', 'telefono', 'ciudad', 'tipo', 'disciplinas', 'bio_show', 'rango_cache', 'video1', 'video2', 'web_rrss', 'fotos_urls'];
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
      if ('email' in update && update.email && !/@placeholder\.eventosbarcelona\.(local|com)\b/i.test(update.email)) ghlBody.email = update.email;
      if ('telefono' in update) ghlBody.phone = update.telefono || '';
      if ('ciudad' in update) ghlBody.city = update.ciudad || '';
      if (Object.keys(ghlBody).length) await ghlPutContact(env, cur.ghl_contact_id, ghlBody);
    } catch (e) { ghlErrors.push('contact: ' + e.message); }

    if ('tipo' in update && update.tipo !== cur.tipo) {
      try {
        await ghlPutContact(env, cur.ghl_contact_id, {
          customFields: [{ key: 'tipo', field_value: update.tipo.charAt(0).toUpperCase() + update.tipo.slice(1) }]
        });
        // Limpieza pasiva: borrar tag legacy tipo:* si existe en el contacto
        await ghlDelTag(env, cur.ghl_contact_id, `tipo:${cur.tipo}`);
      } catch (e) { ghlErrors.push('tipo-field: ' + e.message); }
    }
  }

  // Sync completo: re-popula custom fields (categoria_artista, shows_vinculados,
  // url_supabase, tipo, nombre) desde estado Supabase actual. Idempotente.
  const ghlSync = await syncArtistaToGhlFull(env, artista);
  return res.status(200).json({ success: true, artista, ghl_sync: ghlSync, ghlErrors: ghlErrors.length ? ghlErrors : undefined });
}

async function showsPending(req, res, env) {
  const status = req.query.status || 'pending_review';
  // show_artistas (N:M) viene como array embebido y ordenado por posicion.
  // Legacy artista_id se mantiene como cache de posicion=1 para compat con
  // queries antiguas que aún hacen JOIN directo.
  const select = '*'
    + ',artista:artista_id(id,nombre,nombre_artistico,compania,email,telefono,fotos_urls,ghl_contact_id)'
    + ',show_artistas(posicion,artista:artista_id(id,nombre,nombre_artistico,compania,email,telefono,fotos_urls,ghl_contact_id))';
  const url = `${env.SUPABASE_URL}/rest/v1/shows?status=eq.${encodeURIComponent(status)}`
    + `&select=${select}`
    + `&order=submitted_at.desc.nullslast`;

  let r = await fetch(url, {
    headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` }
  });
  // Fallback si el join show_artistas falla (tabla no creada en este entorno)
  if (!r.ok) {
    const txt = await r.clone().text();
    if (/show_artistas/i.test(txt) && /relation|not exist|could not find/i.test(txt)) {
      const fallbackSel = select.replace(/,show_artistas\([^)]+\)/, '');
      r = await fetch(`${env.SUPABASE_URL}/rest/v1/shows?status=eq.${encodeURIComponent(status)}&select=${fallbackSel}&order=submitted_at.desc.nullslast`, {
        headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` }
      });
    }
  }
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
  // Normaliza: ordena show_artistas por posicion para que el front no se preocupe
  for (const row of rows) {
    if (Array.isArray(row.show_artistas)) {
      row.show_artistas.sort((a, b) => (a.posicion || 99) - (b.posicion || 99));
    }
  }
  return res.status(200).json({ success: true, count: rows.length, shows: rows });
}

async function editShow(req, res, env) {
  const { id, patch } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing id' });
  if (!patch || typeof patch !== 'object') return res.status(400).json({ error: 'Missing patch' });

  const allowed = [
    'name', 'category', 'subcategory', 'description', 'base_price', 'price_note', 'video_url', 'image_url', 'image_urls',
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
  const show = rows[0];

  // GHL sync: si el show tiene ghl_show_id y se tocó algún campo que viaja a
  // GHL (name → nombre_show, description → descripcion_show, video_url →
  // url_video), actualizamos el record. Best-effort.
  const ghlResult = { updated: false };
  const touchesGhl = ('name' in update) || ('description' in update) || ('video_url' in update) || ('image_url' in update);
  if (touchesGhl && show.ghl_show_id) {
    if (!env.GHL_TOKEN || !env.GHL_LOC) {
      ghlResult.skipped = 'missing_ghl_config';
    } else {
      // Siempre incluir url_admin (idempotente, garantiza que el link al panel
      // nunca quede vacío incluso si alguien lo limpió en GHL).
      const props = { url_admin: adminUrlShow(env, show.id) };
      if ('name' in update) props.nombre_show = show.name || '';
      if ('description' in update) props.descripcion_show = show.description || '';
      if ('video_url' in update) props.url_video = show.video_url || '';
      if ('image_url' in update) props.url_imagen = show.image_url || '';
      const g = await ghlFetch('PUT', `/objects/${GHL_SHOWS_OBJECT_KEY}/records/${encodeURIComponent(show.ghl_show_id)}?locationId=${encodeURIComponent(env.GHL_LOC)}`, env, {
        properties: props
      });
      if (g.ok) {
        ghlResult.updated = true;
        ghlResult.fields = Object.keys(props);
      } else {
        ghlResult.error = `GHL ${g.status}: ${g.body.slice(0, 200)}`;
      }
    }
  } else if (touchesGhl && !show.ghl_show_id) {
    ghlResult.skipped = 'no_ghl_show_id';
  }

  return res.status(200).json({ success: true, show, ghl: ghlResult });
}

// Crea un nuevo show: 1) inserta en Supabase, 2) crea record en GHL
// custom_objects.shows, 3) persiste ghl_show_id en la fila SB. GHL es
// best-effort: si falla, el show queda creado en SB y se reporta el error.
// shows.id es un slug TEXT (no UUID auto-generado): "Banda de Jazz" → "banda-de-jazz".
// El insert tiene que traerlo explícito o Postgres falla por NOT NULL.
function slugifyShowName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '') // quita acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'show';
}

async function addShow(req, res, env) {
  const body = req.body || {};
  const name = (body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nombre del show es requerido' });
  // shows.category es NOT NULL — sin esto Postgres tira 23502 críptico.
  const category = (body.category || '').trim();
  if (!category) return res.status(400).json({ error: 'La categoría del show es requerida' });
  const initialImageUrl = (body.image_url || '').trim() || null;

  // Generar id slug único: si ya existe, añadir sufijo -2, -3...
  const baseSlug = slugifyShowName(name);
  let showId = baseSlug;
  try {
    const existRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/shows?id=like.${encodeURIComponent(baseSlug + '*')}&select=id`,
      { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` } }
    );
    if (existRes.ok) {
      const taken = new Set((await existRes.json()).map(r => r.id));
      if (taken.has(showId)) {
        let n = 2;
        while (taken.has(`${baseSlug}-${n}`)) n++;
        showId = `${baseSlug}-${n}`;
      }
    }
  } catch (e) { /* si falla la verificación, seguimos con baseSlug */ }

  const row = {
    id: showId,
    name,
    name_en: (body.name_en || '').trim() || null,
    category,
    subcategory: (body.subcategory || '').trim() || null,
    subcategory_en: (body.subcategory_en || '').trim() || null,
    description: (body.description || '').trim() || null,
    description_en: (body.description_en || '').trim() || null,
    // base_price es NOT NULL — default 0 si no se indica (Xavi lo edita luego).
    base_price: body.base_price != null && body.base_price !== '' ? (parseInt(body.base_price, 10) || 0) : 0,
    price_note: (body.price_note || '').trim() || null,
    price_note_en: (body.price_note_en || '').trim() || null,
    video_url: (body.video_url || '').trim() || null,
    image_url: initialImageUrl,
    image_urls: initialImageUrl ? [initialImageUrl] : null,
    status: 'active',
    submitted_at: new Date().toISOString()
  };

  const ins = await fetch(`${env.SUPABASE_URL}/rest/v1/shows`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_KEY,
      Authorization: `Bearer ${env.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(row)
  });
  if (!ins.ok) return res.status(ins.status).json({ error: await ins.text() });
  const created = await ins.json();
  const show = Array.isArray(created) ? created[0] : created;

  // GHL: crear record en custom_objects.shows
  const ghlResult = { created: false };
  if (env.GHL_TOKEN && env.GHL_LOC) {
    const props = {
      nombre_show: show.name,
      url_admin: adminUrlShow(env, show.id),
      estado_show: show.status || 'active'
    };
    if (show.description) props.descripcion_show = show.description;
    if (show.video_url) props.url_video = show.video_url;
    if (show.image_url) props.url_imagen = show.image_url;
    const g = await ghlFetch('POST', `/objects/${GHL_SHOWS_OBJECT_KEY}/records`, env, {
      locationId: env.GHL_LOC, properties: props
    });
    if (g.ok) {
      let ghlShowId = null;
      try {
        const parsed = JSON.parse(g.body);
        ghlShowId = parsed.record?.id || parsed.id || null;
      } catch {}
      if (ghlShowId) {
        const upd = await fetch(
          `${env.SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(show.id)}&select=*`,
          {
            method: 'PATCH',
            headers: {
              apikey: env.SUPABASE_KEY,
              Authorization: `Bearer ${env.SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=representation'
            },
            body: JSON.stringify({ ghl_show_id: ghlShowId })
          }
        );
        if (upd.ok) {
          const updRows = await upd.json();
          if (updRows.length) Object.assign(show, updRows[0]);
          ghlResult.created = true;
          ghlResult.ghl_show_id = ghlShowId;
        } else {
          ghlResult.error = 'persist ghl_show_id failed: ' + (await upd.text()).slice(0, 160);
        }
      } else {
        ghlResult.error = 'GHL response missing record id';
      }
    } else {
      ghlResult.error = `GHL ${g.status}: ${g.body.slice(0, 160)}`;
    }
  } else {
    ghlResult.skipped = 'missing_ghl_config';
  }

  return res.status(200).json({ success: true, show, ghl: ghlResult });
}

// Elimina un show permanentemente: borra las filas show_artistas vinculadas
// (FK), el record GHL custom_objects.shows si existe, y el row de shows.
// Las propuestas referencian shows por id dentro de un JSON (sin FK), así que
// el borrado no rompe la BD — solo deja ids colgando en propuestas viejas.
async function deleteShow(req, res, env) {
  const id = (req.body && req.body.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const sbHeaders = {
    apikey: env.SUPABASE_KEY,
    Authorization: `Bearer ${env.SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  // 1. Resolver ghl_show_id antes de borrar
  let ghlShowId = null;
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(id)}&select=ghl_show_id`,
      { headers: sbHeaders }
    );
    if (r.ok) {
      const rows = await r.json();
      if (!rows.length) return res.status(404).json({ error: 'Show no encontrado' });
      ghlShowId = rows[0].ghl_show_id || null;
    }
  } catch (e) { /* sigue: el delete de shows abajo es lo crítico */ }

  // 2. Borrar vínculos show_artistas (FK — el delete del show fallaría si quedan)
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/show_artistas?show_id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: sbHeaders
    });
  } catch (e) { /* si la tabla no existe, no hay nada que limpiar */ }

  // 3. Borrar el row de shows
  const del = await fetch(`${env.SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: sbHeaders
  });
  if (!del.ok) {
    return res.status(del.status).json({ error: await del.text() });
  }

  // 4. Borrar el record en GHL custom_objects.shows (best-effort).
  //    locationId va como query param en custom_objects (no en el body).
  const ghlResult = { deleted: false };
  if (ghlShowId && env.GHL_TOKEN && env.GHL_LOC) {
    const g = await ghlFetch(
      'DELETE',
      `/objects/${GHL_SHOWS_OBJECT_KEY}/records/${ghlShowId}?locationId=${encodeURIComponent(env.GHL_LOC)}`,
      env
    );
    if (g.ok) ghlResult.deleted = true;
    else ghlResult.error = `GHL ${g.status}: ${(g.body || '').slice(0, 160)}`;
  } else {
    ghlResult.skipped = ghlShowId ? 'missing_ghl_config' : 'no_ghl_show_id';
  }

  return res.status(200).json({ success: true, id, ghl: ghlResult });
}

// Elimina un artista. Borra los show_artistas vinculados, los shows que
// quedaban sin ningún otro artista (huérfanos), nulea shows.artista_id legacy
// donde apuntaba a este, y finalmente borra el row de artistas. En GHL NO
// borramos el contacto (puede ser lead/cliente también) — solo le sacamos los
// tags artista_ok/proveedor_ok y limpiamos los custom fields de artista para
// que deje de aparecer como tal.
async function deleteArtista(req, res, env) {
  const id = (req.body && req.body.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Missing id' });
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'id must be a UUID' });

  const sbHeaders = {
    apikey: env.SUPABASE_KEY,
    Authorization: `Bearer ${env.SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  // 1. Leer artista (necesitamos ghl_contact_id y tipo)
  let artista = null;
  {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/artistas?id=eq.${encodeURIComponent(id)}&select=id,nombre,nombre_artistico,tipo,ghl_contact_id`,
      { headers: sbHeaders }
    );
    if (!r.ok) return res.status(r.status).json({ error: await r.text() });
    const rows = await r.json();
    if (!rows.length) return res.status(404).json({ error: 'Artista no encontrado' });
    artista = rows[0];
  }

  // 2. Recolectar shows vinculados (N:M + legacy FK)
  const linkedShowIds = new Set();
  try {
    const a = await fetch(
      `${env.SUPABASE_URL}/rest/v1/show_artistas?artista_id=eq.${encodeURIComponent(id)}&select=show_id`,
      { headers: sbHeaders }
    );
    if (a.ok) (await a.json()).forEach(x => linkedShowIds.add(x.show_id));
    const b = await fetch(
      `${env.SUPABASE_URL}/rest/v1/shows?artista_id=eq.${encodeURIComponent(id)}&select=id`,
      { headers: sbHeaders }
    );
    if (b.ok) (await b.json()).forEach(x => linkedShowIds.add(x.id));
  } catch (e) { /* sigue: el delete es lo crítico */ }

  // 3. Decidir cuáles shows quedan huérfanos (no tienen otro artista en N:M)
  const orphanShowIds = [];
  for (const showId of linkedShowIds) {
    try {
      const other = await fetch(
        `${env.SUPABASE_URL}/rest/v1/show_artistas?show_id=eq.${encodeURIComponent(showId)}&artista_id=neq.${encodeURIComponent(id)}&select=artista_id&limit=1`,
        { headers: sbHeaders }
      );
      const rows = other.ok ? await other.json() : [];
      if (!rows.length) orphanShowIds.push(showId);
    } catch (e) { /* lo dejamos como no-huérfano */ }
  }

  // 4. Borrar vínculos show_artistas
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/show_artistas?artista_id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: sbHeaders
    });
  } catch (e) { /* sigue */ }

  // 5. Nulear shows.artista_id legacy (donde apunte a este)
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/shows?artista_id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: sbHeaders,
      body: JSON.stringify({ artista_id: null })
    });
  } catch (e) { /* sigue */ }

  // 6. Borrar shows huérfanos (eran exclusivos de este artista)
  let deletedShows = 0;
  const ghlShowDeletes = [];
  for (const showId of orphanShowIds) {
    let ghlShowId = null;
    try {
      const r = await fetch(
        `${env.SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(showId)}&select=ghl_show_id`,
        { headers: sbHeaders }
      );
      if (r.ok) {
        const rows = await r.json();
        ghlShowId = rows[0]?.ghl_show_id || null;
      }
    } catch (e) { /* sigue */ }
    try {
      const del = await fetch(`${env.SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(showId)}`, {
        method: 'DELETE', headers: sbHeaders
      });
      if (del.ok) deletedShows++;
    } catch (e) { /* best-effort */ }
    if (ghlShowId && env.GHL_TOKEN && env.GHL_LOC) {
      try {
        await ghlFetch(
          'DELETE',
          `/objects/${GHL_SHOWS_OBJECT_KEY}/records/${ghlShowId}?locationId=${encodeURIComponent(env.GHL_LOC)}`,
          env
        );
        ghlShowDeletes.push(ghlShowId);
      } catch (e) { /* best-effort */ }
    }
  }

  // 7. Borrar el row de artistas
  const del = await fetch(`${env.SUPABASE_URL}/rest/v1/artistas?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: sbHeaders
  });
  if (!del.ok) {
    return res.status(del.status).json({ error: await del.text() });
  }

  // 8. GHL: NO borramos el contacto. Solo le sacamos tag artista_ok/proveedor_ok
  //    y limpiamos custom fields de artista.
  const ghlResult = { ok: false };
  if (artista.ghl_contact_id && env.GHL_TOKEN && env.GHL_LOC) {
    try {
      const tag = artista.tipo === 'proveedor' ? 'proveedor_ok' : 'artista_ok';
      await ghlDelTag(env, artista.ghl_contact_id, tag);
      await ghlPutContact(env, artista.ghl_contact_id, {
        customFields: [
          { id: GHL_CF.nombre_artista, field_value: '' },
          { id: GHL_CF.categoria_artista, field_value: '' },
          { id: GHL_CF.subcategoria_artista, field_value: '' },
          { id: GHL_CF.shows_vinculados, field_value: '' },
          { id: GHL_CF.url_supabase, field_value: '' }
        ]
      });
      ghlResult.ok = true;
    } catch (e) { ghlResult.error = e.message; }
  } else {
    ghlResult.skipped = artista.ghl_contact_id ? 'missing_ghl_config' : 'no_ghl_contact_id';
  }

  return res.status(200).json({
    success: true,
    id,
    deleted_shows: deletedShows,
    ghl_show_deletes: ghlShowDeletes,
    ghl: ghlResult
  });
}

// Sube una imagen (data URL base64) al bucket artist-assets y la APPENDS al
// array shows.image_urls del show. La primera del array se sincroniza también
// como shows.image_url para compatibilidad con queries que aún leen la columna
// vieja (admin listings, etc).
//
// Si querés reemplazar imágenes existentes (reorder/delete), usá set-show-images.
async function uploadShowImage(req, res, env) {
  const { id, dataUrl } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing id' });
  if (!dataUrl || typeof dataUrl !== 'string') return res.status(400).json({ error: 'Missing dataUrl' });

  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/s.exec(dataUrl);
  if (!m) return res.status(400).json({ error: 'dataUrl debe ser image/jpeg|png|webp|gif en base64' });
  const mime = m[1];
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mime];
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 15 * 1024 * 1024) return res.status(413).json({ error: 'Imagen supera 15MB' });

  // Trae el array actual para append. Si la columna no existe (migración no
  // corrida), trata el row como single-image (sólo image_url).
  const cur = await fetch(
    `${env.SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(id)}&select=image_url,image_urls`,
    { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` } }
  );
  if (!cur.ok) return res.status(cur.status).json({ error: await cur.text() });
  const curRows = await cur.json();
  if (!curRows.length) return res.status(404).json({ error: 'Show not found' });
  const existing = Array.isArray(curRows[0].image_urls) ? curRows[0].image_urls.filter(Boolean) : [];
  const legacy = curRows[0].image_url && !existing.includes(curRows[0].image_url) ? [curRows[0].image_url] : [];
  const baseArray = existing.length ? existing : legacy;

  // sufijo timestamp: cada upload genera URL única (evita cache CDN viejo)
  const objectPath = `shows/${encodeURIComponent(id)}-${Date.now()}.${ext}`;
  const up = await fetch(`${env.SUPABASE_URL}/storage/v1/object/artist-assets/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_KEY,
      Authorization: `Bearer ${env.SUPABASE_KEY}`,
      'Content-Type': mime,
      'x-upsert': 'true'
    },
    body: buf
  });
  if (!up.ok) return res.status(up.status).json({ error: 'storage: ' + (await up.text()).slice(0, 200) });

  const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/artist-assets/${objectPath}`;
  const nextArray = [...baseArray, publicUrl];

  return await patchShowImages(env, id, nextArray, res, publicUrl);
}

// Sube una foto al artista. Misma lógica que uploadShowImage pero contra
// la columna artistas.fotos_urls. Usa el bucket artist-assets.
async function uploadArtistaPhoto(req, res, env) {
  const { id, dataUrl } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing id' });
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'id must be a UUID' });
  if (!dataUrl || typeof dataUrl !== 'string') return res.status(400).json({ error: 'Missing dataUrl' });

  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/s.exec(dataUrl);
  if (!m) return res.status(400).json({ error: 'dataUrl debe ser image/jpeg|png|webp|gif en base64' });
  const mime = m[1];
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mime];
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 15 * 1024 * 1024) return res.status(413).json({ error: 'Imagen supera 15MB' });

  const cur = await fetch(
    `${env.SUPABASE_URL}/rest/v1/artistas?id=eq.${encodeURIComponent(id)}&select=fotos_urls`,
    { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` } }
  );
  if (!cur.ok) return res.status(cur.status).json({ error: await cur.text() });
  const curRows = await cur.json();
  if (!curRows.length) return res.status(404).json({ error: 'Artista not found' });
  const existing = Array.isArray(curRows[0].fotos_urls) ? curRows[0].fotos_urls.filter(Boolean) : [];

  const objectPath = `artistas/${encodeURIComponent(id)}-${Date.now()}.${ext}`;
  const up = await fetch(`${env.SUPABASE_URL}/storage/v1/object/artist-assets/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_KEY,
      Authorization: `Bearer ${env.SUPABASE_KEY}`,
      'Content-Type': mime,
      'x-upsert': 'true'
    },
    body: buf
  });
  if (!up.ok) return res.status(up.status).json({ error: 'storage: ' + (await up.text()).slice(0, 200) });

  const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/artist-assets/${objectPath}`;
  const nextArray = [...existing, publicUrl];

  const patch = await fetch(
    `${env.SUPABASE_URL}/rest/v1/artistas?id=eq.${encodeURIComponent(id)}&select=*`,
    {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_KEY,
        Authorization: `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({ fotos_urls: nextArray })
    }
  );
  if (!patch.ok) return res.status(patch.status).json({ error: await patch.text() });
  const updated = (await patch.json())[0];
  return res.status(200).json({ success: true, artista: updated, uploadedUrl: publicUrl });
}

// Reemplaza el array completo de imágenes (reorder/delete desde el admin).
async function setShowImages(req, res, env) {
  const { id, image_urls } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing id' });
  if (!Array.isArray(image_urls)) return res.status(400).json({ error: 'image_urls debe ser array' });
  const clean = image_urls.filter(u => typeof u === 'string' && u.trim()).map(u => u.trim());
  return await patchShowImages(env, id, clean, res);
}

// PATCH compartido por upload-show-image y set-show-images.
// Si la columna image_urls no existe todavía (migración pendiente), reintenta
// sólo con image_url para no fallar — la galería se degrada a single-image.
async function patchShowImages(env, id, arr, res, uploadedUrl) {
  const primary = arr[0] || null;
  const body = { image_urls: arr, image_url: primary };
  const url = `${env.SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(id)}&select=*,artista:artista_id(id,nombre,nombre_artistico,compania,email,telefono,fotos_urls)`;
  const headers = {
    apikey: env.SUPABASE_KEY,
    Authorization: `Bearer ${env.SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };

  let patch = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(body) });
  if (!patch.ok) {
    const txt = await patch.clone().text();
    if (/column "?image_urls"?.*does not exist/i.test(txt) || /Could not find the 'image_urls' column/i.test(txt)) {
      // Fallback: migración aún no corrida → sólo escribir image_url
      patch = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ image_url: primary }) });
    }
  }
  if (!patch.ok) return res.status(patch.status).json({ error: await patch.text() });
  const rows = await patch.json();
  if (!rows.length) return res.status(404).json({ error: 'Show not found' });
  const show = rows[0];

  // GHL sync: el campo url_imagen del custom_objects.shows refleja la primary
  // de la galería. Cubre upload/reorder/delete. Best-effort.
  const ghlImg = { updated: false };
  if (show.ghl_show_id && env.GHL_TOKEN && env.GHL_LOC) {
    const g = await ghlFetch('PUT',
      `/objects/${GHL_SHOWS_OBJECT_KEY}/records/${encodeURIComponent(show.ghl_show_id)}?locationId=${encodeURIComponent(env.GHL_LOC)}`,
      env,
      { properties: { url_imagen: primary || '' } }
    );
    if (g.ok) ghlImg.updated = true;
    else ghlImg.error = `GHL ${g.status}: ${g.body.slice(0, 160)}`;
  } else if (!show.ghl_show_id) {
    ghlImg.skipped = 'no_ghl_show_id';
  } else {
    ghlImg.skipped = 'missing_ghl_config';
  }

  return res.status(200).json({ success: true, url: uploadedUrl, image_urls: arr, show, ghl_image_sync: ghlImg });
}

async function toggleFavorite(req, res, env) {
  const { id, is_favorite } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing id' });
  if (typeof is_favorite !== 'boolean') return res.status(400).json({ error: 'is_favorite must be boolean' });

  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(id)}&select=id,is_favorite,ghl_show_id`,
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
  const show = rows[0];

  // Sync es_favorito al record GHL custom_objects.shows.
  let ghl = null;
  if (show.ghl_show_id && env.GHL_TOKEN && env.GHL_LOC) {
    const g = await ghlFetch('PUT', `/objects/${GHL_SHOWS_OBJECT_KEY}/records/${encodeURIComponent(show.ghl_show_id)}?locationId=${encodeURIComponent(env.GHL_LOC)}`, env, {
      properties: { es_favorito: is_favorite }
    });
    ghl = g.ok ? { updated: true } : { error: `GHL ${g.status}: ${g.body.slice(0,160)}` };
  }
  return res.status(200).json({ success: true, show, ghl });
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
  const show = rows[0];

  // GHL sync best-effort.
  // Si el show NO tiene ghl_show_id y se está APROBANDO, lo creamos en GHL
  // custom_objects.shows ahora (los shows auto-creados desde form/admin no
  // tienen ghl_show_id hasta que pasan por approve). Spec Xavi 2026-05-28:
  // aprobar = publicar en el catálogo + sincronizar a GHL.
  let ghl = null;
  if (show && env.GHL_TOKEN && env.GHL_LOC) {
    if (!show.ghl_show_id && action === 'approve') {
      // CREATE en GHL custom_objects.shows
      const props = {
        nombre_show: show.name || '',
        url_admin: adminUrlShow(env, show.id),
        estado_show: show.status || 'active'
      };
      if (show.description) props.descripcion_show = show.description;
      if (show.video_url) props.url_video = show.video_url;
      if (show.image_url) props.url_imagen = show.image_url;
      const g = await ghlFetch('POST', `/objects/${GHL_SHOWS_OBJECT_KEY}/records`, env, {
        locationId: env.GHL_LOC, properties: props
      });
      if (g.ok) {
        let ghlShowId = null;
        try {
          const parsed = JSON.parse(g.body);
          ghlShowId = parsed.record?.id || parsed.id || null;
        } catch {}
        if (ghlShowId) {
          // Persistir ghl_show_id en Supabase para futuras sync
          await fetch(
            `${env.SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(show.id)}`,
            {
              method: 'PATCH',
              headers: {
                apikey: env.SUPABASE_KEY,
                Authorization: `Bearer ${env.SUPABASE_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ ghl_show_id: ghlShowId })
            }
          );
          show.ghl_show_id = ghlShowId;
          ghl = { created: true, ghl_show_id: ghlShowId, fields: Object.keys(props) };
        } else {
          ghl = { error: 'GHL response missing record id' };
        }
      } else {
        ghl = { error: `GHL ${g.status}: ${g.body.slice(0, 200)}` };
      }
    } else if (show.ghl_show_id) {
      // UPDATE — propaga estado_show y campos editados al record existente
      const props = { url_admin: adminUrlShow(env, show.id) };
      if (update.status) props.estado_show = update.status;
      if (action === 'edit') {
        if ('name' in update) props.nombre_show = show.name || '';
        if ('description' in update) props.descripcion_show = show.description || '';
        if ('video_url' in update) props.url_video = show.video_url || '';
        if ('image_url' in update) props.url_imagen = show.image_url || '';
      }
      const g = await ghlFetch('PUT', `/objects/${GHL_SHOWS_OBJECT_KEY}/records/${encodeURIComponent(show.ghl_show_id)}?locationId=${encodeURIComponent(env.GHL_LOC)}`, env, {
        properties: props
      });
      ghl = g.ok ? { updated: true, fields: Object.keys(props) } : { error: `GHL ${g.status}: ${g.body.slice(0, 200)}` };
    }
  }
  return res.status(200).json({ success: true, show, ghl });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Trim defensivo: las env vars de Vercel a veces vienen con \n al final
  // (bug Xavi QA 2026-05-28: las URLs de imágenes quedaban con "\n" en
  // medio, ej. https://...supabase.co\n/storage/... → 404 en el browser).
  const trim = (v) => (typeof v === 'string' ? v.trim() : v);
  const env = {
    SUPABASE_URL: trim(process.env.SUPABASE_URL),
    SUPABASE_KEY: trim(process.env.SUPABASE_SERVICE_KEY),
    GHL_TOKEN: trim(process.env.GHL_API_KEY),
    GHL_LOC: trim(process.env.GHL_LOCATION_ID)
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
      if (action === 'set-show-artistas') return setShowArtistas(req, res, env);
      if (action === 'review-show') return reviewShow(req, res, env);
      if (action === 'edit-show') return editShow(req, res, env);
      if (action === 'add-show') return addShow(req, res, env);
      if (action === 'delete-show') return deleteShow(req, res, env);
      if (action === 'upload-show-image') return uploadShowImage(req, res, env);
      if (action === 'upload-artista-photo') return uploadArtistaPhoto(req, res, env);
      if (action === 'set-show-images') return setShowImages(req, res, env);
      if (action === 'toggle-favorite') return toggleFavorite(req, res, env);
      if (action === 'add-artista') return addArtista(req, res, env);
      if (action === 'edit-artista') return editArtista(req, res, env);
      if (action === 'delete-artista') return deleteArtista(req, res, env);
    }
    return res.status(400).json({
      error: 'Unknown action',
      hint: 'GET list-artistas|list-proposals|get-artista-detail|shows-pending | POST link-show-to-artista|set-show-artistas|review-show|edit-show|add-show|delete-show|upload-show-image|upload-artista-photo|set-show-images|toggle-favorite|add-artista|edit-artista|delete-artista'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
