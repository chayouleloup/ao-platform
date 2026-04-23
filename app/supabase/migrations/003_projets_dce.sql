-- ============================================================
-- AO PLATFORM — Migration 003 : Projets AO + DCE
-- Tables : projects, lots, dce_documents, dce_versions
-- ============================================================

-- ============================================================
-- ENUM : statuts
-- ============================================================
create type project_status as enum (
  'sourcing',       -- AO repéré, pas encore de DCE
  'analyse',        -- DCE importé, en cours d'analyse
  'redaction',      -- Mémoire/prix en cours
  'validation',     -- En attente de validation
  'depose',         -- Pack candidature déposé
  'en_attente',     -- En attente de résultat
  'gagne',          -- Marché attribué
  'perdu',          -- Non retenu
  'abandon'         -- AO abandonné
);

create type lot_status as enum (
  'nouveau', 'analyse', 'redaction', 'validation', 'exporte', 'depose'
);

create type dce_doc_type as enum (
  'RC',             -- Règlement de la consultation
  'CCAP',           -- Cahier des clauses admin particulières
  'CCTP',           -- Cahier des clauses tech particulières
  'AE',             -- Acte d'engagement
  'DPGF',           -- Décomposition du prix global et forfaitaire
  'BPU',            -- Bordereau des prix unitaires
  'DQE',            -- Détail quantitatif estimatif
  'DC1',            -- Lettre de candidature
  'DC2',            -- Déclaration du candidat
  'ANNEXE_ADMIN',   -- Annexe administrative
  'ANNEXE_TECH',    -- Annexe technique
  'PLAN',           -- Plans / dessins
  'CHARTE',         -- Charte RSE / environnement
  'AUTRE'           -- Autre pièce
);

create type doc_scope as enum ('commun', 'lot');  -- pièce commune ou spécifique à un lot

-- ============================================================
-- TABLE: projects (1 consultation = 1 projet)
-- ============================================================
create table public.projects (
  id                uuid primary key default uuid_generate_v4(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  created_by        uuid references public.profiles(id) on delete set null,

  -- Identification de l'AO
  title             text not null,
  reference         text,                -- référence interne ou numéro BOAMP/PLACE
  buyer_name        text,                -- acheteur public
  buyer_siren       text,
  source_url        text,                -- lien vers l'annonce
  cpv_codes         text[],              -- codes CPV
  location          text,                -- lieu d'exécution
  
  -- Dates clés (extraites du DCE + manuelles)
  dlro              timestamptz,         -- date limite de remise des offres
  visit_date        timestamptz,         -- date de visite si applicable
  visit_mandatory   boolean default false,
  visit_contact     text,
  
  -- Montant / durée
  estimated_amount  numeric(15,2),
  market_duration   text,                -- ex: "12 mois renouvelable 2 fois"
  
  -- Statut & allotissement
  status            project_status default 'sourcing',
  is_allotted       boolean default false,  -- AO alloti en lots ?
  
  -- Résultat
  result_status     text,               -- 'gagne' | 'perdu' | 'infructueux'
  result_date       date,
  result_notes      text,
  
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- ============================================================
-- TABLE: lots (sous-projet rattaché à 1 consultation)
-- ============================================================
create table public.lots (
  id                uuid primary key default uuid_generate_v4(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  company_id        uuid not null references public.companies(id) on delete cascade,
  
  number            integer not null,   -- ex: 1, 2, 3
  title             text not null,      -- ex: "Lot 1 - Gros œuvre"
  description       text,
  
  status            lot_status default 'nouveau',
  
  -- Complétude par bloc (0-100)
  progress_analyse  integer default 0,
  progress_memoire  integer default 0,
  progress_admin    integer default 0,
  progress_prix     integer default 0,
  
  -- Validation
  memoire_validated_at   timestamptz,
  memoire_validated_by   uuid references public.profiles(id),
  admin_validated_at     timestamptz,
  admin_validated_by     uuid references public.profiles(id),
  prix_validated_at      timestamptz,
  prix_validated_by      uuid references public.profiles(id),
  
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  
  unique(project_id, number)
);

-- ============================================================
-- TABLE: dce_document_versions (version d'un upload DCE complet)
-- Permet le versioning quand l'acheteur met à jour le DCE
-- ============================================================
create table public.dce_document_versions (
  id            uuid primary key default uuid_generate_v4(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  version       integer not null default 1,
  label         text,                  -- ex: "DCE initial" | "Rectificatif n°1"
  notes         text,
  uploaded_by   uuid references public.profiles(id),
  created_at    timestamptz default now(),
  
  unique(project_id, version)
);

-- ============================================================
-- TABLE: dce_documents (pièces individuelles du DCE)
-- ============================================================
create table public.dce_documents (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  company_id      uuid not null references public.companies(id) on delete cascade,
  version_id      uuid references public.dce_document_versions(id) on delete cascade,
  lot_id          uuid references public.lots(id) on delete set null,
  
  -- Fichier
  file_name       text not null,
  file_url        text,
  file_size       bigint,
  mime_type       text,
  page_count      integer,
  
  -- Classification IA
  doc_type        dce_doc_type default 'AUTRE',
  scope           doc_scope default 'commun',
  classification_confidence  numeric(3,2),  -- 0.00 à 1.00
  classification_validated   boolean default false,  -- validé par l'utilisateur
  
  -- Extraction (remplie après analyse DCE)
  extracted_text  text,
  extraction_status text default 'pending',  -- pending | processing | done | error
  
  -- Tags utilisateur
  tags            text[],
  custom_label    text,
  notes           text,
  
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- TABLE: project_extractions (résultats de l'analyse DCE par lot)
-- Remplie par le module Analyse DCE (migration 004)
-- ============================================================
create table public.project_extractions (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  lot_id          uuid references public.lots(id) on delete cascade,
  company_id      uuid not null references public.companies(id) on delete cascade,
  version_id      uuid references public.dce_document_versions(id),
  
  -- Données extraites (JSON structuré)
  dlro            jsonb,               -- { value, source_doc, source_page, confidence }
  visit_info      jsonb,               -- { mandatory, date, contact, attestation_required, ... }
  criteria        jsonb,               -- [ { name, weight, sub_criteria: [...] } ]
  required_docs   jsonb,               -- { candidature: [...], offre_tech: [...], financier: [...], conditional: [...] }
  formal_constraints jsonb,            -- { page_limit, required_template, formats, signature_rules, ... }
  warning_points  jsonb,               -- [ { type, description, severity } ]
  
  -- Statut
  extraction_status text default 'pending',  -- pending | running | done | error
  extracted_at    timestamptz,
  error_message   text,
  
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  
  unique(lot_id, version_id)
);

-- ============================================================
-- INDEX
-- ============================================================
create index idx_projects_company on public.projects(company_id);
create index idx_projects_status on public.projects(status);
create index idx_projects_dlro on public.projects(dlro);
create index idx_lots_project on public.lots(project_id);
create index idx_lots_company on public.lots(company_id);
create index idx_dce_docs_project on public.dce_documents(project_id);
create index idx_dce_docs_lot on public.dce_documents(lot_id);
create index idx_dce_docs_type on public.dce_documents(doc_type);
create index idx_extractions_project on public.project_extractions(project_id);
create index idx_extractions_lot on public.project_extractions(lot_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.projects                  enable row level security;
alter table public.lots                      enable row level security;
alter table public.dce_document_versions     enable row level security;
alter table public.dce_documents             enable row level security;
alter table public.project_extractions       enable row level security;

create policy "projects_all" on public.projects
  for all using (company_id = public.get_my_company_id());

create policy "lots_all" on public.lots
  for all using (company_id = public.get_my_company_id());

create policy "dce_versions_all" on public.dce_document_versions
  for all using (company_id = public.get_my_company_id());

create policy "dce_docs_all" on public.dce_documents
  for all using (company_id = public.get_my_company_id());

create policy "extractions_all" on public.project_extractions
  for all using (company_id = public.get_my_company_id());

-- ============================================================
-- TRIGGERS updated_at
-- ============================================================
create trigger projects_updated before update on public.projects
  for each row execute function public.handle_updated_at();
create trigger lots_updated before update on public.lots
  for each row execute function public.handle_updated_at();
create trigger dce_docs_updated before update on public.dce_documents
  for each row execute function public.handle_updated_at();
create trigger extractions_updated before update on public.project_extractions
  for each row execute function public.handle_updated_at();

-- ============================================================
-- FONCTION : progression globale d'un lot (%)
-- ============================================================
create or replace function public.lot_global_progress(lot_id uuid)
returns integer language sql stable as $$
  select (
    coalesce((select progress_analyse + progress_memoire + progress_admin + progress_prix from public.lots where id = lot_id), 0) / 4
  )::integer
$$;
