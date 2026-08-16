// Consolidated admin API. Hobby Vercel limita 12 funciones — antes había 6
// endpoints separados. Este handler los unifica via ?action=...
//
// GET  /api/admin?action=list-artistas&q=&disciplina=&limit=&offset=
// GET  /api/admin?action=list-proposals&status=&q=&limit=&offset=
// GET  /api/admin?action=get-artista-detail&id=<uuid>
// POST /api/admin?action=link-show-to-artista  body: {showId, artistaId|null}  (legacy 1:1, delega en set-show-artistas)
// POST /api/admin?action=set-show-artistas     body: {showId, artistas: [{artistaId, posicion?}, ...]}  (N:M; máx 3; sincroniza a GHL)
// GET  /api/admin?action=shows-pending&status=pending_review|active|archived
// POST /api/admin?action=review-show  body: {id, action: approve|archive|to-pending|edit, patch?}
// POST /api/admin?action=edit-show  body: {id, patch: {name?, description?, ...}}
// POST /api/admin?action=add-show   body: {name, name_en?, category?, subcategory?, description?, base_price?, price_note?, video_url?, ...} -> crea show + record GHL custom_objects.shows
// POST /api/admin?action=upload-show-image  body: {id, dataUrl} -> sube a Storage + APPEND a image_urls (y sincroniza image_url = image_urls[0])
// POST /api/admin?action=set-show-images    body: {id, image_urls: string[]} -> reemplaza el array entero (reorder/delete); sincroniza image_url
// POST /api/admin?action=toggle-favorite  body: {id, is_favorite: bool}
// POST /api/admin?action=add-artista  body: {nombre, nombre_artistico?, compania?, email?, telefono?, ciudad?, tipo, disciplinas?[], bio_show?}
// POST /api/admin?action=edit-artista  body: {id, patch: {nombre?, ...}}
// --- Motor de ideas (tab Ideas) ---
// GET  /api/admin?action=list-referencias   -> fuentes del sector que mantiene Xavi
// POST /api/admin?action=save-referencia    body: {id?, nombre, url, tipo?, notas?, tags?, activa?}
// POST /api/admin?action=delete-referencia  body: {id}
// POST /api/admin?action=save-radar       body: {resultado}  -> publica informe del radar
// GET  /api/gpt/catalogo   (rewrite -> action=gpt-catalogo)  auth: Bearer GPT_ACTION_TOKEN
// GET  /api/gpt/show        (rewrite -> action=gpt-show)      auth: Bearer GPT_ACTION_TOKEN

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GHL custom_objects.shows + associación show↔contact (ver
// scripts/sync-shows-and-associations-to-ghl.js).
const GHL_SHOWS_OBJECT_KEY = 'custom_objects.shows';
const GHL_SHOW_CONTACT_ASSOCIATION_ID = '6a018a66c4c95715fde952f9';
const GHL_API = 'https://services.leadconnectorhq.com';
// Custom field url_generador_propuesta en el modelo OPPORTUNITY (pipeline
// Clientes). Es el link que Xavi abre desde GHL para armar/editar la propuesta.
const OPP_URL_GENERADOR_PROPUESTA = 'LJMLhmfJN6W9xHZFXVpB';

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

// Borra una propuesta de Supabase. Best-effort: borra también el PDF del
// storage si tenía uno. NO toca GHL (la opportunity/contact viven aparte y
// las propuestas se regeneran; solo se limpia el registro Supabase). El link
// url_propuesta_validada en GHL puede quedar apuntando a un id inexistente,
// pero eso es aceptable — es un registro histórico.
async function deleteProposal(req, res, env) {
  const id = (req.body && req.body.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const sbHeaders = {
    apikey: env.SUPABASE_KEY,
    Authorization: `Bearer ${env.SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  // 1. Leer pdf_path para limpiar el storage
  let pdfPath = null;
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/proposals?id=eq.${encodeURIComponent(id)}&select=pdf_path`,
      { headers: sbHeaders }
    );
    if (r.ok) {
      const rows = await r.json();
      if (!rows.length) return res.status(404).json({ error: 'Propuesta no encontrada' });
      pdfPath = rows[0].pdf_path || null;
    }
  } catch (e) { /* sigue: el delete es lo crítico */ }

  // 2. Borrar el PDF del bucket (best-effort)
  if (pdfPath) {
    try {
      await fetch(`${env.SUPABASE_URL}/storage/v1/object/propuestas-pdf/${pdfPath}`, {
        method: 'DELETE', headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` }
      });
    } catch (e) { /* no bloquea */ }
  }

  // 3. Borrar la fila
  const del = await fetch(`${env.SUPABASE_URL}/rest/v1/proposals?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: sbHeaders
  });
  if (!del.ok) return res.status(del.status).json({ error: await del.text() });

  return res.status(200).json({ success: true, id, pdf_deleted: !!pdfPath });
}

// Duplica una propuesta: crea una copia nueva (id fresco que genera Postgres)
// con todo el contenido, pero status='revision' y sin datos de aprobación/PDF.
// Mantiene client + ghl_contact_id/opportunity_id → la copia es una NUEVA
// VERSIÓN del mismo cliente (encaja con el listado agrupado por cliente).
async function duplicateProposal(req, res, env) {
  const id = (req.body && req.body.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const sbHeaders = {
    apikey: env.SUPABASE_KEY,
    Authorization: `Bearer ${env.SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  // 1. Leer la propuesta origen completa
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/proposals?id=eq.${encodeURIComponent(id)}&limit=1`,
    { headers: sbHeaders }
  );
  if (!r.ok) return res.status(r.status).json({ error: await r.text() });
  const rows = await r.json();
  if (!rows.length) return res.status(404).json({ error: 'Propuesta no encontrada' });
  const src = rows[0];

  // 2. Construir la copia: quitar id/timestamps/aprobación/PDF, forzar revision.
  //    Postgres genera el id nuevo (default). created_at/updated_at por default.
  const copy = { ...src };
  delete copy.id;
  delete copy.created_at;
  delete copy.updated_at;
  delete copy.approved_at;
  delete copy.approved_by;
  delete copy.pdf_url;
  delete copy.pdf_path;
  copy.status = 'revision';

  // 3. Insertar
  const ins = await fetch(`${env.SUPABASE_URL}/rest/v1/proposals`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'return=representation' },
    body: JSON.stringify(copy)
  });
  if (!ins.ok) return res.status(ins.status).json({ error: await ins.text() });
  const created = await ins.json();
  const newRow = Array.isArray(created) ? created[0] : created;

  return res.status(200).json({ success: true, id: newRow.id, sourceId: id, proposal: newRow });
}

// Asegura que un lead tenga propuesta + URL en la opportunity. Pensado para
// llamarse desde Make (u otra automatización) al crear un lead: los leads que
// entran por Make no pasan por lead-cliente, así que quedan sin propuesta y sin
// url_generador_propuesta. Idempotente:
//   - Si el lead YA tiene propuesta (por ghl_contact_id o email), la reusa.
//   - Si no, crea una propuesta shell (status=revision, sin shows) linkeada.
//   - Siempre (re)escribe la URL en la opp.
// Body flexible: { contactId?, opportunityId?, email?, name? }. Con cualquiera
// que permita resolver el contacto alcanza.
async function ensureProposalForLead(req, res, env) {
  const body = req.body || {};
  let contactId = String(body.contactId || body.contact_id || '').trim();
  let opportunityId = String(body.opportunityId || body.opportunity_id || '').trim();
  const emailIn = String(body.email || '').trim().toLowerCase();
  const nameIn = String(body.name || body.nombre || '').trim();

  const sbHdr = {
    apikey: env.SUPABASE_KEY,
    Authorization: `Bearer ${env.SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };
  const parse = (g) => { try { return JSON.parse(g.body); } catch { return {}; } };

  // 1. Resolver contactId desde opp si hace falta
  if (opportunityId && !contactId) {
    const g = await ghlFetch('GET', `/opportunities/${encodeURIComponent(opportunityId)}`, env);
    if (g.ok) contactId = parse(g).opportunity?.contactId || contactId;
  }
  // Resolver por email si aún no hay contacto
  let contact = null;
  if (!contactId && emailIn) {
    const s = await ghlFetch('GET', `/contacts/search/duplicate?locationId=${env.GHL_LOC}&email=${encodeURIComponent(emailIn)}`, env);
    if (s.ok) { contact = parse(s).contact; contactId = contact?.id || ''; }
  }
  if (!contactId) return res.status(400).json({ error: 'No se pudo resolver el contacto. Pasá contactId, opportunityId o email.' });

  // Datos del contacto para nombre/email/empresa
  if (!contact) {
    const cr = await ghlFetch('GET', `/contacts/${encodeURIComponent(contactId)}`, env);
    if (cr.ok) contact = parse(cr).contact;
  }
  const clientName = nameIn || [contact?.firstName, contact?.lastName].filter(Boolean).join(' ').trim() || contact?.contactName || contact?.companyName || 'Cliente';
  const clientEmail = emailIn || contact?.email || '';
  const clientCompany = contact?.companyName || '';

  // 2. Resolver opp si no vino: la del contacto en el pipeline
  if (!opportunityId) {
    const o = await ghlFetch('GET', `/opportunities/search?location_id=${env.GHL_LOC}&contact_id=${encodeURIComponent(contactId)}`, env);
    if (o.ok) opportunityId = (parse(o).opportunities || [])[0]?.id || '';
  }

  // 3. ¿Ya existe propuesta para este lead? (por ghl_contact_id o email)
  let proposalId = null, reused = false;
  try {
    const orParts = [`ghl_contact_id.eq.${contactId}`];
    if (clientEmail) orParts.push(`client_email.eq.${clientEmail}`);
    const q = await fetch(
      `${env.SUPABASE_URL}/rest/v1/proposals?or=(${orParts.join(',')})&select=id&order=created_at.desc&limit=1`,
      { headers: sbHdr }
    );
    if (q.ok) { const rows = await q.json(); if (rows[0]?.id) { proposalId = rows[0].id; reused = true; } }
  } catch (e) { /* sigue: crea una nueva */ }

  // 4. Crear shell si no existe
  if (!proposalId) {
    const row = {
      status: 'revision',
      client_name: clientName,
      client_email: clientEmail,
      client_company: clientCompany,
      event_name: `Propuesta — ${clientName}`,
      category: 'shows',
      shows: '[]',
      ghl_contact_id: contactId,
      ghl_opportunity_id: opportunityId || null
    };
    const ins = await fetch(`${env.SUPABASE_URL}/rest/v1/proposals`, {
      method: 'POST', headers: { ...sbHdr, Prefer: 'return=representation' }, body: JSON.stringify(row)
    });
    if (!ins.ok) return res.status(ins.status).json({ error: await ins.text() });
    proposalId = (await ins.json())[0]?.id;
  }

  const url = `${siteUrl(env)}/propuesta.html?id=${encodeURIComponent(proposalId)}&admin=1`;

  // 5. Escribir url_generador_propuesta en la opp (si hay opp)
  let oppSync = { skipped: 'no_opp' };
  if (opportunityId) {
    const g = await ghlFetch('PUT', `/opportunities/${encodeURIComponent(opportunityId)}`, env, {
      customFields: [{ id: OPP_URL_GENERADOR_PROPUESTA, field_value: url }]
    });
    oppSync = { ok: g.ok, status: g.status };
    if (!g.ok) oppSync.error = g.body.slice(0, 160);
  }

  return res.status(200).json({ success: true, proposalId, url, reused, contactId, opportunityId: opportunityId || null, oppSync });
}

// Busca contactos en GHL por texto (para el picker de artistas). GHL es la
// fuente de la verdad: hay artistas que están en GHL pero no en Supabase (ej.
// creados directo en GHL, sin tag). El picker antes solo miraba Supabase y
// decía "no existe". Devuelve candidatos + flag inSupabase (por ghl_contact_id
// o email) para que el frontend ofrezca "importar" solo los que faltan.
async function searchGhlArtistas(req, res, env) {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.status(200).json({ success: true, contacts: [] });
  if (!env.GHL_TOKEN || !env.GHL_LOC) return res.status(200).json({ success: true, contacts: [], skipped: 'no_ghl' });

  const r = await fetch(`${GHL_API}/contacts/?locationId=${env.GHL_LOC}&query=${encodeURIComponent(q)}&limit=20`, {
    headers: ghlHeaders(env)
  });
  if (!r.ok) return res.status(502).json({ error: 'GHL search failed', detail: (await r.text()).slice(0, 200) });
  const d = await r.json();
  const contacts = d.contacts || [];
  if (!contacts.length) return res.status(200).json({ success: true, contacts: [] });

  // Dedup contra Supabase por ghl_contact_id y por email
  const ghlIds = contacts.map(c => c.id).filter(Boolean);
  const emails = contacts.map(c => (c.email || '').toLowerCase().trim()).filter(Boolean);
  const existing = new Set(); const existingEmails = new Set();
  const sbAuth = { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` };
  try {
    if (ghlIds.length) {
      const q1 = await fetch(`${env.SUPABASE_URL}/rest/v1/artistas?ghl_contact_id=in.(${ghlIds.map(encodeURIComponent).join(',')})&select=ghl_contact_id`, { headers: sbAuth });
      if (q1.ok) (await q1.json()).forEach(a => existing.add(a.ghl_contact_id));
    }
    if (emails.length) {
      const q2 = await fetch(`${env.SUPABASE_URL}/rest/v1/artistas?email=in.(${emails.map(encodeURIComponent).join(',')})&select=email`, { headers: sbAuth });
      if (q2.ok) (await q2.json()).forEach(a => existingEmails.add((a.email || '').toLowerCase().trim()));
    }
  } catch (e) { /* si falla el dedup, devolvemos todo como importable */ }

  const out = contacts.map(c => {
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.contactName || c.companyName || '';
    const email = (c.email || '').toLowerCase().trim();
    return {
      ghlContactId: c.id,
      name,
      email: c.email || '',
      phone: c.phone || '',
      company: c.companyName || '',
      inSupabase: existing.has(c.id) || (email && existingEmails.has(email))
    };
  });
  return res.status(200).json({ success: true, contacts: out });
}

// Importa un contacto GHL → crea/upsert la fila en Supabase artistas (con
// ghl_contact_id) para poder vincularlo a shows. Marca tag artista_ok en GHL.
async function importArtistaFromGhl(req, res, env) {
  const ghlContactId = (req.body && req.body.ghlContactId || '').trim();
  if (!ghlContactId) return res.status(400).json({ error: 'Missing ghlContactId' });
  if (!env.GHL_TOKEN || !env.GHL_LOC) return res.status(500).json({ error: 'Missing GHL config' });

  // 1. Leer contacto GHL
  const r = await fetch(`${GHL_API}/contacts/${encodeURIComponent(ghlContactId)}`, { headers: ghlHeaders(env) });
  if (!r.ok) return res.status(502).json({ error: 'GHL contact fetch failed', detail: (await r.text()).slice(0, 200) });
  const cd = await r.json();
  const c = cd.contact || cd;
  const nombre = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.contactName || c.companyName || '';

  // 2. Insertar / upsert en Supabase (dedup por ghl_contact_id)
  const row = {
    nombre,
    nombre_artistico: nombre,
    compania: c.companyName || '',
    email: c.email || `no-email-${ghlContactId}@placeholder.eventosbarcelona.local`,
    telefono: c.phone || '',
    ciudad: c.city || '',
    disciplinas: [],
    tipo: 'artista',
    ghl_contact_id: ghlContactId,
    origen: 'import-ghl'
  };
  const ins = await fetch(`${env.SUPABASE_URL}/rest/v1/artistas?on_conflict=ghl_contact_id`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_KEY,
      Authorization: `Bearer ${env.SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(row)
  });
  if (!ins.ok) return res.status(ins.status).json({ error: await ins.text() });
  const created = await ins.json();
  const artista = Array.isArray(created) ? created[0] : created;

  // 3. Tag artista_ok en GHL (best-effort)
  try { await ghlAddTag(env, ghlContactId, 'artista_ok'); } catch (e) { /* no bloquea */ }

  return res.status(200).json({ success: true, artista });
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

  // Subcategoría: disciplinas[1] si hay (la 0 ya es category)
  const discsArr = Array.isArray(artista.disciplinas) ? artista.disciplinas.filter(Boolean) : [];
  const subcategory = discsArr.length > 1 ? String(discsArr[1]).trim() : null;

  const row = {
    id: showId,
    name: displayName,
    category,
    subcategory,
    description: (artista.bio_show && String(artista.bio_show).trim()) || null,
    video_url: (artista.video1 && String(artista.video1).trim()) || null,
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

// Crea un NUEVO show pre-llenado con todos los datos del artista (bio, video,
// fotos, disciplinas → category). A diferencia de autoCreateShowForArtista
// (que corre 1 vez al crear el artista), este se llama desde el modal artista
// con el botón "+ Crear show con datos del artista" y permite múltiples shows
// por artista. NO dedupea — siempre crea uno nuevo con sufijo -2/-3 si hace falta.
async function createShowFromArtista(req, res, env) {
  const { artistaId } = req.body || {};
  if (!artistaId) return res.status(400).json({ error: 'Missing artistaId' });
  if (!UUID_RE.test(artistaId)) return res.status(400).json({ error: 'artistaId must be a UUID' });

  const sbHdr = {
    apikey: env.SUPABASE_KEY,
    Authorization: `Bearer ${env.SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  // 1. Leer artista completo
  const ar = await fetch(
    `${env.SUPABASE_URL}/rest/v1/artistas?id=eq.${encodeURIComponent(artistaId)}&select=*`,
    { headers: sbHdr }
  );
  if (!ar.ok) return res.status(ar.status).json({ error: await ar.text() });
  const arRows = await ar.json();
  if (!arRows.length) return res.status(404).json({ error: 'Artista no encontrado' });
  const artista = arRows[0];

  const displayName = artista.nombre_artistico || artista.compania || artista.nombre || 'Show sin nombre';

  // 2. Categoría desde disciplinas[0]
  const DISC_MAP = {
    danza: 'danza', musica: 'musica', 'música': 'musica',
    circo: 'circo', wow: 'wow', 'wow effect': 'wow',
    proveedores: null
  };
  let category = null;
  let subcategory = null;
  const discs = Array.isArray(artista.disciplinas) ? artista.disciplinas.filter(Boolean) : [];
  if (discs.length) {
    const first = String(discs[0]).toLowerCase().trim();
    if (first in DISC_MAP) category = DISC_MAP[first];
    if (discs.length > 1) subcategory = String(discs[1]).trim();
  }

  // 3. Slug único — siempre permitimos N shows por artista
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
  } catch (e) { /* seguimos con baseSlug */ }

  // 4. Fotos: copiamos todas las del artista
  const fotos = Array.isArray(artista.fotos_urls) ? artista.fotos_urls.filter(Boolean) : [];

  // 5. Insert row
  const row = {
    id: showId,
    name: displayName,
    category,
    subcategory,
    description: artista.bio_show || null,
    base_price: 0,
    price_note: null,
    video_url: artista.video1 || null,
    image_url: fotos[0] || null,
    image_urls: fotos.length ? fotos : null,
    status: 'pending_review',
    artista_id: artista.id,
    submitted_at: new Date().toISOString()
  };

  let r = await fetch(`${env.SUPABASE_URL}/rest/v1/shows`, {
    method: 'POST',
    headers: { ...sbHdr, Prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  // Fallback si la migración category-nullable no se aplicó
  if (!r.ok && row.category == null) {
    const txt = await r.clone().text();
    if (/category.*not.*null|23502/i.test(txt)) {
      row.category = 'shows';
      r = await fetch(`${env.SUPABASE_URL}/rest/v1/shows`, {
        method: 'POST',
        headers: { ...sbHdr, Prefer: 'return=representation' },
        body: JSON.stringify(row)
      });
    }
  }
  if (!r.ok) return res.status(r.status).json({ error: await r.text() });
  const created = await r.json();
  const show = Array.isArray(created) ? created[0] : created;

  // 6. Vincular en show_artistas (N:M, posición 1)
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/show_artistas`, {
      method: 'POST',
      headers: { ...sbHdr, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        show_id: show.id, artista_id: artista.id, posicion: 1,
        source: 'admin-create-from-artista'
      })
    });
  } catch (e) { /* legacy artista_id ya garantiza el vínculo */ }

  return res.status(200).json({
    success: true,
    show,
    artista_id: artista.id,
    copied_fields: {
      name: !!row.name,
      category: !!row.category,
      subcategory: !!row.subcategory,
      description: !!row.description,
      video_url: !!row.video_url,
      image_urls_count: fotos.length
    }
  });
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

  // Propagar a shows vinculados los campos del artista que se acabaron de
  // actualizar (foto, bio, video, subcategoría). NO pisa shows con campo
  // propio ya cargado. Solo corremos si el patch tocó algún campo relevante.
  let showsSync = { updated: 0 };
  const PROPAGATABLE = ['fotos_urls', 'bio_show', 'video1', 'disciplinas'];
  if (PROPAGATABLE.some(f => f in update)) {
    try { showsSync = await propagateArtistaDataToEmptyShows(env, id, artista); }
    catch (e) { showsSync = { updated: 0, error: e.message }; }
  }

  return res.status(200).json({ success: true, artista, ghl_sync: ghlSync, shows_sync: showsSync, ghlErrors: ghlErrors.length ? ghlErrors : undefined });
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
      // url_imagen está configurado como FILE_UPLOAD en GHL custom_objects.shows
      // y rechaza URLs externas (400 "couldn't validate the mapped field").
      // Si Xavi lo cambia a TEXT en el panel GHL, descomentar.
      // if ('image_url' in update) props.url_imagen = show.image_url || '';
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

  // Si se cambió category o subcategory del show, re-sync los artistas
  // vinculados a GHL (sus campos categoria_artista / subcategoria_artista se
  // agregan desde los shows). Best-effort.
  let artistasSync = { synced: 0 };
  if ('category' in update || 'subcategory' in update) {
    try {
      const ids = new Set();
      const sa = await fetch(
        `${env.SUPABASE_URL}/rest/v1/show_artistas?show_id=eq.${encodeURIComponent(id)}&select=artista_id`,
        { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` } }
      );
      if (sa.ok) (await sa.json()).forEach(x => ids.add(x.artista_id));
      if (show.artista_id) ids.add(show.artista_id);
      if (ids.size) {
        const r2 = await syncArtistasToGhlBulk(env, [...ids]);
        artistasSync = { synced: ids.size, results: r2 };
      }
    } catch (e) { artistasSync = { synced: 0, error: e.message }; }
  }

  return res.status(200).json({ success: true, show, ghl: ghlResult, artistas_sync: artistasSync });
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
    // url_imagen rechazado por GHL (FILE_UPLOAD field, no acepta URL externa)
    // if (show.image_url) props.url_imagen = show.image_url;
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

// Propaga datos del artista a los shows vinculados que tengan los campos
// vacíos. NO pisa shows con campo ya cargado. Campos propagados:
//   - image_url + image_urls ← artista.fotos_urls
//   - description ← artista.bio_show
//   - video_url ← artista.video1
//   - subcategory ← artista.disciplinas[1] (la primera ya es category)
// Se llama desde uploadArtistaPhoto, edit-artista, y el script de backfill.
async function propagateArtistaDataToEmptyShows(env, artistaId, artista) {
  const sbHdr = {
    apikey: env.SUPABASE_KEY,
    Authorization: `Bearer ${env.SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  const fotos = Array.isArray(artista?.fotos_urls) ? artista.fotos_urls.filter(Boolean) : [];
  const bio = (artista?.bio_show || '').trim();
  const video = (artista?.video1 || '').trim();
  const discs = Array.isArray(artista?.disciplinas) ? artista.disciplinas.filter(Boolean) : [];
  const subcat = discs.length > 1 ? String(discs[1]).trim() : '';

  // Si artista no tiene NADA que aportar, salir temprano
  if (!fotos.length && !bio && !video && !subcat) return { updated: 0, no_data: true };

  // 1. Recolectar shows vinculados (N:M + legacy FK), sin duplicar
  const linkedIds = new Set();
  try {
    const a = await fetch(
      `${env.SUPABASE_URL}/rest/v1/show_artistas?artista_id=eq.${encodeURIComponent(artistaId)}&select=show_id`,
      { headers: sbHdr }
    );
    if (a.ok) (await a.json()).forEach(x => linkedIds.add(x.show_id));
    const b = await fetch(
      `${env.SUPABASE_URL}/rest/v1/shows?artista_id=eq.${encodeURIComponent(artistaId)}&select=id`,
      { headers: sbHdr }
    );
    if (b.ok) (await b.json()).forEach(x => linkedIds.add(x.id));
  } catch (e) { return { updated: 0, error: e.message }; }
  if (!linkedIds.size) return { updated: 0 };

  // 2. Leer estado actual de los shows
  const idsList = [...linkedIds];
  const showsRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/shows?id=in.(${idsList.map(encodeURIComponent).join(',')})&select=id,image_url,image_urls,description,video_url,subcategory`,
    { headers: sbHdr }
  );
  if (!showsRes.ok) return { updated: 0, error: await showsRes.text() };
  const shows = await showsRes.json();

  // 3. Para cada show, construir patch SOLO con campos que están vacíos
  let updated = 0;
  const fieldsByShow = {};
  for (const s of shows) {
    const patch = {};
    const hasImgUrl = s.image_url && String(s.image_url).trim();
    const hasImgArr = Array.isArray(s.image_urls) && s.image_urls.filter(Boolean).length > 0;
    if (fotos.length && !hasImgUrl && !hasImgArr) {
      patch.image_url = fotos[0];
      patch.image_urls = fotos;
    }
    if (bio && !(s.description && String(s.description).trim())) patch.description = bio;
    if (video && !(s.video_url && String(s.video_url).trim())) patch.video_url = video;
    if (subcat && !(s.subcategory && String(s.subcategory).trim())) patch.subcategory = subcat;

    if (Object.keys(patch).length === 0) continue;
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(s.id)}`, {
      method: 'PATCH', headers: sbHdr, body: JSON.stringify(patch)
    });
    if (r.ok) { updated++; fieldsByShow[s.id] = Object.keys(patch); }
  }
  return { updated, fields_by_show: fieldsByShow };
}

// Alias retrocompatible (algunos sitios viejos llaman al nombre original).
async function propagateFotosToEmptyShows(env, artistaId, fotos) {
  return propagateArtistaDataToEmptyShows(env, artistaId, { fotos_urls: fotos });
}

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

  // Propagar foto a shows vinculados sin imagen propia (best-effort, no bloquea)
  let showsSync = { updated: 0 };
  try { showsSync = await propagateFotosToEmptyShows(env, id, nextArray); }
  catch (e) { showsSync = { updated: 0, error: e.message }; }

  return res.status(200).json({ success: true, artista: updated, uploadedUrl: publicUrl, shows_sync: showsSync });
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

  // GHL sync: url_imagen está como FILE_UPLOAD en GHL custom_objects.shows,
  // rechaza URLs externas. Desactivado hasta que Xavi cambie el campo a TEXT.
  // (la imagen sí queda guardada en image_url + image_urls de Supabase para
  // /admin, propuestas y el catálogo público.)
  const ghlImg = { updated: false, skipped: 'url_imagen_field_is_FILE_UPLOAD' };
  if (false && show.ghl_show_id && env.GHL_TOKEN && env.GHL_LOC) {
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

// Busca en GHL un record de custom_objects.shows que ya represente a este
// show. Clave: url_admin termina en "?show=<show.id>" (único por show). Sirve
// para NO crear un duplicado al aprobar si el record ya existe (doble-click,
// re-aprobación, ghl_show_id perdido). Devuelve el id GHL o null.
async function findGhlShowRecordId(env, show) {
  if (!env.GHL_TOKEN || !env.GHL_LOC || !show || !show.id) return null;
  const suffix = `?show=${show.id}`;
  const query = show.name || show.id;
  try {
    const g = await ghlFetch('POST', `/objects/${GHL_SHOWS_OBJECT_KEY}/records/search`, env, {
      locationId: env.GHL_LOC, query, page: 1, pageLimit: 20
    });
    if (!g.ok) return null;
    let recs = [];
    try { recs = (JSON.parse(g.body).records) || []; } catch { return null; }
    const match = recs.find(rec => String((rec.properties || {}).url_admin || '').endsWith(suffix));
    return match ? match.id : null;
  } catch (e) { return null; }
}

async function reviewShow(req, res, env) {
  const { id, action, patch } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing id' });
  if (!['approve', 'archive', 'to-pending', 'edit'].includes(action)) {
    return res.status(400).json({ error: 'action must be approve|archive|to-pending|edit' });
  }

  const now = new Date().toISOString();
  const update = { reviewed_at: now, reviewed_by: 'admin' };
  if (action === 'approve') update.status = 'active';
  if (action === 'archive') update.status = 'archived';
  if (action === 'to-pending') update.status = 'pending_review';
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
    // Idempotencia anti-duplicado: si vamos a crear (approve sin ghl_show_id),
    // primero re-leemos ghl_show_id fresco de Supabase (otra request concurrente
    // —doble-click en Aprobar— pudo haberlo creado) y buscamos un record GHL
    // existente para este show. Si existe, lo adoptamos en vez de crear otro.
    if (!show.ghl_show_id && action === 'approve') {
      let existingId = null;
      try {
        const fr = await fetch(
          `${env.SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(show.id)}&select=ghl_show_id`,
          { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` } }
        );
        if (fr.ok) { const rr = await fr.json(); existingId = rr[0]?.ghl_show_id || null; }
      } catch (e) { /* sigue */ }
      if (!existingId) existingId = await findGhlShowRecordId(env, show);
      if (existingId) {
        // Adoptar el record existente (no crear duplicado)
        if (existingId !== show.ghl_show_id) {
          await fetch(`${env.SUPABASE_URL}/rest/v1/shows?id=eq.${encodeURIComponent(show.id)}`, {
            method: 'PATCH',
            headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ghl_show_id: existingId })
          });
        }
        show.ghl_show_id = existingId;
      }
    }
    if (!show.ghl_show_id && action === 'approve') {
      // CREATE en GHL custom_objects.shows
      const props = {
        nombre_show: show.name || '',
        url_admin: adminUrlShow(env, show.id),
        estado_show: show.status || 'active'
      };
      if (show.description) props.descripcion_show = show.description;
      if (show.video_url) props.url_video = show.video_url;
      // url_imagen rechazado por GHL (FILE_UPLOAD field, no URL externa)
      // if (show.image_url) props.url_imagen = show.image_url;
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
        // url_imagen rechazado por GHL (FILE_UPLOAD field)
        // if ('image_url' in update) props.url_imagen = show.image_url || '';
      }
      const g = await ghlFetch('PUT', `/objects/${GHL_SHOWS_OBJECT_KEY}/records/${encodeURIComponent(show.ghl_show_id)}?locationId=${encodeURIComponent(env.GHL_LOC)}`, env, {
        properties: props
      });
      ghl = g.ok ? { updated: true, fields: Object.keys(props) } : { error: `GHL ${g.status}: ${g.body.slice(0, 200)}` };
    }
  }
  return res.status(200).json({ success: true, show, ghl });
}

// === geo-metrics ===
// Consume el MCP/REST de eventosbarcelona.com (WordPress) con auth Basic
// server-side (WP_USER/WP_PASS desde env vars) y devuelve métricas
// GEO/AEO/SEO normalizadas para el dashboard live. Sin secretos en el browser.
// Consolidado dentro de /api/admin para no exceder el límite Hobby de 12
// funciones serverless.
async function geoMetrics(req, res, env) {
  const WP_BASE = 'https://www.eventosbarcelona.com/wp-json';
  const user = process.env.WP_USER;
  const pass = process.env.WP_PASS;
  if (!user || !pass) {
    return res.status(500).json({ error: 'WP_USER / WP_PASS no configurados en Vercel env vars' });
  }
  const auth = Buffer.from(`${user}:${pass}`).toString('base64');
  async function wp(method, path, body) {
    const opts = {
      method,
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(WP_BASE + path, opts);
    if (!r.ok) return { _error: `HTTP ${r.status}`, _path: path };
    return r.json();
  }
  try {
    const [
      visibility, audit, llmsStatus, robotsStatus, siteInfo,
      botTraffic, schemaStatus, recommendations, topPages,
    ] = await Promise.all([
      wp('POST', '/llm-analytics/v1/visibility-score/calculate', {}),
      wp('POST', '/llm-analytics/v1/agent-audit/run', {}),
      wp('GET', '/wp-abilities/v1/abilities/llmagnet/get-llms-txt-status/run'),
      wp('GET', '/wp-abilities/v1/abilities/llmagnet/get-robots-txt-status/run'),
      wp('GET', '/wp-abilities/v1/abilities/llmagnet/get-site-info/run'),
      wp('GET', '/wp-abilities/v1/abilities/llmagnet/get-bot-traffic/run'),
      wp('GET', '/wp-abilities/v1/abilities/llmagnet/get-schema-status/run'),
      wp('GET', '/wp-abilities/v1/abilities/llmagnet/get-recommendations/run'),
      wp('GET', '/wp-abilities/v1/abilities/llmagnet/get-top-pages/run'),
    ]);
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    return res.status(200).json({
      generated_at: new Date().toISOString(),
      visibility: visibility?.score_data ?? visibility,
      audit: {
        score: audit?.score,
        agent_ready: audit?.agent_ready,
        counts: audit?.counts,
        flag_checks: audit?.flag_checks,
        domains: audit?.domains,
      },
      llms_txt: llmsStatus?.data ?? llmsStatus,
      robots: robotsStatus?.data ?? robotsStatus,
      site: siteInfo?.data ?? siteInfo,
      bots: botTraffic?.data ?? botTraffic,
      schema: schemaStatus?.data ?? schemaStatus,
      recommendations: recommendations?.data ?? recommendations,
      top_pages: topPages?.data ?? topPages,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}

// ---------------------------------------------------------------------------
// MOTOR DE IDEAS — endpoints para el GPT de Xavi (GPT Actions)
//
// El cerebro vive en el GPT de Xavi: la inferencia la paga su suscripción de
// ChatGPT, así que esto NO llama a ninguna API de pago ni genera coste.
// Aquí solo servimos el catálogo REAL de Supabase para que el GPT deje de
// inventarse shows y trabaje con lo que Eventos Barcelona puede producir.
//
// Rutas limpias vía rewrites en vercel.json (no suman función, siguen siendo
// este mismo handler, que el plan Hobby está a 12/12):
//   GET /api/gpt/catalogo -> action=gpt-catalogo
//   GET /api/gpt/show     -> action=gpt-show
//
// Auth: bearer token en GPT_ACTION_TOKEN. Aquí sí tiene sentido, porque el
// token vive en la config del GPT y no en una página pública.
// ---------------------------------------------------------------------------

function ideasSbHeaders(env) {
  return { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` };
}

async function ideasSbGet(env, path) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: ideasSbHeaders(env) });
  if (!r.ok) throw new Error(`Supabase GET ${path.split('?')[0]}: ${await r.text()}`);
  return r.json();
}

// Comparación en tiempo constante para no filtrar el token carácter a carácter.
function tokenValido(recibido, esperado) {
  if (!recibido || !esperado || recibido.length !== esperado.length) return false;
  let diff = 0;
  for (let i = 0; i < recibido.length; i++) diff |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i);
  return diff === 0;
}

function gptAuthOk(req, env) {
  if (!env.GPT_TOKEN) return { ok: false, code: 500, error: 'Falta GPT_ACTION_TOKEN en el servidor' };
  const raw = req.headers && (req.headers.authorization || req.headers.Authorization);
  const bearer = typeof raw === 'string' ? raw.replace(/^Bearer\s+/i, '').trim() : '';
  if (!tokenValido(bearer, env.GPT_TOKEN)) return { ok: false, code: 401, error: 'Token inválido' };
  return { ok: true };
}

// ---------- referencias (CRUD que usa Xavi desde el tab Ideas) ----------

// El handler hace `return fn(...)` sin await, así que un throw asíncrono se
// escapa de su try/catch y Vercel lo convierte en un crash sin cuerpo. Las
// acciones del motor de ideas capturan aquí para devolver JSON legible.
async function listReferencias(req, res, env) {
  try {
    // Devolvemos también el estado de la conexión con el GPT para que el tab
    // pueda decir si está listo sin exponer el token al browser.
    // El radar vive en Supabase, no en un fichero: `data/` está en .gitignore,
    // así que un JSON ahí nunca llegaría a producción. Y así refrescarlo no
    // obliga a redesplegar.
    const [rows, activos, radar] = await Promise.all([
      ideasSbGet(env, 'referencias?select=*&order=created_at.asc'),
      ideasSbGet(env, 'shows?status=eq.active&select=id'),
      ideasSbGet(env, 'ideas_sesiones?brief->>tipo=eq.radar-sector&select=resultado,created_at&order=created_at.desc&limit=1')
    ]);
    return res.status(200).json({
      items: rows,
      gpt: { token_configurado: !!env.GPT_TOKEN, shows_activos: activos.length },
      radar: radar[0] ? radar[0].resultado : null
    });
  } catch (err) {
    const falta = /Could not find the table/i.test(err.message);
    return res.status(500).json({
      error: falta ? 'Falta la tabla `referencias`: aplica supabase/migrations/20260816_referencias_ideas.sql' : err.message
    });
  }
}

async function saveReferencia(req, res, env) {
  const b = req.body || {};
  const nombre = (b.nombre || '').trim();
  const url = (b.url || '').trim();
  if (!nombre || !url) return res.status(400).json({ error: 'nombre y url son obligatorios' });
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'La url tiene que empezar por http:// o https://' });

  const row = {
    nombre,
    url,
    tipo: (b.tipo || 'web').trim(),
    notas: (b.notas || '').trim() || null,
    tags: Array.isArray(b.tags) ? b.tags.filter(Boolean) : [],
    activa: b.activa !== false
  };

  const isEdit = b.id && UUID_RE.test(b.id);
  const endpoint = isEdit
    ? `${env.SUPABASE_URL}/rest/v1/referencias?id=eq.${encodeURIComponent(b.id)}`
    : `${env.SUPABASE_URL}/rest/v1/referencias`;
  if (isEdit) row.updated_at = new Date().toISOString();

  const r = await fetch(endpoint, {
    method: isEdit ? 'PATCH' : 'POST',
    headers: { ...ideasSbHeaders(env), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  if (!r.ok) return res.status(500).json({ error: await r.text() });
  const saved = await r.json();
  return res.status(200).json({ ok: true, referencia: saved[0] || null });
}

// Publica un informe de radar. Lo llama scripts/radar-publicar.js desde local,
// que es donde hay salida a internet para leer los sitemaps.
async function saveRadar(req, res, env) {
  const resultado = req.body && req.body.resultado;
  if (!resultado || typeof resultado !== 'object') {
    return res.status(400).json({ error: 'Falta el objeto `resultado`' });
  }
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/ideas_sesiones`, {
    method: 'POST',
    headers: { ...ideasSbHeaders(env), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ brief: { tipo: 'radar-sector' }, resultado, modelo: 'claude-code-local' })
  });
  if (!r.ok) return res.status(500).json({ error: await r.text() });
  const saved = await r.json();
  return res.status(200).json({ ok: true, id: saved[0] && saved[0].id });
}

async function deleteReferencia(req, res, env) {
  const id = (req.body && req.body.id) || '';
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'id inválido' });
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/referencias?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: ideasSbHeaders(env)
  });
  if (!r.ok) return res.status(500).json({ error: await r.text() });
  return res.status(200).json({ ok: true });
}

// ---------- catálogo para el GPT ----------

function nombreArtista(a) {
  return a ? (a.nombre_artistico || a.nombre) : null;
}

// Sin esto "laser" no encuentra "Show Láser", y el catálogo está lleno de
// acentos (Aéreas, Acróbatas, Dúo). El GPT escribe sin acentos la mitad de las
// veces, así que normalizamos los dos lados.
function sinAcentos(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function artistasDeShow(s) {
  return uniq((Array.isArray(s.show_artistas) ? s.show_artistas : []).map(sa => nombreArtista(sa && sa.artista)));
}

// Ficha mínima. Las Actions meten la respuesta entera en el contexto del GPT,
// así que por defecto va sin descripciones: 250 shows compactos ocupan poco y
// el GPT los ve TODOS. Si necesita detalle de alguno, tira de /api/gpt/show.
function showCompacto(s) {
  return {
    id: s.id,
    nombre: s.name,
    categoria: s.category || null,
    subcategoria: s.subcategory || null,
    artistas: artistasDeShow(s)
  };
}

async function gptCatalogo(req, res, env) {
  const auth = gptAuthOk(req, env);
  if (!auth.ok) return res.status(auth.code).json({ error: auth.error });

  try {
    const showCols = 'id,name,category,subcategory,description,status,show_artistas(artista:artista_id(nombre,nombre_artistico))';
    const [shows, referencias] = await Promise.all([
      ideasSbGet(env, `shows?status=eq.active&select=${showCols}&order=category,name`),
      ideasSbGet(env, 'referencias?activa=is.true&select=nombre,url,notas,tags&order=created_at.asc')
    ]);

    const q = sinAcentos((req.query.q || '').trim());
    const categoria = sinAcentos((req.query.categoria || '').trim());
    const conDescripcion = String(req.query.incluir_descripciones || '') === 'true';

    let filtrados = shows;
    if (categoria) {
      filtrados = filtrados.filter(s => sinAcentos(s.category) === categoria);
    }
    if (q) {
      // Filtro amplio a propósito: es mejor que al GPT le sobren shows a que le
      // falten. La selección fina la hace él, que para eso ve la lista entera.
      filtrados = filtrados.filter(s => sinAcentos([s.name, s.category, s.subcategory, s.description]
        .filter(Boolean).join(' ')).includes(q));
    }

    const items = filtrados.map(s => {
      const base = showCompacto(s);
      if (conDescripcion && s.description) base.descripcion = s.description.replace(/\s+/g, ' ').trim().slice(0, 300);
      return base;
    });

    return res.status(200).json({
      total_catalogo: shows.length,
      devueltos: items.length,
      categorias: uniq(shows.map(s => s.category)).sort(),
      shows: items,
      referencias: referencias.map(r => ({ nombre: r.nombre, url: r.url, notas: r.notas, tags: r.tags })),
      instrucciones: 'Estos son los unicos shows que Eventos Barcelona puede producir directamente. Usa el id exacto al citarlos. Si el concepto necesita algo que no esta en esta lista, dilo como "a producir a medida" y no lo presentes como show existente.'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function gptShow(req, res, env) {
  const auth = gptAuthOk(req, env);
  if (!auth.ok) return res.status(auth.code).json({ error: auth.error });

  const ids = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 12);
  if (!ids.length) return res.status(400).json({ error: 'Pasa al menos un id en ?ids=' });

  try {
    const cols = 'id,name,category,subcategory,description,base_price,price_note,video_url,image_url,'
      + 'show_artistas(artista:artista_id(nombre,nombre_artistico,compania,ciudad,bio_show))';
    const lista = ids.map(encodeURIComponent).join(',');
    const shows = await ideasSbGet(env, `shows?id=in.(${lista})&select=${cols}`);

    const encontrados = shows.map(s => ({
      id: s.id,
      nombre: s.name,
      categoria: s.category || null,
      subcategoria: s.subcategory || null,
      descripcion: s.description || null,
      precio_base: s.base_price || null,
      nota_precio: s.price_note || null,
      video: s.video_url || null,
      imagen: s.image_url || null,
      url_ficha: adminUrlShow(env, s.id),
      artistas: (Array.isArray(s.show_artistas) ? s.show_artistas : [])
        .map(sa => sa && sa.artista)
        .filter(Boolean)
        .map(a => ({ nombre: nombreArtista(a), compania: a.compania || null, ciudad: a.ciudad || null, bio: a.bio_show || null }))
    }));

    // Devolvemos los que no existen para que el GPT sepa que se los inventó.
    const noExisten = ids.filter(id => !shows.some(s => s.id === id));
    return res.status(200).json({ shows: encontrados, no_encontrados: noExisten });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
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
    GHL_LOC: trim(process.env.GHL_LOCATION_ID),
    GPT_TOKEN: trim(process.env.GPT_ACTION_TOKEN)
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
      if (action === 'search-ghl-artistas') return searchGhlArtistas(req, res, env);
      if (action === 'geo-metrics') return geoMetrics(req, res, env);
      if (action === 'list-referencias') return listReferencias(req, res, env);
      if (action === 'gpt-catalogo') return gptCatalogo(req, res, env);
      if (action === 'gpt-show') return gptShow(req, res, env);
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
      if (action === 'create-show-from-artista') return createShowFromArtista(req, res, env);
      if (action === 'import-artista-from-ghl') return importArtistaFromGhl(req, res, env);
      if (action === 'delete-proposal') return deleteProposal(req, res, env);
      if (action === 'duplicate-proposal') return duplicateProposal(req, res, env);
      if (action === 'ensure-proposal-for-lead') return ensureProposalForLead(req, res, env);
      if (action === 'save-referencia') return saveReferencia(req, res, env);
      if (action === 'delete-referencia') return deleteReferencia(req, res, env);
      if (action === 'save-radar') return saveRadar(req, res, env);
    }
    return res.status(400).json({
      error: 'Unknown action',
      hint: 'GET list-artistas|list-proposals|get-artista-detail|shows-pending | POST link-show-to-artista|set-show-artistas|review-show|edit-show|add-show|delete-show|upload-show-image|upload-artista-photo|set-show-images|toggle-favorite|add-artista|edit-artista|delete-artista|create-show-from-artista|delete-proposal|duplicate-proposal|ensure-proposal-for-lead'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
