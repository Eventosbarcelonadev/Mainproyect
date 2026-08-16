#!/usr/bin/env node
// Publica un informe de radar en Supabase para que se vea en /admin → Ideas.
//
//     node scripts/radar-publicar.js data/radar-sector.json
//
// El informe NO puede vivir como fichero en el repo: `data/` está en el
// .gitignore, así que nunca llegaría a producción. Guardarlo en Supabase
// (decisión de almacenamiento del proyecto) tiene además la ventaja de que
// refrescarlo no obliga a redesplegar.

import fs from 'node:fs';

const ruta = process.argv[2] || 'data/radar-sector.json';
if (!fs.existsSync(ruta)) {
  console.error(`No existe ${ruta}`);
  process.exit(1);
}

const resultado = JSON.parse(fs.readFileSync(ruta, 'utf8'));

// .env local: aquí sí hay credenciales, a diferencia del sandbox cloud.
const env = {};
for (const linea of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = linea.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en .env');
  process.exit(1);
}

const r = await fetch(`${env.SUPABASE_URL}/rest/v1/ideas_sesiones`, {
  method: 'POST',
  headers: {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  },
  body: JSON.stringify({
    brief: { tipo: 'radar-sector' },
    resultado,
    modelo: 'claude-code-local'
  })
});

if (!r.ok) {
  console.error('Fallo al publicar:', await r.text());
  process.exit(1);
}

const [fila] = await r.json();
console.log(`Publicado. ${resultado.descubrimientos?.length || 0} descubrimientos, ${resultado.accionables?.length || 0} accionables.`);
console.log('Visible en https://propuestas.eventosbarcelona.com/admin.html#ideas');
console.log('id:', fila.id);
