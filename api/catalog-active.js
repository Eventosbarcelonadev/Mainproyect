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
    const fields = [
      'id', 'name', 'category', 'subcategory', 'description', 'base_price',
      'price_note', 'video_url', 'image_url', 'name_en', 'description_en',
      'subcategory_en', 'price_note_en', 'is_favorite', 'artista_id',
      'artista:artista_id(id,nombre,nombre_artistico,compania,fotos_urls)'
    ].join(',');
    const url = `${SB_URL}/rest/v1/shows?status=eq.active&select=${fields}&order=name`;

    const r = await fetch(url, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
    });
    if (!r.ok) {
      const txt = await r.text();
      return res.status(500).json({ error: `Supabase ${r.status}`, details: txt.slice(0, 200) });
    }
    const rows = await r.json();

    // Shape compatible con SHOW_CATALOG[id] del propuesta.html (camelCase keys)
    const catalog = {};
    for (const row of rows) {
      const a = row.artista || null;
      const artistaNombre = a ? (a.nombre_artistico || a.compania || a.nombre || '') : '';
      const artistaFotos = (a && Array.isArray(a.fotos_urls)) ? a.fotos_urls : [];
      catalog[row.id] = {
        name: row.name,
        category: row.category,
        subcategory: row.subcategory,
        description: row.description || '',
        basePrice: row.base_price || 0,
        priceNote: row.price_note || '',
        videoUrl: row.video_url || '',
        imageUrl: row.image_url || '',
        nameEn: row.name_en || row.name,
        descriptionEn: row.description_en || row.description || '',
        subcategoryEn: row.subcategory_en || row.subcategory,
        priceNoteEn: row.price_note_en || row.price_note || '',
        artistaId: row.artista_id || null,
        artistaNombre,
        artistaFotos,
        isFavorite: !!row.is_favorite
      };
    }

    return res.status(200).json({ success: true, count: rows.length, catalog });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
