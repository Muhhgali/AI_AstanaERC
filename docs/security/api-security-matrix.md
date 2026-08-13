# API Security Matrix — Stage 3

Created: 2026-08-11. Production DB was not changed.

| Method | Endpoint | Expected access | Reads | Writes | Current protection after Stage 3 | Risk after Stage 3 | Action required |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/health` | Public | env presence only | none | no secrets returned | Low | Keep response minimal |
| POST | `/api/chat` | Public | knowledge, chat ownership | chat history, gaps, requests | rate limit, signed visitor cookie, hashed `visitor_id`, max message length | Medium | Apply RLS source, monitor abuse |
| POST | `/api/chat/history` | Visitor-owned | conversations/messages | none | rate limit, signed cookie required, `visitor_id` filter | Low | Legacy conversations without `visitor_id` need migration decision |
| POST | `/api/chat/feedback` | Visitor-owned | message conversation | message feedback | rate limit, signed cookie ownership check | Low | None |
| POST | `/api/requests/status` | Visitor-owned | request tables | none | rate limit, signed cookie, owned conversation/status scope | Low | Legacy rows without `visitor_id` need migration decision |
| POST | `/api/operator/handoff` | Public write | owned conversation check | operator handoff | rate limit, allowlisted payload, server `visitor_id` | Medium | Add persistent distributed limiter before scale |
| POST | `/api/requests/appeal` | Public write | owned conversation check | appeal request, attachments, email | rate limit, file count/size, server `visitor_id` | Medium | Review MIME/content scanning before broad upload usage |
| POST | `/api/requests/appointment` | Public write | owned conversation check | appointment request, email | rate limit, enum/date validation, server `visitor_id` | Low | None |
| POST | `/api/receipts/analyze` | Public upload | owned conversation check | receipt request | rate limit, MIME/size allowlist, server `visitor_id` | Medium | Add malware scan/OCR sandbox if file processing grows |
| POST | `/app/admin/faq` | Admin | none | faq | `requireAdmin` | Low | Consider consolidating duplicate FAQ endpoint |
| POST | `/api/admin/faq` | Admin | none | faq | `requireAdmin` | Low | Consider consolidating duplicate FAQ endpoint |
| GET | `/api/admin/dashboard` | Admin | admin analytics tables | none | `requireAdmin` | Low | None |
| POST | `/api/admin/documents/analyze` | Admin | uploaded doc text | OpenAI call only | `requireAdmin`, rate limit | Medium | BLOCKED_BY_OPENAI_CREDITS if credits absent |
| GET | `/api/admin/history` | Admin | chat history/gaps | none | `requireAdmin` | Low | None |
| PATCH | `/api/admin/history` | Admin | none | knowledge gap status | `requireAdmin` | Low | None |
| DELETE | `/api/admin/history` | Admin | none | conversation delete | `requireAdmin` | Medium | Add optional audit log before production |
| GET | `/api/admin/knowledge` | Admin | knowledge | none | `requireAdmin` | Low | None |
| POST | `/api/admin/knowledge` | Admin | none | knowledge + embedding | `requireAdmin`, rate limit | Medium | BLOCKED_BY_OPENAI_CREDITS if credits absent |
| PATCH | `/api/admin/knowledge` | Admin | none | knowledge + optional embedding | `requireAdmin`, rate limit | Medium | None |
| DELETE | `/api/admin/knowledge` | Admin | none | knowledge delete | `requireAdmin` | Medium | Add audit log / confirmation token for bulk deletes |
| POST | `/api/admin/knowledge/draft` | Admin | knowledge gaps | generated draft only | `requireAdmin` | Low | None |
| GET | `/api/admin/meter-corrections` | Admin | meter correction requests | none | `requireAdmin` | Low | None |
| PATCH | `/api/admin/meter-corrections` | Admin | none | request status | `requireAdmin` | Low | None |
| PATCH | `/api/admin/operator` | Admin | none | operator handoff status | `requireAdmin` | Low | None |
| GET | `/api/admin/requests` | Admin | public request tables/storage URLs | none | `requireAdmin` | Medium | Ensure storage bucket policies match server-only access |
| PATCH | `/api/admin/requests` | Admin | none | request status | `requireAdmin` | Low | None |
| DELETE | `/api/admin/requests` | Admin | storage paths | request row + attachments | `requireAdmin` | Medium | Add audit log before production |
| GET | `/api/admin/suppliers` | Admin | suppliers | none | `requireAdmin` | Low | None |
| PATCH | `/api/admin/suppliers` | Admin | suppliers | supplier/manager updates | `requireAdmin` | Low | Prefer DB-only writes over local JSON fallback in prod |
