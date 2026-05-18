-- Multi-imagen por show: agregar columna image_urls text[] y backfill desde
-- la columna image_url existente. image_url queda como cache de la primera
-- (image_urls[1]) para no romper queries/JOINs antiguos hasta migrar todo.
--
-- Cuando admin sube/borra/reordena imágenes:
--   - shows.image_urls = array completo en el orden visible
--   - shows.image_url  = image_urls[1] (o NULL si vacío)
--
-- En propuesta.html, si imageUrls.length > 1 → carrusel. Si = 1 → bg-image único.

alter table public.shows
  add column if not exists image_urls text[];

-- Backfill: copiar image_url a image_urls[] solo si está vacío
update public.shows
  set image_urls = array[image_url]
  where image_url is not null
    and image_url <> ''
    and (image_urls is null or array_length(image_urls, 1) is null);
