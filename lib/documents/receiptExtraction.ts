import type {
  DocumentType,
  ReceiptLineItem,
  ReceiptStructuredResult,
} from "@/lib/documents/types";

const RECEIPT_KEYWORDS = [
  "епд",
  "единый платежный документ",
  "квитанц",
  "лицевой счет",
  "лицевой счёт",
  "итого",
  "начислено",
  "задолженность",
  "к оплате",
  "поставщик",
  "услуга",
];

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeNumber(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .replace(/[^\d,.\-]/g, "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return undefined;
}

function numberMatch(text: string, patterns: RegExp[]) {
  return normalizeNumber(firstMatch(text, patterns));
}

export function classifyDocument(text: string): DocumentType {
  const normalized = text.toLowerCase();
  const score = RECEIPT_KEYWORDS.filter((keyword) =>
    normalized.includes(keyword)
  ).length;

  if (score >= 2) {
    return "receipt";
  }

  if (/чек|кассир|фискальн|оплата/i.test(text)) {
    return "payment_receipt";
  }

  if (/заявлен|обращен|өтініш/i.test(text)) {
    return "application";
  }

  return "unknown";
}

function extractSuppliers(text: string) {
  const suppliers = new Set<string>();
  const lines = text.split(/\r?\n| {2,}/).map((line) => line.trim());

  for (const line of lines) {
    if (
      /тоо|ип |ао |кск|ос[иі]|поставщик|услугодатель/i.test(line) &&
      line.length >= 4 &&
      line.length <= 120
    ) {
      suppliers.add(line);
    }
  }

  return Array.from(suppliers).slice(0, 12);
}

function extractLineItems(text: string): ReceiptLineItem[] {
  return text
    .split(/\r?\n/)
    .reduce<ReceiptLineItem[]>((items, value) => {
      const raw = value.trim();

      if (raw.length <= 8) {
        return items;
      }

      const amount = normalizeNumber(raw.match(/(-?\d[\d\s]*[,.]\d{2})\s*$/)?.[1]);

      if (amount === undefined) {
        return items;
      }

      items.push({
        raw,
        amount,
        service: raw.replace(/-?\d[\d\s]*[,.]\d{2}\s*$/, "").trim(),
      });

      return items;
    }, [])
    .slice(0, 30);
}

export function extractReceiptStructuredData(
  text: string
): ReceiptStructuredResult {
  const compact = normalizeText(text);
  const documentType = classifyDocument(text);
  const period = firstMatch(compact, [
    /(?:период|расчетный период|расчётный период)\s*[:\-]?\s*([а-яёa-z0-9.\-/ ]{4,40})/i,
    /(?:за)\s+([а-яё]+\s+20\d{2})/i,
    /\b(0[1-9]|1[0-2])[./-](20\d{2})\b/i,
  ]);
  const accountNumber = firstMatch(compact, [
    /(?:лицев(?:ой|ого)?\s*(?:счет|счёт)|л\/с|лс)\s*[:№#\-]?\s*([0-9]{4,20})/i,
    /(?:дербес\s*шот)\s*[:№#\-]?\s*([0-9]{4,20})/i,
  ]);
  const address = firstMatch(compact, [
    /(?:адрес|мекенжай)\s*[:\-]?\s*([^|]{8,120}?)(?:\s{2,}| лицев| период|$)/i,
  ]);
  const payerName = firstMatch(compact, [
    /(?:фио|плательщик|абонент)\s*[:\-]?\s*([а-яёa-z .-]{5,80})/i,
  ]);
  const totalDue = numberMatch(compact, [
    /(?:итого\s*к\s*оплате|к\s*оплате|всего\s*к\s*оплате|сумма\s*к\s*оплате)\s*[:\-]?\s*(-?\d[\d\s]*[,.]\d{1,2})/i,
    /(?:итого|всего)\s*[:\-]?\s*(-?\d[\d\s]*[,.]\d{1,2})/i,
  ]);
  const previousDebt = numberMatch(compact, [
    /(?:задолженность|долг|сальдо)\s*[:\-]?\s*(-?\d[\d\s]*[,.]\d{1,2})/i,
  ]);
  const paymentAmount = numberMatch(compact, [
    /(?:оплачено|оплата|платеж|платёж)\s*[:\-]?\s*(-?\d[\d\s]*[,.]\d{1,2})/i,
  ]);
  const paymentDate = firstMatch(compact, [
    /(?:дата\s*оплаты|оплачено)\s*[:\-]?\s*(\d{2}[./-]\d{2}[./-]20\d{2})/i,
  ]);
  const suppliers = extractSuppliers(text);
  const lineItems = extractLineItems(text);
  const missingFields = [
    accountNumber ? null : "accountNumber",
    period ? null : "period",
    totalDue === undefined ? "totalDue" : null,
    suppliers.length > 0 ? null : "suppliers",
  ].filter((item): item is string => Boolean(item));
  const warnings = [
    documentType === "unknown"
      ? "Document type is unknown; receipt-specific interpretation is limited."
      : null,
    missingFields.length
      ? `Missing fields: ${missingFields.join(", ")}.`
      : null,
  ].filter((item): item is string => Boolean(item));

  return {
    documentType,
    period,
    accountNumber,
    address,
    payerName,
    totalDue,
    previousDebt,
    paymentAmount,
    paymentDate,
    suppliers,
    lineItems,
    missingFields,
    warnings,
  };
}

export function buildReceiptSummary(
  result: ReceiptStructuredResult,
  status: "ready" | "ocr_required" | "failed"
) {
  if (status === "ocr_required") {
    return [
      "Похоже, это сканированный PDF: текста внутри почти нет.",
      "Для такого файла нужен OCR. Сейчас я не буду угадывать данные по изображению.",
      "Загрузите текстовый PDF или дождитесь подключения OCR-провайдера.",
    ].join("\n");
  }

  if (status === "failed") {
    return "Не удалось прочитать PDF. Проверьте файл: он не должен быть повреждён или защищён паролем.";
  }

  const lines = [
    result.documentType === "receipt"
      ? "Я прочитал PDF-квитанцию и выделил данные, которые удалось найти."
      : "Я прочитал PDF, но тип документа определён не полностью.",
    result.period ? `Период: ${result.period}` : "Период: не найден в тексте.",
    result.accountNumber
      ? `Лицевой счёт: ${result.accountNumber}`
      : "Лицевой счёт: не найден в тексте.",
    result.totalDue !== undefined
      ? `Итого к оплате: ${result.totalDue}`
      : "Итого к оплате: не найдено.",
    result.previousDebt !== undefined
      ? `Долг/сальдо: ${result.previousDebt}`
      : null,
    result.paymentAmount !== undefined
      ? `Оплата в документе: ${result.paymentAmount}`
      : null,
    result.suppliers.length
      ? `Поставщики/строки: ${result.suppliers.slice(0, 5).join("; ")}`
      : "Поставщики: не удалось надёжно выделить.",
    "",
    "Можете спросить по этой квитанции: «почему такая сумма?», «где долг?», «какой период указан?».",
  ];

  return lines.filter(Boolean).join("\n");
}
