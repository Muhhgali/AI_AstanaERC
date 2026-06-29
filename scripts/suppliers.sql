create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_code integer not null unique,
  supplier_name text not null,
  bin text,
  contract text,
  address text,
  district text,
  chair_phone text,
  chair_name text,
  supplier_category text,
  manager_name text,
  manager_photo_url text,
  manager_phone text,
  manager_email text,
  supplier_email text,
  settlement_type text,
  source_date date not null default date '2026-06-25',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.suppliers
  add column if not exists manager_photo_url text;

alter table public.suppliers
  add column if not exists manager_phone text;

alter table public.suppliers
  add column if not exists manager_email text;

create index if not exists suppliers_bin_idx
  on public.suppliers (bin);

create index if not exists suppliers_manager_name_idx
  on public.suppliers (manager_name);

create index if not exists suppliers_category_idx
  on public.suppliers (supplier_category);

notify pgrst, 'reload schema';
