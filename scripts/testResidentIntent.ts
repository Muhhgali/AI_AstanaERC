import assert from "node:assert/strict";
import {
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
    question:
      "Здравствуйте, не могу отправить показания по электроэнергии. Ни на вашем сайте, ни на сайте Астана РЭК не получается.",
    language: "ru",
    expected: "meter-submission-failure",
  },
  {
    question:
      "Мен пәтерді жаңадан сатып алып едім, лицевой счет нөмірі қажет болып тұр",
    language: "kk",
    expected: "new-owner-account",
  },
  {
    question:
      "Здравствуйте, как расторгнуть договор на основании купли-продажи квартиры. 7654321 абонентский номер.",
    language: "ru",
    expected: "ownership-account-change",
  },
  {
    question:
      "Здравствуйте, у меня в этом месяце стоит 1500 тг за домофон, подскажите пожалуйста почемуи",
    language: "ru",
    expected: "disputed-service-charge",
  },
  {
    question:
      "Здравствуйте! У меня ребенок инвалид детства. Хотела узнать есть ли льгота?",
    language: "ru",
    expected: "benefit-eligibility",
  },
  {
    question:
      "Здравствуйте, прошлый месяц мы оплатили поздно, теперь сумма у нас висит. Можно устранить, чтобы заплатить за этот месяц? Сарыарка 10, кв. 20",
    language: "ru",
    expected: "uncredited-payment",
  },
];

for (const testCase of cases) {
  const result = resolveResidentIntent(testCase.question, testCase.language);

  assert.equal(
    result?.kind,
    testCase.expected,
    `Wrong intent for: ${testCase.question}`
  );
  assert.ok(
    !result?.answer.includes("7654321") &&
      !result?.answer.includes("Сарыарка 10"),
    `Answer repeated private data for: ${testCase.question}`
  );
}

const standardQuestions = [
  "Куда передать показания электроэнергии?",
  "Как оплатить ЕПД?",
  "Можно ли оплатить через Kaspi?",
  "Что такое ЕПД?",
  "Как найти менеджера поставщика?",
];

for (const question of standardQuestions) {
  assert.equal(
    resolveResidentIntent(question, "ru"),
    null,
    `Standard question was incorrectly treated as a problem: ${question}`
  );
}

console.log(
  `Resident intent scenarios passed: ${cases.length}; standard routing checks: ${standardQuestions.length}`
);
