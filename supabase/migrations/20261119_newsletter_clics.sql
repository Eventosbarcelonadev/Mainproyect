-- 2026-11-19: clics en los enlaces de las newsletters de GHL, para el mapa de clics de la
-- pestaña Outbound de /admin. Cada enlace de la newsletter pasa por /r (api/admin.js,
-- acción clic), que apunta el clic aquí y lleva al destino. Los enlaces se preparan con
-- scripts/newsletter-enlaces.mjs.
--   campana     slug de la newsletter (?n=), el mismo en todos sus enlaces
--   bloque      qué enlace de la newsletter (?b=): e01, e02... o el data-bloque del HTML
--   contact_id  id del contacto de GHL ({{contact.id}}), si llega
--   es_bot      user agent de escáner o petición HEAD; las ráfagas se descartan al leer

CREATE TABLE IF NOT EXISTS newsletter_clics (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
  campana     TEXT NOT NULL,
  bloque      TEXT NOT NULL,
  destino     TEXT NOT NULL,
  contact_id  TEXT,
  metodo      TEXT,
  user_agent  TEXT,
  pais        TEXT,
  es_bot      BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS newsletter_clics_campana_ts ON newsletter_clics (campana, ts);

-- Como el resto de public (20261019_rls_tablas_base.sql): solo la service key de /api.
ALTER TABLE newsletter_clics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON newsletter_clics FROM anon, authenticated;
REVOKE ALL ON SEQUENCE newsletter_clics_id_seq FROM anon, authenticated;

COMMENT ON TABLE newsletter_clics IS '2026-11-19: clics en enlaces de newsletters (redirect /r). Ver clic y newsletterMapa en api/admin.js';
