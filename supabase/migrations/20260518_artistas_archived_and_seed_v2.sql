-- 2026-05-18: nuevo modelo artistas (representantes vs performers).
-- Añade campo archived para distinguir los del sheet vigente (1ThFrtK_) vs el modelo viejo.

ALTER TABLE artistas
  ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

CREATE INDEX IF NOT EXISTS artistas_archived_idx ON artistas (archived);

COMMENT ON COLUMN artistas.archived IS '2026-05-18: TRUE para performers individuales del modelo viejo reemplazados por representantes del sheet 1ThFrtK_.';
