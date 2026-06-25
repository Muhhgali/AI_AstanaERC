export type MeterCorrectionDraft = {
  accountNumber?: string;
  meterNumber?: string;
  correctReading?: string;
  contact?: string;
  serviceType?: string;
  reason?: string;
};

export type MeterCorrectionRequest = Required<
  Pick<MeterCorrectionDraft, "accountNumber" | "meterNumber" | "correctReading" | "contact">
> &
  Pick<MeterCorrectionDraft, "serviceType" | "reason"> & {
    rawText: string;
  };

const INTENT_WORDS = [
  "исправ",
  "коррект",
  "ошиб",
  "не могу передать",
  "не получается передать",
  "меньше",
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

  if (normalized.includes("горяч") || normalized.includes("гвс")) {
    return "горячая вода";
  }

  if (normalized.includes("холод") || normalized.includes("хвс") || normalized.includes("вод")) {
    return "вода";
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

export function extractMeterCorrectionDraft(text: string): MeterCorrectionDraft {
  const accountNumber =
    findAfterLabel(text, ["лицевой счет", "лицевой счёт", "лс", "л/с"]) ??
    text.match(/\b\d{7,12}\b/)?.[0];

  const meterNumber = findAfterLabel(text, [
    "номер счетчика",
    "номер счётчика",
    "счетчик",
    "счётчик",
    "прибор",
  ]);

  const correctReading =
    findAfterLabel(text, [
      "показания",
      "правильные показания",
      "должно быть",
      "надо поставить",
      "передать",
    ]) ?? text.match(/\b\d{1,7}(?:[.,]\d{1,3})?\b(?=\s*(?:квт|квтч|м3|куб|$))/i)?.[0];

  const contact =
    text.match(/\+?\d[\d\s()_-]{8,}\d/)?.[0]?.trim() ??
    text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];

  return {
    accountNumber,
    meterNumber,
    correctReading,
    contact,
    serviceType: inferServiceType(text),
    reason: text,
  };
}

export function mergeMeterCorrectionDrafts(messages: { content?: string }[]) {
  return messages.reduce<MeterCorrectionDraft>((acc, message) => {
    const draft = extractMeterCorrectionDraft(message.content ?? "");

    return {
      accountNumber: acc.accountNumber ?? draft.accountNumber,
      meterNumber: acc.meterNumber ?? draft.meterNumber,
      correctReading: acc.correctReading ?? draft.correctReading,
      contact: acc.contact ?? draft.contact,
      serviceType: acc.serviceType ?? draft.serviceType,
      reason: draft.reason || acc.reason,
    };
  }, {});
}

export function getMissingMeterCorrectionFields(draft: MeterCorrectionDraft) {
  const missing = [];

  if (!draft.accountNumber) missing.push("лицевой счёт");
  if (!draft.meterNumber) missing.push("номер счётчика");
  if (!draft.correctReading) missing.push("правильные показания");
  if (!draft.contact) missing.push("контакт для связи");

  return missing;
}

export function buildMeterCorrectionQuestion(missing: string[]) {
  return [
    "Чтобы создать заявку на корректировку показаний, пришлите:",
    ...missing.map((field) => `- ${field}`),
    "",
    "Можно одним сообщением: лицевой счёт, номер счётчика, правильные показания и телефон или email.",
  ].join("\n");
}

export function buildMeterCorrectionCreatedMessage(requestNumber: string) {
  return [
    `Заявка на корректировку показаний создана: ${requestNumber}.`,
    "Специалист проверит данные и свяжется по указанному контакту.",
  ].join("\n");
}
