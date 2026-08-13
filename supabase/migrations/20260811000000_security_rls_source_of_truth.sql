-- STAGE 3 SECURITY RLS SOURCE OF TRUTH
-- Created: 2026-08-11
-- IMPORTANT: This file was added to the repository only.
-- It has NOT been applied to production by Codex.
--
-- Apply manually in Supabase after reviewing policies against the live schema.

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    or exists (
      select 1
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'roles') = 'array'
          then auth.jwt() -> 'app_metadata' -> 'roles'
          else '[]'::jsonb
        end
      ) as role_name
      where role_name = 'admin'
    );
$$;

-- Internal/admin tables. Public access should happen only through server routes.
alter table if exists public.knowledge enable row level security;
alter table if exists public.faq enable row level security;
alter table if exists public.suppliers enable row level security;
alter table if exists public.knowledge_gaps enable row level security;
alter table if exists public.chat_conversations enable row level security;
alter table if exists public.chat_messages enable row level security;
alter table if exists public.meter_correction_requests enable row level security;
alter table if exists public.appeal_requests enable row level security;
alter table if exists public.leadership_appointments enable row level security;
alter table if exists public.operator_handoffs enable row level security;
alter table if exists public.receipt_analysis_requests enable row level security;

drop policy if exists "admin full access to knowledge" on public.knowledge;
create policy "admin full access to knowledge"
on public.knowledge
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin full access to faq" on public.faq;
create policy "admin full access to faq"
on public.faq
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin full access to suppliers" on public.suppliers;
create policy "admin full access to suppliers"
on public.suppliers
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin full access to knowledge_gaps" on public.knowledge_gaps;
create policy "admin full access to knowledge_gaps"
on public.knowledge_gaps
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin full access to chat_conversations" on public.chat_conversations;
create policy "admin full access to chat_conversations"
on public.chat_conversations
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin full access to chat_messages" on public.chat_messages;
create policy "admin full access to chat_messages"
on public.chat_messages
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin full access to meter_correction_requests" on public.meter_correction_requests;
create policy "admin full access to meter_correction_requests"
on public.meter_correction_requests
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin full access to appeal_requests" on public.appeal_requests;
create policy "admin full access to appeal_requests"
on public.appeal_requests
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin full access to leadership_appointments" on public.leadership_appointments;
create policy "admin full access to leadership_appointments"
on public.leadership_appointments
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin full access to operator_handoffs" on public.operator_handoffs;
create policy "admin full access to operator_handoffs"
on public.operator_handoffs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin full access to receipt_analysis_requests" on public.receipt_analysis_requests;
create policy "admin full access to receipt_analysis_requests"
on public.receipt_analysis_requests
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Anonymous visitor ownership is enforced in Next.js server routes via
-- signed HttpOnly cookie -> hashed visitor_id.
-- Do not add broad anon/authenticated SELECT policies for these tables.

notify pgrst, 'reload schema';
