import { describe, expect, it } from "vitest";
import {
  ASSISTANT_PROMPT_V3_VERSION,
  buildAssistantPromptV3,
} from "../lib/ai/prompts/assistantPromptV3";

describe("assistant prompt v3", () => {
  it("is versioned and keeps verified knowledge as source of truth", () => {
    const prompt = buildAssistantPromptV3({
      language: "ru",
      knowledgeContext: "Квитанция формируется 11–12 числа.",
    });

    expect(prompt).toContain(ASSISTANT_PROMPT_V3_VERSION);
    expect(prompt).toContain("SOURCE OF TRUTH");
    expect(prompt).toContain("KNOWLEDGE_CONTEXT");
    expect(prompt).toContain("Квитанция формируется 11–12 числа.");
  });

  it("does not encode clarification by confidence level", () => {
    const prompt = buildAssistantPromptV3({
      language: "ru",
      knowledgeContext: "Контекст есть.",
    });

    expect(prompt).not.toContain("HIGH:");
    expect(prompt).not.toContain("MEDIUM:");
    expect(prompt).not.toContain("LOW:");
    expect(prompt).not.toContain("уточняющий вопрос");
    expect(prompt).toContain("Не задавай уточняющие вопросы");
  });

  it("blocks internal meta-talk in user-facing answers", () => {
    const prompt = buildAssistantPromptV3({
      language: "kk",
      knowledgeContext: "",
    });

    expect(prompt).toContain("Не упоминай intent");
    expect(prompt).toContain("Не начинай с «Правильно понимаю»");
    expect(prompt).toContain("казахском");
    expect(prompt).toContain("KNOWLEDGE_CONTEXT_EMPTY");
  });
});
