// POST /api/track-proposal
// Registra lo que hace el CLIENTE en la propuesta (propuesta.html, vista cliente):
//   open     → ha cargado la página
//   engaged  → persona real: 4 s visible + un gesto (descarta escáneres de correo)
//   section  → un bloque (portada, concepto, show, resumen, condiciones) ha quedado a la vista
//   click    → clic en un botón o enlace (PDF, vídeo, fotos, idioma, email...), con el
//              show en el que se ha hecho (section/name) desde el 19-oct-2026
//   leave    → oculta o cierra la pestaña: segundos visibles, scroll máximo, secciones
//              vistas y dwell (segundos por sección desde el envío anterior)
// Body JSON (o text/plain vía sendBeacon): { proposalId, sessionId, event, detail, lang }
//
// En cada "engaged" actualiza proposals.first_opened_at / last_opened_at / open_count,
// escribe el custom field GHL "Propuesta abierta" y, la primera vez, deja una nota
// en el contacto y dispara GHL_WORKFLOW_PROPOSAL_OPENED (opcional) para avisar a Xavi.
// Nunca devuelve error al cliente: el seguimiento no puede romper la propuesta.
//
// Las visitas del equipo no se guardan: si el navegador tiene abierta la sesión del
// admin (lib/sesion-admin.js), es Xavi o alguien de EB mirando la propuesta, no el
// cliente. Va además del aviso de propuesta.html (localStorage eb_interno).

import { esEquipo } from '../lib/sesion-admin.js';

const EVENTS = new Set(['open', 'engaged', 'section', 'click', 'leave']);
const GHL_API = 'https://services.leadconnectorhq.com';
// Escáneres de enlaces de correo y previsualizadores: abren la URL antes que la persona.
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp\/|telegrambot|skypeuripreview|slackbot|discordbot|twitterbot|pinterestbot|proofpoint|mimecast|barracuda|forcepoint|symantec|mcafee|trendmicro|zscaler|safelinks|urldefense|headless|phantom|lighthouse|pagespeed|gtmetrix|curl\/|wget\/|python|go-http|java\/|okhttp|axios|node-fetch|preview|scan/i;

function deviceOf(ua) {
  if (/ipad|tablet|silk|kindle/i.test(ua)) return 'tablet';
  if (/mobi|android|iphone|ipod/i.test(ua)) return 'mobile';
  return 'desktop';
}

function parseBody(req) {
  const b = req.body;
  if (!b) return null;
  if (typeof b === 'object') return b;
  try { return JSON.parse(String(b)); } catch { return null; }
}

async function hashIp(ip, salt) {
  try {
    const data = new TextEncoder().encode(`${ip}|${salt}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

function fmtMadrid(d) {
  return new Date(d).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  }).replace(',', '');
}

const DEVICE_ES = { mobile: 'móvil', tablet: 'tablet', desktop: 'escritorio' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SB_URL = (process.env.SUPABASE_URL || '').trim();
  const SB_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();
  const GHL_KEY = (process.env.GHL_API_KEY || '').trim();
  const WORKFLOW = (process.env.GHL_WORKFLOW_PROPOSAL_OPENED || '').trim();

  const body = parseBody(req);
  const proposalId = String(body?.proposalId || '').trim();
  const event = String(body?.event || '').trim();
  if (!SB_URL || !SB_KEY || !proposalId || proposalId.length > 100 || !EVENTS.has(event)) {
    return res.status(204).end();
  }
  if (await esEquipo(req)) return res.status(204).end();

  const ua = String(req.headers['user-agent'] || '').slice(0, 400);
  const isBot = BOT_RE.test(ua);
  const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim();
  const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase().slice(0, 2) || null;
  let city = null;
  try { city = req.headers['x-vercel-ip-city'] ? decodeURIComponent(String(req.headers['x-vercel-ip-city'])).slice(0, 80) : null; } catch { city = null; }
  const device = deviceOf(ua);
  const lang = body?.lang === 'en' ? 'en' : 'es';
  const detail = body?.detail && typeof body.detail === 'object' ? body.detail : null;
  const sessionId = String(body?.sessionId || '').slice(0, 64) || null;

  const sbHeaders = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    await fetch(`${SB_URL}/rest/v1/proposal_views`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        proposal_id: proposalId,
        session_id: sessionId,
        event,
        detail,
        lang,
        country,
        city,
        device,
        ua,
        is_bot: isBot,
        ip_hash: ip ? await hashIp(ip, SB_KEY.slice(-12)) : null
      })
    });
  } catch (err) {
    console.error('track-proposal insert', err.message);
  }

  // Solo una persona real cuenta como apertura.
  if (event !== 'engaged' || isBot) return res.status(204).end();

  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/proposals?id=eq.${encodeURIComponent(proposalId)}&select=id,first_opened_at,open_count,ghl_contact_id,client_company,client_name,lang`,
      { headers: sbHeaders }
    );
    const rows = await r.json();
    const p = Array.isArray(rows) ? rows[0] : null;
    if (!p) return res.status(204).end();

    const now = new Date().toISOString();
    const firstTime = !p.first_opened_at;
    const openCount = (Number(p.open_count) || 0) + 1;

    await fetch(`${SB_URL}/rest/v1/proposals?id=eq.${encodeURIComponent(proposalId)}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ last_opened_at: now, open_count: openCount, first_opened_at: p.first_opened_at || now })
    });

    if (!GHL_KEY || !p.ghl_contact_id) return res.status(204).end();

    const ghlHeaders = {
      Authorization: `Bearer ${GHL_KEY}`,
      Version: '2021-07-28',
      'Content-Type': 'application/json'
    };
    const where = [country, city].filter(Boolean).join(' ');
    const resumen = `Sí · ${openCount} apertura${openCount === 1 ? '' : 's'} · última ${fmtMadrid(now)} · ${where || 'origen desconocido'} · ${DEVICE_ES[device]}`;
    const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
    const baseUrl = process.env.PUBLIC_BASE_URL || `${proto}://${req.headers.host}`;

    const jobs = [
      // Campo "Propuesta abierta": se ve en la ficha del contacto y sirve de disparador de workflows.
      fetch(`${GHL_API}/contacts/${p.ghl_contact_id}`, {
        method: 'PUT',
        headers: ghlHeaders,
        body: JSON.stringify({ customFields: [{ key: 'propuesta_abierta', field_value: resumen }] })
      })
    ];
    if (firstTime) {
      jobs.push(fetch(`${GHL_API}/contacts/${p.ghl_contact_id}/notes`, {
        method: 'POST',
        headers: ghlHeaders,
        body: JSON.stringify({
          body: `Propuesta abierta por el cliente el ${fmtMadrid(now)} (${where || 'origen desconocido'}, ${DEVICE_ES[device]}).\n${baseUrl}/propuesta.html?id=${encodeURIComponent(proposalId)}`
        })
      }));
      if (WORKFLOW) {
        jobs.push(fetch(`${GHL_API}/contacts/${p.ghl_contact_id}/workflow/${WORKFLOW}`, { method: 'POST', headers: ghlHeaders }));
      }
    }
    const results = await Promise.allSettled(jobs);
    results.forEach((x, i) => {
      if (x.status === 'rejected') console.error('track-proposal ghl', i, x.reason?.message);
      else if (!x.value.ok) console.error('track-proposal ghl', i, x.value.status);
    });
  } catch (err) {
    console.error('track-proposal engaged', err.message);
  }

  return res.status(204).end();
}
