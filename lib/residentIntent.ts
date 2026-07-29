export type ResidentLanguage = "ru" | "kk";

export type ResidentIntentKind =
  | "meter-submission-failure"
  | "new-owner-account"
  | "ownership-account-change"
  | "disputed-service-charge"
  | "benefit-eligibility"
  | "uncredited-payment";

export type ResidentIntentResolution = {
  kind: ResidentIntentKind;
  source: `resident-intent-${ResidentIntentKind}`;
  answer: string;
  support?: "technical";
  needsKnowledgeGap?: boolean;
};

function normalizeResidentText(text: string) {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/палуч/g, "получ")
    .replace(/паказан/g, "показан")
    .replace(/атправ/g, "отправ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text: string, phrases: string[]) {
  return phrases.some((phrase) => text.includes(phrase));
}

function buildResolution(
  kind: ResidentIntentKind,
  answer: string,
  options: Pick<
    ResidentIntentResolution,
    "support" | "needsKnowledgeGap"
  > = {}
): ResidentIntentResolution {
  return {
    kind,
    source: `resident-intent-${kind}`,
    answer,
    ...options,
  };
}

function meterSubmissionFailureAnswer(language: ResidentLanguage) {
  if (language === "kk") {
    return [
      "Дұрыс түсіндім: есептегіш көрсеткіштері сайт арқылы жіберілмей жатыр.",
      "Сіз қолданып көрген сілтемені қайта ұсынбаймын. Жіберу кезінде не болатынын жазыңыз: қате мәтіні шыға ма, әлде батырма әрекет етпей ме? Мүмкін болса, жеке деректер көрінбейтін скриншот тіркеңіз.",
      "Төменде техникалық қолдау байланысы көрсетіледі.",
    ].join("\n");
  }

  return [
    "Правильно понимаю: показания не отправляются через сайт, то есть проблема не в том, где их передать, а в самой отправке.",
    "Повторно предлагать уже проверенные вами ссылки не буду. Напишите, что происходит после нажатия кнопки: появляется текст ошибки или ничего не происходит? Если возможно, приложите скриншот без личных данных.",
    "Ниже указан контакт технической поддержки.",
  ].join("\n");
}

function newOwnerAccountAnswer(language: ResidentLanguage) {
  if (language === "kk") {
    return [
      "Дұрыс түсіндім: пәтерді жаңадан сатып алдыңыз және дербес шот нөмірін білгіңіз келеді.",
      "Алдымен қай қызметтің шоты қажет екенін нақтылаңыз: ЕПД, электр энергиясы немесе басқа қызмет пе?",
      "Толық мекенжайды және меншік құжаттарын ашық чатқа жібермеңіз; қызмет анықталған соң қауіпсіз тексеру жолын көрсетемін.",
    ].join("\n");
  }

  return [
    "Правильно понимаю: вы недавно приобрели квартиру и хотите узнать номер лицевого счёта.",
    "Уточните, пожалуйста, лицевой счёт какой услуги нужен: ЕПД, электроэнергия или другая услуга?",
    "Не отправляйте в открытый чат полный адрес и документы о собственности; после уточнения услуги подскажу безопасный способ проверки.",
  ].join("\n");
}

function ownershipAccountChangeAnswer(language: ResidentLanguage) {
  if (language === "kk") {
    return [
      "Сұрағыңыз пәтерді сату-сатып алуға байланысты дербес шотты жабу немесе жаңа меншік иесіне қайта рәсімдеу туралы екенін түсіндім.",
      "Алдымен нақтылайын: пәтерді саттыңыз ба, әлде сатып алдыңыз ба? Бұл екі жағдайда рәсім әртүрлі болуы мүмкін.",
      "Дербес шот нөмірін және меншік құжаттарын ашық чатқа толық жібермеңіз.",
    ].join("\n");
  }

  return [
    "Правильно понимаю: после сделки с квартирой нужно закрыть лицевой счёт прежнего владельца или переоформить его на нового собственника.",
    "Уточните, пожалуйста: вы продали квартиру или приобрели её? От этого зависит нужная процедура.",
    "Не отправляйте в открытый чат полный номер лицевого счёта и документы о собственности.",
  ].join("\n");
}

function disputedServiceChargeAnswer(language: ResidentLanguage) {
  if (language === "kk") {
    return [
      "Сіз осы айда көрсетілген қызмет үшін неге мұндай сома есептелгенін білгіңіз келетінін түсіндім.",
      "Тек сомаға қарап оның себебін анықтау мүмкін емес. ЕПД жолындағы қызмет көрсетушінің атауын, есептік кезеңді және өткен айдағы соманың өзгеше болған-болмағанын жазыңыз.",
      "Дербес шоттың толық нөмірін жібермеңіз.",
    ].join("\n");
  }

  return [
    "Правильно понимаю: вы хотите выяснить, почему по конкретной услуге в этом месяце начислена такая сумма.",
    "По одной сумме причину определить нельзя. Напишите название поставщика из строки ЕПД, расчётный период и отличалась ли сумма в прошлом месяце.",
    "Полный номер лицевого счёта отправлять не нужно.",
  ].join("\n");
}

function benefitEligibilityAnswer(language: ResidentLanguage) {
  if (language === "kk") {
    return [
      "Сіз балаңыздың мүгедектігіне байланысты жеңілдік бар-жоғын білгіңіз келетінін түсіндім.",
      "Жеңілдік шарттары қызмет түріне байланысты болуы мүмкін, ал базада бұл жағдай бойынша нақты тексерілген жауап жоқ.",
      "Қай төлем немесе қызмет туралы сұрап тұрсыз: ЕПД, электр энергиясы, тұрғын үй көмегі немесе басқа қызмет пе?",
    ].join("\n");
  }

  return [
    "Правильно понимаю: вы хотите узнать, положена ли семье льгота в связи с инвалидностью ребёнка.",
    "Условия могут зависеть от конкретной услуги, а точной проверенной информации для этой ситуации в базе сейчас нет.",
    "Уточните, пожалуйста, о какой оплате идёт речь: ЕПД, электроэнергия, жилищная помощь или другая услуга?",
  ].join("\n");
}

function uncreditedPaymentAnswer(language: ResidentLanguage) {
  if (language === "kk") {
    return [
      "Дұрыс түсіндім: өткен айдың төлемі кеш жасалған, ал қазір ол берешек ретінде әлі көрініп тұр.",
      "Қайта төлем жасамас бұрын төлемнің есепке алынғанын тексерген дұрыс. Төлем күнін, төлеу тәсілін және түбіртекте берешек қай жолда тұрғанын жазыңыз; чек болса, карта деректерін жауып тіркеңіз.",
      "Сонда бұл кеш көрсетілген төлем бе, әлде жеткізушіге нақтылау қажет пе — ажыратуға болады.",
    ].join("\n");
  }

  return [
    "Правильно понимаю: прошлый месяц вы оплатили с опозданием, но эта сумма всё ещё отображается как долг в новом ЕПД.",
    "Перед повторной оплатой лучше проверить, был ли платёж зачтён. Напишите дату и способ оплаты, а также в какой строке квитанции остался долг; чек можно приложить, закрыв данные карты.",
    "После этого можно понять, платёж просто отразился позже или требуется проверка у поставщика.",
  ].join("\n");
}

export function hasResidentProblemSignal(question: string) {
  const text = normalizeResidentText(question);

  return hasAny(text, [
    "не могу",
    "не получается",
    "не выходит",
    "не работает",
    "не отправ",
    "не принимает",
    "не прош",
    "ошиб",
    "неверн",
    "неправил",
    "почему",
    "начисл",
    "висит",
    "не учтен",
    "не учли",
    "не отраз",
    "переоформ",
    "расторг",
    "купил квартир",
    "купила квартир",
    "приобрел квартир",
    "приобрела квартир",
    "льгот",
    "инвалид",
    "жібере алмай",
    "болмай тұр",
    "жұмыс істем",
    "қате",
    "неге",
    "есептел",
    "көрін",
    "қайта рәсім",
    "жаңадан сатып",
    "сатып алып",
    "жеңілдік",
    "мүгедек",
  ]);
}

export function resolveResidentIntent(
  question: string,
  language: ResidentLanguage
): ResidentIntentResolution | null {
  const text = normalizeResidentText(question);

  const hasMeterContext = hasAny(text, [
    "показан",
    "счетчик",
    "электр",
    "астана рэк",
    "көрсеткіш",
    "есептегіш",
    "санауыш",
    "электр энергия",
  ]);
  const hasSubmissionContext = hasAny(text, [
    "отправ",
    "передат",
    "сдать",
    "сайт",
    "жібере",
    "беру",
  ]);
  const hasFailureContext = hasAny(text, [
    "не могу",
    "не получается",
    "не выходит",
    "не отправ",
    "не принимает",
    "не работает",
    "ошиб",
    "ничего не происходит",
    "жібере алмай",
    "болмай тұр",
    "жұмыс істем",
    "қате",
  ]);

  if (hasMeterContext && hasSubmissionContext && hasFailureContext) {
    return buildResolution(
      "meter-submission-failure",
      meterSubmissionFailureAnswer(language),
      { support: "technical" }
    );
  }

  const hasPaymentContext = hasAny(text, [
    "оплат",
    "платеж",
    "заплат",
    "чек",
    "төле",
    "төлем",
  ]);
  const hasUncreditedContext = hasAny(text, [
    "прошлый месяц",
    "прошлом месяце",
    "поздно",
    "с опоздан",
    "висит",
    "долг",
    "задолж",
    "не учли",
    "не учтен",
    "не отраз",
    "не села",
    "не зачисл",
    "өткен ай",
    "кеш",
    "берешек",
    "түспе",
    "ескерілм",
  ]);

  if (hasPaymentContext && hasUncreditedContext) {
    return buildResolution(
      "uncredited-payment",
      uncreditedPaymentAnswer(language)
    );
  }

  const hasPropertyContext = hasAny(text, [
    "квартир",
    "жиль",
    "недвижим",
    "пәтер",
    "тұрғын үй",
  ]);
  const hasOwnershipTransaction =
    hasAny(text, [
      "купли продажи",
      "купля продажа",
      "новый собственник",
      "смена собственник",
      "жаңа меншік",
    ]) ||
    (hasPropertyContext &&
      hasAny(text, [
        "продал",
        "продала",
        "продали",
        "купил",
        "купила",
        "приобрел",
        "приобрела",
        "недавно взял",
        "сатып",
        "жаңадан ал",
      ]));
  const hasCloseOrTransferContext = hasAny(text, [
    "расторг",
    "закрыт",
    "переоформ",
    "смен",
    "договор",
    "лицев",
    "абонент",
    "жабу",
    "қайта рәсім",
    "шарт",
    "дербес шот",
  ]);

  if (hasOwnershipTransaction && hasCloseOrTransferContext) {
    const isNewOwnerAccountRequest =
      hasAny(text, [
        "лицевой счет",
        "лицевой счёт",
        "номер счета",
        "номер счёта",
        "дербес шот",
        "шот нөмір",
      ]) &&
      hasAny(text, [
        "нужен",
        "необходим",
        "узнать",
        "найти",
        "қажет",
        "білу",
      ]) &&
      !hasAny(text, ["расторг", "закрыт", "переоформ", "жабу", "қайта рәсім"]);

    if (isNewOwnerAccountRequest) {
      return buildResolution(
        "new-owner-account",
        newOwnerAccountAnswer(language)
      );
    }

    return buildResolution(
      "ownership-account-change",
      ownershipAccountChangeAnswer(language)
    );
  }

  const hasBenefitContext =
    hasAny(text, ["льгот", "пособ", "скидк", "жеңілдік", "жәрдемақы"]) &&
    hasAny(text, ["инвалид", "ребенок", "ребёнок", "мүгедек", "бала"]);

  if (hasBenefitContext) {
    return buildResolution(
      "benefit-eligibility",
      benefitEligibilityAnswer(language),
      { needsKnowledgeGap: true }
    );
  }

  const hasChargeQuestion = hasAny(text, [
    "почему",
    "откуда",
    "за что",
    "начисл",
    "сумм",
    "стоит",
    "тенге",
    "тг",
    "неге",
    "есептел",
    "сома",
  ]);
  const hasServiceContext = hasAny(text, [
    "домофон",
    "услуг",
    "епд",
    "квитанц",
    "электр",
    "вода",
    "отоплен",
    "газ",
    "қызмет",
    "түбіртек",
    "жарық",
    "су",
  ]);

  if (hasChargeQuestion && hasServiceContext) {
    return buildResolution(
      "disputed-service-charge",
      disputedServiceChargeAnswer(language),
      { needsKnowledgeGap: true }
    );
  }

  return null;
}
