-- Guarda la URL pública y el path del PDF generado para cada propuesta.
-- Lo escribe /api/generate-proposal-pdf.
-- Permite que /admin ofrezca "Descargar PDF" en propuestas ya validadas.

alter table proposals add column if not exists pdf_url text;
alter table proposals add column if not exists pdf_path text;
