# Stage 5 — Document Intelligence & PDF Conversations

## Short audit

Already reusable:

- chat UI already had a receipt upload button;
- `/api/receipts/analyze` existed, with visitor ownership and rate limiting;
- `receipt_analysis_requests` existed as an admin queue;
- Stage 3 visitor ownership is reusable through the signed HttpOnly visitor cookie;
- Stage 4 lifecycle/KB remains separate from document facts.

Missing before this stage:

- private document storage;
- document table with ownership/status/structured result;
- PDF magic-byte validation;
- native text extraction;
- OCR fallback state;
- active document context in `/api/chat`;
- document delete/status endpoint;
- document injection tests.

Risk:

- resident PDFs may contain account numbers, addresses, names, totals, QR/barcodes;
- PDF/OCR text is untrusted input and must never become system instructions;
- scanned PDFs and images use OpenAI vision OCR when `OPENAI_API_KEY` is set;
- without the key, scans/images stay `ocr_required` and are not guessed.

## Architecture

Upload → Validate → Private Storage → Native Extract → (Vision OCR fallback) → Classify → Structure → Store → Chat.

MVP + Stage 5.1 OCR:

- supported upload: PDF, JPG, PNG;
- primary types: `epd_receipt` / `bank_payment_receipt`;
- native text PDF is processed locally with `pdf-parse` (0 OpenAI calls);
- scanned/image PDF or photo falls back to OpenAI vision OCR (`OPENAI_ANALYSIS_MODEL`, default `gpt-4.1`);
- structured fields still come from deterministic parsers over OCR text;
- document follow-up questions still use stored `structured_result` (0 OpenAI calls).

## Limits

- max file size: 4 MB (runtime validation);
- max pages: 5;
- MIME: `application/pdf`, `image/jpeg`, `image/png`;
- extension must match content;
- magic bytes must match PDF/PNG/JPEG;
- encrypted/malformed PDF returns a user-friendly failure.

These limits are intentionally small for MVP because receipts should be short, and
large PDFs increase privacy, cost, and timeout risk.

## Storage and privacy

- bucket: `resident-documents`;
- bucket is private;
- no permanent public URL;
- document access is through server-side routes only;
- owner access is checked by hashed `visitor_id`;
- `DELETE /api/documents/[documentId]` soft-deletes DB data and removes the stored file when possible.

Production migration is in:

`supabase/migrations/20260813002000_document_intelligence.sql`

It was not applied automatically.

## Receipt schema

The MVP extracts only what it can find deterministically:

- document type;
- period;
- account number;
- address;
- payer name;
- total due;
- previous debt/saldo;
- payment amount;
- payment date;
- supplier/service-like lines;
- missing fields;
- warnings.

Missing fields are marked as missing. The system does not invent values.

## Conversation

After upload, the client stores `activeDocumentId`.

Follow-up questions such as:

- “Какой период указан?”
- “Где здесь долг?”
- “Почему такая сумма?”
- “Какой поставщик начислил?”

are answered from `resident_documents.structured_result`. If a question needs a
company rule that is not in the document, the assistant says that verified KB
rules are required.

## Cost control

- upload of one text PDF: 0 OpenAI calls;
- native extraction: 0 OpenAI calls;
- follow-up document question: 0 OpenAI calls;
- scanned PDF / JPG / PNG: 1 OpenAI vision call for OCR text, then local structuring;
- if `OPENAI_API_KEY` is missing: 0 OpenAI calls, returns `ocr_required`;
- no repeated extraction for follow-up questions.

## OWNER DOCUMENT PACK REQUIRED

Please provide 5–10 anonymized PDF receipts:

1. ordinary ЕПД/квитанция for one month, no debt;
2. receipt with debt/zadolzhennost/saldo;
3. receipt after payment was made;
4. receipt with several suppliers/services;
5. receipt with negative amount/overpayment if such layout exists;
6. receipt from another month/layout;
7. scanned PDF version if residents often upload scans;
8. corrupted/password-protected example only if common, anonymized;
9. receipt where payment after the 25th matters;
10. receipt with unclear abbreviations/supplier names.

Do not put real resident PDFs into git. Use `private-documents/` locally; it is ignored.

## OWNER BUSINESS RULES REQUIRED

After reviewing real receipts, we need explicit rules:

- what exactly “period” means in the receipt;
- how debt/saldo is calculated and displayed;
- how overpayment/negative amount should be explained;
- how to tell whether payment was accounted for;
- what payment after the 25th changes;
- which supplier abbreviations are official;
- which fields may be shown back to the resident;
- when the bot should send the resident to 109/Qalaqyzmet/operator.

## OCR / Stage 5.1

Implemented behind `OcrExtractor` / `extractResidentDocumentText`:

- PDF with usable text layer → `native_pdf`;
- PDF with too little text → OpenAI vision via Files + Responses API;
- JPG/PNG → OpenAI vision `input_image`;
- temporary uploaded OpenAI files are deleted after OCR;
- deterministic `extractReceiptStructuredData` still owns field parsing.
