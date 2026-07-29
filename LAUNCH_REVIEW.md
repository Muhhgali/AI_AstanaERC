# Launch review — 2026-07-29

## Решение

Локальная recovery-версия собирается и покрыта базовыми тестами, но production запуск пока **не подтверждён**. Блокеры находятся во внешнем состоянии Supabase, роли администратора и production env, а не в локальной компиляции.

## Готово локально

- Чистая установка из lock-файла и Next.js production build проходят.
- 23 regression tests покрывают resident intents, 401/403 admin guard, limiter, env и health.
- FAQ endpoints закрыты доверенной admin-role.
- Публичные формы/чат/feedback и дорогие AI endpoints имеют базовый rate limit.
- Добавлены CI workflow, `/api/health`, environment diagnostics и актуальная документация.
- Публичная загрузка квитанции честно описана как проверка файла/очередь оператору, не OCR.

## Блокирует подтверждение запуска

1. Нет read-only подтверждения доступности Supabase API, фактической схемы, RLS и данных.
2. Не подтверждено назначение `app_metadata.role=admin` владельцу/операторам.
3. Не проверены production variables и health в Vercel.
4. Не пройдены end-to-end сценарии с реальными Supabase/OpenAI данными после восстановления проекта.

## Важно до публичного трафика

- Перевести остальные admin API с «любая валидная session» на общий admin-role guard.
- Выбрать защищённую модель владения visitor/conversation ID для history/status/feedback.
- Заменить in-memory limiter на общий store при горизонтальном/serverless масштабировании.
- Проверить и утвердить факты базы знаний, особенно контакты, сроки и способы оплаты.
- Настроить Resend или убрать ожидание email-уведомлений из операционного процесса.

## Осознанно не сделано

- Не выполнялись deployment, SQL, production mutation и запрос к Supabase с service-role.
- Не добавлялся OCR: публичный endpoint не читает содержимое квитанции.
- Не делались major upgrades или архитектурный rewrite.
- Не скрыты 15 lint warnings и 2 high advisory `sharp/libvips`; они зафиксированы как долг.

## Рекомендуемый gate запуска

Зелёный CI → Supabase/RLS read-only review → admin-role → интеграционные тесты → Vercel env review → staging smoke-test → решение владельца о deployment/tag.
