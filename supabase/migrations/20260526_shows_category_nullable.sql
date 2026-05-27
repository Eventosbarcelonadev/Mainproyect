-- Permite shows sin categoría (Xavi 2026-05-26).
-- Cuando se crea un artista desde /admin, se auto-genera un show vinculado
-- sin categoría — Xavi la asigna después al editar el show.
ALTER TABLE shows
  ALTER COLUMN category DROP NOT NULL;

-- Asegura que base_price tampoco bloquee el flujo de auto-crear show desde
-- artista. Si ya está en 0 default funciona, pero por las dudas:
ALTER TABLE shows
  ALTER COLUMN base_price SET DEFAULT 0;
