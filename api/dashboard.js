// GET /dashboard              → último informe de resultados
// GET /dashboard/historico    → lista de informes guardados
// GET /dashboard/AAAA-MM-DD   → un informe guardado, con un aviso arriba si no es el último
// (rewrites de vercel.json a /api/dashboard). Los informes los genera api/dashboard-cron.js y se
// guardan en Supabase Storage (lib/dashboard/almacen.js). Solo para el equipo: el middleware ya
// pide sesión en /dashboard, pero /api queda fuera de su matcher, así que aquí se comprueba otra vez.
import { esEquipo } from '../lib/sesion-admin.js';
import { bajar, leerIndice } from '../lib/dashboard/almacen.js';
import { renderHistorico, avisoArchivado, renderMensaje } from '../lib/dashboard/render.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function enviar(res, status, html) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.end(html);
}

export default async function handler(req, res) {
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
