-- ============================================================
-- AO PLATFORM — Migration 006 : Module Prix DPGF/BPU/DQE
-- ============================================================

create type prix_status as enum (
  'importe',      -- fichier importé, pas encore mappé
  'mapping',      -- mapping IA en cours
  'a_valider',    -- mapping fait, en attente validation globale
  'valide',       -- validé globalement, export autorisé
  'exporte'       -- fichier final exporté
);

create type anomalie_severity as enum (
  'bloquante',    -- empêche la validation
  'attention'     -- signalée mais non bloquante
);

create type anomalie_type as enum (
  'unite_incoherente',
  'quantite_aberrante',
  'pu_hors_fourchette',
  'doublon',
  'ligne_vide',
  'montant_zero',
  'mapping_incertain'
);

-- ============================================================
-- TABLE: prix_fichiers
-- Un fichier DPGF/BPU/DQE par lot
-- ============================================================
create table public.prix_fichiers (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  lot_id          uuid not null references public.lots(id) on delete cascade,
  company_id      uuid not null references public.companies(id) on delete cascade,

  -- Fichier source
  file_name       text not null,
  file_url        text,
  file_size       bigint,
  doc_type        text default 'DPGF',  -- DPGF | BPU | DQE

  -- Fichier final (après remplissage)
  output_file_url text,
  output_file_name text,

  status          prix_status default 'importe',

  -- Totaux calculés
  total_ht        numeric(15,2),
  sheets_count    integer default 1,
  lines_count     integer default 0,
  mapped_count    integer default 0,

  -- Validation globale
  validated_at    timestamptz,
  validated_by    uuid references public.profiles(id),
  validation_notes text,

  -- Audit
  imported_by     uuid references public.profiles(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- TABLE: prix_lignes
-- Chaque ligne du DPGF/BPU/DQE
-- ============================================================
create table public.prix_lignes (
  id              uuid primary key default uuid_generate_v4(),
  fichier_id      uuid not null references public.prix_fichiers(id) on delete cascade,
  company_id      uuid not null references public.companies(id) on delete cascade,

  -- Position dans le fichier
  sheet_name      text,
  row_index       integer not null,
  display_order   integer not null,

  -- Contenu original (importé)
  designation     text,           -- libellé de la prestation
  unite_orig      text,           -- unité telle qu'importée
  quantite_orig   numeric(15,4),  -- quantité telle qu'importée
  pu_orig         numeric(15,4),  -- PU original (si présent)
  montant_orig    numeric(15,2),  -- montant original (si présent)

  -- Valeurs proposées par l'IA ou l'utilisateur
  unite           text,
  quantite        numeric(15,4),
  pu              numeric(15,4),
  montant         numeric(15,2),  -- calculé : pu × quantite

  -- Mapping IA
  matched_article text,           -- libellé de l'article de référence trouvé
  matched_source  text,           -- 'prix_client' | 'base_reference'
  mapping_confidence numeric(3,2),-- 0.00 à 1.00
  mapping_validated  boolean default false,

  -- Notes
  notes           text,
  is_section_header boolean default false,  -- ligne de titre/section
  is_subtotal     boolean default false,    -- ligne de sous-total

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- TABLE: prix_anomalies
-- Anomalies détectées sur les lignes
-- ============================================================
create table public.prix_anomalies (
  id              uuid primary key default uuid_generate_v4(),
  fichier_id      uuid not null references public.prix_fichiers(id) on delete cascade,
  ligne_id        uuid references public.prix_lignes(id) on delete cascade,
  company_id      uuid not null references public.companies(id) on delete cascade,

  anomalie_type   anomalie_type not null,
  severity        anomalie_severity default 'attention',
  description     text not null,
  suggestion      text,

  -- Résolution
  resolved        boolean default false,
  resolved_at     timestamptz,
  resolved_by     uuid references public.profiles(id),
  resolution_note text,

  created_at      timestamptz default now()
);

-- ============================================================
-- TABLE: prix_client (bibliothèque de prix de l'entreprise)
-- Alimentée par les devis et historiques importés
-- ============================================================
create table public.prix_client (
  id              uuid primary key default uuid_generate_v4(),
  company_id      uuid not null references public.companies(id) on delete cascade,

  designation     text not null,
  unite           text,
  pu_min          numeric(15,4),
  pu_max          numeric(15,4),
  pu_cible        numeric(15,4),  -- prix recommandé
  source          text,           -- 'devis_importe' | 'historique' | 'manuel'
  tags            text[],
  valid_until     date,

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- INDEX
-- ============================================================
create index idx_prix_lot       on public.prix_fichiers(lot_id);
create index idx_prix_project   on public.prix_fichiers(project_id);
create index idx_lignes_fichier on public.prix_lignes(fichier_id);
create index idx_lignes_order   on public.prix_lignes(fichier_id, display_order);
create index idx_anomalies_fic  on public.prix_anomalies(fichier_id);
create index idx_anomalies_line on public.prix_anomalies(ligne_id);
create index idx_prix_client_co on public.prix_client(company_id);

-- ============================================================
-- RLS
-- ============================================================
alter table public.prix_fichiers  enable row level security;
alter table public.prix_lignes    enable row level security;
alter table public.prix_anomalies enable row level security;
alter table public.prix_client    enable row level security;

create policy "prix_fichiers_all"  on public.prix_fichiers  for all using (company_id = public.get_my_company_id());
create policy "prix_lignes_all"    on public.prix_lignes    for all using (company_id = public.get_my_company_id());
create policy "prix_anomalies_all" on public.prix_anomalies for all using (company_id = public.get_my_company_id());
create policy "prix_client_all"    on public.prix_client    for all using (company_id = public.get_my_company_id());

-- ============================================================
-- TRIGGERS
-- ============================================================
create trigger prix_fichiers_updated before update on public.prix_fichiers
  for each row execute function public.handle_updated_at();
create trigger prix_lignes_updated before update on public.prix_lignes
  for each row execute function public.handle_updated_at();

-- ============================================================
-- FONCTION : recalcul du total d'un fichier
-- ============================================================
create or replace function public.recalculate_prix_total(p_fichier_id uuid)
returns void language plpgsql as $$
begin
  update public.prix_fichiers
  set
    total_ht = (
      select coalesce(sum(montant), 0)
      from public.prix_lignes
      where fichier_id = p_fichier_id
        and is_section_header = false
        and is_subtotal = false
        and montant is not null
    ),
    mapped_count = (
      select count(*)
      from public.prix_lignes
      where fichier_id = p_fichier_id
        and pu is not null
        and is_section_header = false
    )
  where id = p_fichier_id;
end;
$$;
