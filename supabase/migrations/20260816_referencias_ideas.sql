-- Motor de ideas (/admin → tab Ideas).
--
-- `referencias`: webs y perfiles del sector que Xavi mete a mano desde /admin
-- (Scarlett, Contraband, Stormont, 42.show, Sintonizart, Creartys, Talents...).
-- Alimentan el contexto del generador de conceptos. Son fuentes de INSPIRACIÓN:
-- guardamos nombre/url/tags, nunca copy ajeno para reutilizar.
--
-- `ideas_sesiones`: historial de briefs + conceptos generados, para que Xavi
-- pueda volver a una sesión y para tener trazabilidad de qué se propuso.

create table if not exists referencias (
  id uuid primary key default extensions.uuid_generate_v4(),
  nombre text not null,
  url text not null,
  tipo text not null default 'web',       -- web | instagram | pinterest | otro
  notas text,                              -- qué mirar en esta fuente
  tags text[] default '{}',                -- ej: {catalogo-grande, mice, aereo}
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists referencias_activa_idx on referencias (activa);

create table if not exists ideas_sesiones (
  id uuid primary key default extensions.uuid_generate_v4(),
  brief jsonb not null,                    -- {concepto, fecha, pax, formato, espacio, presupuesto, notas}
  resultado jsonb not null,                -- {conceptos: [...], huecos_catalogo: [...]}
  modelo text,
  created_at timestamptz not null default now()
);

create index if not exists ideas_sesiones_created_idx on ideas_sesiones (created_at desc);

-- Semilla: las fuentes que pasó Xavi por WhatsApp el 12/08/2026.
insert into referencias (nombre, url, tipo, notas, tags)
values
  ('Scarlett Entertainment', 'https://scarlettentertainment.com/es', 'web',
   'Catálogo enorme y bien categorizado. Referencia de amplitud y de cómo nombran los actos.',
   '{catalogo-grande, internacional}'),
  ('Contraband Events', 'https://www.contrabandevents.com/', 'web',
   'Agencia UK. Buena para conceptos de espectáculo y actos poco vistos.',
   '{catalogo-grande, uk}'),
  ('Stormont', 'https://www.stormont.com/', 'web',
   'Producción de eventos corporativos. Mirar escenografía y formato de evento completo.',
   '{produccion, corporativo}'),
  ('42.show', 'https://42.show/', 'web',
   'Formatos inmersivos y tecnológicos. Referencia para conceptos futuristas.',
   '{inmersivo, tecnologia}'),
  ('Sintonizart', 'https://www.sintonizart.com/index.php', 'web',
   'Agencia española. Comparable directa en mercado local.',
   '{espana, competencia-local}'),
  ('Creartys', 'https://www.creartys.com/', 'web',
   'Agencia española de animación y espectáculos.',
   '{espana, competencia-local}'),
  ('Talents Productions', 'https://www.talents-productions.com/', 'web',
   'Producción artística. Referencia de shows a medida.',
   '{produccion, a-medida}')
on conflict do nothing;
