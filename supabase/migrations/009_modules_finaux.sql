-- ============================================================
-- AO PLATFORM — Migration 009 : Modules finaux
-- ============================================================

-- ============================================================
-- MODULE RÉSULTATS & NOTATION
-- ============================================================
create table public.resultats (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  lot_id          uuid references public.lots(id) on delete set null,
  company_id      uuid not null references public.companies(id) on delete cascade,

  -- Fichier source
  pdf_url         text,
  pdf_name        text,

  -- Statut de l'extraction
  extraction_status text default 'pending',  -- pending | running | done | error

  -- Résultat général
  result_status   text,  -- 'gagne' | 'perdu' | 'infructueux' | 'sans_suite'
  notification_date date,
  attributaire    text,  -- nom du titulaire si communiqué

  -- Notes extraites
  note_globale    numeric(5,2),
  note_max        numeric(5,2) default 100,
  notes_by_critere jsonb default '[]',
  -- [{ critere, note, note_max, commentaire, source_page }]

  -- Analyse IA
  points_perdus       jsonb default '[]',
  -- [{ critere, points, raison, section_memoire }]
  recommandations     jsonb default '[]',
  -- [{ priorite, action, detail, type }]
  ameliorations       jsonb default '[]',
  -- [{ titre, description, type, validated }]

  -- Notes manuelles
  notes_utilisateur text,

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- MODULE PIÈCES ADMIN (DC1/DC2/AE)
-- ============================================================
create table public.pieces_admin (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  lot_id          uuid references public.lots(id) on delete set null,
  company_id      uuid not null references public.companies(id) on delete cascade,

  piece_type      text not null,  -- 'DC1' | 'DC2' | 'AE' | 'AUTRE'
  file_url        text,
  file_name       text,
  html_content    text,           -- contenu prérempli HTML
  status          text default 'brouillon',  -- brouillon | valide | exporte
  validated_at    timestamptz,
  validated_by    uuid references public.profiles(id),

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- MODULE SOURCING AO
-- ============================================================
create table public.sourcing_profiles (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  keywords    text[],
  cpv_codes   text[],
  regions     text[],
  departments text[],
  alert_freq  text default 'daily',  -- 'immediate' | 'daily' | 'weekly'
  is_active   boolean default true,
  last_run_at timestamptz,
  created_at  timestamptz default now()
);

create table public.sourcing_results (
  id              uuid primary key default uuid_generate_v4(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  profile_id      uuid references public.sourcing_profiles(id) on delete set null,
  title           text not null,
  buyer_name      text,
  location        text,
  dlro            timestamptz,
  estimated_amount numeric(15,2),
  source_url      text,
  cpv_codes       text[],
  status          text default 'nouveau',  -- 'nouveau' | 'suivi' | 'ignore' | 'projet_cree'
  project_id      uuid references public.projects(id) on delete set null,
  published_at    timestamptz,
  created_at      timestamptz default now()
);

-- ============================================================
-- RLS
-- ============================================================
alter table public.resultats          enable row level security;
alter table public.pieces_admin       enable row level security;
alter table public.sourcing_profiles  enable row level security;
alter table public.sourcing_results   enable row level security;

create policy "resultats_all"         on public.resultats         for all using (company_id = public.get_my_company_id());
create policy "pieces_admin_all"      on public.pieces_admin      for all using (company_id = public.get_my_company_id());
create policy "sourcing_profiles_all" on public.sourcing_profiles for all using (company_id = public.get_my_company_id());
create policy "sourcing_results_all"  on public.sourcing_results  for all using (company_id = public.get_my_company_id());

-- TRIGGERS
create trigger resultats_updated before update on public.resultats for each row execute function public.handle_updated_at();
create trigger pieces_admin_updated before update on public.pieces_admin for each row execute function public.handle_updated_at();
