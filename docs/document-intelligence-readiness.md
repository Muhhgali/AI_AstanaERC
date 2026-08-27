# Document Intelligence — план до полной готовности

## Part 1 (эта ветка) — чтение документов

Цель: бот умеет разобрать ЕПД/чек и ответить на вопрос по полям.

Сделано:

1. OCR/vision для сканов PDF и JPG/PNG через OpenAI.
2. Текстовый PDF — по-прежнему `pdf-parse` без OpenAI.
3. Ephemeral-анализ: если миграция `resident_documents` ещё не применена, файл всё равно разбирается и возвращается summary (без follow-up в чате).
4. Миграция обновлена под `epd_receipt` / `bank_payment_receipt` / `vision`.
5. Анонимные фикстуры + `scripts/smokeDocumentIntelligence.ts`.

Проверка:

```bash
npx tsx scripts/smokeDocumentIntelligence.ts
```

## Part 2 (следующий этап) — production persistence

1. Применить `supabase/migrations/20260813002000_document_intelligence.sql` (таблица + bucket).
2. Проверить RLS и private bucket `resident-documents`.
3. Задеплоить ветку с OCR на production/preview.
4. Live E2E: upload PDF + фото → follow-up в `/api/chat`.
5. Сверка ЕПД + банковский чек (`reconciliation`) на реальных анонимных образцах владельца.
6. Стоимость/лимиты OCR и мониторинг ошибок vision.
