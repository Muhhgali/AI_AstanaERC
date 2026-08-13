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
  {
    question: "Хочу убрать услугу с квитанции",
    language: "ru",
    expected: "SERVICE_REMOVE",
  },
  {
    question: "Как исключить домофон из ЕПД?",
    language: "ru",
    expected: "SERVICE_REMOVE",
  },
  {
    question: "Пришли двойные начисления по квитанции",
    language: "ru",
    expected: "RECEIPT_DUPLICATE_CHARGE",
  },
  {
    question: "В ЕПД два раза начислили одну услугу",
    language: "ru",
    expected: "RECEIPT_DUPLICATE_CHARGE",
  },
  {
    question: "Оплата списалась два раза",
    language: "ru",
    expected: "PAYMENT_DUPLICATE",
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

  const routingRegressionCases: Array<{
    question: string;
    expected: ResidentIntentKind | null;
  }> = [
    { question: "хочу убрать услугу с квитанции", expected: "SERVICE_REMOVE" },
    { question: "уберите услугу из квитанции", expected: "SERVICE_REMOVE" },
    { question: "как удалить услугу из ЕПД", expected: "SERVICE_REMOVE" },
    { question: "как исключить услугу с квитанции", expected: "SERVICE_REMOVE" },
    { question: "отключить домофон в квитанции", expected: "SERVICE_REMOVE" },
    { question: "не хочу платить за домофон в ЕПД", expected: "SERVICE_REMOVE" },
    { question: "можно отказаться от услуги в квитанции", expected: "SERVICE_REMOVE" },
    { question: "снять строку КСК из ЕПД", expected: "SERVICE_REMOVE" },
    { question: "убрать вывоз мусора из квитанции", expected: "SERVICE_REMOVE" },
    { question: "исключить лифт из ЕПД", expected: "SERVICE_REMOVE" },
    { question: "как добавить услугу в квитанцию", expected: "SERVICE_ADD" },
    { question: "подключить услугу в ЕПД", expected: "SERVICE_ADD" },
    { question: "внести поставщика в квитанцию", expected: "SERVICE_ADD" },
    { question: "добавить домофон в ЕПД", expected: "SERVICE_ADD" },
    { question: "пришли двойные начисления по квитанции", expected: "RECEIPT_DUPLICATE_CHARGE" },
    { question: "двойное начисление в ЕПД", expected: "RECEIPT_DUPLICATE_CHARGE" },
    { question: "дважды начислили одну сумму в квитанции", expected: "RECEIPT_DUPLICATE_CHARGE" },
    { question: "начисление повторяется два раза", expected: "RECEIPT_DUPLICATE_CHARGE" },
    { question: "в квитанции дубль по услуге", expected: "RECEIPT_DUPLICATE_CHARGE" },
    { question: "одна строка начислена 2 раза в ЕПД", expected: "RECEIPT_DUPLICATE_CHARGE" },
    { question: "повторное начисление за мусор", expected: "RECEIPT_DUPLICATE_CHARGE" },
    { question: "две одинаковые суммы в квитанции", expected: "RECEIPT_DUPLICATE_CHARGE" },
    { question: "оплата прошла два раза", expected: "PAYMENT_DUPLICATE" },
    { question: "дважды списали деньги за ЕПД", expected: "PAYMENT_DUPLICATE" },
    { question: "платеж продублировался", expected: "PAYMENT_DUPLICATE" },
    { question: "оплатил два раза одну квитанцию", expected: "PAYMENT_DUPLICATE" },
    { question: "почему неправильная сумма в квитанции", expected: "RECEIPT_WRONG_AMOUNT" },
    { question: "в ЕПД ошибочная сумма", expected: "RECEIPT_WRONG_AMOUNT" },
    { question: "лишняя сумма в квитанции", expected: "RECEIPT_WRONG_AMOUNT" },
    { question: "сумма в квитанции стала больше", expected: "RECEIPT_WRONG_AMOUNT" },
    { question: "не пришла квитанция", expected: null },
    { question: "где посмотреть квитанцию", expected: null },
    { question: "когда формируется квитанция", expected: null },
    { question: "квитанция на email", expected: null },
    { question: "как оплатить ЕПД", expected: null },
    { question: "оплатить через Kaspi", expected: null },
    { question: "платеж не прошел", expected: null },
    { question: "оплатил но долг висит", expected: "uncredited-payment" },
    { question: "деньги списались но в ЕПД не отразились", expected: "uncredited-payment" },
    { question: "как передать показания", expected: null },
    { question: "не получается отправить показания", expected: "meter-submission-failure" },
    { question: "ошибка при передаче показаний счетчика", expected: "meter-submission-failure" },
    { question: "проблема со счетчиком", expected: "meter-vague-problem" },
    { question: "как исправить показания счетчика", expected: null },
    { question: "как найти лицевой счет", expected: null },
    { question: "купил квартиру нужен лицевой счет", expected: "new-owner-account" },
    { question: "переоформить лицевой счет после продажи квартиры", expected: "ownership-account-change" },
    { question: "смена владельца квартиры", expected: "ownership-account-change" },
    { question: "сколько у меня долг по лицевому счету", expected: null },
    { question: "контакты поставщика", expected: null },
    { question: "кто поставщик по услуге", expected: null },
    { question: "почему начислили за домофон", expected: "disputed-service-charge" },
    { question: "за что начисление по услуге", expected: "disputed-service-charge" },
    { question: "льгота ребенку инвалиду", expected: "benefit-eligibility" },
    { question: "куда писать по технической ошибке", expected: "technical-support-contact" },
    { question: "сайт выдает ошибку куда обратиться", expected: "technical-support-contact" },
    { question: "не работает личный кабинет кому написать", expected: "technical-support-contact" },
    { question: "проблема с квитанцией", expected: null },
    { question: "по квитанции вопрос", expected: null },
    { question: "не понимаю квитанцию", expected: null },
  ];

  it.each(routingRegressionCases)(
    "keeps deterministic routing for: $question",
    ({ question, expected }) => {
      expect(resolveResidentIntent(question, "ru")?.kind ?? null).toBe(expected);
    }
  );

  it("marks new high-specific intents as knowledge gaps instead of generic clarification", () => {
    for (const question of [
      "хочу убрать услугу с квитанции",
      "пришли двойные начисления по квитанции",
      "оплата списалась два раза",
    ]) {
      const intent = resolveResidentIntent(question, "ru");

      expect(intent?.specificity).toBe("high");
      expect(intent?.needsKnowledgeGap).toBe(true);
      expect(intent?.answer).not.toContain("Что именно произошло с квитанцией");
    }
  });
});
