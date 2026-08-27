# Document Intelligence — план до полной готовности

## Part 1 — чтение документов ✅

- OCR/vision для сканов PDF и JPG/PNG
- Ephemeral-анализ без таблицы
- Фикстуры + `npm run smoke:documents`
- Фикс периода и составных вопросов

## Part 2 — persistence + сверка + UX (этот этап)

Сделано в коде:

1. **Ephemeral follow-up в чате** — клиент держит `documentContexts` и шлёт в `/api/chat`, даже без `resident_documents`.
2. **Умная сверка ЕПД + чек** — reconciliation при вопросах про долг/оплату/сверку; иначе ответ по релевантному документу.
3. **OCR cost control** — отдельный лимит `documentOcr` (4 / 10 мин); `OPENAI_OCR_IMAGE_DETAIL` (`low`|`high`|`auto`).
4. **Миграция** обновлена под `vision` / `epd_receipt` / `bank_payment_receipt`.
5. UI показывает summary разбора сразу после upload.

### Owner checklist (нужны ваши доступы)

1. Supabase SQL Editor → выполнить  
   `supabase/migrations/20260813002000_document_intelligence.sql`
2. Проверить bucket `resident-documents` = **private**
3. Vercel / Cursor Secrets:
   - `OPENAI_API_KEY`
   - опционально `OPENAI_ANALYSIS_MODEL=gpt-4.1`
   - опционально `OPENAI_OCR_IMAGE_DETAIL=high`
4. Redeploy preview/production
5. Smoke:
   - текстовый ЕПД PDF → вопрос про период/сумму
   - фото Kaspi → OCR → сумма/л/с
   - ЕПД + чек → «почему долг, если оплатил?»

Пока миграция не применена: разбор и follow-up работают через ephemeral contexts (без долгого хранения файла в Storage).
