create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Новый диалог',
  visitor_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_conversations
  add column if not exists visitor_id text;

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

create index if not exists chat_conversations_visitor_updated_idx
  on public.chat_conversations (visitor_id, updated_at desc);

create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at asc);

create table if not exists public.knowledge_gaps (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.chat_conversations(id) on delete set null,
  assistant_message_id uuid references public.chat_messages(id) on delete set null,
  topic text not null,
  user_question text not null,
  assistant_answer text,
  reason text not null check (reason in ('no-match', 'weak-match', 'unverified-match', 'gpt-answer')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  top_similarity double precision,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists knowledge_gaps_status_created_idx
  on public.knowledge_gaps (status, created_at desc);

create index if not exists knowledge_gaps_conversation_idx
  on public.knowledge_gaps (conversation_id);

create table if not exists public.meter_correction_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique,
  conversation_id uuid references public.chat_conversations(id) on delete set null,
  visitor_id text,
  account_number text not null,
  meter_number text not null,
  correct_reading text not null,
  contact text not null,
  service_type text,
  comment text,
  reason text,
  raw_text text,
  status text not null default 'new' check (status in ('new', 'in_progress', 'done', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meter_correction_requests_status_created_idx
  on public.meter_correction_requests (status, created_at desc);

alter table public.meter_correction_requests
  add column if not exists visitor_id text;

create index if not exists meter_correction_requests_visitor_created_idx
  on public.meter_correction_requests (visitor_id, created_at desc);

create table if not exists public.appeal_requests (
  id uuid primary key default gen_random_uuid(),
  visitor_id text,
  name text not null,
  topic text not null,
  message text not null,
  contact text,
  attachments jsonb not null default '[]'::jsonb,
  status text not null default 'new' check (status in ('new', 'in_progress', 'done', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appeal_requests
  add column if not exists conversation_id uuid references public.chat_conversations(id) on delete set null;

alter table public.appeal_requests
  add column if not exists visitor_id text;

create index if not exists appeal_requests_status_created_idx
  on public.appeal_requests (status, created_at desc);

create index if not exists appeal_requests_conversation_idx
  on public.appeal_requests (conversation_id);

create index if not exists appeal_requests_visitor_created_idx
  on public.appeal_requests (visitor_id, created_at desc);

create table if not exists public.leadership_appointments (
  id uuid primary key default gen_random_uuid(),
  visitor_id text,
  first_name text not null,
  last_name text not null,
  leader_key text not null check (leader_key in ('general_director', 'deputy_director')),
  leader_title text not null,
  leader_name text not null,
  appointment_date date not null,
  appointment_time text not null default '15:00–16:00',
  phone text,
  email text,
  status text not null default 'new' check (status in ('new', 'confirmed', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (phone is not null or email is not null)
);

alter table public.leadership_appointments
  add column if not exists conversation_id uuid references public.chat_conversations(id) on delete set null;

alter table public.leadership_appointments
  add column if not exists visitor_id text;

create index if not exists leadership_appointments_status_created_idx
  on public.leadership_appointments (status, created_at desc);

create index if not exists leadership_appointments_conversation_idx
  on public.leadership_appointments (conversation_id);

create index if not exists leadership_appointments_visitor_created_idx
  on public.leadership_appointments (visitor_id, created_at desc);

create table if not exists public.operator_handoffs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.chat_conversations(id) on delete set null,
  visitor_id text,
  user_message text not null,
  reason text not null default 'manual-request',
  status text not null default 'new' check (status in ('new', 'in_progress', 'done', 'cancelled')),
  priority integer not null default 80,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operator_handoffs_status_created_idx
  on public.operator_handoffs (status, created_at desc);

create index if not exists operator_handoffs_conversation_idx
  on public.operator_handoffs (conversation_id);

create index if not exists operator_handoffs_visitor_created_idx
  on public.operator_handoffs (visitor_id, created_at desc);

create table if not exists public.receipt_analysis_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.chat_conversations(id) on delete set null,
  visitor_id text,
  file_name text not null,
  file_type text not null,
  file_size integer not null,
  analysis_summary text,
  status text not null default 'new' check (status in ('new', 'in_progress', 'done', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists receipt_analysis_requests_status_created_idx
  on public.receipt_analysis_requests (status, created_at desc);

create index if not exists receipt_analysis_requests_conversation_idx
  on public.receipt_analysis_requests (conversation_id);

create index if not exists receipt_analysis_requests_visitor_created_idx
  on public.receipt_analysis_requests (visitor_id, created_at desc);

notify pgrst, 'reload schema';
