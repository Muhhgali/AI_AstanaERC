-- Align resident_documents check constraints with the values the code writes.
-- The code stores document_type 'epd_receipt' / 'bank_payment_receipt' and
-- extraction_method 'vision', but the first version of
-- 20260813002000_document_intelligence.sql only allowed 'receipt' /
-- 'payment_receipt' / 'native_pdf' / 'ocr'. `create table if not exists` does
-- not update constraints on an existing table, so this migration replaces them.
-- Safe to run more than once, and safe on a fresh database after 20260813002000.

alter table if exists public.resident_documents
  drop constraint if exists resident_documents_document_type_check;

alter table if exists public.resident_documents
  add constraint resident_documents_document_type_check
  check (document_type in (
    'epd_receipt',
    'bank_payment_receipt',
    'application',
    'statement',
    'other',
    'unknown',
    'receipt',
    'payment_receipt'
  ));

alter table if exists public.resident_documents
  drop constraint if exists resident_documents_extraction_method_check;

alter table if exists public.resident_documents
  add constraint resident_documents_extraction_method_check
  check (extraction_method in ('native_pdf', 'ocr', 'vision', 'none'));

notify pgrst, 'reload schema';
