-- Migration: permitir INSERT desde el browser (anon) al bucket artist-assets.
-- Fecha: 2026-05-08
--
-- El formulario público (formulario-artistas.html) sube fotos/videos directo
-- desde el navegador con la SUPABASE_ANON key. La migration original
-- (20260425) solo permitía escritura a service_role, por lo que cualquier
-- subida desde el form devolvía 403 row-level security.
--
-- Restricciones que mantienen el bucket seguro: file_size_limit (20MB) y
-- allowed_mime_types ya están definidos a nivel de bucket en la migration
-- previa, y se aplican incluso con esta policy permisiva.

DROP POLICY IF EXISTS "artist-assets anon insert" ON storage.objects;
CREATE POLICY "artist-assets anon insert"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'artist-assets');

-- Update también, para que x-upsert: true funcione si el cliente reintenta
-- con el mismo path.
DROP POLICY IF EXISTS "artist-assets anon update" ON storage.objects;
CREATE POLICY "artist-assets anon update"
  ON storage.objects FOR UPDATE
  TO anon
  USING (bucket_id = 'artist-assets');
