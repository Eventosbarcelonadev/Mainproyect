#!/usr/bin/env node
/**
 * One-shot: corrige la opp de prueba de philosh95@gmail.com en GHL.
 *   - monetaryValue = 18000 (el parser viejo lo dejó en 18)
 *   - estilos_artisticos: pasa de array (CHECKBOX) a string multiline (LARGE_TEXT)
 *
 * Uso:
 *   node scripts/fix-philosh95-opp.js               # dry run
 *   node scripts/fix-philosh95-opp.js --apply       # aplica
 */
import 'dotenv/config';

const API = 'https://services.leadconnectorhq.com';
const TOKEN = process.env.GHL_API_KEY;
const LOC = process.env.GHL_LOCATION_ID;
const EMAIL = 'philosh95@gmail.com';
const APPLY = process.argv.includes('--apply');

const ESTILOS_FIELD_ID = 'Y3CacQG4d9rl8T9l0zmS';

if (!TOKEN || !LOC) {
  console.error('Falta GHL_API_KEY o GHL_LOCATION_ID en env');
  process.exit(1);
}

const H = {
  Authorization: `Bearer ${TOKEN}`,
  Version: '2021-07-28',
  'Content-Type': 'application/json'
};

async function main() {
  // 1. Buscar contact por email
  const searchRes = await fetch(`${API}/contacts/search`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      locationId: LOC,
      filters: [{ field: 'email', operator: 'eq', value: EMAIL }],
      pageLimit: 5
    })
  });
  const searchData = await searchRes.json();
  const contact = searchData.contacts?.[0];
  if (!contact) {
    console.error('No se encontró contact para', EMAIL);
    console.error('Response:', JSON.stringify(searchData));
    process.exit(1);
  }
  console.log('Contact:', contact.id, contact.email, contact.firstName);

  // 2. Listar opps del contact (via /opportunities/search con contact_id)
  const oppsRes = await fetch(`${API}/opportunities/search?location_id=${LOC}&contact_id=${contact.id}&limit=20`, { headers: H });
  const oppsData = await oppsRes.json();
  const opps = oppsData.opportunities || [];
  if (!opps.length) {
    console.error('No hay opps para este contact');
    process.exit(1);
  }
  // Más reciente primero (la última prueba)
  opps.sort((a, b) => new Date(b.dateAdded || b.updatedAt || 0) - new Date(a.dateAdded || a.updatedAt || 0));
  const opp = opps[0];
  console.log('Opp:', opp.id, opp.name, 'monetaryValue actual:', opp.monetaryValue);

  // 3. Leer custom fields actuales
  const oppDetailRes = await fetch(`${API}/opportunities/${opp.id}`, { headers: H });
  const oppDetail = await oppDetailRes.json();
  const cfs = oppDetail.opportunity?.customFields || [];
  const estilosCf = cfs.find(c => c.id === ESTILOS_FIELD_ID);
  let estilosArr = [];
  if (estilosCf) {
    const v = estilosCf.fieldValue ?? estilosCf.field_value;
    if (Array.isArray(v)) estilosArr = v;
    else if (typeof v === 'string') estilosArr = v.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  }
  console.log('Estilos actuales:', estilosArr);

  const estilosMultiline = estilosArr.join('\n');

  const putBody = {
    pipelineStageId: opp.pipelineStageId,
    name: opp.name,
    status: opp.status,
    monetaryValue: 18000,
    customFields: [
      { key: 'estilos_artisticos', field_value: estilosMultiline }
    ]
  };
  console.log('PUT body:', JSON.stringify(putBody, null, 2));

  if (!APPLY) {
    console.log('\n(dry run) — pasa --apply para ejecutar');
    return;
  }

  const putRes = await fetch(`${API}/opportunities/${opp.id}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify(putBody)
  });
  const putText = await putRes.text();
  console.log('PUT status:', putRes.status);
  console.log('PUT body:', putText);
}

main().catch(e => { console.error(e); process.exit(1); });
