// GET /api/catalog-active
// Devuelve shows del Catálogo Activo (status=active) desde Supabase para
// alimentar el modo `auto` de propuesta.html. Reemplaza al SHOW_CATALOG
// estático: si Xavi aprueba un show nuevo (status active), aparece aquí
// automáticamente; si lo archiva, deja de sugerirse.
//
// "Catálogo Activo" del brief equivale operacionalmente a shows.status='active'
// (los aprobados por Xavi en /admin → tab Shows → Active).

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'Missing Supabase config' });

  try {
    // artista:artista_id(...) = artista primario legacy (1:1, compat).
    // show_artistas(...) = todos los artistas vinculados N:M, con bio, para
    // que el cliente pueda elegir cuál quiere dentro del show (Xavi 2026-05-22).
    const artistaCols = 'id,nombre,nombre_artistico,compania,fotos_urls,bio_show';
    const fields = [
      'id', 'name', 'category', 'subcategory', 'description', 'base_price',
      'price_note', 'video_url', 'image_url', 'image_urls', 'name_en', 'description_en',
      'subcategory_en', 'price_note_en', 'is_favorite', 'artista_id',
      `artista:artista_id(${artistaCols})`,
      `show_artistas(posicion,artista:artista_id(${artistaCols}))`
    ].join(',');
    const url = `${SB_URL}/rest/v1/shows?status=eq.active&select=${fields}&order=name`;

    let r = await fetch(url, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
    });
    // Fallback si la migración de image_urls aún no corrió en este entorno.
    if (!r.ok) {
      const txt = await r.clone().text();
      if (/image_urls/i.test(txt) && /does not exist|not find/i.test(txt)) {
        const fallback = fields.replace(',image_urls', '');
        r = await fetch(`${SB_URL}/rest/v1/shows?status=eq.active&select=${fallback}&order=name`, {
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
        });
      }
    }
    // Fallback si la tabla show_artistas aún no existe en este entorno.
    if (!r.ok) {
      const txt = await r.clone().text();
      if (/show_artistas/i.test(txt) && /does not exist|not find|relation/i.test(txt)) {
        const fallback = fields.replace(new RegExp(',show_artistas\\([^)]*\\([^)]*\\)[^)]*\\)'), '');
        r = await fetch(`${SB_URL}/rest/v1/shows?status=eq.active&select=${fallback}&order=name`, {
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
        });
      }
    }
    if (!r.ok) {
      const txt = await r.text();
      return res.status(500).json({ error: `Supabase ${r.status}`, details: txt.slice(0, 200) });
    }
    const rows = await r.json();

    // Mapea una fila de artista (legacy o embebida en show_artistas) al shape
    // que consume la propuesta: nombre legible + bio + fotos.
    const shapeArtista = (a) => {
      if (!a) return null;
      return {
        id: a.id,
        nombre: a.nombre_artistico || a.compania || a.nombre || '',
        bio: a.bio_show || '',
        fotos: Array.isArray(a.fotos_urls) ? a.fotos_urls : []
      };
    };

    // Shape compatible con SHOW_CATALOG[id] del propuesta.html (camelCase keys)
    const catalog = {};
    for (const row of rows) {
      const a = row.artista || null;
      const artistaNombre = a ? (a.nombre_artistico || a.compania || a.nombre || '') : '';
      const artistaFotos = (a && Array.isArray(a.fotos_urls)) ? a.fotos_urls : [];

      // artistas[] = todos los vinculados (N:M), ordenados por posición, sin
      // duplicar. Si la join está vacía, cae al artista primario legacy.
      const saRows = Array.isArray(row.show_artistas) ? row.show_artistas : [];
      const ordered = [...saRows].sort((x, y) => (x.posicion || 99) - (y.posicion || 99));
      const artistasArr = [];
      const seen = new Set();
      for (const sa of ordered) {
        const shaped = shapeArtista(sa.artista);
        if (shaped && shaped.id && !seen.has(shaped.id)) {
          seen.add(shaped.id);
          artistasArr.push(shaped);
        }
      }
      if (!artistasArr.length && a) {
        const shaped = shapeArtista(a);
        if (shaped && shaped.id) artistasArr.push(shaped);
      }
      // image_urls = array completo de la galería (orden visible).
      // imageUrl   = primera del array (o image_url legacy si la columna nueva
      //              no existe / el row es viejo). Mantiene compat con código
      //              que aún lee SHOW_CATALOG[id].imageUrl como string único.
      const imageUrls = Array.isArray(row.image_urls) ? row.image_urls.filter(Boolean) : [];
      const primary = imageUrls[0] || row.image_url || '';
      catalog[row.id] = {
        name: row.name,
        category: row.category,
        subcategory: row.subcategory,
        description: row.description || '',
        basePrice: row.base_price || 0,
        priceNote: row.price_note || '',
        videoUrl: row.video_url || '',
        imageUrl: primary,
        imageUrls: imageUrls.length ? imageUrls : (primary ? [primary] : []),
        nameEn: row.name_en || row.name,
        descriptionEn: row.description_en || row.description || '',
        subcategoryEn: row.subcategory_en || row.subcategory,
        priceNoteEn: row.price_note_en || row.price_note || '',
        artistaId: row.artista_id || null,
        artistaNombre,
        artistaFotos,
        artistas: artistasArr, // [{id, nombre, bio, fotos}] — para el selector de propuesta
        isFavorite: !!row.is_favorite
      };
    }

    return res.status(200).json({ success: true, count: rows.length, catalog });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
