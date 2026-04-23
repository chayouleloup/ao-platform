-- ============================================================
-- AO PLATFORM — Migration 005 : Mémoire technique
-- Tables : memoires, memoire_sections, memoire_versions
-- ============================================================

create type memoire_status as enum (
  'brouillon',    -- en cours de génération/rédaction
  'a_valider',    -- soumis pour validation
  'valide',       -- validé, export autorisé
  'rejete'        -- renvoyé en correction
);

create type section_status as enum (
  'vide',
  'genere',       -- généré par IA, pas encore relu
  'a_completer',  -- IA a mis "Non précisé..." → action requise
  'valide'        -- relu et approuvé
);

-- ============================================================
-- TABLE: memoires
-- Un mémoire par lot (peut avoir plusieurs versions)
-- ============================================================
create table public.memoires (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  lot_id          uuid not null references public.lots(id) on delete cascade,
  company_id      uuid not null references public.companies(id) on delete cascade,

  title           text not null,          -- ex: "Mémoire technique — Lot 1 VRD"
  version         integer default 1,
  status          memoire_status default 'brouillon',

  -- Contraintes formelles issues de l'analyse DCE
  page_limit      integer,                -- null = pas de limite
  has_template    boolean default false,  -- trame imposée par l'acheteur

  -- Fichier DOCX généré
  docx_url        text,
  pdf_url         text,
  generated_at    timestamptz,

  -- Workflow
  submitted_for_validation_at timestamptz,
  submitted_by    uuid references public.profiles(id),
  validated_at    timestamptz,
  validated_by    uuid references public.profiles(id),
  validation_notes text,
  rejected_at     timestamptz,
  rejected_by     uuid references public.profiles(id),
  rejection_reason text,

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- TABLE: memoire_sections
-- Une section = un critère ou sous-critère du RC
-- ============================================================
create table public.memoire_sections (
  id              uuid primary key default uuid_generate_v4(),
  memoire_id      uuid not null references public.memoires(id) on delete cascade,
  company_id      uuid not null references public.companies(id) on delete cascade,

  -- Position dans le plan
  display_order   integer not null,
  level           integer default 1,       -- 1 = titre principal, 2 = sous-section
  heading         text not null,           -- ex: "2. Organisation et méthodologie"
  section_type    text not null,           -- 'cover'|'toc'|'criterion'|'appendix'|'custom'

  -- Lien avec les critères DCE
  criterion_name  text,                    -- nom du critère aligné
  criterion_weight integer,               -- pondération %

  -- Contenu
  content         text,                    -- Markdown / texte riche
  content_html    text,                    -- version HTML pour preview
  status          section_status default 'vide',

  -- Preuves associées
  evidence_ids    uuid[],                  -- IDs documents entreprise
  evidence_notes  text,

  -- IA metadata
  ai_prompt_used  text,
  ai_generated_at timestamptz,
  word_count      integer,

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- INDEX
-- ============================================================
create index idx_memoires_lot       on public.memoires(lot_id);
create index idx_memoires_project   on public.memoires(project_id);
create index idx_memoires_company   on public.memoires(company_id);
create index idx_sections_memoire   on public.memoire_sections(memoire_id);
create index idx_sections_order     on public.memoire_sections(memoire_id, display_order);

-- ============================================================
-- RLS
-- ============================================================
alter table public.memoires          enable row level security;
alter table public.memoire_sections  enable row level security;

create policy "memoires_all" on public.memoires
  for all using (company_id = public.get_my_company_id());

create policy "sections_all" on public.memoire_sections
  for all using (company_id = public.get_my_company_id());

-- ============================================================
-- TRIGGERS
-- ============================================================
create trigger memoires_updated before update on public.memoires
  for each row execute function public.handle_updated_at();

create trigger sections_updated before update on public.memoire_sections
  for each row execute function public.handle_updated_at();

-- ============================================================
-- FONCTION : progression du mémoire (% sections validées)
-- ============================================================
create or replace function public.memoire_progress(p_memoire_id uuid)
returns integer language sql stable as $$
  select coalesce(
    round(
      100.0 * count(*) filter (where status in ('valide','genere'))
      / nullif(count(*) filter (where section_type not in ('cover','toc')), 0)
    )::integer,
    0
  )
  from public.memoire_sections
  where memoire_id = p_memoire_id
$$;
