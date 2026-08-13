-- Stage 4 source-of-truth migration for Knowledge Operations.
-- Do not apply automatically to production. Review in Supabase SQL editor first.

alter table public.knowledge
  add column if not exists language text not null default 'ru'
    check (language in ('ru', 'kk')),
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'review', 'verified', 'archived')),
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists content_hash text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists version integer not null default 1,
  add column if not exists updated_at timestamptz not null default now();

update public.knowledge
set status = case when verified is true then 'verified' else 'draft' end
where status is null or status = 'draft';

create index if not exists knowledge_status_priority_idx
  on public.knowledge (status, verified, priority desc);

create index if not exists knowledge_content_hash_idx
  on public.knowledge (content_hash);

create table if not exists public.knowledge_audit_events (
  id uuid primary key default gen_random_uuid(),
  knowledge_id uuid references public.knowledge(id) on delete set null,
  action text not null,
  actor_id uuid references auth.users(id) on delete set null,
  before_row jsonb,
  after_row jsonb,
  created_at timestamptz not null default now()
);

alter table public.knowledge_audit_events enable row level security;

drop policy if exists "knowledge_audit_admin_read" on public.knowledge_audit_events;
create policy "knowledge_audit_admin_read"
on public.knowledge_audit_events
for select
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "knowledge_audit_admin_insert" on public.knowledge_audit_events;
create policy "knowledge_audit_admin_insert"
on public.knowledge_audit_events
for insert
to authenticated
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
