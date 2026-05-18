/**
 * Parser de la primera hoja del Sheets de artistas (gid=1104680070).
 *
 * Estructura del TSV (data/xavi-shows-artistas-2026-05-18.tsv):
 *   - Sección 1 (DANZA, header implícito): 29 shows
 *   - "MUSICA (78)" + header
 *   - "CIRCO (75)" + header
 *   - "WOW (44)" + header
 *   Cabecera: # | Subcategoría | Show | A1 | Tel1 | Email1 | A2 | Tel2 | Email2 | A3 | Tel3 | Email3
 *
 * Genera:
 *   data/xavi-shows-artistas.json
 *     - shows[]:   {macro, sub, name, row_in_section, artistas:[{nombre, telefono, email, anomaly?}]}
 *     - artistas[]:{id, nombre, telefono, email, shows:[{macro, name}]} (dedupe por email; fallback nombre+tel)
 *     - stats
 *     - anomalies[]
 *
 * Uso: node scripts/parse-xavi-shows-artistas.js
 */

const fs = require('fs');
const path = require('path');

const TSV_PATH = path.join(__dirname, '..', 'data', 'xavi-shows-artistas-2026-05-18.tsv');
const OUT_PATH = path.join(__dirname, '..', 'data', 'xavi-shows-artistas.json');

// Strip bidi LRE/PDF marks and trim.
function clean(s) {
  return String(s || '')
    .replace(/[‪‫‬‭‮‎‏]/g, '')
    .trim();
}

// Normalize phone for fingerprinting (digits only).
function normPhone(s) {
  return clean(s).replace(/\D/g, '');
}

// Normalize email for fingerprinting.
function normEmail(s) {
  const c = clean(s).toLowerCase();
  // Drop stray trailing chars like ">" we've seen in the data.
  return c.replace(/[>\s]+$/g, '');
}

// Loose key for artist when no email: lowercased nombre + phone digits.
function nameKey(nombre) {
  return clean(nombre).toLowerCase().replace(/\s+/g, ' ');
}

function isEmailish(s) {
  return /@/.test(clean(s));
}
function isPhoneish(s) {
  // At least 6 digits in total (spaces/+/parens allowed).
  return (clean(s).match(/\d/g) || []).length >= 6;
}

// Section markers in the source.
const SECTION_RE = /^(DANZA|MUSICA|CIRCO|WOW)\s*\(\d+\)\s*$/;

function parseTrio(tokens, offset, anomalies, ctx) {
  // tokens slice expected: [nombre, tel, email] — but the source has data
  // anomalies (cols shifted). Best-effort detect: if "tel" looks like email
  // or "email" looks like phone, swap.
  const a = clean(tokens[offset] || '');
  let t = clean(tokens[offset + 1] || '');
  let e = clean(tokens[offset + 2] || '');
  if (!a && !t && !e) return null;

  let anomaly;
  if (e && !isEmailish(e) && isEmailish(t)) {
    // Swap tel/email
    [t, e] = [e, t];
    anomaly = 'tel/email swapped';
  }
  // Drop a "nombre" that mistakenly landed in email col (e.g. "Elisenda Duo Acrobatic Pack" repeated).
  if (e && !isEmailish(e) && !isPhoneish(e)) {
    anomaly = (anomaly ? anomaly + '; ' : '') + `email col not email: "${e}"`;
    e = '';
  }
  // Tel column should look phone-ish; if it's clearly text, mark and drop.
  if (t && !isPhoneish(t) && !isEmailish(t)) {
    anomaly = (anomaly ? anomaly + '; ' : '') + `tel col not phone: "${t}"`;
    t = '';
  }
  const out = { nombre: a, telefono: t || null, email: e ? normEmail(e) : null };
  if (anomaly) {
    out.anomaly = anomaly;
    anomalies.push({ ...ctx, artista: a, anomaly });
  }
  return out;
}

function main() {
  const raw = fs.readFileSync(TSV_PATH, 'utf8');
  const lines = raw.split(/\r?\n/);

  let macro = 'DANZA'; // first (implicit) section
  const shows = [];
  const anomalies = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const m = SECTION_RE.exec(line.trim());
    if (m) { macro = m[1]; continue; }
    if (/^#\t/.test(line) || /^#\s*Subcategor/.test(line)) continue; // header row

    const tokens = line.split('\t');
    const num = parseInt(tokens[0], 10);
    if (!Number.isFinite(num)) continue;

    const sub = clean(tokens[1] || '');
    const name = clean(tokens[2] || '');
    if (!name) continue;

    const ctx = { macro, sub, show: name, row: num };
    const a1 = parseTrio(tokens, 3, anomalies, ctx);
    const a2 = parseTrio(tokens, 6, anomalies, ctx);
    const a3 = parseTrio(tokens, 9, anomalies, ctx);
    const artistas = [a1, a2, a3].filter(Boolean).filter(x => x.nombre);

    if (artistas.length === 0) {
      anomalies.push({ ...ctx, anomaly: 'show without any artist' });
    }

    shows.push({
      macro, sub, name, row_in_section: num,
      artistas
    });
  }

  // Build unique artist registry.
  // Strategy: bucket by email (lowercased), fallback to nameKey if no email.
  const byKey = new Map();
  function slug(s) {
    return clean(s).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  for (const s of shows) {
    for (const a of s.artistas) {
      const key = a.email || `name:${nameKey(a.nombre)}|tel:${normPhone(a.telefono)}`;
      let rec = byKey.get(key);
      if (!rec) {
        rec = {
          id: slug(a.email ? a.email.split('@')[0] : a.nombre) || `artist-${byKey.size + 1}`,
          email: a.email || null,
          telefonos: new Set(),
          nombres: new Set(),
          shows: []
        };
        byKey.set(key, rec);
      }
      if (a.nombre) rec.nombres.add(clean(a.nombre));
      if (a.telefono) rec.telefonos.add(clean(a.telefono));
      rec.shows.push({ macro: s.macro, name: s.name });
    }
  }

  // Ensure unique slugs.
  const seenSlugs = new Map();
  const artistas = [];
  for (const rec of byKey.values()) {
    let id = rec.id;
    const n = (seenSlugs.get(id) || 0) + 1;
    seenSlugs.set(id, n);
    if (n > 1) id = `${id}-${n}`;
    // Canonical name = shortest non-empty (often the cleanest variant).
    const nombresArr = [...rec.nombres].filter(Boolean);
    nombresArr.sort((a, b) => a.length - b.length || a.localeCompare(b));
    artistas.push({
      id,
      nombre: nombresArr[0] || '',
      nombre_variantes: nombresArr.length > 1 ? nombresArr : undefined,
      email: rec.email,
      telefono: [...rec.telefonos][0] || null,
      telefono_variantes: rec.telefonos.size > 1 ? [...rec.telefonos] : undefined,
      shows: rec.shows,
      shows_count: rec.shows.length
    });
  }
  artistas.sort((a, b) => b.shows_count - a.shows_count || a.nombre.localeCompare(b.nombre));

  const stats = {
    shows: {
      total: shows.length,
      by_macro: shows.reduce((acc, s) => (acc[s.macro] = (acc[s.macro] || 0) + 1, acc), {}),
      with_no_artist: shows.filter(s => s.artistas.length === 0).length,
      with_1: shows.filter(s => s.artistas.length === 1).length,
      with_2: shows.filter(s => s.artistas.length === 2).length,
      with_3: shows.filter(s => s.artistas.length === 3).length
    },
    artistas: {
      total: artistas.length,
      with_email: artistas.filter(a => a.email).length,
      with_phone: artistas.filter(a => a.telefono).length,
      with_multiple_name_variants: artistas.filter(a => a.nombre_variantes).length,
      with_multiple_phones: artistas.filter(a => a.telefono_variantes).length,
      top10_by_shows: artistas.slice(0, 10).map(a => ({ nombre: a.nombre, email: a.email, shows: a.shows_count }))
    },
    relaciones_show_artista: shows.reduce((n, s) => n + s.artistas.length, 0),
    anomalies: anomalies.length
  };

  const out = {
    source: {
      file: path.basename(TSV_PATH),
      snapshot_date: '2026-05-18',
      sheet_id: '1ThFrtK_2_q0qwjjKz9EST-33ogBD37Rs',
      sheet_gid: '1104680070',
      provided_by: 'Xavi'
    },
    shows,
    artistas,
    anomalies,
    stats
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log('=== Parse Xavi Shows-Artistas (sheet 1ThFrtK_) ===');
  console.log('Output:', OUT_PATH);
  console.log(JSON.stringify(stats, null, 2));
  if (anomalies.length) {
    console.log(`\nAnomalies (${anomalies.length}):`);
    for (const x of anomalies.slice(0, 20)) {
      console.log(`  ⚠ [${x.macro}] ${x.show} → ${x.anomaly}${x.artista ? ' ('+x.artista+')' : ''}`);
    }
    if (anomalies.length > 20) console.log(`  ... +${anomalies.length - 20} more`);
  }
}

main();
