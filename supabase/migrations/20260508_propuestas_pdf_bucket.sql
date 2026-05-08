-- Migration: bucket 'propuestas-pdf' para almacenar las propuestas
-- validadas como PDF (Propuesta_{contact_id}_{timestamp}.pdf).
-- Fecha: 2026-05-08
--
-- Lectura pública (Xavi y el cliente abren el link desde GHL).
-- Escritura sólo via service_role (endpoint /api/upload-proposal-pdf).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'propuestas-pdf',
  'propuestas-pdf',
  true,
  10485760, -- 10 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "propuestas-pdf public read" ON storage.objects;
CREATE POLICY "propuestas-pdf public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'propuestas-pdf');

DROP POLICY IF EXISTS "propuestas-pdf service write" ON storage.objects;
CREATE POLICY "propuestas-pdf service write"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'propuestas-pdf');

DROP POLICY IF EXISTS "propuestas-pdf service update" ON storage.objects;
CREATE POLICY "propuestas-pdf service update"
  ON storage.objects FOR UPDATE
  TO service_role
  USING (bucket_id = 'propuestas-pdf');
