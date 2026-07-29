# API security review

Дата: 2026-07-29. Обозначения: SR — server-side service-role; session — bearer token, проверенный через `auth.getUser`.

| Endpoint | Methods | Класс | Текущая авторизация | SR | Ожидаемая защита | Статус |
|---|---|---|---|---:|---|---|
| `/api/health` | GET | public | нет | нет | минимум без секретов | OK |
| `/api/chat` | POST | public | visitor/conversation IDs | да | rate limit, validation | OK в текущем scope |
| `/api/chat/feedback` | POST | public mutation | нет; UUID сообщения | да | rate limit, ownership | Требует решения владельца по ownership |
| `/api/chat/history` | POST | public read | visitor/conversation IDs | да | session/подписанный visitor token | Требует решения владельца |
| `/api/requests/status` | POST | public read | visitor/conversation IDs | да | session/подписанный visitor token | Требует решения владельца |
| `/api/operator/handoff` | POST | public mutation | visitor/conversation IDs | да | rate limit, validation | OK в текущем scope |
| `/api/receipts/analyze` | POST | public mutation | visitor/conversation IDs | да | rate limit, file validation | OK; не OCR |
| `/api/requests/appeal` | POST | public mutation | visitor/conversation IDs | да | rate limit, validation | OK в текущем scope |
| `/api/requests/appointment` | POST | public mutation | visitor/conversation IDs | да | rate limit, validation | OK в текущем scope |
| `/api/admin/faq` | POST | admin + OpenAI | session + `app_metadata.admin` | да | admin role + rate limit | OK |
| `/admin/faq` | POST | legacy admin + embeddings | session + `app_metadata.admin` | нет | admin role + rate limit | OK; legacy route |
| `/api/admin/documents/analyze` | POST | admin + OpenAI | любая session | нет | admin role + rate limit | Требует решения владельца/миграции |
| `/api/admin/knowledge` | GET/POST/PATCH/DELETE | admin mutation | любая session | да | admin role; rate limit для embeddings | Требует решения владельца/миграции |
| `/api/admin/knowledge/draft` | POST | admin mutation | любая session | да | admin role | Требует решения владельца/миграции |
| `/api/admin/dashboard` | GET | admin read | любая session | да | admin role | Требует решения владельца/миграции |
| `/api/admin/history` | GET/PATCH/DELETE | admin mutation | любая session | да | admin role | Требует решения владельца/миграции |
| `/api/admin/meter-corrections` | GET/PATCH | admin mutation | любая session | да | admin role | Требует решения владельца/миграции |
| `/api/admin/operator` | PATCH | admin mutation | любая session | да | admin role | Требует решения владельца/миграции |
| `/api/admin/requests` | GET/PATCH/DELETE | admin mutation | любая session | да | admin role | Требует решения владельца/миграции |
| `/api/admin/suppliers` | GET/PATCH | admin mutation | любая session | да | admin role | Требует решения владельца/миграции |

## Выводы

- Полностью открытые административные FAQ routes закрыты общим `requireAdmin`; роль берётся только из доверенного `app_metadata`.
- Остальные admin routes не были массово изменены: сейчас они требуют session, но не admin-role. Автоматическая миграция могла бы заблокировать владельца до назначения metadata.
- Service-role находится только в серверных route handlers/scripts и не использует префикс `NEXT_PUBLIC_`.
- Публичные history/status и feedback не имеют криптографически подтверждённого владения идентификатором. Для исправления владелец должен выбрать Supabase Auth, signed visitor token либо серверную cookie-сессию.
- Rate limiter хеширует IP/user-agent сигнал и не сохраняет исходные значения; глобальная serverless-защита пока не гарантируется.
