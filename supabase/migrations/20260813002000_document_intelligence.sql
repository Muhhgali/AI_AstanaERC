-- Stage 5 Document Intelligence source-of-truth migration.
-- Review before applying to production. Do not store real PDF fixtures in git.

insert into storage.buckets (id, name, public)
values ('resident-documents', 'resident-documents', false)
on conflict (id) do update set public = false;

create table if not exists public.resident_documents (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.chat_conversations(id) on delete set null,
  visitor_id text not null,
  file_name text not null,
  file_type text not null,
  file_size integer not null,
  storage_bucket text not null default 'resident-documents',
  storage_path text,
  file_hash text not null,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'extracting', 'ready', 'ocr_required', 'failed', 'deleted')),
  document_type text not null default 'unknown'
    check (document_type in (
      'epd_receipt',
      'bank_payment_receipt',
      'application',
      'statement',
      'other',
      'unknown',
      -- backward-compatible Stage 5 aliases
      'receipt',
      'payment_receipt'
    )),
  extraction_method text not null default 'none'
    check (extraction_method in ('native_pdf', 'ocr', 'vision', 'none')),
  page_count integer,
  extracted_text text,
  structured_result jsonb,
  warnings jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists resident_documents_visitor_created_idx
  on public.resident_documents (visitor_id, created_at desc);

create index if not exists resident_documents_conversation_idx
  on public.resident_documents (conversation_id);

create index if not exists resident_documents_file_hash_visitor_idx
  on public.resident_documents (visitor_id, file_hash);

alter table public.resident_documents enable row level security;

-- Anonymous visitor ownership is enforced in Next.js server routes via
-- signed HttpOnly cookie -> hashed visitor_id. Direct browser access is denied.
drop policy if exists "deny direct resident document access" on public.resident_documents;
create policy "deny direct resident document access"
on public.resident_documents
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "admin read resident documents" on public.resident_documents;
create policy "admin read resident documents"
on public.resident_documents
for select
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "admin update resident documents" on public.resident_documents;
create policy "admin update resident documents"
on public.resident_documents
for update
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Storage objects are private. Server-side service role performs upload/read/delete.
-- Do not add public read policies or permanent public URLs for resident documents.

notify pgrst, 'reload schema';
