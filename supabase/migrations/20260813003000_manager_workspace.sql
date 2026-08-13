-- Stage 4.5: manager workspace and knowledge distribution.
-- This migration is additive: it keeps the old knowledge_gaps.status=open/resolved
-- lifecycle for existing admin screens and adds assignment/review fields beside it.

alter table public.knowledge_gaps
  add column if not exists assignment_status text not null default 'unassigned'
    check (assignment_status in ('unassigned', 'assigned', 'in_progress', 'review', 'completed')),
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_comment text,
  add column if not exists prepared_answer text,
  add column if not exists prepared_source text,
  add column if not exists draft_knowledge_id uuid references public.knowledge(id) on delete set null,
  add column if not exists manager_version integer not null default 1,
  add column if not exists frequency integer not null default 1,
  add column if not exists priority integer not null default 50,
  add column if not exists category text,
  add column if not exists sanitized_user_question text,
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.knowledge_gaps
set
  assignment_status = case
    when status = 'resolved' then 'completed'
    when assigned_to is null then 'unassigned'
    else assignment_status
  end,
  completed_at = case when status = 'resolved' then coalesce(completed_at, resolved_at, now()) else completed_at end,
  sanitized_user_question = coalesce(sanitized_user_question, left(regexp_replace(user_question, '\s+', ' ', 'g'), 500)),
  category = coalesce(
    category,
    case
      when lower(coalesce(topic, '') || ' ' || coalesce(user_question, '')) ~ 'оплат|kaspi|плат[её]ж|сумм' then 'payments'
      when lower(coalesce(topic, '') || ' ' || coalesce(user_question, '')) ~ 'показан|счетчик|счётчик|есептегіш' then 'meters'
      when lower(coalesce(topic, '') || ' ' || coalesce(user_question, '')) ~ 'квитанц|епд|түбіртек|дубликат' then 'receipts'
      when lower(coalesce(topic, '') || ' ' || coalesce(user_question, '')) ~ 'лицев|дербес|владел|шот' then 'accounts'
      when lower(coalesce(topic, '') || ' ' || coalesce(user_question, '')) ~ 'начисл|перерасч|долг|қарыз' then 'billing'
      when lower(coalesce(topic, '') || ' ' || coalesce(user_question, '')) ~ 'сайт|кабинет|виджет|форма|ошибк|whatsapp|телефон|тех' then 'services'
      else 'support'
    end
  ),
  priority = greatest(
    priority,
    least(
      100,
      40
        + case reason
            when 'no-match' then 24
            when 'weak-match' then 16
            when 'unverified-match' then 12
            else 8
          end
        + least(greatest(frequency, 1), 10) * 4
        - case
            when top_similarity is null then 0
            else round(greatest(0, least(top_similarity, 1)) * 20)::integer
          end
    )
  )
where manager_version is not null;

create index if not exists knowledge_gaps_queue_priority_idx
  on public.knowledge_gaps (assignment_status, priority desc, frequency desc, created_at asc)
  where status = 'open';

create index if not exists knowledge_gaps_assignee_status_idx
  on public.knowledge_gaps (assigned_to, assignment_status, updated_at desc);

create index if not exists knowledge_gaps_category_status_idx
  on public.knowledge_gaps (category, assignment_status, priority desc);

create table if not exists public.manager_workspace_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid not null,
  previous_status text,
  new_status text,
  previous_assignee uuid,
  new_assignee uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.manager_workspace_audit_events enable row level security;

drop policy if exists "admin full access to manager workspace audit" on public.manager_workspace_audit_events;
create policy "admin full access to manager workspace audit"
on public.manager_workspace_audit_events
for all
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  or (auth.jwt() -> 'app_metadata' -> 'roles') ? 'admin'
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  or (auth.jwt() -> 'app_metadata' -> 'roles') ? 'admin'
);

create or replace function public.touch_knowledge_gap_manager_workspace()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.manager_version = coalesce(old.manager_version, 0) + 1;
  return new;
end;
$$;

drop trigger if exists touch_knowledge_gap_manager_workspace on public.knowledge_gaps;
create trigger touch_knowledge_gap_manager_workspace
before update on public.knowledge_gaps
for each row
execute function public.touch_knowledge_gap_manager_workspace();

create or replace function public.claim_next_knowledge_gap(
  p_user_id uuid,
  p_active_limit integer default 5
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gap_id uuid;
  v_active_count integer;
begin
  select count(*)
  into v_active_count
  from public.knowledge_gaps
  where assigned_to = p_user_id
    and status = 'open'
    and assignment_status in ('assigned', 'in_progress', 'review');

  if v_active_count >= greatest(1, least(coalesce(p_active_limit, 5), 10)) then
    return null;
  end if;

  select id
  into v_gap_id
  from public.knowledge_gaps
  where status = 'open'
    and assignment_status = 'unassigned'
    and assigned_to is null
  order by priority desc, frequency desc, created_at asc
  for update skip locked
  limit 1;

  if v_gap_id is null then
    return null;
  end if;

  update public.knowledge_gaps
  set
    assignment_status = 'assigned',
    assigned_to = p_user_id,
    assigned_at = now()
  where id = v_gap_id;

  insert into public.manager_workspace_audit_events (
    actor_id,
    action,
    entity,
    entity_id,
    previous_status,
    new_status,
    previous_assignee,
    new_assignee
  )
  values (
    p_user_id,
    'claim_next',
    'knowledge_gap',
    v_gap_id,
    'unassigned',
    'assigned',
    null,
    p_user_id
  );

  return v_gap_id;
end;
$$;
