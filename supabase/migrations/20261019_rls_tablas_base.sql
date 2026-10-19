-- 2026-10-19: RLS en las tablas que se crearon a mano sin él.
-- proposals, artistas, shows y show_artistas no tenían Row Level Security. La
-- clave anon es pública (está en formulario-artistas.html para subir fotos a
-- Storage), así que con ella se leían enteras por la API REST de Supabase, sin
-- pasar por /api: nombre, email y teléfono de cada cliente y artista, márgenes,
-- tokens de los formularios. Sin RLS, anon también puede escribir y borrar.
--
-- Toda la app (api/*.js, scripts/) usa la service key, que se salta el RLS, y
-- el navegador solo usa anon para Storage, que va por sus propias políticas
-- (20260508_artist_assets_anon_insert.sql). Activar RLS sin políticas corta el
-- acceso anónimo y no cambia nada más. Es lo mismo que ya tienen proposal_views,
-- referencias e ideas_sesiones.
--
-- Recorre todas las tablas de public por si hay alguna más en el mismo estado.

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    RAISE NOTICE 'RLS activado en %', t.tablename;
  END LOOP;
END $$;

-- Comprobación: todas deben salir con rowsecurity = true.
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
