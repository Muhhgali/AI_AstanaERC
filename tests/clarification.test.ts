import { describe, expect, it } from "vitest";
import {
  clarificationAnswer,
  decideClarification,
  type ClarificationDecisionInput,
} from "../lib/clarification";
import { understandQuery } from "../lib/rag/queryUnderstanding";

function mediumInput(
  query: string,
  overrides: Partial<ClarificationDecisionInput> = {}
): ClarificationDecisionInput {
  const understood = understandQuery({ query });

  return {
    query,
    language: "ru",
    confidence: {
      level: "medium",
      decision: "clarify",
      reasons: ["test-medium"],
    },
    intentHints: understood.intentHints,
    isOutOfDomain: understood.isOutOfDomain,
    requiresPrivateAccountLookup: understood.requiresPrivateAccountLookup,
    candidates: [],
    ...overrides,
  };
}

describe("clarification decision layer", () => {
  it("clarifies ambiguous payment/debt situations without assuming late payment", () => {
    const decision = decideClarification(
      mediumInput("помогите разобраться с оплатой и суммой в квитанции")
    );

    expect(decision.action).toBe("clarify");
    expect(decision.reason).toBe("MULTIPLE_POSSIBLE_PROCESSES");
    expect(clarificationAnswer(decision)).toContain("деньги списались");
    expect(clarificationAnswer(decision)).not.toContain("после 25");
  });

  it("clarifies ambiguous receipt situations with one useful question", () => {
    const decision = decideClarification(
      mediumInput("у меня проблема с квитанцией")
    );

    expect(decision.action).toBe("clarify");
    expect(decision.reason).toBe("RECEIPT_AMBIGUITY");
    expect((clarificationAnswer(decision).match(/\?/g) ?? []).length).toBe(1);
  });

  it.each([
    "хочу убрать услугу с квитанции",
    "как исключить домофон из ЕПД",
    "пришли двойные начисления по квитанции",
    "в ЕПД два раза начислили одну услугу",
    "оплата списалась два раза",
  ])("does not downgrade a specific intent to generic clarification: %s", (query) => {
    const decision = decideClarification(mediumInput(query));

    expect(decision.action).toBe("answer");
    expect(decision.reason).toBe("MEDIUM_SAFE_TO_ANSWER");
    expect(clarificationAnswer(decision)).not.toContain("Что именно произошло с квитанцией");
    expect(clarificationAnswer(decision)).not.toContain("деньги списались");
  });

  it("clarifies ambiguous meter requests", () => {
    const decision = decideClarification(
      mediumInput("проблема со счетчиком")
    );

    expect(decision.action).toBe("clarify");
    expect(decision.missingInformation).toBe("meter-action");
  });

  it("clarifies supplier names that are not full questions", () => {
    const decision = decideClarification(mediumInput("ТОО Sanat Service"));

    expect(decision.action).toBe("clarify");
    expect(decision.reason).toBe("SUPPLIER_AMBIGUITY");
    expect(clarificationAnswer(decision)).toContain("ТОО Sanat Service");
  });

  it("does not promise private account lookup", () => {
    const decision = decideClarification(
      mediumInput("сколько у меня долг по лицевому счету [ACCOUNT_NUMBER]", {
        requiresPrivateAccountLookup: true,
      })
    );

    expect(decision.action).toBe("clarify");
    expect(decision.reason).toBe("PERSONAL_DATA_REQUIRED");
    expect(clarificationAnswer(decision)).toContain("не вижу персональные");
  });

  it("clarifies contact ambiguity", () => {
    const decision = decideClarification(
      mediumInput("когда точно работает офис Астана-ЕРЦ в [ADDRESS]")
    );

    expect(decision.action).toBe("clarify");
    expect(decision.reason).toBe("CONTACT_AMBIGUITY");
  });

  it("does not over-clarify a clear Kaspi payment question", () => {
    const decision = decideClarification(
      mediumInput("Как оплатить ЕПД через Kaspi?")
    );

    expect(decision.action).toBe("answer");
  });

  it("keeps out-of-domain fallback behavior", () => {
    const understood = understandQuery({ query: "что такое биткоин" });
    const decision = decideClarification(
      mediumInput("что такое биткоин", {
        intentHints: understood.intentHints,
        isOutOfDomain: understood.isOutOfDomain,
      })
    );

    expect(decision.action).toBe("fallback");
    expect(decision.reason).toBe("OUT_OF_DOMAIN");
  });
});
