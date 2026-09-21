-- 2026-09-21: los artistas nuevos del formulario web entran como pendientes de
-- revisión y ya no crean un show automático (Xavi). Xavi los aprueba desde
-- /admin → Artistas → "Nuevos". Los existentes quedan aprobados por el DEFAULT.

ALTER TABLE artistas
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (review_status IN ('pending_review', 'approved')),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS artistas_review_status_idx ON artistas (review_status);

COMMENT ON COLUMN artistas.review_status IS '2026-09-21: pending_review = entró por el formulario web y Xavi aún no lo ha revisado; approved = revisado (o creado a mano).';
