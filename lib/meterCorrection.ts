import { hasPhrase, hasWord, hasWordPrefix } from "./textMatch";

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

const METER_WORD_PREFIXES = [
  "показан",
  "счетчик",
  "прибор",
  "көрсеткіш",
  "есептегіш",
  "санауыш",
];

// Prefixes are matched against whole words only: the old substring check
// treated "аз" inside "показания" as a correction request.
const CORRECTION_WORD_PREFIXES = [
  "исправ",
  "коррект",
  "ошиб",
  "неверн",
  "неправильн",
  "повышен",
  "завышен",
  "түзет",
  "қате",
  "өзгерт",
];

const CORRECTION_WORDS = ["меньше", "больше", "көп", "аз"];

const CORRECTION_PHRASES = [
  "не могу передать",
  "не получается передать",
  "не те показания",
  "дұрыс емес",
  "жібере алма",
  "бере алма",
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
  if (!hasWordPrefix(text, METER_WORD_PREFIXES)) {
    return false;
  }

  return (
    hasWordPrefix(text, CORRECTION_WORD_PREFIXES) ||
    hasWord(text, CORRECTION_WORDS) ||
    hasPhrase(text, CORRECTION_PHRASES)
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

// "Не могу передать показания" is a problem with the readings form, not a
// request to change readings the supplier already has.
const SUBMISSION_PROBLEM_PHRASES = [
  "не могу передать",
  "не получается передать",
  "жібере алма",
  "бере алма",
];

export function isMeterValueCorrectionQuestion(text: string) {
  return isMeterCorrectionIntent(text) && !hasPhrase(text, SUBMISSION_PROBLEM_PHRASES);
}

// aerc.kz «ГИД» pages that list each supplier's phones and offices.
const SUPPLIER_GUIDE_PAGES = [
  {
    path: "energosnabzhenie-i-teplosnabzhenie-",
    services: ["electricity_astana_rek"],
    ru: "Электроэнергия и отопление",
    kk: "Электр энергиясы және жылу",
  },
  {
    path: "vodosnabzhenie-i-vodootvedenie",
    services: ["cold_water_astana_su", "hot_water_astana_su"],
    ru: "Водоснабжение и водоотведение",
    kk: "Сумен жабдықтау және су бұру",
  },
  {
    path: "gazosnabzhenie",
    services: ["gas_central"],
    ru: "Газоснабжение",
    kk: "Газбен жабдықтау",
  },
];

// Readings and charges in the ЕПД come from the supplier's database, so only
// the supplier can correct them.
export function buildMeterCorrectionSupplierAnswer(
  question: string,
  language: "ru" | "kk"
) {
  const service = inferServiceType(question);
  const matching = SUPPLIER_GUIDE_PAGES.filter((page) =>
    service ? page.services.includes(service) : false
  );
  const pages = matching.length > 0 ? matching : SUPPLIER_GUIDE_PAGES;
  const links = pages
    .map((page) => `- ${page[language]}: https://www.aerc.kz/${language}/guide/${page.path}/`)
    .join("\n");

  if (language === "kk") {
    return [
      "ЕПД-дағы көрсеткіштер мен есептеулер қызмет жеткізушінің базасындағы деректер бойынша көрсетіледі, сондықтан көрсеткішті түзету үшін сол қызметтің жеткізушісіне хабарласыңыз.",
      "Жеткізушінің телефондары мен мекенжайлары Астана-ЕРЦ сайтындағы «ГИД» бөлімінде:",
      links,
    ].join("\n\n");
  }

  return [
    "Показания и начисления в ЕПД отображаются по данным базы поставщика услуги, поэтому для корректировки показаний обратитесь к поставщику этой услуги.",
    "Телефоны и адреса поставщиков есть на сайте Астана-ЕРЦ в разделе «ГИД»:",
    links,
  ].join("\n\n");
}
