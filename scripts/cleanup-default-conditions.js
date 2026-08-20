// Pone conditions=null en las propuestas cuyo array de condiciones es
// EXACTAMENTE el default (ES o EN) sin personalizar. Bug: al guardar una
// propuesta se persistía el default en el idioma del builder (ES), y en
// propuestas EN salían las condiciones en español (etiqueta EN + items ES).
// Con conditions=null el render usa el default del idioma de la propuesta.
// Las condiciones REALMENTE custom (que no coinciden con ningún default) no se tocan.
//
// Uso:
//   node scripts/cleanup-default-conditions.js           # dry-run
//   node scripts/cleanup-default-conditions.js --apply   # aplica
require('dotenv').config({ path: '.env' });

const SB = process.env.SUPABASE_URL.trim(), K = process.env.SUPABASE_SERVICE_KEY.trim();
const APPLY = process.argv.includes('--apply');
const hdr = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const c = (col, t) => `\x1b[${ {red:31,green:32,yellow:33,blue:34,dim:2}[col] }m${t}\x1b[0m`;

// Defaults EXACTOS de propuesta.html (I18N.es.conditions / I18N.en.conditions)
const DEF_ES = [
  'Pre-reserva válida durante 5 días, tras los cuales la reserva podrá ser liberada',
  'No incluido: equipo de sonido e iluminación, sistemas AV, elementos de branding, diseño gráfico',
  'El cliente debe proporcionar comida y agua para todo el equipo artístico, técnico y de coordinación',
  'IVA del 21% no incluido',
  'Cancelación: 50% de cargo en la última semana, 100% en las últimas 48 horas',
  'Pago: 100% a la aceptación salvo acuerdo previo con Eventos Barcelona'
];
const DEF_EN = [
  'Pre-booking valid for 5 days, after which the reservation may be released',
  'Not included: sound and lighting equipment, AV systems, branding elements, graphic design',
  'The client must provide food and water for the full artistic, technical and coordination team',
  '21% VAT not included',
  'Cancellation: 50% charge in the last week, 100% in the last 48 hours',
  'Payment: 100% on acceptance unless otherwise agreed with Eventos Barcelona'
];
const norm = a => JSON.stringify((a || []).map(s => String(s == null ? '' : s).trim()));
const NORM_ES = norm(DEF_ES), NORM_EN = norm(DEF_EN);
const isDefault = arr => { const t = norm(arr); return t === NORM_ES || t === NORM_EN; };

(async () => {
  const r = await fetch(`${SB}/rest/v1/proposals?conditions=not.is.null&select=id,client_name,lang,status,conditions&order=created_at.desc`, { headers: hdr });
  const rows = await r.json();
  console.log(c('blue', `\n=== ${APPLY ? 'APPLY' : 'DRY-RUN'} limpieza conditions default ===\n`));
  console.log(`Propuestas con conditions != null: ${rows.length}\n`);

  const toNull = [], custom = [];
  for (const p of rows) {
    if (Array.isArray(p.conditions) && isDefault(p.conditions)) toNull.push(p);
    else custom.push(p);
  }

  console.log(c('yellow', `A limpiar (== default, se pondrán null): ${toNull.length}`));
  toNull.forEach(p => {
    const which = norm(p.conditions) === NORM_EN ? 'EN-def' : 'ES-def';
    const flag = (p.lang === 'en' && which === 'ES-def') ? c('red', '  ⚠ EN con items ES (el bug)') : '';
    console.log(`  · lang=${(p.lang||'?').padEnd(3)} [${which}] ${(p.client_name||'').slice(0,24).padEnd(24)} ${p.id}${flag}`);
  });
  console.log(c('dim', `\nCustom (NO se tocan): ${custom.length}`));
  custom.forEach(p => console.log(c('dim', `  · lang=${(p.lang||'?').padEnd(3)} ${(p.client_name||'').slice(0,24).padEnd(24)} ${p.id}`)));

  if (!APPLY) { console.log(c('blue', `\n[DRY-RUN] Para aplicar: --apply\n`)); return; }
  if (!toNull.length) { console.log(c('green', '\nNada que limpiar ✓\n')); return; }

  console.log(c('blue', `\nAplicando null a ${toNull.length}...\n`));
  let ok = 0, fail = 0;
  for (const p of toNull) {
    const res = await fetch(`${SB}/rest/v1/proposals?id=eq.${encodeURIComponent(p.id)}`, {
      method: 'PATCH', headers: hdr, body: JSON.stringify({ conditions: null })
    });
    if (res.ok) { ok++; process.stdout.write('.'); }
    else { fail++; console.log(c('red', '\n✗'), p.id, res.status, (await res.text()).slice(0, 80)); }
  }
  console.log(c('green', `\n\n${ok} limpiadas, ${fail} fallos.\n`));
})().catch(e => { console.error(e); process.exit(1); });
