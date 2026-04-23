-- ============================================================
-- AO PLATFORM — Migration 007 : Chatbot RAG
-- ============================================================

-- ============================================================
-- TABLE: chat_conversations
-- Une conversation par projet/lot (ou plusieurs)
-- ============================================================
create table public.chat_conversations (
  id            uuid primary key default uuid_generate_v4(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  lot_id        uuid references public.lots(id) on delete set null,
  company_id    uuid not null references public.companies(id) on delete cascade,
  user_id       uuid references public.profiles(id) on delete set null,
  title         text,             -- auto-généré depuis le premier message
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ============================================================
-- TABLE: chat_messages
-- Messages de la conversation
-- ============================================================
create table public.chat_messages (
  id              uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  company_id      uuid not null references public.companies(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  -- Sources citées dans la réponse
  sources         jsonb default '[]',   -- [{doc, page, excerpt}]
  -- Méta IA
  tokens_used     integer,
  created_at      timestamptz default now()
);

-- ============================================================
-- INDEX
-- ============================================================
create index idx_chat_conv_project on public.chat_conversations(project_id);
create index idx_chat_conv_company on public.chat_conversations(company_id);
create index idx_chat_msg_conv     on public.chat_messages(conversation_id);

-- ============================================================
-- RLS
-- ============================================================
alter table public.chat_conversations enable row level security;
alter table public.chat_messages      enable row level security;

create policy "chat_conv_all" on public.chat_conversations
  for all using (company_id = public.get_my_company_id());

create policy "chat_msg_all" on public.chat_messages
  for all using (company_id = public.get_my_company_id());

-- TRIGGERS
create trigger chat_conv_updated before update on public.chat_conversations
  for each row execute function public.handle_updated_at();
