import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildManagerKnowledgeDraft,
  calculateQuestionPriority,
  canPublishKnowledge,
  hasReachedActiveTaskLimit,
  sanitizeResidentQuestion,
  sortAssignableGaps,
} from "../lib/managerWorkspace";

describe("manager workspace", () => {
  it("redacts likely PII from resident questions before showing queue text", () => {
    const text = sanitizeResidentQuestion(
      "Мой телефон +7 701 123 45 67, лицевой 123456789012, улица Абая 10 кв 5"
    );

    expect(text).toContain("[PHONE]");
    expect(text).toContain("[NUMBER]");
    expect(text).toContain("[ADDRESS]");
    expect(text).not.toContain("+7 701");
    expect(text).not.toContain("123456789012");
  });

  it("does not allow manager role to publish verified knowledge", () => {
    expect(canPublishKnowledge(["manager"])).toBe(false);
    expect(canPublishKnowledge(["knowledge_editor"])).toBe(false);
    expect(canPublishKnowledge(["admin"])).toBe(true);
    expect(canPublishKnowledge(["reviewer"])).toBe(true);
  });

  it("requires a source before creating a review draft", () => {
    expect(() =>
      buildManagerKnowledgeDraft({
        authorId: "user-1",
        answer: "Писать в WhatsApp поддержки.",
        source: "",
        gap: {
          id: "gap-1",
          user_question: "Куда писать по технической ошибке?",
        },
      })
    ).toThrow("source is required");
  });

  it("builds review-only draft from manager answer", () => {
    const draft = buildManagerKnowledgeDraft({
      authorId: "user-1",
      answer: "По техническим ошибкам личного кабинета нужно писать в WhatsApp поддержки.",
      source: "Официальный файл контактов, строка technical_errors",
      gap: {
        id: "gap-1",
        user_question: "Куда писать по технической ошибке?",
        priority: 91,
      },
    });

    expect(draft.status).toBe("review");
    expect(draft.verified).toBe(false);
    expect(draft.source).toBe("manager-workspace");
    expect(draft.metadata.source).toContain("Официальный файл");
    expect(draft.content).toContain("Куда писать по технической ошибке?");
  });

  it("sorts next question by priority, frequency and age", () => {
    const [first] = sortAssignableGaps([
      { id: "old", priority: 60, frequency: 1, created_at: "2026-08-01" },
      { id: "hot", priority: 80, frequency: 2, created_at: "2026-08-10" },
      { id: "repeat", priority: 80, frequency: 5, created_at: "2026-08-12" },
    ]);

    expect(first.id).toBe("repeat");
  });

  it("enforces active assignment limit locally", () => {
    expect(
      hasReachedActiveTaskLimit({
        limit: 3,
        assigned: [
          { assignment_status: "assigned" },
          { assignment_status: "in_progress" },
          { assignment_status: "review" },
          { assignment_status: "completed" },
        ],
      })
    ).toBe(true);
  });

  it("keeps claim-next concurrency in database with skip locked RPC", () => {
    const migration = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase",
        "migrations",
        "20260813003000_manager_workspace.sql"
      ),
      "utf8"
    );

    expect(migration).toContain("claim_next_knowledge_gap");
    expect(migration.toLowerCase()).toContain("for update skip locked");
    expect(migration).toContain("manager_workspace_audit_events");
  });

  it("exposes delete action to remove a bad question from the work queue", () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), "app", "api", "manager", "workspace", "route.ts"),
      "utf8"
    );

    expect(route).toContain('"delete_question"');
    expect(route).toContain("status: \"resolved\"");
    expect(route).toContain("assignment_status: \"completed\"");
    expect(route).toContain("Вопрос удалён из рабочей очереди.");
  });

  it("prioritizes no-match repeated questions over weak isolated matches", () => {
    const noMatch = calculateQuestionPriority({
      frequency: 4,
      reason: "no-match",
      topSimilarity: 0.1,
    });
    const weak = calculateQuestionPriority({
      frequency: 1,
      reason: "weak-match",
      topSimilarity: 0.55,
    });

    expect(noMatch).toBeGreaterThan(weak);
  });
});
