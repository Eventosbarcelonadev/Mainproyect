// Dashboard de resultados. Va dentro de api/admin.js (acciones "dashboard" y "dashboard-cron")
// porque el plan Hobby de Vercel no admite más de 12 funciones por despliegue y ya estaban todas.
// Rewrites de vercel.json:
//   /dashboard             → último informe
//   /dashboard/historico   → lista de informes guardados
//   /dashboard/AAAA-MM-DD  → un informe guardado, con un aviso arriba si no es el último
//   /api/dashboard-cron    → genera el informe y lo guarda (cron de Vercel los miércoles a las 6:00 UTC)
// Los informes se guardan en Supabase Storage (almacen.js). Cada acción comprueba su acceso:
// la página pide sesión del equipo (el middleware ya lo hace en /dashboard, pero /api queda fuera
// de su matcher) y el cron, `Authorization: Bearer CRON_SECRET` o sesión del equipo.
//
// El cron genera solo si el último informe tiene CADA_DIAS días o más, así sale uno cada dos
// semanas; ?forzar=1 lo genera igual. Variables: GOOGLE_SA_JSON_B64 (cuenta de servicio de Search
// Console y GA4, en base64), BING_WEBMASTER_API_KEY, GHL_*, SUPABASE_URL, SUPABASE_SERVICE_KEY y
// CRON_SECRET.
import fs from 'node:fs';
import path from 'node:path';
import { esEquipo } from '../sesion-admin.js';
import { bajar, leerIndice, publicarInforme } from './almacen.js';
import { recogerDatos, resumenInforme } from './datos.js';
import { renderDashboard, renderHistorico, avisoArchivado, renderMensaje } from './render.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function enviar(res, status, html) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.end(html);
}

export async function paginaDashboard(req, res) {
  const q = new URL(req.url, 'http://localhost').searchParams;
  const informe = String((req.query && req.query.informe) || q.get('informe') || '');
  const lista = String((req.query && req.query.lista) || q.get('lista') || '') === '1';
  const ruta = lista ? '/dashboard/historico' : informe ? `/dashboard/${informe}` : '/dashboard';

  if (!(await esEquipo(req))) {
    res.statusCode = 303;
    res.setHeader('Location', `/login?next=${encodeURIComponent(ruta)}`);
    res.setHeader('Cache-Control', 'no-store');
    return res.end();
  }
  try {
    const indice = await leerIndice(process.env);
    if (lista) return enviar(res, 200, renderHistorico(indice));
    if (informe && !FECHA.test(informe)) return enviar(res, 404, renderMensaje('Informe no encontrado', `No hay ningún informe con la fecha ${informe}.`));
    const fecha = informe || (indice[0] && indice[0].fecha);
    if (!fecha) return enviar(res, 404, renderMensaje('Todavía no hay informes', 'El primero se genera el próximo miércoles.'));
    let html = await bajar(process.env, `${fecha}.html`);
    if (!html) return enviar(res, 404, renderMensaje('Informe no encontrado', `No hay ningún informe del ${fecha}.`));
    if (indice[0] && fecha !== indice[0].fecha) html = html.replace(/<body([^>]*)>/, m => m + avisoArchivado(fecha, indice[0].fecha));
    return enviar(res, 200, html);
  } catch (e) {
    console.error('dashboard', e);
    return enviar(res, 500, renderMensaje('No se pudo abrir el informe', 'Error al leer los informes guardados. Prueba de nuevo en un momento.'));
  }
}

const CADA_DIAS = 13;

export async function generarDashboard(req, res) {
  const env = process.env;
  const esCron = !!env.CRON_SECRET && String(req.headers.authorization || '') === `Bearer ${env.CRON_SECRET}`;
  if (!esCron && !(await esEquipo(req))) return res.status(401).json({ error: 'No autorizado' });
  const forzar = String((req.query && req.query.forzar) || '') === '1';

  try {
    const hoy = new Date();
    const fecha = hoy.toISOString().slice(0, 10);
    const ultimo = (await leerIndice(env))[0];
    const dias = ultimo ? (Date.parse(fecha) - Date.parse(ultimo.fecha)) / 864e5 : Infinity;
    if (!forzar && dias < CADA_DIAS) return res.status(200).json({ ok: true, omitido: `El último informe es del ${ultimo.fecha}; toca cada dos semanas.` });

    const sa = JSON.parse(Buffer.from(env.GOOGLE_SA_JSON_B64 || '', 'base64').toString('utf8'));
    const citas = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'bing-ai-citas.json'), 'utf8'));
    const t0 = Date.now();
    const datos = await recogerDatos({ env, sa, hoy });
    const html = renderDashboard(datos, citas);
    await publicarInforme(env, { fecha, html, datos, resumen: resumenInforme(datos) });
    return res.status(200).json({ ok: true, fecha, meses: datos.months, datosHasta: datos.gscRecent.end, segundos: Math.round((Date.now() - t0) / 1000) });
  } catch (e) {
    console.error('dashboard-cron', e);
    return res.status(500).json({ error: e.message });
  }
}
