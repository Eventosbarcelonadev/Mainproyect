-- Condiciones generales editables por propuesta (Xavi 2026-05-19).
-- null = usar los defaults del I18N en propuesta.html.
-- jsonb array de strings cuando Xavi adapta el texto/orden/cantidad por cliente.
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS conditions jsonb;
