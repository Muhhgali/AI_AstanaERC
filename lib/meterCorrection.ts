export type MeterCorrectionDraft = {
  accountNumber?: string;
  serviceType?: string;
  meterNumber?: string;
  correctReading?: string;
  contact?: string;
  reason?: string;
};

export type MeterCorrectionRequest = Required<
  Pick<
    MeterCorrectionDraft,
    "accountNumber" | "serviceType" | "meterNumber" | "correctReading" | "contact"
  >
> &
  Pick<MeterCorrectionDraft, "reason"> & {
    rawText: string;
  };

const SERVICE_OPTIONS =
  "электроэнергия, холодная вода, горячая вода, подогрев воды или газ";

const INTENT_WORDS = [
  "исправ",
  "коррект",
  "ошиб",
  "не могу передать",
  "не получается передать",
  "меньше",
  "повышен",
  "завышен",
  "показан",
  "счетчик",
  "счётчик",
  "прибор",
];

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function isMeterCorrectionIntent(text: string) {
  const normalized = normalize(text);

  return (
    (normalized.includes("показан") ||
      normalized.includes("счетчик") ||
      normalized.includes("счётчик") ||
      normalized.includes("прибор")) &&
    INTENT_WORDS.some((word) => normalized.includes(word))
  );
}

export function inferServiceType(text: string) {
  const normalized = normalize(text);

  if (normalized.includes("электр") || normalized.includes("свет")) {
    return "электроэнергия";
  }

  if (
    normalized.includes("подогрев") ||
    normalized.includes("подогрев воды") ||
    normalized.includes("нагрев")
  ) {
    return "подогрев воды";
  }

  if (normalized.includes("горяч") || normalized.includes("гвс")) {
    return "горячая вода";
  }

  if (
    normalized.includes("холод") ||
    normalized.includes("хвс") ||
    normalized.includes("вода")
  ) {
    return "холодная вода";
  }

  if (normalized.includes("газ")) {
    return "газ";
  }

  return undefined;
}

function findAfterLabel(text: string, labels: string[]) {
  for (const label of labels) {
    const match = text.match(
      new RegExp(`${label}\\s*[:№#-]?\\s*([A-Za-zА-Яа-я0-9./-]{4,})`, "i")
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
  ]);

  const correctReading =
    findAfterLabel(text, [
      "правильные показания",
      "показания",
      "должно быть",
      "надо поставить",
      "нужно поставить",
      "передать",
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
      reason: draft.reason || acc.reason,
    };
  }, {});
}

export function getMissingMeterCorrectionFields(draft: MeterCorrectionDraft) {
  const missing = [];

  if (!draft.accountNumber) missing.push("лицевой счёт");
  if (!draft.serviceType) {
    missing.push(`вид услуги или счётчика (${SERVICE_OPTIONS})`);
  }
  if (!draft.meterNumber) missing.push("номер счётчика или прибора учёта");
  if (!draft.correctReading) missing.push("правильные показания");
  if (!draft.contact) missing.push("телефон или email для связи");

  return missing;
}

export function buildMeterCorrectionQuestion(missing: string[]) {
  return [
    "Чтобы создать заявку на корректировку показаний, нужно уточнить:",
    ...missing.map((field) => `- ${field}`),
    "",
    "Удобно отправить одним сообщением: лицевой счёт, вид услуги, номер счётчика, правильные показания и телефон или email для связи.",
    `Вид услуги можно указать так: ${SERVICE_OPTIONS}.`,
  ].join("\n");
}

export function buildMeterCorrectionCreatedMessage(requestNumber: string) {
  return [
    `Заявка на корректировку показаний создана: ${requestNumber}.`,
    "Специалист проверит лицевой счёт, вид услуги, номер счётчика и правильные показания, затем свяжется по указанному телефону или email.",
  ].join("\n");
}
