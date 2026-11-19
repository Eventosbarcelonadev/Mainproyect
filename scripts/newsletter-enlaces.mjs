#!/usr/bin/env node
// Prepara el HTML de una newsletter de GHL para el mapa de clics de /admin (pestaña Outbound).
//
//   node scripts/newsletter-enlaces.mjs <entrada.html> <campaña> [salida.html]
//
// Cambia cada enlace http(s) por uno que pasa por /r, que apunta el clic y lleva al mismo sitio:
//   https://propuestas.eventosbarcelona.com/r?n=<campaña>&b=<bloque>&c={{contact.id}}&u=<destino>
// <campaña> es un slug (navidad-2026) y tiene que ser el mismo en todos los enlaces del correo.
// <bloque> es el data-bloque del <a> si lo lleva (data-bloque="hero-boton") o, si no, e01, e02...
// en el orden del HTML. GHL pone el id del contacto en {{contact.id}} al enviar.
// mailto:, tel:, la baja de GHL y los enlaces que ya pasan por /r se dejan como están.
// Solo se redirige a los dominios de CLIC_HOSTS de api/admin.js; los demás se avisan y no se tocan.

import { readFileSync, writeFileSync } from 'node:fs';

const BASE = 'https://propuestas.eventosbarcelona.com/r';
const HOSTS = ['eventosbarcelona.com', 'youtube.com', 'youtu.be', 'wa.me', 'whatsapp.com',
  'instagram.com', 'linkedin.com', 'facebook.com', 'tiktok.com', 'vimeo.com'];

const [entrada, campana, salida] = process.argv.slice(2);
if (!entrada || !campana) {
  console.error('Uso: node scripts/newsletter-enlaces.mjs <entrada.html> <campaña> [salida.html]');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(campana)) {
  console.error('La campaña tiene que ser un slug: minúsculas, números y guiones (navidad-2026).');
  process.exit(1);
}

const desescapar = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const permitido = u => {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return HOSTS.some(d => h === d || h.endsWith('.' + d));
  } catch { return false; }
};

const html = readFileSync(entrada, 'utf8');
let n = 0;
let ultimo = null; // el enlace anterior: {destino, bloque}
const tabla = [];
const avisos = [];

// Cada <a href> y cada <v:roundrect href> (el botón de Outlook). Los enlaces seguidos al mismo
// destino comparten bloque: la imagen, el título y el subtítulo de una tarjeta, o el botón VML y
// el <a> que ven los demás clientes. Así el mapa cuenta por tarjeta y no por trocito.
const salidaHtml = html.replace(/<(a|v:roundrect)\b([^>]*?)\bhref=(["'])(.*?)\3([^>]*)>/gis, (todo, tag, antes, q, href, despues) => {
  const esVml = tag.toLowerCase() === 'v:roundrect';
  const destino = desescapar(href.trim());
  if (!/^https?:\/\//i.test(destino) || destino.startsWith(BASE) || /unsubscribe|\{\{/.test(destino)) return todo;
  if (!permitido(destino)) {
    if (!esVml) avisos.push(destino);
    return todo;
  }
  const propio = /\bdata-bloque=(["'])([a-z0-9-]+)\1/i.exec(antes + despues);
  let bloque;
  if (propio) bloque = propio[2].toLowerCase();
  else if (ultimo && ultimo.destino === destino) bloque = ultimo.bloque;
  else bloque = `e${String(++n).padStart(2, '0')}`;
  ultimo = { destino, bloque };
  if (!esVml && !tabla.some(t => t.bloque === bloque)) tabla.push({ bloque, destino });
  const nuevo = `${BASE}?n=${campana}&amp;b=${bloque}&amp;c={{contact.id}}&amp;u=${encodeURIComponent(destino)}`;
  return `<${tag}${antes}href=${q}${nuevo}${q}${despues}>`;
});

if (salida) writeFileSync(salida, salidaHtml);
else process.stdout.write(salidaHtml);

console.error(`\n${tabla.length} bloques pasan por /r (campaña "${campana}"):`);
for (const t of tabla) console.error(`  ${t.bloque.padEnd(14)} ${t.destino}`);
if (avisos.length) {
  console.error(`\nSin tocar, su dominio no está en la lista de /r (añádelo a CLIC_HOSTS de api/admin.js y aquí si hace falta):`);
  for (const a of avisos) console.error(`  ${a}`);
}
