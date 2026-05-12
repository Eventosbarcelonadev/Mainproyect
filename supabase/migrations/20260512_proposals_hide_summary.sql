-- Añadir columna hide_summary a proposals para persistir el toggle X del
-- summary final en la propuesta (botón admin en propuesta.html).
-- Hasta que esta migración corra, save-proposal.js no escribe el campo
-- (se mantiene solo en proposalState frontend de la sesión actual).

alter table public.proposals
  add column if not exists hide_summary boolean not null default false;
