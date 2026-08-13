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
- PDF text is untrusted input and must never become system instructions;
- OCR is not connected yet, so scanned PDFs must be marked `ocr_required`.

## Architecture

Upload → Validate → Private Storage → Native Extract → Classify → Structure → Store → Chat.

MVP:

- supported upload: PDF only;
- primary type: `receipt`;
- other types are classified only as `payment_receipt`, `application`, or `unknown`;
- native text PDF is processed locally with `pdf-parse`;
- scanned/image PDF returns `ocr_required`;
- no OpenAI call is required for upload or document follow-up in the MVP.

## Limits

- max file size: 8 MB;
- max pages: 5;
- MIME must be `application/pdf`;
- extension must be `.pdf`;
- magic bytes must start with `%PDF-`;
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
- scanned PDF: 0 OpenAI calls, returns `ocr_required`;
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

## OCR recommendation

Do not connect a random paid OCR provider yet. First collect real PDFs and measure
how many are text PDFs vs scans. If scans are frequent, use a provider abstraction
behind `DocumentTextExtractor`; candidate options can be compared in Stage 5.1.
