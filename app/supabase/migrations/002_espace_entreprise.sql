-- ============================================================
-- AO PLATFORM — Migration 002 : Espace Entreprise
-- Tables : certifications, staff, équipement, références, documents
-- ============================================================

-- ============================================================
-- TABLE: company_certifications
-- Qualibat, RGE, ISO, MASE, etc.
-- ============================================================
create table public.company_certifications (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  name         text not null,                    -- ex: "Qualibat 1511"
  issuer       text,                             -- ex: "Qualibat"
  number       text,                             -- numéro du certificat
  issued_at    date,
  expires_at   date,
  document_url text,                             -- lien vers le justificatif
  notes        text,
  is_active    boolean default true,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ============================================================
-- TABLE: company_staff
-- Fiches RH — intervenants potentiels sur AO
-- ============================================================
create table public.company_staff (
  id              uuid primary key default uuid_generate_v4(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  full_name       text not null,
  job_title       text,                          -- ex: "Chargé d'affaires"
  qualifications  text[],                        -- ex: ['CACES R489', 'Habilitation électrique B1']
  skills          text[],                        -- ex: ['Gestion de chantier', 'AutoCAD']
  experience_years integer,
  availability    text,                          -- ex: "Disponible immédiatement"
  cv_url          text,
  photo_url       text,
  notes           text,
  is_active       boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- TABLE: company_equipment
-- Matériels et moyens techniques
-- ============================================================
create table public.company_equipment (
  id              uuid primary key default uuid_generate_v4(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  name            text not null,                 -- ex: "Pelle hydraulique CATERPILLAR 320"
  category        text,                          -- ex: "Engins de terrassement"
  brand           text,
  model           text,
  year            integer,
  capacity        text,                          -- ex: "20 tonnes"
  quantity        integer default 1,
  location        text,                          -- ex: "Dépôt Marseille"
  conformity_notes text,
  document_url    text,                          -- fiche technique, photos
  is_available    boolean default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- TABLE: company_references
-- Références marchés — le cœur de la crédibilité
-- ============================================================
create table public.company_references (
  id              uuid primary key default uuid_generate_v4(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  client_name     text not null,                 -- ex: "Mairie de Lyon"
  client_type     text,                          -- ex: "Public" | "Privé"
  project_name    text,                          -- ex: "Réfection voirie"
  description     text,
  location        text,                          -- ex: "Lyon 69"
  amount          numeric(15,2),                 -- montant du marché
  start_date      date,
  end_date        date,
  role            text,                          -- ex: "Mandataire" | "Co-traitant"
  tags            text[],                        -- ex: ['Terrassement', 'VRD']
  contact_name    text,
  contact_email   text,
  contact_phone   text,
  -- Preuves jointes
  document_urls   text[],                        -- attestations, PV, photos
  is_featured     boolean default false,         -- mise en avant dans mémoires
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- TABLE: company_documents
-- Bibliothèque documentaire — Kbis, RC Pro, URSSAF, bilans...
-- ============================================================
create type document_status as enum ('valid', 'expiring_soon', 'expired', 'missing');

create table public.company_documents (
  id              uuid primary key default uuid_generate_v4(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  name            text not null,                 -- ex: "Kbis"
  category        text,                          -- ex: "Administratif" | "Financier" | "Assurance"
  tags            text[],
  file_url        text,
  file_name       text,
  file_size       bigint,
  mime_type       text,
  issued_at       date,
  expires_at      date,
  version         integer default 1,
  replaced_by     uuid references public.company_documents(id),
  status          document_status default 'valid',
  notes           text,
  uploaded_by     uuid references public.profiles(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- INDEX pour performances
-- ============================================================
create index idx_certif_company on public.company_certifications(company_id);
create index idx_certif_expires on public.company_certifications(expires_at);
create index idx_staff_company on public.company_staff(company_id);
create index idx_equipment_company on public.company_equipment(company_id);
create index idx_references_company on public.company_references(company_id);
create index idx_references_tags on public.company_references using gin(tags);
create index idx_docs_company on public.company_documents(company_id);
create index idx_docs_expires on public.company_documents(expires_at);
create index idx_docs_status on public.company_documents(status);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.company_certifications enable row level security;
alter table public.company_staff         enable row level security;
alter table public.company_equipment     enable row level security;
alter table public.company_references    enable row level security;
alter table public.company_documents     enable row level security;

-- Politique générique : accès uniquement à sa propre company
create policy "company_certifications_policy" on public.company_certifications
  for all using (company_id = public.get_my_company_id());

create policy "company_staff_policy" on public.company_staff
  for all using (company_id = public.get_my_company_id());

create policy "company_equipment_policy" on public.company_equipment
  for all using (company_id = public.get_my_company_id());

create policy "company_references_policy" on public.company_references
  for all using (company_id = public.get_my_company_id());

create policy "company_documents_policy" on public.company_documents
  for all using (company_id = public.get_my_company_id());

-- ============================================================
-- TRIGGERS updated_at
-- ============================================================
create trigger certif_updated before update on public.company_certifications
  for each row execute function public.handle_updated_at();
create trigger staff_updated before update on public.company_staff
  for each row execute function public.handle_updated_at();
create trigger equipment_updated before update on public.company_equipment
  for each row execute function public.handle_updated_at();
create trigger references_updated before update on public.company_references
  for each row execute function public.handle_updated_at();
create trigger documents_updated before update on public.company_documents
  for each row execute function public.handle_updated_at();

-- ============================================================
-- FONCTION : Calcul automatique du statut des documents
-- Appelée par un job CRON ou en lecture
-- ============================================================
create or replace function public.compute_document_status(expires_at date)
returns document_status language sql immutable as $$
  select case
    when expires_at is null then 'valid'::document_status
    when expires_at < current_date then 'expired'::document_status
    when expires_at < current_date + interval '30 days' then 'expiring_soon'::document_status
    else 'valid'::document_status
  end
$$;

-- ============================================================
-- STORAGE BUCKET (à créer via dashboard Supabase)
-- Nom: "company-documents"
-- Policies: authenticated users peuvent lire/écrire leur dossier
-- Path convention: {company_id}/{category}/{filename}
-- ============================================================
-- NOTE: exécuter dans Supabase Dashboard > Storage > New Bucket:
--   Bucket name: "company-documents"
--   Public: false (privé)
--   Puis dans Storage Policies, autoriser les utilisateurs authentifiés
--   à accéder à leur company_id/ uniquement.
