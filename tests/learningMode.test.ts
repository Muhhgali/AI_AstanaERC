import { describe, expect, it } from "vitest";
import {
  buildLearningKnowledgeContent,
  buildLearningKnowledgeTitle,
  buildLearningQuestion,
  inferLearningCategory,
} from "../lib/learningMode";

describe("learning mode", () => {
  it("asks the owner about an unknown resident question", () => {
    const question = buildLearningQuestion({
      id: "gap-1",
      user_question: "Куда писать по технической ошибке?",
    });

    expect(question).toContain("Куда писать по технической ошибке?");
    expect(question).toContain("Какой проверенный ответ");
  });

  it("turns owner explanation into knowledge content with source context", () => {
    const content = buildLearningKnowledgeContent({
      ownerExplanation:
        "По техническим ошибкам личного кабинета нужно писать в WhatsApp поддержки.",
      gap: {
        id: "gap-2",
        topic: "technical support",
        user_question: "Сайт не работает",
        reason: "low_confidence",
      },
    });

    expect(content).toContain("WhatsApp поддержки");
    expect(content).toContain("Вопрос жителя: Сайт не работает");
    expect(content).toContain("Почему бот спросил: low_confidence");
  });

  it("infers service category for technical support issues", () => {
    expect(inferLearningCategory("техническая ошибка в личном кабинете")).toBe(
      "services"
    );
  });

  it("uses resident question as generated title", () => {
    expect(
      buildLearningKnowledgeTitle({
        id: "gap-3",
        user_question: "Как исправить ошибку оплаты?",
        topic: "payments",
      })
    ).toBe("Как исправить ошибку оплаты?");
  });
});
