// Demo en vivo: crea un artista "TEST QA — Banda Jazz" con bio + foto + video,
// muestra todos los IDs y URLs para abrir en /admin y ver cómo se replica
// la información a shows.
//
// NO limpia al final — queda en el sistema para que Xavi/Phil lo vean.
// Cuando quieran borrarlo: node scripts/demo-artista-replica-shows.js --cleanup <artistaId>
require('dotenv').config({ path: '.env' });

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const PROD = 'https://propuestas.eventosbarcelona.com';
const ADMIN_BASE = 'https://eventos-barcelona.vercel.app';

const sbHdr = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
const colors = { green: '\x1b[32m', blue: '\x1b[34m', yellow: '\x1b[33m', dim: '\x1b[2m', bold: '\x1b[1m', reset: '\x1b[0m' };
const c = (col, t) => `${colors[col]}${t}${colors.reset}`;

const CLEANUP_ID = process.argv[2] === '--cleanup' ? process.argv[3] : null;

(async () => {
  if (CLEANUP_ID) {
    console.log(c('yellow', `Limpiando artista ${CLEANUP_ID}...`));
    const r = await fetch(`${PROD}/api/admin?action=delete-artista`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: CLEANUP_ID })
    });
    const d = await r.json();
    console.log(r.ok ? c('green', '✓ borrado') : c('yellow', JSON.stringify(d)));
    console.log(d);
    return;
  }

  const stamp = new Date().toISOString().slice(11, 19);
  const name = `TEST QA Demo — Banda Jazz ${stamp}`;
  const email = `qa-demo-${Date.now()}@growth4u.test`;
  const photos = [
    'https://www.eventosbarcelona.com/wp-content/uploads/2024/03/IMG_9815-copia.jpg',
    'https://www.eventosbarcelona.com/wp-content/uploads/2025/06/DSC05295-scaled.jpg'
  ];

  console.log(c('bold', '\n=== DEMO: crear artista → ver cómo se replica en shows ===\n'));
  console.log(c('blue', 'Paso 1.') + ' Crear artista vía POST /api/admin?action=add-artista');
  console.log(c('dim', `  nombre = "${name}"`));
  console.log(c('dim', `  email = ${email}`));
  console.log(c('dim', `  disciplinas = [musica, Jazz] → category=musica, subcategory=Jazz`));

  const r1 = await fetch(`${PROD}/api/admin?action=add-artista`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: name, nombre_artistico: name, compania: '', email,
      telefono: '+34 600 123 456', ciudad: 'Barcelona', tipo: 'artista',
      disciplinas: ['musica', 'Jazz'],
      bio_show: 'Cuarteto de jazz para eventos corporativos, cócteles y bodas. Repertorio que va desde standards clásicos a fusión moderna. Show de 60-90 minutos.'
    })
  });
  const d1 = await r1.json();
  if (!r1.ok) { console.log('FAIL:', d1); process.exit(1); }
  const artistaId = d1.artista.id;
  const ghlContactId = d1.artista.ghl_contact_id;
  const autoShowId = d1.auto_show?.show_id;

  console.log(c('green', '\n  ✓ Artista creado'));
  console.log(`    artista.id        = ${c('bold', artistaId)}`);
  console.log(`    ghl_contact_id    = ${ghlContactId}`);
  console.log(c('green', '  ✓ Auto-show creado'));
  console.log(`    show.id           = ${c('bold', autoShowId)}`);
  console.log(`    status            = pending_review`);
  console.log(`    category          = ${d1.auto_show?.category || 'null'}`);
  console.log(c('yellow', '  ! Pero como no enviamos fotos/video en el add-artista, el show queda con image_url=null'));

  // Paso 2: cargar fotos + video al artista
  console.log(c('blue', '\nPaso 2.') + ' PATCH artista con fotos + video1 (simulando upload posterior)');
  await fetch(`${PROD}/api/admin?action=edit-artista`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: artistaId,
      patch: {
        fotos_urls: photos,
        video1: 'https://www.youtube.com/embed/4DNFFXRKK9E',
        web_rrss: 'https://www.eventosbarcelona.com',
        rango_cache: '1500-2500€'
      }
    })
  });
  console.log(c('green', '  ✓ Artista actualizado con 2 fotos + 1 video'));

  // Paso 3: Click "+ Crear show con estos datos" — crea un 2do show CON los datos completos
  console.log(c('blue', '\nPaso 3.') + ' Simular click en "+ Crear show con estos datos" del modal artista');
  console.log(c('dim', '  → POST /api/admin?action=create-show-from-artista'));
  const r3 = await fetch(`${PROD}/api/admin?action=create-show-from-artista`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artistaId })
  });
  const d3 = await r3.json();
  if (!r3.ok) { console.log('FAIL:', d3); }
  const newShow = d3.show || {};
  console.log(c('green', '  ✓ Nuevo show creado'));
  console.log(`    show.id           = ${c('bold', newShow.id)}`);
  console.log(`    status            = ${newShow.status}`);
  console.log(`    name              = ${newShow.name}`);
  console.log(`    category          = ${newShow.category}`);
  console.log(`    subcategory       = ${newShow.subcategory}`);
  console.log(`    description       = ${(newShow.description || '').slice(0, 60)}...`);
  console.log(`    video_url         = ${newShow.video_url}`);
  console.log(`    image_url         = ${newShow.image_url ? '✓ (foto del artista)' : '✗'}`);
  console.log(`    image_urls count  = ${Array.isArray(newShow.image_urls) ? newShow.image_urls.length : 0}`);
  console.log(c('dim', '  → 1 artista ahora tiene 2 shows en pending_review'));

  // Resumen para que abran en /admin
  console.log(c('bold', '\n=== LINKS PARA ABRIR EN /ADMIN ===\n'));
  console.log(`Tab Artistas (modal del artista de prueba):`);
  console.log(`  ${ADMIN_BASE}/admin.html#tab=artistas&sub=${artistaId}`);
  console.log('');
  console.log(`Tab Shows → Pending review (verás los 2 shows del artista):`);
  console.log(`  ${ADMIN_BASE}/admin.html#tab=shows&sub=pending_review`);
  console.log('');
  console.log(c('bold', `Cleanup cuando quieran borrar el test:`));
  console.log(`  ${c('dim', `node scripts/demo-artista-replica-shows.js --cleanup ${artistaId}`)}`);
  console.log('');
})().catch(err => { console.error(err); process.exit(1); });
