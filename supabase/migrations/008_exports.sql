-- ============================================================
-- AO PLATFORM — Migration 008 : Exports
-- ============================================================

create type export_status as enum ('pending', 'generating', 'ready', 'error');

-- ============================================================
-- TABLE: exports
-- Historique de tous les exports générés
-- ============================================================
create table public.exports (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  lot_id          uuid not null references public.lots(id) on delete cascade,
  company_id      uuid not null references public.companies(id) on delete cascade,
  created_by      uuid references public.profiles(id),

  export_type     text not null default 'pack',  -- 'pack' | 'rapport' | 'memoire' | 'prix'
  status          export_status default 'pending',

  -- Fichiers générés
  zip_url         text,
  pdf_url         text,
  zip_file_name   text,
  pdf_file_name   text,
  zip_size        bigint,

  -- Contenu (index des pièces)
  manifest        jsonb default '[]',  -- [{name, category, lot, status, size}]

  -- Erreur
  error_message   text,

  -- Méta
  generated_at    timestamptz,
  expires_at      timestamptz default (now() + interval '30 days'),
  created_at      timestamptz default now()
);

-- INDEX + RLS
create index idx_exports_lot     on public.exports(lot_id);
create index idx_exports_project on public.exports(project_id);

alter table public.exports enable row level security;
create policy "exports_all" on public.exports
  for all using (company_id = public.get_my_company_id());

create trigger exports_updated before update on public.exports
  for each row execute function public.handle_updated_at();
