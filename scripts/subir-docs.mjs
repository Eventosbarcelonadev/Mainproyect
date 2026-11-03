/**
 * Sube docs de EB (informes, presentaciones, datos, notas) al bucket privado
 * docs-internos de Supabase y los apunta en su index.json, que es lo que lista
 * la pestaña Docs del admin (ver docsList y servirDoc en api/admin.js).
 *
 * No van al repo: es público y los docs llevan datos de contactos.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/subir-docs.mjs manifiesto.json
 *
 * manifiesto.json: [{origen, id, titulo, tipo, fecha, resumen, entrada?}]
 *   origen   archivo o carpeta local. Una carpeta se sube entera (imágenes incluidas).
 *   id       slug: a-z, 0-9 y guiones. Si ya existe, se reemplaza.
 *   tipo     informe | presentacion | datos | guia | nota
 *   fecha    YYYY-MM-DD
 *   entrada  archivo que abre la tarjeta. Por defecto index.html en una carpeta,
 *            o el nombre del archivo.
 *
 * Crea el bucket (privado) si no existe.
 */

import fs from 'node:fs';
import path from 'node:path';

const BUCKET = 'docs-internos';
const TIPOS = new Set(['informe', 'presentacion', 'datos', 'guia', 'nota']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.csv': 'text/csv; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4'
};

const SB_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const SB_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();
const auth = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

function archivosDe(origen) {
  if (fs.statSync(origen).isFile()) return [{ abs: origen, rel: path.basename(origen) }];
  const out = [];
  (function recorrer(dir, base) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) recorrer(abs, rel);
      else out.push({ abs, rel });
    }
  })(origen, '');
  return out;
}

async function asegurarBucket() {
  const r = await fetch(`${SB_URL}/storage/v1/bucket/${BUCKET}`, { headers: auth });
  if (r.ok) {
    const b = await r.json();
    if (b.public) throw new Error(`El bucket ${BUCKET} es público: no subo nada`);
    return;
  }
  const c = await fetch(`${SB_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false })
  });
  if (!c.ok) throw new Error(`No se pudo crear el bucket: ${c.status} ${await c.text()}`);
  console.log(`Bucket ${BUCKET} creado (privado)`);
}

async function subir(ruta, cuerpo, tipo) {
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${ruta.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': tipo, 'x-upsert': 'true', 'Cache-Control': 'no-store' },
    body: cuerpo
  });
  if (!r.ok) throw new Error(`${ruta}: ${r.status} ${await r.text()}`);
}

async function leerIndice() {
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/index.json`, { headers: auth });
  if (r.status === 400 || r.status === 404) return [];
  if (!r.ok) throw new Error(`index.json: ${r.status} ${await r.text()}`);
  return r.json();
}

async function main() {
  const manifiesto = process.argv[2];
  if (!manifiesto) throw new Error('Uso: node scripts/subir-docs.mjs manifiesto.json');
  if (!SB_URL || !SB_KEY) throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY');
  const docs = JSON.parse(fs.readFileSync(manifiesto, 'utf8'));
  const dirBase = path.dirname(path.resolve(manifiesto));

  for (const d of docs) {
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(d.id || '')) throw new Error(`id no válido: ${d.id}`);
    if (!TIPOS.has(d.tipo)) throw new Error(`${d.id}: tipo no válido: ${d.tipo}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '')) throw new Error(`${d.id}: fecha no válida: ${d.fecha}`);
    if (!d.titulo) throw new Error(`${d.id}: falta el título`);
  }

  await asegurarBucket();
  const indice = await leerIndice();

  for (const d of docs) {
    const origen = path.resolve(dirBase, d.origen);
    const archivos = archivosDe(origen);
    const entrada = d.entrada || (fs.statSync(origen).isFile() ? path.basename(origen) : 'index.html');
    if (!archivos.some(a => a.rel === entrada)) throw new Error(`${d.id}: no está la entrada ${entrada}`);
    for (const a of archivos) {
      await subir(`${d.id}/${a.rel}`, fs.readFileSync(a.abs), MIME[path.extname(a.rel).toLowerCase()] || 'application/octet-stream');
    }
    const fila = { id: d.id, titulo: d.titulo, tipo: d.tipo, fecha: d.fecha, resumen: d.resumen || '', entrada };
    const i = indice.findIndex(x => x.id === d.id);
    if (i >= 0) indice[i] = fila; else indice.push(fila);
    console.log(`${d.id}: ${archivos.length} archivo(s)`);
  }

  indice.sort((a, b) => b.fecha.localeCompare(a.fecha));
  await subir('index.json', JSON.stringify(indice, null, 2), 'application/json');
  console.log(`index.json: ${indice.length} docs`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
