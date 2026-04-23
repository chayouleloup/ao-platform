-- ============================================================
-- AO PLATFORM — Schéma initial (multi-tenant, RBAC, audit)
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLE: companies (1 par entreprise cliente = 1 tenant)
-- ============================================================
create table public.companies (
  id                   uuid primary key default uuid_generate_v4(),
  name                 text not null,
  siret                text,
  siren                text,
  ape_code             text,
  legal_form           text,
  tva_number           text,
  address              text,
  city                 text,
  postal_code          text,
  -- Branding
  logo_url             text,
  primary_color        text default '#1a56db',
  secondary_color      text default '#7e3af2',
  -- Contact AO dédié
  ao_contact_name      text,
  ao_contact_role      text,
  ao_contact_email     text,
  ao_contact_phone     text,
  -- Financier
  revenue_n1           numeric(15,2),
  revenue_n2           numeric(15,2),
  revenue_n3           numeric(15,2),
  -- Abonnement
  stripe_customer_id   text,
  subscription_status  text not null default 'trial'
    check (subscription_status in ('trial','active','past_due','canceled','paused')),
  subscription_plan    text not null default 'starter'
    check (subscription_plan in ('starter','pro','enterprise')),
  trial_ends_at        timestamptz default (now() + interval '14 days'),
  -- Meta
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- ============================================================
-- TABLE: profiles (étend auth.users — 1 par utilisateur)
-- ============================================================
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  company_id    uuid references public.companies(id) on delete cascade,
  full_name     text not null,
  role          text not null default 'utilisateur'
    check (role in ('admin_platform','admin_entreprise','utilisateur','relecteur','finance')),
  phone         text,
  avatar_url    text,
  is_active     boolean default true,
  last_login_at timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ============================================================
-- TABLE: invitations (inviter des collègues)
-- ============================================================
create table public.invitations (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  email       text not null,
  role        text not null
    check (role in ('admin_entreprise','utilisateur','relecteur','finance')),
  token       text not null unique default encode(gen_random_bytes(32), 'hex'),
  invited_by  uuid references public.profiles(id) on delete set null,
  expires_at  timestamptz default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at  timestamptz default now()
);

-- ============================================================
-- TABLE: audit_logs (journal d'audit obligatoire CDC §4.3)
-- ============================================================
create table public.audit_logs (
  id            uuid primary key default uuid_generate_v4(),
  company_id    uuid references public.companies(id) on delete cascade,
  user_id       uuid references public.profiles(id) on delete set null,
  action        text not null,       -- ex: 'upload', 'generate', 'validate', 'export'
  resource_type text,                -- ex: 'document', 'project', 'memoire', 'dpgf'
  resource_id   uuid,
  resource_name text,
  metadata      jsonb default '{}',
  ip_address    inet,
  created_at    timestamptz default now()
);

-- Index pour les requêtes fréquentes
create index idx_audit_logs_company_id on public.audit_logs(company_id);
create index idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index idx_profiles_company_id on public.profiles(company_id);
create index idx_invitations_company_id on public.invitations(company_id);
create index idx_invitations_token on public.invitations(token);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.companies   enable row level security;
alter table public.profiles    enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_logs  enable row level security;

-- Fonctions helper (security definer = s'exécute comme le propriétaire)
create or replace function public.get_my_company_id()
returns uuid language sql security definer stable as $$
  select company_id from public.profiles where id = auth.uid()
$$;

create or replace function public.get_my_role()
returns text language sql security definer stable as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_platform_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles 
    where id = auth.uid() and role = 'admin_platform'
  )
$$;

-- --- COMPANIES ---
create policy "company_select" on public.companies
  for select using (id = public.get_my_company_id() or public.is_platform_admin());

create policy "company_update" on public.companies
  for update using (
    id = public.get_my_company_id() 
    and public.get_my_role() in ('admin_entreprise','admin_platform')
  );

-- --- PROFILES ---
create policy "profiles_select" on public.profiles
  for select using (
    company_id = public.get_my_company_id() or public.is_platform_admin()
  );

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

create policy "profiles_manage_company" on public.profiles
  for all using (
    company_id = public.get_my_company_id() 
    and public.get_my_role() in ('admin_entreprise','admin_platform')
  );

-- --- INVITATIONS ---
create policy "invitations_select" on public.invitations
  for select using (company_id = public.get_my_company_id());

create policy "invitations_manage" on public.invitations
  for all using (
    company_id = public.get_my_company_id()
    and public.get_my_role() in ('admin_entreprise','admin_platform')
  );

-- --- AUDIT LOGS ---
create policy "audit_select" on public.audit_logs
  for select using (
    company_id = public.get_my_company_id() or public.is_platform_admin()
  );

create policy "audit_insert" on public.audit_logs
  for insert with check (company_id = public.get_my_company_id());

-- ============================================================
-- TRIGGERS
-- ============================================================

-- updated_at automatique
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger companies_updated before update on public.companies
  for each row execute function public.handle_updated_at();

create trigger profiles_updated before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Créer le profil automatiquement après inscription (via metadata)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, company_id, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    (new.raw_user_meta_data->>'company_id')::uuid,
    coalesce(new.raw_user_meta_data->>'role', 'utilisateur')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mettre à jour last_login_at
create or replace function public.handle_user_login()
returns trigger language plpgsql security definer as $$
begin
  update public.profiles
  set last_login_at = now()
  where id = new.id;
  return new;
end;
$$;
