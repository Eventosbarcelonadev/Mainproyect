-- Añadir columna hero_image_url a proposals: permite que admin elija una
-- imagen distinta a shows[0].imageUrl para la cabecera de la propuesta.
-- Selector de imagen entre los shows incluidos (sin uploads externos).

alter table public.proposals
  add column if not exists hero_image_url text;
