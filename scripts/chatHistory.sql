create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Новый диалог',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  source text,
  feedback text check (feedback in ('up', 'down')),
  created_at timestamptz not null default now()
);

create index if not exists chat_conversations_updated_at_idx
  on public.chat_conversations (updated_at desc);

create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at asc);

notify pgrst, 'reload schema';
