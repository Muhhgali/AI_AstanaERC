import { describe, expect, it } from "vitest";
import {
  ephemeralContextsToDocuments,
  parseEphemeralDocumentContexts,
} from "../lib/documents/ephemeralContext";
import {
  buildMultiDocumentGroundedAnswer,
  isDocumentSetReconciliationQuestion,
} from "../lib/documents/conversation";
import {
  extractBankPaymentReceiptAnalysis,
  extractEpdReceiptAnalysis,
} from "../lib/documents/receiptExtraction";
import type { ResidentDocumentRecord } from "../lib/documents/types";
import { RATE_LIMIT_POLICIES } from "../lib/rateLimit";

const epdText = `
ЕПД квитанция
Лицевой счёт: 123456789
Расчетный период: июль 2026
Итого к оплате: 1200.50
Задолженность: 300.00
Оплата: 900.50
`;

const kaspiText = `
Kaspi.kz
Чек об оплате
Платеж успешно
Сумма платежа: 1200.50 ₸
Получатель: ТОО Астана-ЕРЦ
Лицевой счет: 123456789
`;

function doc(
  id: string,
  structured: ReturnType<typeof extractEpdReceiptAnalysis> | ReturnType<typeof extractBankPaymentReceiptAnalysis>
): ResidentDocumentRecord {
  return {
    id,
    visitor_id: "visitor",
    file_name: `${id}.pdf`,
    file_type: "application/pdf",
    file_size: 100,
    file_hash: "hash",
    status: "ready",
    document_type: structured.documentType,
    extraction_method: "native_pdf",
    structured_result: structured,
  };
}

describe("ephemeral document contexts", () => {
  it("parses and converts ready contexts for chat grounding", () => {
    const contexts = parseEphemeralDocumentContexts([
      {
        clientId: "c1",
        fileName: "epd.pdf",
        documentType: "epd_receipt",
        extractionMethod: "native_pdf",
        structuredResult: extractEpdReceiptAnalysis(epdText),
        status: "ready",
      },
      {
        clientId: "bad",
        fileName: "x.pdf",
        documentType: "not-a-type",
        extractionMethod: "native_pdf",
        structuredResult: {},
      },
    ]);

    expect(contexts).toHaveLength(1);
    const documents = ephemeralContextsToDocuments(contexts);
    expect(documents[0]?.status).toBe("ready");
    expect(documents[0]?.structured_result?.documentType).toBe("epd_receipt");
  });
});

describe("multi-document grounded answers", () => {
  it("detects reconciliation questions", () => {
    expect(
      isDocumentSetReconciliationQuestion("Почему долг, если оплатил?")
    ).toBe(true);
    expect(isDocumentSetReconciliationQuestion("Какой период указан?")).toBe(
      false
    );
  });

  it("answers field questions from EPD while noting the bank receipt", () => {
    const answer = buildMultiDocumentGroundedAnswer({
      question: "Какой период указан?",
      documents: [
        doc("epd", extractEpdReceiptAnalysis(epdText)),
        doc("kaspi", extractBankPaymentReceiptAnalysis(kaspiText)),
      ],
    });

    expect(answer).toContain("июль 2026");
    expect(answer.toLowerCase()).toMatch(/чек|свер/);
  });

  it("runs reconciliation for debt-after-payment questions", () => {
    const answer = buildMultiDocumentGroundedAnswer({
      question: "Почему долг, если оплатил?",
      documents: [
        doc("epd", extractEpdReceiptAnalysis(epdText)),
        doc("kaspi", extractBankPaymentReceiptAnalysis(kaspiText)),
      ],
    });

    expect(answer.toLowerCase()).toMatch(/свер|совпад|оплат|епд|чек/);
  });
});

describe("document OCR rate policy", () => {
  it("defines a stricter OCR policy than general document analysis", () => {
    expect(RATE_LIMIT_POLICIES.documentAnalysis.limit).toBe(10);
    expect(RATE_LIMIT_POLICIES.documentOcr.limit).toBe(4);
    expect(RATE_LIMIT_POLICIES.documentOcr.windowMs).toBe(
      RATE_LIMIT_POLICIES.documentAnalysis.windowMs
    );
  });
});
