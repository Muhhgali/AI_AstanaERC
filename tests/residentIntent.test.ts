import { describe, expect, it } from "vitest";
import {
  hasResidentProblemSignal,
  resolveResidentIntent,
  type ResidentIntentKind,
  type ResidentLanguage,
} from "../lib/residentIntent";

const cases: Array<{
  question: string;
  language: ResidentLanguage;
  expected: ResidentIntentKind;
}> = [
  {
    question: "Не могу отправить показания по электроэнергии на сайте.",
    language: "ru",
    expected: "meter-submission-failure",
  },
  {
    question: "Куда писать по технической ошибке?",
    language: "ru",
    expected: "technical-support-contact",
  },
  {
    question:
      "Мен пәтерді жаңадан сатып алып едім, лицевой счет нөмірі қажет болып тұр.",
    language: "kk",
    expected: "new-owner-account",
  },
  {
    question:
      "Как расторгнуть договор на основании купли-продажи квартиры?",
    language: "ru",
    expected: "ownership-account-change",
  },
  {
    question: "Почему начислили 1500 тенге за домофон?",
    language: "ru",
    expected: "disputed-service-charge",
  },
  {
    question: "Есть ли льгота семье с ребёнком-инвалидом?",
    language: "ru",
    expected: "benefit-eligibility",
  },
  {
    question: "Прошлый месяц оплатили поздно, но платёж всё ещё висит как долг.",
    language: "ru",
    expected: "uncredited-payment",
  },
];

describe("resident intent routing", () => {
  it.each(cases)("routes $expected", ({ question, language, expected }) => {
    expect(resolveResidentIntent(question, language)?.kind).toBe(expected);
  });

  it("understands common spelling mistakes", () => {
    expect(
      resolveResidentIntent("Не палучается атправить паказания счетчика", "ru")
        ?.kind
    ).toBe("meter-submission-failure");
  });

  it("understands mixed Russian and Kazakh", () => {
    expect(
      resolveResidentIntent(
        "Сайтта есептегіш көрсеткішін отправить не получается",
        "kk"
      )?.kind
    ).toBe("meter-submission-failure");
  });

  it("keeps standard and unknown questions on the RAG fallback", () => {
    for (const question of [
      "Как оплатить ЕПД?",
      "Куда передавать показания электроэнергии?",
      "Как найти менеджера поставщика?",
      "Расскажите о графике работы офиса",
    ]) {
      expect(resolveResidentIntent(question, "ru")).toBeNull();
    }
  });

  it("resolves conflicting signals in a stable order", () => {
    expect(
      resolveResidentIntent(
        "Не могу отправить показания счётчика, и прошлый платёж висит как долг",
        "ru"
      )?.kind
    ).toBe("multi-intent-payment-meter");
  });

  it("does not split a single payment/debt situation into multi-intent", () => {
    expect(
      resolveResidentIntent(
        "я оплатил вчера и сегодня вижу долг",
        "ru"
      )?.kind
    ).toBe("uncredited-payment");
  });

  it("treats a vague resident problem as unsafe for direct KB answers", () => {
    expect(hasResidentProblemSignal("у меня проблема со счетчиком")).toBe(true);
    expect(resolveResidentIntent("у меня проблема со счетчиком", "ru")?.kind).toBe(
      "meter-vague-problem"
    );
  });
});
