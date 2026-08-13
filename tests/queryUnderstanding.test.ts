import { describe, expect, it } from "vitest";
import {
  normalizeQueryText,
  understandQuery,
} from "../lib/rag/queryUnderstanding";

describe("query understanding", () => {
  it("normalizes common Russian typos without changing the original query", () => {
    expect(normalizeQueryText("куда пердать покозания света")).toBe(
      "куда передать показания света"
    );
  });

  it("does not confuse sum wording with water meter intent", () => {
    const query = understandQuery({
      query: "я уже платил но сумма не поменялась",
    });

    expect(query.intentHints).toContain("payment");
    expect(query.intentHints).toContain("billing");
    expect(query.intentHints).not.toContain("meter");
    expect(query.rewrittenQueries[0]).toContain("платеж не отразился");
  });

  it("does not confuse electronic receipt wording with electricity meter intent", () => {
    const query = understandQuery({
      query: "а где это посмотреть?",
      previousMessages: [
        {
          role: "user",
          content: "Как получить электронную квитанцию?",
        },
        {
          role: "assistant",
          content: "ЕПД можно посмотреть в электронных сервисах.",
        },
      ],
    });

    expect(query.intentHints).toContain("receipt");
    expect(query.intentHints).not.toContain("meter");
  });

  it("marks private debt lookup as low-confidence fallback material", () => {
    const query = understandQuery({
      query: "сколько у меня долг по лицевому счету 123456",
    });

    expect(query.requiresPrivateAccountLookup).toBe(true);
  });

  it("does not let old conversation context override a new explicit topic", () => {
    const query = understandQuery({
      query: "квитанция не пришла",
      previousMessages: [
        {
          role: "user",
          content: "у меня проблема со счетчиком",
        },
        {
          role: "assistant",
          content: "Показания можно передать на сайте.",
        },
      ],
    });

    expect(query.intentHints).toContain("receipt");
    expect(query.intentHints).not.toContain("meter");
    expect(query.searchTexts.join("\n")).not.toContain("проблема со счетчиком");
  });

  it("does not let payment history override a new contact question", () => {
    const query = understandQuery({
      query: "какой адрес офиса?",
      previousMessages: [
        {
          role: "user",
          content: "оплата не отразилась",
        },
        {
          role: "assistant",
          content: "Что именно с оплатой: деньги списались или платёж не прошёл?",
        },
      ],
    });

    expect(query.intentHints).toContain("support");
    expect(query.intentHints).not.toContain("payment");
    expect(query.intentHints).not.toContain("billing");
  });

  it("does not let supplier history override a new receipt question", () => {
    const query = understandQuery({
      query: "когда формируется квитанция?",
      previousMessages: [
        {
          role: "user",
          content: "ТОО Sanat Service",
        },
        {
          role: "assistant",
          content: "Что именно хотите узнать про ТОО Sanat Service: контакты, услугу или менеджера?",
        },
      ],
    });

    expect(query.intentHints).toContain("receipt");
    expect(query.intentHints).not.toContain("supplier");
  });

  it("marks out-of-domain questions by the current user query, not by history", () => {
    const query = understandQuery({
      query: "что такое биткоин",
      previousMessages: [
        {
          role: "user",
          content: "куда передать показания счетчика",
        },
      ],
    });

    expect(query.isOutOfDomain).toBe(true);
  });

  it("does not add an unstated late-payment cause to generic payment debt rewrites", () => {
    const query = understandQuery({
      query: "деньги закинул почему долг",
    });

    expect(query.rewrittenQueries.join("\n")).toContain("платеж не отразился");
    expect(query.rewrittenQueries.join("\n")).not.toContain("после формирования");
    expect(query.rewrittenQueries.join("\n")).not.toContain("поздняя оплата");
  });

  it("keeps late-payment search concepts only when the user mentions lateness", () => {
    const query = understandQuery({
      query: "оплатил после 25 числа но долг остался",
    });

    expect(query.rewrittenQueries.join("\n")).toContain("после формирования");
  });
});
