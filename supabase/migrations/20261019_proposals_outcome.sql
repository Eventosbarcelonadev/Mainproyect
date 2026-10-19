-- 2026-10-19: estado comercial de la propuesta.
-- La lista de /admin enseña cuatro estados: Borrador (status = 'revision', Xavi la
-- está haciendo), Enviada (status = 'approved': validada y enviada al cliente),
-- Aprobada y Cancelada. Las dos últimas las marca Xavi a mano desde /admin
-- (Más → Marcar aprobada / Marcar cancelada) y viven aquí, no en status, que usan
-- el PDF, la validación y GHL.
--
-- Se puede aplicar antes o después de desplegar: list-proposals sigue funcionando
-- sin estas columnas, y solo los botones de marcar avisan de que falta la migración.

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS outcome    TEXT CHECK (outcome IN ('won', 'cancelled')),
  ADD COLUMN IF NOT EXISTS outcome_at TIMESTAMPTZ;

COMMENT ON COLUMN proposals.outcome IS '2026-10-19: won = el cliente la ha aprobado, cancelled = cancelada. Lo marca Xavi desde /admin. NULL = sin decidir (Borrador o Enviada según status)';
