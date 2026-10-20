# Apply Document Intelligence migration (Part 2)

Run in **Supabase Dashboard → SQL Editor** on the production/staging project:

1. Open `supabase/migrations/20260813002000_document_intelligence.sql`
2. Paste and run the full script
3. Run `supabase/migrations/20261020000000_resident_documents_types.sql` too.
   It is required when step 2 was already applied earlier: the first version
   of that migration did not allow `epd_receipt` / `bank_payment_receipt` /
   `vision`, and `create table if not exists` does not update constraints.
4. Confirm:
   - table `public.resident_documents` exists
   - bucket `resident-documents` exists and is **not public**
   - RLS enabled; anon/authenticated cannot select rows directly

Do **not** commit real resident PDFs. Keep anonymized fixtures only under `tests/fixtures/documents/`.

After apply + deploy with `OPENAI_API_KEY`, verify:

```bash
npm run smoke:documents
# then in UI: upload EPD PDF + Kaspi photo and ask:
# «Какой период?» / «Почему долг, если оплатил?»
```
