#!/usr/bin/env tsx
/**
 * Part 1 smoke: local extract → structure → grounded answer.
 * Does not call Supabase/OpenAI unless OPENAI_API_KEY is set for image OCR.
 *
 * Usage:
 *   npx tsx scripts/smokeDocumentIntelligence.ts
 *   npx tsx scripts/smokeDocumentIntelligence.ts tests/fixtures/documents/sample-kaspi-photo.png
 */
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import {
  extractResidentDocumentText,
  type DocumentExtractRequest,
} from "../lib/documents/extraction";
import {
  buildReceiptSummary,
  classifyDocument,
  extractReceiptStructuredData,
} from "../lib/documents/receiptExtraction";
import { buildDocumentGroundedAnswer } from "../lib/documents/conversation";

function contentTypeFor(path: string): DocumentExtractRequest["contentType"] {
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/pdf";
}

async function run(path: string, question: string) {
  const absolute = resolve(path);
  const bytes = new Uint8Array(readFileSync(absolute));
  const contentType = contentTypeFor(absolute);

  console.log("\n=== FILE ===");
  console.log(absolute, contentType, `${bytes.length} bytes`);

  const extraction = await extractResidentDocumentText({
    bytes,
    contentType,
    fileName: absolute.split("/").pop(),
  });

  console.log("\n=== EXTRACTION ===");
  console.log({
    status: extraction.status,
    method: extraction.method,
    pageCount: extraction.pageCount,
    warnings: extraction.warnings,
    textLength: extraction.text.length,
  });

  if (extraction.status !== "ready") {
    console.log("Cannot structure / answer without ready text.");
    if (extraction.status === "failed") {
      console.log(extraction.errorMessage);
    }
    return;
  }

  const structured = extractReceiptStructuredData(extraction.text);
  const documentType = classifyDocument(extraction.text);
  const summary = buildReceiptSummary(structured, "ready");

  console.log("\n=== BOT SUMMARY (as after upload) ===");
  console.log(summary);

  const answer = buildDocumentGroundedAnswer({
    question,
    document: {
      id: "00000000-0000-4000-8000-000000000099",
      visitor_id: "smoke-visitor",
      file_name: absolute.split("/").pop() ?? "document",
      file_type: contentType,
      file_size: bytes.length,
      file_hash: "smoke",
      status: "ready",
      document_type: documentType,
      extraction_method: extraction.method,
      structured_result: structured,
    },
  });

  console.log("\n=== TEST QUESTION ===");
  console.log(question);
  console.log("\n=== BOT ANSWER ===");
  console.log(answer);
}

const fileArg =
  process.argv[2] ?? "tests/fixtures/documents/sample-epd-text.pdf";
const questionArg =
  process.argv[3] ?? "Какой период указан и сколько итого к оплате?";

async function main() {
  await run(fileArg, questionArg);

  if (!process.argv[2]) {
    await run(
      "tests/fixtures/documents/sample-kaspi-photo.png",
      "Какая сумма оплаты и лицевой счёт?"
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
