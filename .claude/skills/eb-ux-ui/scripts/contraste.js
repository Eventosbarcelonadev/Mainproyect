#!/usr/bin/env node
// Ratio de contraste WCAG 2.x para pares texto/fondo.
//
// Uso: node contraste.js "#ffffff/#2ecc71" "#B63F35/#FAF8F5" ["#ccc/#fff@0.3/#1a1a1a" …]
//   El tercer formato calcula texto sobre un fondo compuesto: color con opacidad sobre otro
//   (p. ej. una foto blanca al 30 % sobre #1a1a1a).
const hex = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); };
const lum = c => { const a = c.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
const ratio = (f, b) => { const L1 = lum(f), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };

const pares = process.argv.slice(2);
if (!pares.length) { console.error('Uso: node contraste.js "#texto/#fondo" […]'); process.exit(1); }
for (const par of pares) {
  const [texto, fondo, sobre] = par.split('/');
  let bg;
  if (sobre) {
    const [color, alpha] = fondo.split('@');
    const a = Number(alpha), top = hex(color), bottom = hex(sobre);
    bg = top.map((v, i) => Math.round(v * a + bottom[i] * (1 - a)));
  } else {
    bg = hex(fondo);
  }
  const r = ratio(hex(texto), bg);
  const veredicto = r >= 4.5 ? 'AA' : r >= 3 ? 'AA solo texto ≥ 24 px' : 'FALLA';
  console.log(`${r.toFixed(2).replace('.', ',').padStart(6)}:1  ${veredicto.padEnd(22)} ${par}`);
}
