# Stage 4 — Knowledge Operations & AI Quality Control

## Source of truth

- Runtime source of truth: Supabase table `public.knowledge`.
- JSON files in `data/` are fixtures/import/eval material, not production truth.
- Production DB is not changed by this repository change. Apply
  `supabase/migrations/20260811001000_knowledge_operations.sql` manually after review.

## Knowledge lifecycle

Statuses:

- `draft` — owner/operator is preparing an answer.
- `review` — answer needs human approval.
- `verified` — human-approved and allowed for bot retrieval.
- `archived` — kept for audit/history, excluded from retrieval.

Rules:

- New admin/gap drafts default to `draft`, not verified.
- Publishing requires explicit human action: `status=verified` / `verified=true`.
- Editing text of a previously verified row downgrades it to `review`.
- Archiving sets `status=archived` and `verified=false`.
- Retrieval excludes archived rows and treats only `status=verified` + `verified=true`
  as published knowledge.

## Embeddings

- Embeddings are refreshed only when title/category/content hash changes or when an
  embedding is missing.
- Status/priority/language/source/metadata changes do not refresh embeddings.
- This protects OpenAI credits and avoids noisy vector churn.

## Admin Knowledge Center

Visible Stage 4 changes:

- language and lifecycle status fields in the knowledge form;
- status/language/search filters;
- gap-to-draft creates a non-published draft;
- delete action is backed by archive semantics when lifecycle columns exist.

If the lifecycle migration has not been applied yet, the API falls back to the
legacy schema so the existing admin page keeps working.

## AI Test Center

- `/api/admin/ai-tests` is admin-only.
- `GET` lists/filter real-world eval cases and returns `openAiCalls: 0`.
- `POST` creates a dry-run plan and enforces:
  - selected bulk limit: 10 cases;
  - full run requires `confirmFullRun=true`;
  - no automatic OpenAI call from this endpoint.

Full answer-level eval remains a deliberate manual operation, not something that
runs just because the admin page opened.

## Supabase migration checklist

Before applying to production:

1. Confirm latest production backup exists.
2. Review `20260811001000_knowledge_operations.sql`.
3. Apply during a quiet window.
4. Open admin Knowledge Center and verify existing rows show as `verified` when
   old `verified=true`.
5. Archive one test row and confirm the bot no longer retrieves it.

## Tests added

- `tests/knowledgeLifecycle.test.ts`
- `tests/aiTestCenter.test.ts`

Run:

```bash
npm run typecheck
npm run test:security
vitest run tests/knowledgeLifecycle.test.ts tests/aiTestCenter.test.ts tests/residentIntent.test.ts
```
