# Локальная установка (новый ноутбук)

Облачный агент и ваш ноутбук — **один и тот же код через GitHub**. Не копируйте `node_modules` вручную.

## 1. Клонировать

```bash
git clone https://github.com/Muhhgali/AI_AstanaERC.git
cd AI_AstanaERC
git fetch origin
git checkout cursor/ocr-vision-receipts-8b22
```

Ветка с OCR/ЕПД: `cursor/ocr-vision-receipts-8b22`  
Прод без OCR: `main`

## 2. Авто-установка

**macOS / Linux:**

```bash
chmod +x scripts/local-bootstrap.sh
./scripts/local-bootstrap.sh
```

**Windows (PowerShell):**

```powershell
npm ci
copy .env.example .env.local
```

## 3. Секреты в `.env.local`

| Переменная | Где взять |
|---|---|
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_ANON_KEY` | то же |
| `SUPABASE_SERVICE_ROLE_KEY` | то же (server only) |
| `NEXT_PUBLIC_SUPABASE_URL` | = SUPABASE_URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | = anon key |
| `OPENAI_API_KEY` | platform.openai.com |
| `VISITOR_TOKEN_SECRET` | случайная строка ≥ 32 символов |

Опционально:

- `OPENAI_ANALYSIS_MODEL=gpt-4.1`
- `OPENAI_OCR_IMAGE_DETAIL=high`

## 4. Запуск

```bash
npm run check:env
npm run dev
```

Открыть http://localhost:3000

## 5. Supabase (для сохранения документов)

SQL Editor → выполнить:

`supabase/migrations/20260813002000_document_intelligence.sql`

См. `docs/document-intelligence-apply.md`

## 6. Cursor

File → Open Folder → папка `AI_AstanaERC`

---

**Не коммитьте** `.env.local`. Ключи только в файле на ноуте или в Cursor Secrets.
