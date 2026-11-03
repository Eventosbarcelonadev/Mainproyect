-- 2026-11-03: métricas del outbound de LinkedIn de Xavi para la pestaña LinkedIn de /admin.
-- Las manda cada hora el servidor de Rianex (panel_metricas.py, junto a los envíos por Unipile)
-- a POST /api/admin?action=linkedin-push. Dos tipos de fila:
--   id = 'actual'      lo último que ha llegado: totales, listas, semanas y quién ha contestado
--   id = 'AAAA-MM-DD'  los totales con que acabó cada día, para ver la evolución
-- Solo hay nombres de quien ha contestado; del resto, números.

CREATE TABLE IF NOT EXISTS linkedin_metricas (
  id         TEXT PRIMARY KEY,
  datos      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Como el resto de public (20261019_rls_tablas_base.sql): solo la service key de /api.
ALTER TABLE linkedin_metricas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON linkedin_metricas FROM anon, authenticated;

COMMENT ON TABLE linkedin_metricas IS '2026-11-03: métricas del outbound de LinkedIn (panel_metricas.py del servidor Rianex). Ver linkedinPush en api/admin.js';
