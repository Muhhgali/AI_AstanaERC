export type MeterCorrectionDraft = {
  accountNumber?: string;
  serviceType?: string;
  meterNumber?: string;
  correctReading?: string;
  contact?: string;
  comment?: string;
  reason?: string;
};

export type MeterCorrectionFormPayload = {
  accountNumber?: string;
  serviceType?: string;
  meterNumber?: string;
  correctReading?: string;
  contact?: string;
  comment?: string;
};

type ChatLanguage = "ru" | "kk";

export type MeterCorrectionRequest = Required<
  Pick<
    MeterCorrectionDraft,
    "accountNumber" | "serviceType" | "meterNumber" | "correctReading" | "contact"
  >
> &
  Pick<MeterCorrectionDraft, "comment" | "reason"> & {
    rawText: string;
  };

export const METER_CORRECTION_SERVICE_OPTIONS = [
  {
    value: "electricity_astana_rek",
    label: "Электроэнергия",
    provider: "АстанаРЭК",
  },
  {
    value: "cold_water_astana_su",
    label: "Холодная вода",
    provider: "Астана Су Арнасы",
  },
  {
    value: "hot_water_astana_su",
    label: "Горячая вода",
    provider: "Астана Су Арнасы",
  },
  {
    value: "water_heating_teplotranzit",
    label: "Подогрев воды",
    provider: "Теплотранзит",
  },
  {
    value: "gas_central",
    label: "Газ",
    provider: "Центральное газоснабжение",
  },
] as const;

const METER_CORRECTION_SERVICE_OPTIONS_KK = [
  {
    value: "electricity_astana_rek",
    label: "Электр энергиясы",
    provider: "АстанаРЭК",
  },
  {
    value: "cold_water_astana_su",
    label: "Суық су",
    provider: "Астана Су Арнасы",
  },
  {
    value: "hot_water_astana_su",
    label: "Ыстық су",
    provider: "Астана Су Арнасы",
  },
  {
    value: "water_heating_teplotranzit",
    label: "Суды жылыту",
    provider: "Теплотранзит",
  },
  {
    value: "gas_central",
    label: "Газ",
    provider: "Центральное газоснабжение",
  },
] as const;

export function getMeterCorrectionServiceOptions(
  language: ChatLanguage = "ru"
) {
  return language === "kk"
    ? METER_CORRECTION_SERVICE_OPTIONS_KK
    : METER_CORRECTION_SERVICE_OPTIONS;
}

function getServiceOptionsText(language: ChatLanguage) {
  return getMeterCorrectionServiceOptions(language)
    .map((option) => `${option.label} (${option.provider})`)
    .join(", ");
}

const INTENT_WORDS = [
  "исправ",
  "коррект",
  "ошиб",
  "не могу передать",
  "не получается передать",
  "меньше",
  "повышен",
  "завышен",
  "түзет",
  "қате",
  "дұрыс емес",
  "өзгер",
  "жібере алма",
  "бере алма",
  "көп",
];

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function getMeterCorrectionServiceLabel(value: string) {
  const option = METER_CORRECTION_SERVICE_OPTIONS.find(
    (item) => item.value === value
  );

  return option ? `${option.label} - ${option.provider}` : value;
}

export function isMeterCorrectionIntent(text: string) {
  const normalized = normalize(text);
  const hasPlainMeter =
    normalized.includes("показан") ||
    normalized.includes("счетчик") ||
    normalized.includes("счётчик") ||
    normalized.includes("прибор") ||
    normalized.includes("көрсеткіш") ||
    normalized.includes("есептегіш") ||
    normalized.includes("санауыш");
  const hasPlainCorrectionIntent = [
    "исправ",
    "коррект",
    "ошиб",
    "не могу передать",
    "не получается передать",
    "меньше",
    "повышен",
    "завышен",
    "неверн",
    "неправильн",
    "түзет",
    "қате",
    "дұрыс емес",
    "өзгер",
    "жібере алма",
    "бере алма",
    "көп",
    "аз",
  ].some((word) => normalized.includes(word));

  if (hasPlainMeter && hasPlainCorrectionIntent) {
    return true;
  }

  return (
    (normalized.includes("показан") ||
      normalized.includes("счетчик") ||
      normalized.includes("счётчик") ||
      normalized.includes("прибор") ||
      normalized.includes("көрсеткіш") ||
      normalized.includes("есептегіш") ||
      normalized.includes("санауыш")) &&
    INTENT_WORDS.some((word) => normalized.includes(word))
  );
}

export function inferServiceType(text: string) {
  const normalized = normalize(text);

  if (
    normalized.includes("электр") ||
    normalized.includes("свет") ||
    normalized.includes("жарық")
  ) {
    return "electricity_astana_rek";
  }

  if (
    normalized.includes("подогрев") ||
    normalized.includes("подогрев воды") ||
    normalized.includes("нагрев") ||
    normalized.includes("су жылыту") ||
    normalized.includes("жылыту")
  ) {
    return "water_heating_teplotranzit";
  }

  if (
    normalized.includes("горяч") ||
    normalized.includes("гвс") ||
    normalized.includes("ыстық")
  ) {
    return "hot_water_astana_su";
  }

  if (
    normalized.includes("холод") ||
    normalized.includes("хвс") ||
    normalized.includes("вода") ||
    normalized.includes("суық") ||
    normalized.includes("су")
  ) {
    return "cold_water_astana_su";
  }

  if (normalized.includes("газ")) {
    return "gas_central";
  }

  return undefined;
}

function findAfterLabel(text: string, labels: string[]) {
  for (const label of labels) {
    const match = text.match(
      new RegExp(
        `${label}\\s*[:№#-]?\\s*([A-Za-zА-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі0-9./-]{4,})`,
        "i"
      )
    );

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return undefined;
}

function extractExplicitAccount(text: string) {
  return findAfterLabel(text, [
    "лицевой счет",
    "лицевой счёт",
    "лицевой",
    "лс",
    "л/с",
    "дербес шот",
    "жеке шот",
    "шот",
  ]);
}

export function extractMeterCorrectionDraft(text: string): MeterCorrectionDraft {
  const contact =
    text.match(/\+?\d[\d\s()_-]{8,}\d/)?.[0]?.trim() ??
    text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const fallbackAccount = text.match(/\b\d{7,12}\b/)?.[0];
  const contactDigits = contact?.replace(/\D/g, "");
  const accountNumber =
    extractExplicitAccount(text) ??
    (fallbackAccount && fallbackAccount !== contactDigits
      ? fallbackAccount
      : undefined);

  const meterNumber = findAfterLabel(text, [
    "номер счетчика",
    "номер счётчика",
    "счетчик",
    "счётчик",
    "номер прибора",
    "прибор",
    "есептегіш нөмірі",
    "есептегіш",
    "санауыш нөмірі",
    "санауыш",
  ]);

  const correctReading =
    findAfterLabel(text, [
      "правильные показания",
      "верные показания",
      "показания",
      "должно быть",
      "надо поставить",
      "нужно поставить",
      "передать",
      "дұрыс көрсеткіш",
      "көрсеткіш",
      "осылай болуы керек",
      "жіберу",
    ]) ??
    text.match(/\b\d{1,7}(?:[.,]\d{1,3})?\b(?=\s*(?:квт|квтч|м3|куб|$))/i)?.[0];

  return {
    accountNumber,
    serviceType: inferServiceType(text),
    meterNumber,
    correctReading,
    contact,
    reason: text,
  };
}

export function mergeMeterCorrectionDrafts(messages: { content?: string }[]) {
  return messages.reduce<MeterCorrectionDraft>((acc, message) => {
    const draft = extractMeterCorrectionDraft(message.content ?? "");

    return {
      accountNumber: acc.accountNumber ?? draft.accountNumber,
      serviceType: acc.serviceType ?? draft.serviceType,
      meterNumber: acc.meterNumber ?? draft.meterNumber,
      correctReading: acc.correctReading ?? draft.correctReading,
      contact: acc.contact ?? draft.contact,
      comment: acc.comment ?? draft.comment,
      reason: draft.reason || acc.reason,
    };
  }, {});
}

export function getMissingMeterCorrectionFields(draft: MeterCorrectionDraft) {
  const missing = [];

  if (!draft.accountNumber) missing.push("лицевой счёт");
  if (!draft.serviceType) missing.push("вид услуги");
  if (!draft.meterNumber) missing.push("номер счётчика или прибора учёта");
  if (!draft.correctReading) missing.push("верные показания");
  if (!draft.contact) missing.push("телефон или email для связи");

  return missing;
}

export function validateMeterCorrectionForm(form: MeterCorrectionFormPayload) {
  const draft = {
    accountNumber: form.accountNumber?.trim(),
    serviceType: form.serviceType?.trim(),
    meterNumber: form.meterNumber?.trim(),
    correctReading: form.correctReading?.trim(),
    contact: form.contact?.trim(),
    comment: form.comment?.trim(),
  };
  const missing = getMissingMeterCorrectionFields(draft);

  return {
    draft,
    missing,
  };
}

export function buildMeterCorrectionQuestion(
  _missing?: string[],
  language: ChatLanguage = "ru"
) {
  void _missing;

  if (language === "kk") {
    return [
      "Көрсеткіштерді түзетуге өтінім формасын толтырыңыз.",
      "Міндетті өрістер: дербес шот, қызмет түрі, есептегіш нөмірі, дұрыс көрсеткіш және байланыс үшін телефон немесе email.",
      `Қызмет түрін тізімнен таңдаңыз: ${getServiceOptionsText(language)}.`,
      "Қажет болса, қосымша пікір қалдыруға болады.",
    ].join("\n");
  }

  return [
    "Заполните форму заявки на корректировку показаний.",
    "Обязательные поля: лицевой счёт, вид услуги, номер счётчика, верные показания и телефон или email для связи.",
    `Вид услуги выберите из списка: ${getServiceOptionsText(language)}.`,
    "Комментарий можно оставить дополнительно.",
  ].join("\n");
}

export function buildMeterCorrectionCreatedMessage(
  requestNumber: string,
  language: ChatLanguage = "ru"
) {
  if (language === "kk") {
    return [
      `Көрсеткіштерді түзетуге өтінім жасалды: ${requestNumber}.`,
      "Маман деректерді тексеріп, көрсетілген телефон немесе email арқылы хабарласады.",
    ].join("\n");
  }

  return [
    `Заявка на корректировку показаний создана: ${requestNumber}.`,
    "Специалист проверит данные и свяжется по указанному телефону или email.",
  ].join("\n");
}
