import { describe, expect, it } from "vitest";
import {
  buildKnowledgeGapPriority,
  inferKnowledgeGapCategory,
  normalizeKnowledgeGapQuestion,
  sanitizeKnowledgeGapQuestion,
} from "../lib/knowledgeGaps";

describe("knowledge gap normalization", () => {
  it("redacts personal data before storing unknown questions", () => {
    const sanitized = sanitizeKnowledgeGapQuestion(
      "Мой ИИН 123456789012, телефон +7 777 111 22 33, л/с 12345678, ул. Абая 10 кв 5"
    );

    expect(sanitized).toContain("[IIN]");
    expect(sanitized).toContain("[PHONE]");
    expect(sanitized).toContain("[ACCOUNT_NUMBER]");
    expect(sanitized).toContain("[ADDRESS]");
    expect(sanitized).not.toContain("123456789012");
  });

  it("normalizes similar repeated questions to the same dedupe key", () => {
    expect(normalizeKnowledgeGapQuestion(" Почему долг после оплаты??? ")).toBe(
      normalizeKnowledgeGapQuestion("почему долг после оплаты")
    );
  });

  it("infers queue category and priority deterministically", () => {
    expect(inferKnowledgeGapCategory("почему долг после оплаты")).toBe("payments");
    expect(
      buildKnowledgeGapPriority({
        reason: "no-match",
        frequency: 5,
        topSimilarity: 0.1,
      })
    ).toBeGreaterThan(
      buildKnowledgeGapPriority({
        reason: "gpt-answer",
        frequency: 1,
        topSimilarity: 0.9,
      })
    );
  });
});
