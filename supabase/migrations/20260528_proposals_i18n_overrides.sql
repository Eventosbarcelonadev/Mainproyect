-- Overrides de texto en EN para propuestas (Xavi QA 2026-05-28).
-- Cuando Xavi edita la propuesta en EN, los overrides se guardan en estas
-- columnas. Si están NULL, el render cae al default del catálogo EN
-- (CATEGORY_CONFIG_EN del propuesta.html).
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS hero_sub_en text,
  ADD COLUMN IF NOT EXISTS concept_title_en text,
  ADD COLUMN IF NOT EXISTS concept_text_en text;
