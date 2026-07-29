# Recovery status

## Срез состояния

- Дата: 2026-07-29.
- Ветка: `recovery/2026-07`.
- База ветки: `0f2c773` (`origin/main`).
- Git: исходная незакоммиченная resident-intent работа сохранена первой; каждый последующий блок разделён на логические коммиты.
- Production/deployment/SQL: не изменялись.

## Коммиты recovery

| Hash | Назначение |
|---|---|
| `9f09243` | resident intent routing и исходные проверки |
| `11e1ed2` | безопасные patch/minor зависимости |
| `b34bae9` | 401/403/admin-role для FAQ endpoints |
| `74bfea2` | базовый rate limiting публичных и дорогих API |
| `3a81179` | Vitest, regression tests и environment diagnostics |
| `1bf92a0` | GitHub Actions CI |
| `81aae54` | публичный health endpoint и тесты |
| `70b56f1` | rate limit и безопасные ошибки feedback endpoint |

Этот файл входит в отдельный `docs: document recovery and local setup`; его итоговый hash смотрите в `git log` (коммит не может стабильно ссылаться на собственный hash).

## Проверки

- `npm ci`: проходит; на Windows системный npm cache один раз дал EPERM, изолированный `.npm-cache` решил проблему.
- ESLint: 0 errors, 15 warnings.
- TypeScript: проходит.
- Vitest: 23/23 проходят.
- Next.js production build: проходит, 28 routes включая `/api/health`.
- CI YAML: синтаксически валиден; внешний запуск GitHub Actions ещё не происходил.
- `npm audit --omit=dev`: 2 high в `sharp/libvips` через Next.js, fix в текущей линии не опубликован.

## Интеграции

- Supabase: обязательные локальные переменные присутствуют, URL синтаксически корректен, DNS разрешается. Запрос к данным с service-role намеренно не выполнялся; состояние проекта, таблиц и RLS не подтверждено.
- OpenAI: локальный key присутствует; доступ к моделям ранее подтверждён безопасным запросом списка. Billable smoke-test в recovery не выполнялся.
- Resend: `RESEND_API_KEY` и `MAIL_FROM` локально отсутствуют; email не проверен.

## Security fixes

- FAQ: anonymous 401, authenticated non-admin 403, доверенный admin допускается.
- Клиентская роль/body/user_metadata не используются для авторизации.
- Публичные и OpenAI-heavy mutations получили 429/`Retry-After` и разные политики.
- Feedback больше не возвращает внутреннюю ошибку БД.
- Environment/health diagnostics не выводят значения ключей.

## Оставшиеся риски и действия владельца

1. Восстановить/проверить Supabase project, таблицы, RLS и миграции; назначить `app_metadata.role=admin` нужным пользователям.
2. Выбрать модель владения visitor/conversation ID для history/status/feedback.
3. После назначения admin-role перевести все `/api/admin/*` на общий `requireAdmin`.
4. Настроить Vercel env и проверить production `/api/health`; deployment здесь не выполнялся.
5. Настроить Resend либо явно выключить ожидание email-уведомлений.
6. Принять временный риск `sharp/libvips` или обновить после появления совместимого исправления.
7. Для нескольких serverless-инстансов подключить общий rate-limit store.

## Следующий этап

После восстановления Supabase: read-only проверка схемы/RLS и данных, назначение admin metadata, интеграционные smoke-tests ключевых RU/KZ сценариев, затем owner-approved миграция всех admin routes на role guard и подготовка стабильного тега.
