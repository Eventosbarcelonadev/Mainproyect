-- Migration: shows ↔ artistas FK + review status
-- Fecha: 2026-04-24
-- Ver docs/arquitectura-show-artista.md para el racional completo.
--
-- Objetivo: permitir que un artista que llega por formulario pueda registrar
-- N shows vinculados a su contacto, y que Xavi los revise antes de que
-- aparezcan en el catálogo público (status='pending_review' → 'active').
--
-- Compatibilidad: los defaults preservan el comportamiento actual.
-- Filas existentes quedan con artista_id = NULL y status = 'active'.
-- La columna legacy `active` (boolean) se mantiene por ahora; la usa el
-- loader actual de `propuesta.html` y podemos migrarla después.

BEGIN;

ALTER TABLE shows
  ADD COLUMN IF NOT EXISTS artista_id uuid REFERENCES artistas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by text;

-- status permitidos: 'active', 'pending_review', 'archived'
ALTER TABLE shows
  DROP CONSTRAINT IF EXISTS shows_status_check;
ALTER TABLE shows
  ADD CONSTRAINT shows_status_check
  CHECK (status IN ('active', 'pending_review', 'archived'));

CREATE INDEX IF NOT EXISTS idx_shows_artista_id ON shows(artista_id);
CREATE INDEX IF NOT EXISTS idx_shows_status ON shows(status);

-- Las filas existentes quedan como 'active' (default). Confirmamos por claridad:
UPDATE shows SET status = 'active' WHERE status IS NULL;

COMMIT;
