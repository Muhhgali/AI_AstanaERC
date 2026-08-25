import { describe, expect, it } from "vitest";
import {
  AI_TEST_GENERATION_LIMIT,
  AI_TEST_RUN_LIMIT,
  AI_TEST_SELECTED_LIMIT,
  evaluateAiTestAnswer,
  filterAiTestCases,
  generateAiTestCasesFromKnowledge,
  normalizeAiTestCases,
  planAiTestRun,
  selectAiTestRunCases,
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

  it("generates deterministic cases from verified knowledge with source trace", () => {
    const cases = generateAiTestCasesFromKnowledge({
      knowledge: [
        {
          id: "k-1",
          title: "Оплата через Kaspi",
          category: "payments",
          content: "ЕПД можно оплатить через Kaspi Bank.",
          verified: true,
          status: "verified",
        },
        {
          id: "k-2",
          title: "Черновик",
          category: "payments",
          content: "Не проверено",
          verified: false,
          status: "review",
        },
      ],
      category: "payments",
      count: 4,
      difficulty: "hard",
      generationModes: ["normal", "paraphrase", "typo", "conflict"],
    });

    expect(cases).toHaveLength(4);
    expect(cases.every((item) => item.sourceKnowledgeId === "k-1")).toBe(true);
    expect(cases.some((item) => item.generationMode === "conflict")).toBe(true);
  });

  it("caps generated cases to protect test center from noisy bulk generation", () => {
    const cases = generateAiTestCasesFromKnowledge({
      knowledge: Array.from({ length: 50 }, (_, index) => ({
        id: `k-${index}`,
        title: `Тема ${index}`,
        category: "support",
        content: `Проверенное знание ${index}`,
        verified: true,
      })),
      count: AI_TEST_GENERATION_LIMIT + 10,
    });

    expect(cases.length).toBe(AI_TEST_GENERATION_LIMIT);
  });

  it("caps executable runs to protect chat and OpenAI usage", () => {
    const cases = normalizeAiTestCases(
      Array.from({ length: AI_TEST_RUN_LIMIT + 3 }, (_, index) => ({
        id: `case-${index}`,
        sanitizedQuery: `Question ${index}`,
      }))
    );

    expect(selectAiTestRunCases(cases, { mode: "run" })).toHaveLength(
      AI_TEST_RUN_LIMIT
    );
  });

  it("marks uncertain answers as needs review when a grounded answer is expected", () => {
    const result = evaluateAiTestAnswer(
      {
        id: "case-1",
        sanitizedQuery: "Как оплатить ЕПД?",
        shouldAnswer: true,
      },
      {
        message: "По этому вопросу в базе пока нет точной информации.",
        source: "uncertain",
      }
    );

    expect(result.status).toBe("needs_review");
    expect(result.reasons).toContain(
      "expected grounded answer but got uncertain source"
    );
  });

  it("fails empty chat responses", () => {
    const result = evaluateAiTestAnswer(
      {
        id: "case-2",
        sanitizedQuery: "Куда писать по технической ошибке?",
      },
      { message: "", source: "gpt" }
    );

    expect(result.status).toBe("fail");
  });
});
