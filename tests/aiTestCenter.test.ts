import { describe, expect, it } from "vitest";
import {
  AI_TEST_SELECTED_LIMIT,
  filterAiTestCases,
  normalizeAiTestCases,
  planAiTestRun,
} from "../lib/aiTestCenter";

const rawCases = [
  {
    id: "rw-001",
    sanitizedQuery: "Как оплатить ЕПД?",
    language: "ru",
    category: "payments",
    expectedBehavior: "answer",
    tags: ["smoke"],
    shouldAnswer: true,
  },
  {
    id: "rw-002",
    sanitizedQuery: "Тех ошибка в кабинете",
    language: "ru",
    category: "support",
    expectedBehavior: "answer",
  },
];

describe("AI Test Center cost guards", () => {
  it("lists and filters cases without planning OpenAI calls", () => {
    const cases = normalizeAiTestCases(rawCases);
    const filtered = filterAiTestCases(cases, {
      query: "тех",
      category: "support",
      language: "ru",
    });

    expect(filtered.map((item) => item.id)).toEqual(["rw-002"]);
  });

  it("limits selected bulk runs", () => {
    const cases = normalizeAiTestCases(
      Array.from({ length: AI_TEST_SELECTED_LIMIT + 1 }, (_, index) => ({
        id: `rw-${index}`,
        sanitizedQuery: `Question ${index}`,
      }))
    );
    const result = planAiTestRun(cases, {
      mode: "selected",
      ids: cases.map((item) => item.id),
    });

    expect(result.ok).toBe(false);
    expect(result.openAiCalls).toBe(0);
  });

  it("requires confirmation before a full run", () => {
    const result = planAiTestRun(normalizeAiTestCases(rawCases), {
      mode: "full",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.openAiCalls).toBe(0);
  });

  it("creates a dry-run plan for a single selected case", () => {
    const result = planAiTestRun(normalizeAiTestCases(rawCases), {
      mode: "single",
      ids: ["rw-001"],
    });

    expect(result.ok).toBe(true);
    expect(result.cases.map((item) => item.id)).toEqual(["rw-001"]);
    expect(result.openAiCalls).toBe(0);
  });
});
