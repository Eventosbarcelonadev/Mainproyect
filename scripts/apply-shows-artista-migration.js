/**
 * Helper para aplicar la migración shows ↔ artistas.
 *
 * Supabase no expone un endpoint público para ejecutar SQL arbitrario con
 * SERVICE_KEY, así que la migración se pega en el SQL Editor del dashboard.
 * Este script imprime el SQL y al final chequea si ya está aplicada.
 *
 * Uso:
 *   node scripts/apply-shows-artista-migration.js           → imprime SQL + instrucciones
 *   node scripts/apply-shows-artista-migration.js --verify  → verifica si las columnas nuevas existen
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VERIFY = process.argv.includes('--verify');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_KEY en .env');
  process.exit(1);
}

const MIGRATION_PATH = path.join(
  __dirname, '..', 'supabase', 'migrations', '20260424_shows_artista_fk.sql'
);

async function verify() {
  console.log('Verificando migración...');
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/shows?select=id,status,artista_id,submitted_at&limit=1`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  if (res.ok) {
    console.log('✓ Migración aplicada — columnas status, artista_id, submitted_at accesibles.');
    return 0;
  }
  const err = await res.text();
  if (/column.*does not exist/i.test(err) || res.status === 400) {
    console.log('✗ Migración NO aplicada — al menos una columna falta.');
    console.log('  Detalle:', err);
    return 1;
  }
  console.log(`? Respuesta inesperada (${res.status}):`, err);
  return 2;
}

function printInstructions() {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const projectRef = (SUPABASE_URL.match(/https:\/\/([^.]+)/) || [])[1];

  console.log('=== Migración shows ↔ artistas ===');
  console.log('');
  console.log('Paso 1: Abrí el SQL Editor del dashboard de Supabase:');
  console.log(`  https://supabase.com/dashboard/project/${projectRef}/sql/new`);
  console.log('');
  console.log('Paso 2: Copiá y pegá este SQL, luego click "Run":');
  console.log('');
  console.log('---------------- COPIAR DESDE ACÁ ----------------');
  console.log(sql);
  console.log('----------------- HASTA ACÁ ----------------------');
  console.log('');
  console.log('Paso 3: Volvé acá y corré:');
  console.log('  node scripts/apply-shows-artista-migration.js --verify');
  console.log('');
}

(async () => {
  if (VERIFY) {
    process.exit(await verify());
  }
  printInstructions();
  console.log('(Tip: --verify después para confirmar que se aplicó)');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
