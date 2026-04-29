alter table public.proposals
  add column if not exists hide_summary boolean not null default false;
