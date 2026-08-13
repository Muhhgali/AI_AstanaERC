export type ResidentLanguage = "ru" | "kk";

export type ResidentIntentKind =
  | "SERVICE_REMOVE"
  | "SERVICE_ADD"
  | "SERVICE_PROVIDER_INFO"
  | "RECEIPT_DUPLICATE_CHARGE"
  | "RECEIPT_WRONG_AMOUNT"
  | "RECEIPT_NOT_RECEIVED"
  | "RECEIPT_GET_COPY"
  | "RECEIPT_EMAIL_DELIVERY"
  | "RECEIPT_FORMATION_DATE"
  | "PAYMENT_METHOD"
  | "PAYMENT_FAILED"
  | "PAYMENT_NOT_REFLECTED"
  | "PAYMENT_DUPLICATE"
  | "PAYMENT_WRONG"
  | "PAYMENT_STATUS"
  | "METER_SUBMIT"
  | "METER_CORRECT"
  | "METER_SERVICE_UNAVAILABLE"
  | "ACCOUNT_FIND"
  | "ACCOUNT_CHANGE_OWNER"
  | "ACCOUNT_PERSONAL_DEBT"
  | "technical-support-contact"
  | "multi-intent-payment-meter"
  | "meter-submission-failure"
  | "meter-vague-problem"
  | "new-owner-account"
  | "ownership-account-change"
  | "disputed-service-charge"
  | "benefit-eligibility"
  | "uncredited-payment";

export type ResidentIntentResolution = {
  kind: ResidentIntentKind;
  source: `resident-intent-${ResidentIntentKind}`;
  answer: string;
  specificity?: "high" | "medium" | "low";
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
    "specificity" | "support" | "needsKnowledgeGap"
  > = {}
): ResidentIntentResolution {
  return {
    kind,
    source: `resident-intent-${kind}`,
    answer,
    ...options,
  };
}

function specificKnowledgeGapAnswer(
  language: ResidentLanguage,
  lines: { ru: string[]; kk: string[] }
) {
  return (language === "kk" ? lines.kk : lines.ru).join("\n");
}

function serviceRemoveAnswer(language: ResidentLanguage) {
  return specificKnowledgeGapAnswer(language, {
    ru: [
      "Правильно понимаю: вы хотите убрать или исключить конкретную услугу из квитанции/ЕПД.",
      "Я не буду переводить это в общий вопрос по квитанции. Для такой процедуры нужна точная проверенная инструкция по конкретной услуге, а в базе сейчас её нет.",
      "Уточните название услуги из строки ЕПД — например домофон, вывоз мусора, КСК/ОСИ или другая услуга. Я отмечу тему для пополнения базы знаний и дальше смогу отвечать уже по этой процедуре.",
    ],
    kk: [
      "Дұрыс түсіндім: сіз түбіртектен/ЕПД-дан нақты қызметті алып тастағыңыз келеді.",
      "Мұны жалпы түбіртек мәселесіне айналдырмаймын. Мұндай рәсім үшін нақты қызмет бойынша тексерілген нұсқаулық керек, ал базада ол қазір жоқ.",
      "ЕПД жолындағы қызмет атауын жазыңыз — мысалы, домофон, қоқыс шығару, КСК/ОСИ немесе басқа қызмет. Мен бұл тақырыпты білім базасын толықтыруға белгілеймін.",
    ],
  });
}

function serviceAddAnswer(language: ResidentLanguage) {
  return specificKnowledgeGapAnswer(language, {
    ru: [
      "Правильно понимаю: вы хотите добавить услугу в квитанцию/ЕПД.",
      "Это отдельный процесс по услуге и поставщику, не общий вопрос по квитанции. В базе пока нет точной проверенной инструкции для добавления услуги.",
      "Уточните название услуги и поставщика, если он известен. Тему отмечу для пополнения базы знаний.",
    ],
    kk: [
      "Дұрыс түсіндім: сіз түбіртекке/ЕПД-ға қызмет қосуды сұрап тұрсыз.",
      "Бұл жалпы түбіртек мәселесі емес, нақты қызмет пен жеткізушіге байланысты процесс. Базада қазір қызмет қосу бойынша тексерілген нұсқаулық жоқ.",
      "Қызмет атауын және белгілі болса жеткізушіні жазыңыз. Тақырыпты білім базасына қосуға белгілеймін.",
    ],
  });
}

function duplicateChargeAnswer(language: ResidentLanguage) {
  return specificKnowledgeGapAnswer(language, {
    ru: [
      "Правильно понимаю: речь о возможном двойном начислении в квитанции/ЕПД.",
      "Это не общий вопрос «почему сумма больше», поэтому я не буду задавать общее уточнение по квитанции.",
      "В базе пока нет точной проверенной инструкции по двойным начислениям. Уточните услугу, период и видно ли две одинаковые строки/суммы — тему отмечу для пополнения базы знаний.",
    ],
    kk: [
      "Дұрыс түсіндім: түбіртекте/ЕПД-да екі рет есептелген сома болуы мүмкін.",
      "Бұл «неге сома көп» деген жалпы сұрақ емес, сондықтан жалпы түбіртек бойынша нақтылау сұрамаймын.",
      "Қосарланған есептеу бойынша базада әзірге тексерілген нұсқаулық жоқ. Қызметті, кезеңді және екі бірдей жол/сома көрініп тұрғанын нақтылаңыз — тақырыпты білім базасына белгілеймін.",
    ],
  });
}

function receiptWrongAmountAnswer(language: ResidentLanguage) {
  return specificKnowledgeGapAnswer(language, {
    ru: [
      "Понимаю: вы хотите разобраться с неправильной или неожиданной суммой в квитанции.",
      "По одной сумме причину определить нельзя. Нужны название услуги из строки ЕПД, расчётный период и чем сумма отличается от прошлого месяца.",
      "Полный лицевой счёт и документы в открытый чат отправлять не нужно.",
    ],
    kk: [
      "Түсіндім: түбіртектегі дұрыс емес немесе күтпеген соманы анықтағыңыз келеді.",
      "Бір ғана сома бойынша себебін анықтау мүмкін емес. ЕПД жолындағы қызмет атауы, есептік кезең және өткен аймен айырмасы керек.",
      "Толық дербес шот нөмірін және құжаттарды ашық чатқа жібермеңіз.",
    ],
  });
}

function paymentDuplicateAnswer(language: ResidentLanguage) {
  return specificKnowledgeGapAnswer(language, {
    ru: [
      "Правильно понимаю: оплата могла пройти два раза.",
      "Это отдельный сценарий возврата/зачёта платежа, не общий вопрос по оплате. В базе пока нет точной проверенной инструкции по двойной оплате.",
      "Сохраните чеки и уточните дату, способ оплаты и за какую услугу платили; данные карты в чат не отправляйте. Тему отмечу для пополнения базы знаний.",
    ],
    kk: [
      "Дұрыс түсіндім: төлем екі рет өтіп кеткен болуы мүмкін.",
      "Бұл жалпы төлем сұрағы емес, қайтару/есепке алу бойынша бөлек сценарий. Базада қос төлем бойынша тексерілген нұсқаулық әзірге жоқ.",
      "Чектерді сақтап, төлем күнін, тәсілін және қай қызмет үшін төлегеніңізді нақтылаңыз; карта деректерін чатқа жібермеңіз. Тақырыпты базаға қосуға белгілеймін.",
    ],
  });
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

function multiIntentPaymentMeterAnswer(language: ResidentLanguage) {
  if (language === "kk") {
    return [
      "Сұрағыңызда екі бөлек мәселе бар екенін көріп тұрмын: төлемнің көрінбеуі және есептегіш көрсеткіштерінің жіберілмеуі.",
      "1. Төлем бойынша: төлем күні мен тәсілін, сондай-ақ берешек қай жолда тұрғанын жазыңыз. Чек болса, карта деректерін жауып тіркеңіз.",
      "2. Көрсеткіш бойынша: сайтта жібергенде не болатынын нақтылаңыз — қате мәтіні шыға ма, әлде батырма әрекет етпей ме?",
      "Алдымен қай мәселені қараймыз: төлем бе, әлде көрсеткіш жіберу ме?",
    ].join("\n");
  }

  return [
    "Вижу две отдельные проблемы: платёж не отразился и показания не отправляются.",
    "1. По платежу: напишите дату и способ оплаты, а также в какой строке квитанции остался долг. Чек можно приложить, закрыв данные карты.",
    "2. По показаниям: уточните, что происходит на сайте после отправки — появляется текст ошибки или ничего не происходит?",
    "С чего начнём: с платежа или с показаний?",
  ].join("\n");
}

function meterVagueProblemAnswer(language: ResidentLanguage) {
  if (language === "kk") {
    return [
      "Есептегіш бойынша мәселе екенін түсіндім.",
      "Нақтылап жіберіңізші: ағымдағы көрсеткішті бергіңіз келе ме, бұрын жіберілген көрсеткішті түзеткіңіз келе ме, әлде сайтта көрсеткіш жіберілмей жатыр ма?",
    ].join("\n");
  }

  return [
    "Понял, речь о счётчике.",
    "Уточните, пожалуйста: вы хотите передать текущие показания, исправить уже отправленные показания или они не отправляются на сайте?",
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
      "Дұрыс түсіндім: төлем жасадыңыз, бірақ сома ЕПД ішінде әлі берешек ретінде көрініп тұр.",
      "Қайта төлем жасамас бұрын төлемнің есепке алынғанын тексерген дұрыс. Төлем күнін, төлеу тәсілін және түбіртекте берешек қай жолда тұрғанын жазыңыз; чек болса, карта деректерін жауып тіркеңіз.",
      "Сонда төлем әлі көрінбей тұр ма, басқа кезеңге түсті ме, әлде жеткізушіден нақтылау қажет пе — ажыратуға болады.",
    ].join("\n");
  }

  return [
    "Правильно понимаю: вы оплатили, но сумма всё ещё отображается как долг в ЕПД.",
    "Перед повторной оплатой лучше проверить, был ли платёж зачтён. Напишите дату и способ оплаты, а также в какой строке квитанции остался долг; чек можно приложить, закрыв данные карты.",
    "После этого можно понять, платёж ещё не отразился, попал в другой период или требуется проверка у поставщика.",
  ].join("\n");
}

function technicalSupportContactAnswer(language: ResidentLanguage) {
  if (language === "kk") {
    return [
      "Техникалық қате бойынша WhatsApp нөміріне жазыңыз: +7-777-003-3013.",
      "Бұл нөмір тек WhatsApp хабарламалары үшін, қоңырау қабылданбайды.",
      "Хабарламаға қатенің скриншотын, қай жерде болғанын (сайт, жеке кабинет, виджет немесе форма), күнін/уақытын және қысқаша сипаттамасын қосыңыз. Жеке деректерді ашық жібермеген дұрыс.",
    ].join("\n");
  }

  return [
    "По технической ошибке напишите в WhatsApp: +7-777-003-3013.",
    "Этот номер только для сообщений WhatsApp, звонки не принимаются.",
    "К сообщению лучше приложить скриншот ошибки, где она возникла (сайт, личный кабинет, виджет или форма), дату/время и короткое описание действия. Личные данные в открытый чат лучше не отправлять.",
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
    "проблем",
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

  const hasTechnicalContext = hasAny(text, [
    "техническ",
    "техподдерж",
    "тех поддерж",
    "сайт",
    "личный кабинет",
    "кабинет",
    "виджет",
    "форма",
    "бот",
    "чат",
    "авторизац",
    "логин",
    "парол",
    "смс",
    "sms",
    "қате",
    "техникалық",
    "жеке кабинет",
  ]);
  const hasTechnicalIssue = hasAny(text, [
    "ошиб",
    "не работает",
    "не открывается",
    "не отправ",
    "не получается",
    "завис",
    "слом",
    "қате",
    "ашылмай",
    "жұмыс істем",
    "жіберілмей",
  ]);
  const asksForSupportContact = hasAny(text, [
    "куда писать",
    "куда обратиться",
    "куда написать",
    "кому писать",
    "кому написать",
    "как связаться",
    "контакт",
    "номер",
    "whatsapp",
    "ватсап",
    "поддержк",
    "техподдерж",
    "қайда жаз",
    "кімге жаз",
    "байланыс",
  ]);

  if (hasTechnicalContext && hasTechnicalIssue && asksForSupportContact) {
    return buildResolution(
      "technical-support-contact",
      technicalSupportContactAnswer(language),
      { support: "technical" }
    );
  }

  const hasReceiptContext = hasAny(text, [
    "квитанц",
    "епд",
    "түбіртек",
    "тубиртек",
  ]);
  const hasGenericServiceContext = hasAny(text, [
    "услуг",
    "строк",
    "поставщик",
    "домофон",
    "кск",
    "оси",
    "мусор",
    "вывоз",
    "лифт",
    "сервис",
    "қызмет",
    "жеткізуші",
  ]);
  const hasRemoveAction = hasAny(text, [
    "убрать",
    "уберите",
    "удалить",
    "исключить",
    "отключить",
    "отказаться",
    "не хочу платить",
    "снять",
    "алып таста",
    "өшіру",
    "бас тарт",
  ]);
  const hasAddAction = hasAny(text, [
    "добавить",
    "подключить",
    "включить",
    "внести",
    "қосу",
    "енгіз",
  ]);

  if ((hasReceiptContext || hasGenericServiceContext) && hasGenericServiceContext && hasRemoveAction) {
    return buildResolution("SERVICE_REMOVE", serviceRemoveAnswer(language), {
      specificity: "high",
      needsKnowledgeGap: true,
    });
  }

  if ((hasReceiptContext || hasGenericServiceContext) && hasGenericServiceContext && hasAddAction) {
    return buildResolution("SERVICE_ADD", serviceAddAnswer(language), {
      specificity: "high",
      needsKnowledgeGap: true,
    });
  }

  const hasDuplicateSignal = hasAny(text, [
    "двойн",
    "дважды",
    "две",
    "два раза",
    "2 раза",
    "повторн",
    "дублир",
    "дубль",
    "қосар",
    "екі рет",
  ]);
  const hasChargeOrPaymentContext = hasAny(text, [
    "начисл",
    "сумм",
    "квитанц",
    "епд",
    "оплат",
    "платеж",
    "списал",
    "деньги",
    "есептел",
    "төлем",
    "сома",
  ]);

  if (hasDuplicateSignal && hasChargeOrPaymentContext && hasAny(text, ["оплат", "платеж", "списал", "деньги", "төлем"])) {
    return buildResolution("PAYMENT_DUPLICATE", paymentDuplicateAnswer(language), {
      specificity: "high",
      needsKnowledgeGap: true,
    });
  }

  if (
    hasDuplicateSignal &&
    hasChargeOrPaymentContext &&
    (hasAny(text, ["начисл", "квитанц", "епд", "есептел", "түбіртек"]) ||
      (hasAny(text, ["одинаков"]) && hasAny(text, ["сумм", "строк"])))
  ) {
    return buildResolution("RECEIPT_DUPLICATE_CHARGE", duplicateChargeAnswer(language), {
      specificity: "high",
      needsKnowledgeGap: true,
    });
  }

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
    "передач",
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
  const hasPaymentContext = hasAny(text, [
    "оплат",
    "платеж",
    "заплат",
    "чек",
    "деньги",
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

  if (
    hasMeterContext &&
    hasSubmissionContext &&
    hasFailureContext &&
    hasPaymentContext &&
    hasUncreditedContext
  ) {
    return buildResolution(
      "multi-intent-payment-meter",
      multiIntentPaymentMeterAnswer(language),
      { support: "technical" }
    );
  }

  if (hasMeterContext && hasSubmissionContext && hasFailureContext) {
    return buildResolution(
      "meter-submission-failure",
      meterSubmissionFailureAnswer(language),
      { support: "technical" }
    );
  }

  if (hasMeterContext && hasAny(text, ["проблем", "мәселе"])) {
    return buildResolution(
      "meter-vague-problem",
      meterVagueProblemAnswer(language),
      { needsKnowledgeGap: true }
    );
  }

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
      "смена владельц",
      "жаңа меншік",
    ]) ||
    (hasPropertyContext &&
      hasAny(text, [
        "продал",
        "продала",
        "продали",
        "прода",
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
    if (!hasPaymentContext && hasReceiptContext && hasAny(text, ["неправ", "ошиб", "лишн", "больш", "мален", "сумм", "артық", "қате"])) {
      return buildResolution("RECEIPT_WRONG_AMOUNT", receiptWrongAmountAnswer(language), {
        specificity: "high",
        needsKnowledgeGap: true,
      });
    }

    return buildResolution(
      "disputed-service-charge",
      disputedServiceChargeAnswer(language),
      { specificity: "medium", needsKnowledgeGap: true }
    );
  }

  return null;
}
