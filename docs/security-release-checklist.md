# Security Release Checklist

Created: 2026-08-11. Use before production deploy.

| Area | Status | Check |
| --- | --- | --- |
| Auth | PASS | Admin APIs use central `requireAdmin`. |
| Admin | PASS | Unauthenticated => 401, authenticated non-admin => 403 in guard tests. |
| Role model | PASS | Admin role is trusted only from `app_metadata.role` or `app_metadata.roles`. |
| RLS | MANUAL | Review and apply `supabase/migrations/20260811000000_security_rls_source_of_truth.sql` manually. |
| Ownership | PASS | Public chat/history/status/feedback use signed HttpOnly visitor cookie and hashed `visitor_id`. |
| Public writes | PASS | Public forms use server-side `visitor_id`; client `visitorId` is not trusted. |
| Rate limiting | PASS | Chat, public mutations, history/status, feedback, and upload/AI paths are rate-limited. |
| Service role | PASS | No `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`; service role usage is server route/script only. |
| Secrets | MANUAL | Rotate/check Vercel and Supabase secrets; set `VISITOR_TOKEN_SECRET` to 32+ random characters. |
| Headers/CSP | MANUAL | Confirm widget embed domains before tightening `frame-ancestors`. |
| CORS | PASS | No broad CORS headers found in API routes. |
| Logging | MANUAL | Existing logs are mostly technical; reduce raw error objects in production next. |
| Database | MANUAL | Confirm live tables/columns match repository SQL before applying RLS. |
| Uploads | MANUAL | File size/MIME limits exist; malware scanning is not implemented. |
| Dependencies | MANUAL | Run `npm audit` and classify vulnerabilities before release. |
| Tests | PASS | Run `npm run test:security` and `npm run check`. |
| Deployment | MANUAL | No production deploy was performed in Stage 3. |

Release gate command:

```bash
npm run security:gate
```
