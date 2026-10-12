/**
 * Crea el custom field de contacto en GHL:
 *   - "Propuesta abierta" (TEXT, contactos) → fieldKey contact.propuesta_abierta
 *
 * Lo rellena api/track-proposal.js cada vez que el cliente abre de verdad la
 * propuesta (evento engaged), con el formato:
 *   "Sí · 3 aperturas · última 12/10 19:02 · ES · móvil"
 * Xavi puede montar un workflow GHL con disparador "custom field changed"
 * sobre este campo para avisarse, o usar GHL_WORKFLOW_PROPOSAL_OPENED.
 *
 * Idempotente: si el campo ya existe no hace nada.
 */
require('dotenv').config();
const API_KEY = process.env.GHL_API_KEY;
const LOC = process.env.GHL_LOCATION_ID;
const BASE = 'https://services.leadconnectorhq.com';

async function api(method, path, body) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: text }; }
}

async function main() {
  if (!API_KEY || !LOC) throw new Error('Faltan GHL_API_KEY / GHL_LOCATION_ID en .env');
  const existing = await api('GET', `/locations/${LOC}/customFields`);
  const fields = existing.data?.customFields || [];
  const found = fields.find(f => f.fieldKey === 'contact.propuesta_abierta' || f.name === 'Propuesta abierta');
  if (found) {
    console.log(`Ya existe: ${found.name} (${found.fieldKey}) id=${found.id}`);
    return;
  }
  const r = await api('POST', `/locations/${LOC}/customFields`, {
    name: 'Propuesta abierta',
    dataType: 'TEXT',
    model: 'contact',
    placeholder: 'Sí · 3 aperturas · última 12/10 19:02 · ES · móvil'
  });
  if (r.status >= 300) throw new Error(`GHL ${r.status}: ${JSON.stringify(r.data)}`);
  const f = r.data.customField || r.data;
  console.log(`Creado: ${f.name} (${f.fieldKey}) id=${f.id}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
