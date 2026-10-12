-- 2026-10-12: registro de aperturas de propuestas.
-- Xavi quiere saber si el cliente abre el enlace de la propuesta, cuándo, qué
-- mira y dónde hace clic. Hasta hoy no se guardaba nada: Vercel (plan Hobby)
-- descarta los logs en una hora y propuesta.html no enviaba eventos.
--
-- Quién escribe aquí: api/track-proposal.js (vista CLIENTE de propuesta.html).
-- No se registra nada en modo admin, builder ni al generar el PDF (print=1).

CREATE TABLE IF NOT EXISTS proposal_views (
  id          BIGSERIAL PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  session_id  TEXT,
  event       TEXT NOT NULL,            -- open | engaged | section | click | leave
  detail      JSONB,                    -- sección vista, texto del clic, segundos, scroll...
  lang        TEXT,
  country     TEXT,                     -- cabeceras x-vercel-ip-*
  city        TEXT,
  device      TEXT,                     -- mobile | tablet | desktop
  ua          TEXT,
  is_bot      BOOLEAN NOT NULL DEFAULT false,  -- escáneres de correo (Safe Links, Proofpoint...)
  ip_hash     TEXT,                     -- sha256 truncado, nunca la IP en claro
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proposal_views_proposal_idx
  ON proposal_views (proposal_id, created_at DESC);

-- Resumen en la propia propuesta, para la lista de /admin sin agregar cada vez.
-- open_count cuenta solo aperturas "engaged": persona real, 4 s visible + un gesto.
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS first_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_opened_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS open_count      INTEGER NOT NULL DEFAULT 0;

COMMENT ON TABLE proposal_views IS '2026-10-12: eventos de la vista cliente de cada propuesta (aperturas, secciones, clics, tiempo). Ver api/track-proposal.js';
COMMENT ON COLUMN proposals.open_count IS 'Aperturas confirmadas por una persona (evento engaged). Las aperturas de escáneres quedan solo en proposal_views con is_bot=true';
