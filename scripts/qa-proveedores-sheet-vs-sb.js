// Dry-run + apply: cruzar proveedores del sheet de Xavi contra Supabase.
//
// Lee data/xavi-contactos.csv (CSV completo de la planilla Xavi).
//   - Reporta qué proveedores ya están en SB y qué campos pueden backfillearse
//     (compania, telefono, actividad → bio_show).
//   - Reporta qué proveedores del sheet faltan en SB.
//   - Reporta qué proveedores en SB no aparecen en el sheet.
//
// Uso:
//   node scripts/qa-proveedores-sheet-vs-sb.js            # dry-run
//   node scripts/qa-proveedores-sheet-vs-sb.js --apply    # backfillea SB (NO toca GHL)
//   node scripts/qa-proveedores-sheet-vs-sb.js --apply --create  # también crea los faltantes
require('dotenv').config({ path: '.env' });
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const CREATE_MISSING = process.argv.includes('--create');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const sbHdr = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

const colors = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', dim: '\x1b[2m', bold: '\x1b[1m', reset: '\x1b[0m' };
const c = (col, t) => `${colors[col]}${t}${colors.reset}`;

// CSV parser básico que respeta comillas y soporta saltos de línea dentro de campos.
function parseCsv(text) {
  const rows = [];
  let cur = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i+1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { cur.push(field); field = ''; }
      else if (ch === '\r') { /* skip */ }
      else if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else field += ch;
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

(async () => {
  // 1. Cargar CSV
  const csvPath = path.join(__dirname, '..', 'data', 'xavi-contactos.csv');
  if (!fs.existsSync(csvPath)) { console.error('No existe', csvPath); process.exit(1); }
  const text = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCsv(text);
  const headers = rows[0].map(h => h.trim());
  const ix = (name) => headers.indexOf(name);
  const IX = {
    phone: ix('Phone'), email: ix('Email'), first: ix('First Name'), last: ix('Last Name'),
    business: ix('Business Name'), tags: ix('Tags'), actividad: ix('Actividad'),
    ciudad: ix('Población'), idFiscal: ix('ID Fiscal')
  };

  const sheet = rows.slice(1)
    .filter(r => r.length >= headers.length - 2 && r[IX.email])
    .map(r => ({
      email: (r[IX.email] || '').trim().toLowerCase(),
      tel: (r[IX.phone] || '').trim(),
      first: (r[IX.first] || '').trim(),
      last: (r[IX.last] || '').trim(),
      business: (r[IX.business] || '').trim(),
      tag: (r[IX.tags] || '').trim(),
      actividad: (r[IX.actividad] || '').trim(),
      ciudad: (r[IX.ciudad] || '').trim(),
      idFiscal: (r[IX.idFiscal] || '').trim()
    }));

  const sheetProveedores = sheet.filter(r => r.tag.toLowerCase() === 'proveedor');

  // 2. Cargar proveedores SB
  const r = await fetch(
    `${SB_URL}/rest/v1/artistas?tipo=eq.proveedor&select=id,nombre,nombre_artistico,compania,email,telefono,bio_show,ciudad&limit=2000`,
    { headers: sbHdr }
  );
  if (!r.ok) { console.error('SB error:', await r.text()); process.exit(1); }
  const sbAll = await r.json();
  const sbByEmail = new Map(sbAll.map(p => [(p.email || '').toLowerCase().trim(), p]));

  console.log(c('blue', `\n=== ${APPLY ? 'APPLY' : 'DRY-RUN'} proveedores sheet vs Supabase ===\n`));
  console.log(c('dim', `Sheet: ${sheet.length} contactos total · ${sheetProveedores.length} con tag=Proveedor`));
  console.log(c('dim', `Supabase: ${sbAll.length} proveedores total`));
  console.log('');

  let matched = 0, alreadyComplete = 0, notInSb = 0;
  const toBackfill = [];   // {sbId, email, patch, before}
  const missingInSb = [];  // {row}

  for (const row of sheetProveedores) {
    const sbRow = sbByEmail.get(row.email);
    if (!sbRow) { notInSb++; missingInSb.push(row); continue; }
    matched++;
    const patch = {};
    if (row.business && !(sbRow.compania && sbRow.compania.trim())) patch.compania = row.business;
    if (row.tel && !(sbRow.telefono && sbRow.telefono.trim())) patch.telefono = row.tel;
    if (row.actividad && !(sbRow.bio_show && sbRow.bio_show.trim())) patch.bio_show = row.actividad;
    if (row.ciudad && !(sbRow.ciudad && sbRow.ciudad.trim())) patch.ciudad = row.ciudad;
    if (Object.keys(patch).length === 0) { alreadyComplete++; continue; }
    toBackfill.push({ sbId: sbRow.id, email: row.email, patch, before: sbRow });
  }

  // ============================================================
  // REPORTE
  // ============================================================
  console.log(c('bold', `RESUMEN`));
  console.log(`  · ${matched} proveedores del sheet machean por email en SB`);
  console.log(`  · ${alreadyComplete} ya están completos (no faltan campos)`);
  console.log(`  · ${c('yellow', toBackfill.length + ' se backfillearían')} (${toBackfill.reduce((s, x) => s + Object.keys(x.patch).length, 0)} campos en total)`);
  console.log(`  · ${c('red', notInSb + ' del sheet NO están en SB')}`);
  console.log('');

  if (toBackfill.length) {
    console.log(c('bold', `\nBACKFILL (${toBackfill.length} proveedores):`));
    toBackfill.forEach(item => {
      console.log(`  ${c('yellow', '⟳')} ${item.email}`);
      for (const [k, v] of Object.entries(item.patch)) {
        const was = item.before[k] || '∅';
        console.log(`     ${c('dim', k.padEnd(12))} ${c('dim', String(was).slice(0, 40))} → ${c('green', String(v).slice(0, 60))}`);
      }
    });
  }

  if (missingInSb.length) {
    console.log(c('bold', `\nNO ESTÁN en SB (${missingInSb.length} proveedores del sheet sin contraparte):`));
    missingInSb.slice(0, 30).forEach(p => {
      console.log(`  ${c('red', '✗')} ${p.email.padEnd(40)} ${c('dim', p.business || '(sin business)')}  ${c('dim', '· ' + (p.actividad || '?'))}`);
    });
    if (missingInSb.length > 30) console.log(c('dim', `  ... ${missingInSb.length - 30} más`));
  }

  // SB proveedores sin compañía que no están en el sheet
  const sbSinCompaniaNoEnSheet = sbAll.filter(p => !(p.compania && p.compania.trim()) && !sheetProveedores.some(s => s.email === (p.email || '').toLowerCase()));
  if (sbSinCompaniaNoEnSheet.length) {
    console.log(c('bold', `\nEN SB SIN COMPAÑÍA y NO en sheet (${sbSinCompaniaNoEnSheet.length}):`));
    console.log(c('dim', `Estos quedan como están — no hay fuente para completarlos automáticamente.`));
    sbSinCompaniaNoEnSheet.slice(0, 15).forEach(p => {
      console.log(`  ${c('dim', '·')} ${(p.email || '(sin email)').padEnd(40)} ${c('dim', p.nombre || p.nombre_artistico || '?')}`);
    });
    if (sbSinCompaniaNoEnSheet.length > 15) console.log(c('dim', `  ... ${sbSinCompaniaNoEnSheet.length - 15} más`));
  }

  // ============================================================
  // APPLY
  // ============================================================
  if (!APPLY) {
    console.log(c('blue', `\n\n[DRY-RUN] No se modificó nada. Para aplicar: --apply  (o --apply --create para también crear los ${notInSb} faltantes en SB)\n`));
    return;
  }

  // Backfill
  console.log(c('blue', `\n=== APLICANDO BACKFILL ===\n`));
  let ok = 0, fail = 0;
  for (const item of toBackfill) {
    const res = await fetch(`${SB_URL}/rest/v1/artistas?id=eq.${item.sbId}`, {
      method: 'PATCH',
      headers: sbHdr,
      body: JSON.stringify(item.patch)
    });
    if (res.ok) { ok++; console.log(c('green', '✓'), item.email); }
    else { fail++; console.log(c('red', '✗'), item.email, '·', (await res.text()).slice(0, 100)); }
  }
  console.log(c('blue', `\nBackfill: ${ok} OK, ${fail} fallos.\n`));

  // Crear faltantes (solo si --create). NO TOCA GHL — el usuario fue explícito:
  // "SB no toques nada de GHL". Crea artistas con tipo='proveedor' y un email
  // placeholder NO se usa (se usa el real del sheet).
  if (CREATE_MISSING && missingInSb.length) {
    console.log(c('blue', `=== CREANDO ${missingInSb.length} PROVEEDORES FALTANTES (sin GHL) ===\n`));
    let cOk = 0, cFail = 0;
    for (const row of missingInSb) {
      const body = {
        nombre: [row.first, row.last].filter(Boolean).join(' ').trim() || row.business || row.email,
        nombre_artistico: '',
        compania: row.business || '',
        email: row.email,
        telefono: row.tel || '',
        ciudad: row.ciudad || '',
        tipo: 'proveedor',
        disciplinas: [],
        bio_show: row.actividad || '',
        origen: 'sheet-xavi-import',
        ghl_contact_id: null
      };
      const r2 = await fetch(`${SB_URL}/rest/v1/artistas`, {
        method: 'POST',
        headers: { ...sbHdr, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(body)
      });
      if (r2.ok) { cOk++; console.log(c('green', '+'), row.email); }
      else { cFail++; console.log(c('red', '✗'), row.email, '·', (await r2.text()).slice(0, 120)); }
    }
    console.log(c('blue', `\nCreación: ${cOk} OK, ${cFail} fallos.\n`));
  } else if (notInSb && !CREATE_MISSING) {
    console.log(c('dim', `(${notInSb} faltantes NO se crearon — usar --create si querés crearlos en SB.)\n`));
  }
})().catch(err => { console.error(err); process.exit(1); });
