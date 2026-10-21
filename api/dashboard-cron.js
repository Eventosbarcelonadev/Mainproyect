// GET /api/dashboard-cron
// Genera el informe de resultados (lib/dashboard/datos.js + render.js) y lo guarda en Supabase
// Storage como el de hoy (lib/dashboard/almacen.js). Lo llama el cron de Vercel los miércoles
// (vercel.json) con `Authorization: Bearer CRON_SECRET`; si el último informe tiene menos de
// CADA_DIAS días no hace nada, así sale uno cada dos semanas.
// ?forzar=1 lo genera aunque no toque (con CRON_SECRET o sesión del equipo).
//
// Variables: GOOGLE_SA_JSON_B64 (cuenta de servicio de Search Console y GA4, en base64),
// BING_WEBMASTER_API_KEY, GHL_*, SUPABASE_URL, SUPABASE_SERVICE_KEY y CRON_SECRET.
import fs from 'node:fs';
import path from 'node:path';
import { esEquipo } from '../lib/sesion-admin.js';
import { recogerDatos, resumenInforme } from '../lib/dashboard/datos.js';
import { renderDashboard } from '../lib/dashboard/render.js';
import { leerIndice, publicarInforme } from '../lib/dashboard/almacen.js';

const CADA_DIAS = 13;

export default async function handler(req, res) {
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
