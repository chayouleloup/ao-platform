-- ============================================================
-- AO PLATFORM — Migration 004 : Moteur de conformité
-- Tables : checklist_items, checklist_validations, export_blocks
-- ============================================================

create type checklist_status as enum (
  'manquant',     -- non fourni / non généré
  'fourni',       -- document uploadé ou livrable généré
  'perime',       -- document expiré
  'non_applicable' -- ne s'applique pas à ce lot
);

create type checklist_category as enum (
  'candidature',
  'offre_technique',
  'offre_financiere',
  'conditionnel'
);

create type item_character as enum (
  'obligatoire',
  'conditionnel',
  'recommande'
);

-- ============================================================
-- TABLE: checklist_items
-- Une ligne par pièce attendue, par lot
-- ============================================================
create table public.checklist_items (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  lot_id          uuid not null references public.lots(id) on delete cascade,
  company_id      uuid not null references public.companies(id) on delete cascade,

  -- Identification
  name            text not null,          -- ex: "DC1 - Lettre de candidature"
  category        checklist_category not null,
  character       item_character default 'obligatoire',
  scope           text default 'lot',     -- 'commun' | 'lot'

  -- Origine
  source_type     text default 'ia',      -- 'ia' | 'manuel' | 'template'
  source_ref      text,                   -- ex: "RC Article 5.2 page 8"
  dce_doc_type    text,                   -- type de document DCE qui génère cet item

  -- Format attendu
  expected_format text,                   -- ex: "PDF", "XLSX"
  format_notes    text,

  -- Statut
  status          checklist_status default 'manquant',
  status_notes    text,

  -- Lien vers la pièce fournie
  document_id     uuid,                   -- ID dans company_documents ou dce_documents
  document_url    text,
  document_name   text,
  document_expires_at date,               -- pour détecter les périmés

  -- Livrable généré (mémoire, AE, etc.)
  linked_output   text,                   -- 'memoire' | 'ae' | 'dpgf' | 'dc1' | 'dc2'

  -- Validation manuelle
  validated_by    uuid references public.profiles(id),
  validated_at    timestamptz,
  override_reason text,                   -- raison si "non_applicable" manuel

  -- Ordre d'affichage
  display_order   integer default 0,

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- TABLE: checklist_uploads
-- Fichiers uploadés pour satisfaire un item de checklist
-- ============================================================
create table public.checklist_uploads (
  id            uuid primary key default uuid_generate_v4(),
  item_id       uuid not null references public.checklist_items(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  file_name     text not null,
  file_url      text,
  file_size     bigint,
  mime_type     text,
  uploaded_by   uuid references public.profiles(id),
  expires_at    date,
  created_at    timestamptz default now()
);

-- ============================================================
-- TABLE: export_blocks
-- Journal des blocages d'export actifs
-- ============================================================
create table public.export_blocks (
  id          uuid primary key default uuid_generate_v4(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  lot_id      uuid not null references public.lots(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  block_type  text not null,   -- 'pack' | 'memoire' | 'prix' | 'admin'
  reason      text not null,
  item_ids    uuid[],          -- items responsables du blocage
  resolved_at timestamptz,
  created_at  timestamptz default now()
);

-- ============================================================
-- INDEX
-- ============================================================
create index idx_checklist_lot     on public.checklist_items(lot_id);
create index idx_checklist_project on public.checklist_items(project_id);
create index idx_checklist_status  on public.checklist_items(status);
create index idx_checklist_company on public.checklist_items(company_id);
create index idx_uploads_item      on public.checklist_uploads(item_id);
create index idx_blocks_lot        on public.export_blocks(lot_id);

-- ============================================================
-- RLS
-- ============================================================
alter table public.checklist_items   enable row level security;
alter table public.checklist_uploads enable row level security;
alter table public.export_blocks     enable row level security;

create policy "checklist_items_all" on public.checklist_items
  for all using (company_id = public.get_my_company_id());

create policy "checklist_uploads_all" on public.checklist_uploads
  for all using (company_id = public.get_my_company_id());

create policy "export_blocks_all" on public.export_blocks
  for all using (company_id = public.get_my_company_id());

-- ============================================================
-- TRIGGERS
-- ============================================================
create trigger checklist_items_updated before update on public.checklist_items
  for each row execute function public.handle_updated_at();

-- ============================================================
-- FONCTION : blocages actifs d'un lot
-- ============================================================
create or replace function public.get_lot_blocks(p_lot_id uuid)
returns table (
  block_type    text,
  reason        text,
  missing_count integer
) language sql stable as $$
  select
    'pack'::text as block_type,
    'Pièces obligatoires manquantes ou périmées' as reason,
    count(*)::integer as missing_count
  from public.checklist_items
  where lot_id = p_lot_id
    and character = 'obligatoire'
    and status in ('manquant', 'perime')
  having count(*) > 0

  union all

  select
    'memoire'::text,
    'Mémoire technique non validé',
    1
  from public.lots
  where id = p_lot_id and memoire_validated_at is null
    and progress_memoire > 0

  union all

  select
    'prix'::text,
    'Offre financière non validée',
    1
  from public.lots
  where id = p_lot_id and prix_validated_at is null
    and progress_prix > 0
$$;

-- ============================================================
-- FONCTION : score de complétude de la checklist d'un lot
-- ============================================================
create or replace function public.lot_checklist_score(p_lot_id uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'total',          count(*),
    'fourni',         count(*) filter (where status = 'fourni'),
    'manquant',       count(*) filter (where status = 'manquant' and character = 'obligatoire'),
    'perime',         count(*) filter (where status = 'perime'),
    'non_applicable', count(*) filter (where status = 'non_applicable'),
    'score_pct',      round(
      100.0 * count(*) filter (where status in ('fourni','non_applicable'))
      / nullif(count(*), 0)
    )
  )
  from public.checklist_items
  where lot_id = p_lot_id
$$;
