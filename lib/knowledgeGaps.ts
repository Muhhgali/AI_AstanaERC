export type KnowledgeGapReason =
  | "no-match"
  | "weak-match"
  | "unverified-match"
  | "gpt-answer";

export function sanitizeKnowledgeGapQuestion(input: string) {
  return input
    .normalize("NFKC")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/\b\d{12}\b/g, "[IIN]")
    .replace(/(?:\+?\d[\s()_-]*){10,}/g, "[PHONE]")
    .replace(
      /\b(?:л\/?с|лицев(?:ой|ого)?\s+сч[её]т(?:а)?|дербес\s+шот)\s*[:№#-]?\s*\d{4,}\b/giu,
      "[ACCOUNT_NUMBER]"
    )
    .replace(/\b\d{6,}\b/g, "[ACCOUNT_NUMBER]")
    .replace(
      /(?:ул\.?|улица|пр\.?|проспект|мкр\.?|микрорайон|дом|д\.?|кв\.?|квартира)\s+[^\n,.!?;]{2,80}/giu,
      "[ADDRESS]"
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function normalizeKnowledgeGapQuestion(input: string) {
  return sanitizeKnowledgeGapQuestion(input)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\[\]_ ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferKnowledgeGapCategory(input: string) {
  const normalized = normalizeKnowledgeGapQuestion(input);

  if (/оплат|kaspi|платеж|платёж|сумм|төлем|ақша/.test(normalized)) {
    return "payments";
  }

  if (/показан|счетчик|счётчик|электр|көрсеткіш|есептегіш/.test(normalized)) {
    return "meters";
  }

  if (/квитанц|епд|түбіртек|дубликат/.test(normalized)) {
    return "receipts";
  }

  if (/лицев|дербес|владел|счет|счёт|шот|переоформ/.test(normalized)) {
    return "accounts";
  }

  if (/начисл|перерасч|долг|задолж|қарыз|есептеу/.test(normalized)) {
    return "billing";
  }

  if (/сайт|кабинет|виджет|форма|ошиб|whatsapp|телефон|тех/.test(normalized)) {
    return "services";
  }

  if (/поставщик|бин|бсн|менеджер|договор/.test(normalized)) {
    return "suppliers";
  }

  return "support";
}

export function buildKnowledgeGapPriority(params: {
  reason: KnowledgeGapReason;
  frequency?: number | null;
  topSimilarity?: number | null;
}) {
  const frequencyBoost = Math.min(Math.max(params.frequency ?? 1, 1), 10) * 4;
  const reasonBoost =
    params.reason === "no-match"
      ? 24
      : params.reason === "weak-match"
        ? 16
        : params.reason === "unverified-match"
          ? 12
          : 8;
  const similarityPenalty =
    params.topSimilarity === null || params.topSimilarity === undefined
      ? 0
      : Math.round(Math.max(0, Math.min(params.topSimilarity, 1)) * 20);

  return Math.max(
    1,
    Math.min(100, 40 + frequencyBoost + reasonBoost - similarityPenalty)
  );
}
