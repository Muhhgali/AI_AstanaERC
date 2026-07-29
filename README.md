# AI-ассистент Астана-ЕРЦ

Веб-приложение поддержки жителей по вопросам ЕПД, оплат, начислений, показаний, квитанций и обращений. Продукт включает основной чат, встраиваемый widget, административный интерфейс и серверные API для RAG-поиска, заявок и операторской обработки.

## Стек

- Next.js 16 App Router, React 19, TypeScript.
- Supabase Auth/Postgres/pgvector; серверные операции используют service-role только в route handlers и scripts.
- OpenAI: embeddings, ответы чата и административный анализ PDF.
- Tailwind CSS 4; Resend предусмотрен для уведомлений, но локально не настроен.
- Vitest, ESLint, TypeScript, GitHub Actions.

## Архитектура

1. `app/page.tsx` — основной пользовательский чат; `app/widget` — встраиваемая версия.
2. `app/admin` — рабочее место оператора/редактора базы знаний.
3. `app/api/chat` — intent routing, RAG fallback, OpenAI и сохранение диалогов.
4. `lib/residentIntent.ts` — детерминированные сценарии для частых обращений жителей.
5. `lib/embedding.ts` и Supabase `knowledge` — векторный поиск по базе знаний.
6. `app/api/requests`, `operator`, `receipts` — публичные формы и очереди обработки.
7. `app/api/admin` — административные чтение/изменение данных и AI-анализ документов.
8. `lib/auth/requireAdmin.ts` — проверка FAQ по доверенному `app_metadata`.
9. `lib/rateLimit.ts` — заменяемый интерфейс limiter и локальная in-memory реализация.
10. `scripts` и SQL-файлы — импорт/сжатие знаний и подготовка схемы.

## Требования и локальный запуск

- Node.js `>=20.9.0` (CI использует Node 20).
- npm и закоммиченный `package-lock.json`.
- Доступные проекты Supabase и OpenAI для функционального smoke-test.

```bash
npm ci
copy .env.example .env.local
npm run check:env
npm run dev
```

Откройте `http://localhost:3000`. Не коммитьте `.env` и `.env.local` — они исключены через `.gitignore`.

## Environment variables

| Переменная | Обязательна | Назначение |
|---|---:|---|
| `SUPABASE_URL` | да | Server-side URL проекта Supabase |
| `SUPABASE_ANON_KEY` | да | Проверка пользовательских Supabase-сессий |
| `SUPABASE_SERVICE_ROLE_KEY` | да | Только server-side операции с данными |
| `NEXT_PUBLIC_SUPABASE_URL` | да | URL для браузерного клиента |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | да | Публичный anon key браузерного клиента |
| `OPENAI_API_KEY` | да | Embeddings и генерация ответов |
| `OPENAI_ANALYSIS_MODEL` | нет | Модель административного анализа PDF; fallback — `gpt-4.1` |
| `RESEND_API_KEY` | нет | Отправка уведомлений |
| `MAIL_FROM` | нет | Проверенный отправитель Resend |
| `DEBUG_RETRIEVAL` | нет | Диагностика retrieval без вывода секретов |

`npm run check:env` проверяет наличие, URL и DNS, но не печатает ключи и не делает запрос с service-role.

## Supabase

1. Создайте/восстановите проект и возьмите URL, anon key и service-role key в Dashboard.
2. Убедитесь, что server и public URL указывают на один проект.
3. Добавьте значения только в локальное/production окружение, не в Git.
4. Проверьте таблицы и RLS до запуска любых импортирующих scripts.
5. Назначьте администраторам `app_metadata.role = "admin"` серверным способом. `user_metadata` не считается доверенным.

SQL-файлы находятся в `scripts/*.sql` и корне репозитория. Сначала прочитайте diff и применяйте их вручную к выбранному окружению через Supabase SQL Editor/CLI. `knowledge:replace:compact` заменяет содержимое `knowledge` и не должен запускаться без backup и явного подтверждения.

## OpenAI и Resend

Для OpenAI достаточно `OPENAI_API_KEY`; административный PDF-анализ дополнительно может использовать `OPENAI_ANALYSIS_MODEL`. Проверяйте доступность модели в аккаунте до production запуска.

Resend опционален: создайте API key, подтвердите домен/адрес отправителя и задайте `RESEND_API_KEY` и `MAIL_FROM`. Без них приложение продолжает работать, но email-уведомления недоступны.

## Команды

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run check
npm audit --omit=dev
```

`npm run test` запускает Vitest в watch-режиме; для CI используйте `test:run`. Widget preview доступен на `http://localhost:3000/widget-preview`, сам widget — на `/widget`.

## Admin authorization

FAQ endpoints требуют bearer-сессию Supabase и роль `admin` в серверно проверенном `app_metadata`; аноним получает 401, обычный пользователь — 403. Остальные `app/api/admin/*` пока проверяют только валидную сессию и требуют миграции на общий `requireAdmin` после решения владельца. Полная матрица: [docs/API_SECURITY_REVIEW.md](docs/API_SECURITY_REVIEW.md).

## Deployment checklist (без автоматического deployment)

1. Получить зелёный CI и проверить `npm audit --omit=dev`.
2. Проверить production env в Vercel, не копируя значения в issue/log.
3. Проверить Supabase RLS, admin `app_metadata`, таблицы и backup.
4. Выполнить smoke-test `/`, `/widget-preview`, `/login`, `/admin`, `/api/health`.
5. Прогнать реальные вопросы RU/KZ, создание заявки и 401/403 FAQ.
6. Только владелец выполняет deployment и создаёт стабильный tag после проверки.

## Known limitations

- Публичный анализ квитанций пока не извлекает содержимое документа. Он проверяет тип/размер и сохраняет метаданные/подсказку оператору; это не OCR и не AI-анализ файла.
- In-memory rate limiter действует только внутри одного процесса/serverless-инстанса. Для глобальной квоты нужен общий store (например, Redis/Upstash) через существующий интерфейс.
- Большинство admin API пока допускают любого аутентифицированного пользователя, а не только роль `admin`.
- Публичные history/status endpoint принимают visitor/conversation identifiers; нужна продуктовая модель владения/сессии до усиления доступа.
- Состояние production, RLS и фактические таблицы локально не подтверждены.
- `npm audit --omit=dev` показывает 2 high advisory в транзитивном `sharp/libvips` через Next.js; исправления в текущей линии зависимостей нет.
- Lint проходит с 15 предупреждениями о неиспользуемых типах/переменной.

## Troubleshooting

- `npm ci`/EPERM на Windows: остановите оставшийся `next`/`npm` процесс и используйте проектный cache: `npm ci --cache .npm-cache --prefer-offline`.
- Supabase DNS: запустите `npm run check:env`; если URL валиден, но DNS не разрешается, сравните masked project ref с Dashboard и проверьте локальный DNS/VPN.
- 401 в admin: обновите Supabase-сессию. 403 на FAQ означает отсутствие доверенной admin-role.
- `degraded` на `/api/health`: отсутствует одна из обязательных server-side конфигураций; endpoint намеренно не раскрывает какая.
- Ошибка модели OpenAI: проверьте доступ аккаунта и `OPENAI_ANALYSIS_MODEL`, не меняя SDK major вслепую.
