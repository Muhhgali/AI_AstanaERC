-- Settings the admin panel can change without a deploy.
-- First use: "resident_requests" turns the resident appeal, appointment and
-- operator-handoff forms on or off. The app reads and writes it with the
-- service-role key; admins may also read and edit it directly.
-- Safe to run more than once.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.app_settings enable row level security;

drop policy if exists "admin full access to app settings" on public.app_settings;
create policy "admin full access to app settings"
on public.app_settings
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Requests are off until someone is assigned to handle them.
insert into public.app_settings (key, value)
values ('resident_requests', '{"appeals": false, "appointments": false, "operator": false}'::jsonb)
on conflict (key) do nothing;

notify pgrst, 'reload schema';
