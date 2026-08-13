# RLS Policy Matrix — Stage 3

Created: 2026-08-11. Production RLS was not applied by Codex.

| Table | Data type | Anon SELECT | Anon INSERT | Authenticated SELECT | Authenticated WRITE | Admin | Service role | Recommended policy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `knowledge` | public KB but internally managed | No direct DB access | No | Admin only | Admin only | Full | Bypasses RLS | Server APIs read/write; admin JWT can manage |
| `faq` | public-ish FAQ but internally managed | No direct DB access | No | Admin only | Admin only | Full | Bypasses RLS | Server APIs read/write; admin JWT can manage |
| `suppliers` | supplier directory + manager contacts | No direct DB access | No | Admin only | Admin only | Full | Bypasses RLS | Public display should be via sanitized server/UI path |
| `chat_conversations` | visitor-generated, may contain PII | No | No | Admin only | Admin only | Full | Bypasses RLS | Visitor ownership enforced in Next server via signed cookie |
| `chat_messages` | visitor-generated, may contain PII | No | No | Admin only | Admin only | Full | Bypasses RLS | Visitor ownership enforced in Next server via signed cookie |
| `knowledge_gaps` | internal QA + user questions | No | No | Admin only | Admin only | Full | Bypasses RLS | Admin only; public writes via server route only |
| `meter_correction_requests` | resident request, PII | No | No | Admin only | Admin only | Full | Bypasses RLS | Visitor status via server cookie only |
| `appeal_requests` | resident request, PII/attachments | No | No | Admin only | Admin only | Full | Bypasses RLS | Visitor status via server cookie only |
| `leadership_appointments` | resident request, PII | No | No | Admin only | Admin only | Full | Bypasses RLS | Visitor status via server cookie only |
| `operator_handoffs` | support handoff, PII risk | No | No | Admin only | Admin only | Full | Bypasses RLS | Admin queue only; public insert via server route |
| `receipt_analysis_requests` | upload metadata, PII risk | No | No | Admin only | Admin only | Full | Bypasses RLS | Admin queue only; public insert via server route |

Notes:

- Anonymous visitor ownership is not Supabase Auth, so it is intentionally enforced in Next.js server code with an HttpOnly signed cookie and hashed `visitor_id`.
- Do not add broad `authenticated can select everything` policies.
- `service_role` bypasses RLS by design; it must remain server-only.
