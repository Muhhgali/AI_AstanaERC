import type {
  BankPaymentReceiptAnalysis,
  DocumentStatus,
  DocumentType,
  EpdReceiptAnalysis,
  ReceiptLineItem,
  ReceiptStructuredResult,
} from "@/lib/documents/types";

const EPD_KEYWORDS = [
  "епд",
  "единый платежный документ",
  "квитанц",
  "лицевой счет",
  "лицевой счёт",
  "итого к оплате",
  "начислено",
  "задолженность",
  "поставщик",
  "услуга",
  "расчетный период",
  "расчётный период",
];

const BANK_KEYWORDS = [
  "kaspi",
  "halyk",
  "homebank",
  "jusan",
  "forte",
  "bcc",
  "centercredit",
  "чек",
  "квитанция об оплате",
  "платеж успешно",
  "платёж успешно",
  "операция успешно",
  "транзакция",
  "комиссия",
  "получатель",
];

function normalizeText(text: string) {
  return text.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function normalizeForSearch(text: string) {
  return normalizeText(text).toLowerCase().replace(/ё/g, "е");
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
      return match[1].trim().replace(/\s{2,}/g, " ");
    }
  }

  return undefined;
}

function numberMatch(text: string, patterns: RegExp[]) {
  return normalizeNumber(firstMatch(text, patterns));
}

function compactLineValue(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  return value
    .replace(/\s{2,}/g, " ")
    .replace(/[|]+$/g, "")
    .trim()
    .slice(0, 160);
}

export function classifyDocument(text: string): DocumentType {
  const normalized = normalizeForSearch(text);
  const epdScore = EPD_KEYWORDS.filter((keyword) =>
    normalized.includes(keyword)
  ).length;
  const bankScore = BANK_KEYWORDS.filter((keyword) =>
    normalized.includes(keyword)
  ).length;

  if (bankScore >= 2 && bankScore >= epdScore) {
    return "bank_payment_receipt";
  }

  if (epdScore >= 2) {
    return "epd_receipt";
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
      /тоо|ип |ао |кск|оси|осі|поставщик|услугодатель/i.test(line) &&
      line.length >= 4 &&
      line.length <= 140
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

      const amount = normalizeNumber(raw.match(/(-?\d[\d\s]*[,.]\d{1,2})\s*(?:₸|тг|kzt)?\s*$/i)?.[1]);

      if (amount === undefined) {
        return items;
      }

      items.push({
        raw,
        amount,
        service: raw.replace(/-?\d[\d\s]*[,.]\d{1,2}\s*(?:₸|тг|kzt)?\s*$/i, "").trim(),
      });

      return items;
    }, [])
    .slice(0, 30);
}

function extractionConfidence(found: unknown[], total: number) {
  const score = found.filter((item) => item !== undefined && item !== "").length / total;

  return Math.max(0.1, Math.min(0.95, Number(score.toFixed(2))));
}

export function extractEpdReceiptAnalysis(text: string): EpdReceiptAnalysis {
  const compact = normalizeText(text);
  const period = firstMatch(compact, [
    /(?:период|расчетный период|расчётный период)\s*[:\-]?\s*([а-яёa-z0-9.\-/ ]{4,40})/i,
    /(?:за)\s+([а-яё]+\s+20\d{2})/i,
    /\b((?:0[1-9]|1[0-2])[./-]20\d{2})\b/i,
  ]);
  const documentDate = firstMatch(compact, [
    /(?:дата документа|дата квитанции)\s*[:\-]?\s*(\d{2}[./-]\d{2}[./-]20\d{2})/i,
  ]);
  const formationDate = firstMatch(compact, [
    /(?:сформирован[ао]?|дата формирования)\s*[:\-]?\s*(\d{2}[./-]\d{2}[./-]20\d{2})/i,
  ]);
  const accountNumber = firstMatch(compact, [
    /(?:лицев(?:ой|ого)?\s*(?:счет|счёт)|л\/с|лс)\s*[:№#\-]?\s*([0-9]{4,24})/i,
    /(?:дербес\s*шот)\s*[:№#\-]?\s*([0-9]{4,24})/i,
  ]);
  const address = compactLineValue(
    firstMatch(compact, [
      /(?:адрес|мекенжай)\s*[:\-]?\s*([^|]{8,160}?)(?:\s{2,}| лицев| период| поставщик|$)/i,
    ])
  );
  const payerName = compactLineValue(
    firstMatch(compact, [
      /(?:фио|плательщик|абонент|собственник)\s*[:\-]?\s*([а-яёa-z .-]{5,100})/i,
    ])
  );
  const previousBalance = numberMatch(compact, [
    /(?:входящее\s*сальдо|сальдо\s*на\s*начало|предыдущее\s*сальдо|предыдущий\s*долг)\s*[:\-]?\s*(-?\d[\d\s]*[,.]\d{1,2})/i,
  ]);
  const chargesAmount = numberMatch(compact, [
    /(?:начислено|начисления)\s*[:\-]?\s*(-?\d[\d\s]*[,.]\d{1,2})/i,
  ]);
  const paymentsShown = numberMatch(compact, [
    /(?:оплачено|оплата|платежи|платежи\s*учтены|платежи\s*за\s*период)\s*[:\-]?\s*(-?\d[\d\s]*[,.]\d{1,2})/i,
  ]);
  const debtAmount = numberMatch(compact, [
    /(?:задолженность|долг|сальдо)\s*[:\-]?\s*(-?\d[\d\s]*[,.]\d{1,2})/i,
  ]);
  const overpaymentAmount = numberMatch(compact, [
    /(?:переплата)\s*[:\-]?\s*(-?\d[\d\s]*[,.]\d{1,2})/i,
  ]);
  const totalDue = numberMatch(compact, [
    /(?:итого\s*к\s*оплате|к\s*оплате|всего\s*к\s*оплате|сумма\s*к\s*оплате)\s*[:\-]?\s*(-?\d[\d\s]*[,.]\d{1,2})/i,
    /(?:итого|всего)\s*[:\-]?\s*(-?\d[\d\s]*[,.]\d{1,2})/i,
  ]);
  const suppliers = extractSuppliers(text);
  const lineItems = extractLineItems(text);
  const services = Array.from(
    new Set(
      lineItems
        .map((item) => item.service)
        .filter((item): item is string => Boolean(item && item.length >= 3))
    )
  ).slice(0, 12);
  const amountDue = totalDue ?? debtAmount;
  const missingFields = [
    accountNumber ? null : "accountNumber",
    period ? null : "period",
    amountDue === undefined ? "amountDue" : null,
    suppliers.length > 0 ? null : "suppliers",
  ].filter((item): item is string => Boolean(item));
  const warnings = [
    missingFields.length ? `Missing fields: ${missingFields.join(", ")}.` : null,
  ].filter((item): item is string => Boolean(item));

  return {
    documentType: "epd_receipt",
    period,
    documentDate,
    formationDate,
    accountNumber,
    address,
    payerName,
    previousBalance,
    chargesAmount,
    paymentsShown,
    debtAmount,
    overpaymentAmount,
    totalDue,
    amountDue,
    suppliers,
    services,
    lineItems,
    missingFields,
    warnings,
  };
}

function detectBankName(text: string) {
  const normalized = normalizeForSearch(text);

  if (normalized.includes("kaspi")) return "Kaspi";
  if (normalized.includes("halyk") || normalized.includes("homebank")) return "Halyk";
  if (normalized.includes("jusan")) return "Jusan";
  if (normalized.includes("forte")) return "Forte";
  if (normalized.includes("centercredit") || normalized.includes("банк центркредит") || normalized.includes("bcc")) return "Bank CenterCredit";

  return undefined;
}

function detectPaymentStatus(text: string): BankPaymentReceiptAnalysis["paymentStatus"] {
  const normalized = normalizeForSearch(text);

  if (/отмен|возврат|cancel/.test(normalized)) return "cancelled";
  if (/ошиб|неуспеш|отклон|failed|declined/.test(normalized)) return "failed";
  if (/обработ|ожидан|processing|в обработке/.test(normalized)) return "processing";
  if (/успеш|исполнен|проведен|проведен|оплачено|төленді|success/.test(normalized)) return "successful";

  return "unknown";
}

export function extractBankPaymentReceiptAnalysis(
  text: string
): BankPaymentReceiptAnalysis {
  const compact = normalizeText(text);
  const bankName = detectBankName(text);
  const paymentStatus = detectPaymentStatus(text);
  const paymentDate = firstMatch(compact, [
    /(?:дата\s*(?:оплаты|платежа|операции)?|оплачено|проведено)\s*[:\-]?\s*(\d{2}[./-]\d{2}[./-]20\d{2})/i,
    /\b(\d{2}[./-]\d{2}[./-]20\d{2})\b/,
  ]);
  const paymentTime = firstMatch(compact, [
    /(?:время)\s*[:\-]?\s*(\d{2}:\d{2}(?::\d{2})?)/i,
    /\b(\d{2}:\d{2}(?::\d{2})?)\b/,
  ]);
  const amount = numberMatch(compact, [
    /(?:сумма\s*(?:платежа|оплаты)?|оплачено|платеж|платёж)\s*[:\-]?\s*(-?\d[\d\s]*[,.]\d{1,2})\s*(?:₸|тг|kzt)?/i,
    /(-?\d[\d\s]*[,.]\d{1,2})\s*(?:₸|тг|kzt)/i,
  ]);
  const feeAmount = numberMatch(compact, [
    /(?:комиссия|fee)\s*[:\-]?\s*(-?\d[\d\s]*[,.]\d{1,2})\s*(?:₸|тг|kzt)?/i,
  ]);
  const currency = /₸|тг|kzt/i.test(compact) ? "KZT" : undefined;
  const recipientName = compactLineValue(
    firstMatch(compact, [
      /(?:получатель|кому|recipient|поставщик)\s*[:\-]?\s*([^|]{3,140}?)(?:\s{2,}| сумма| услуга| назначение| лицев|$)/i,
    ])
  );
  const serviceName = compactLineValue(
    firstMatch(compact, [
      /(?:услуга|service)\s*[:\-]?\s*([^|]{3,120}?)(?:\s{2,}| сумма| получатель| назначение|$)/i,
    ])
  );
  const purpose = compactLineValue(
    firstMatch(compact, [
      /(?:назначение|purpose|комментарий)\s*[:\-]?\s*([^|]{3,160}?)(?:\s{2,}| сумма| комиссия|$)/i,
    ])
  );
  const accountNumber = firstMatch(compact, [
    /(?:лицев(?:ой|ого)?\s*(?:счет|счёт)|л\/с|лс|account)\s*[:№#\-]?\s*([0-9]{4,24})/i,
  ]);
  const transactionId = firstMatch(compact, [
    /(?:id\s*транзакции|транзакция|transaction\s*id|txn|номер\s*операции)\s*[:№#\-]?\s*([a-z0-9\-]{5,60})/i,
  ]);
  const referenceNumber = firstMatch(compact, [
    /(?:референс|reference|rrn|код\s*авторизации)\s*[:№#\-]?\s*([a-z0-9\-]{5,60})/i,
  ]);
  const payerName = compactLineValue(
    firstMatch(compact, [
      /(?:плательщик|payer|отправитель)\s*[:\-]?\s*([а-яёa-z .-]{5,100})/i,
    ])
  );
  const missingFields = [
    bankName ? null : "bankName",
    paymentStatus !== "unknown" ? null : "paymentStatus",
    paymentDate ? null : "paymentDate",
    amount !== undefined ? null : "amount",
    recipientName ? null : "recipientName",
    accountNumber ? null : "accountNumber",
  ].filter((item): item is string => Boolean(item));
  const warnings = [
    "Банковский чек подтверждает операцию в банке, но сам по себе не доказывает, что ЕРЦ уже учёл оплату на лицевом счёте.",
    feeAmount !== undefined ? "Комиссия выделена отдельно и не прибавляется к сумме оплаты." : null,
    missingFields.length ? `Missing fields: ${missingFields.join(", ")}.` : null,
  ].filter((item): item is string => Boolean(item));

  return {
    documentType: "bank_payment_receipt",
    bankName,
    paymentStatus,
    paymentDate,
    paymentTime,
    amount,
    currency,
    feeAmount,
    recipientName,
    serviceName,
    purpose,
    accountNumber,
    transactionId,
    referenceNumber,
    payerName,
    extractionConfidence: extractionConfidence(
      [bankName, paymentStatus !== "unknown" ? paymentStatus : undefined, paymentDate, amount, recipientName, accountNumber],
      6
    ),
    missingFields,
    warnings,
  };
}

export function extractReceiptStructuredData(
  text: string
): ReceiptStructuredResult {
  const documentType = classifyDocument(text);

  if (documentType === "bank_payment_receipt" || documentType === "payment_receipt") {
    return extractBankPaymentReceiptAnalysis(text);
  }

  if (documentType === "epd_receipt" || documentType === "receipt") {
    return extractEpdReceiptAnalysis(text);
  }

  return {
    documentType,
    missingFields: ["documentType"],
    warnings: [
      "Тип документа не определён; не буду интерпретировать суммы как ЕПД или банковский чек.",
    ],
  };
}

function money(value: number | undefined, currency = "₸") {
  if (value === undefined) {
    return null;
  }

  return `${value.toLocaleString("ru-RU")} ${currency}`;
}

export function buildReceiptSummary(
  result: ReceiptStructuredResult,
  status: DocumentStatus
) {
  if (status === "ocr_required") {
    return [
      "Похоже, в документе нет доступного текстового слоя.",
      "Для скана или фото нужен OCR/vision. Я не буду угадывать данные по картинке без распознавания.",
      "Можно загрузить текстовый PDF или подключить OCR-провайдера для изображений.",
    ].join("\n");
  }

  if (status === "failed") {
    return "Не удалось прочитать документ. Проверьте, что файл не повреждён и не защищён паролем.";
  }

  if (result.documentType === "bank_payment_receipt") {
    return [
      `Я прочитал банковский чек${result.bankName ? ` (${result.bankName})` : ""}.`,
      result.paymentStatus !== "unknown" ? `Статус в банке: ${result.paymentStatus}.` : "Статус платежа: не найден.",
      money(result.amount, result.currency === "KZT" ? "₸" : result.currency) ? `Сумма оплаты: ${money(result.amount, result.currency === "KZT" ? "₸" : result.currency)}.` : "Сумма оплаты: не найдена.",
      result.feeAmount !== undefined ? `Комиссия: ${money(result.feeAmount)} отдельно.` : null,
      result.paymentDate ? `Дата: ${result.paymentDate}${result.paymentTime ? ` ${result.paymentTime}` : ""}.` : "Дата оплаты: не найдена.",
      result.accountNumber ? `Лицевой счёт: ${result.accountNumber}.` : "Лицевой счёт: не найден.",
      result.recipientName ? `Получатель: ${result.recipientName}.` : "Получатель: не найден.",
      "",
      "Важно: чек банка подтверждает банковскую операцию, но не доказывает, что ЕРЦ уже учёл оплату. Для ответа «почему долг» загрузите ЕПД тоже.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (result.documentType === "epd_receipt") {
    return [
      "Я прочитал ЕПД/квитанцию и выделил найденные поля.",
      result.period ? `Период: ${result.period}.` : "Период: не найден.",
      result.accountNumber ? `Лицевой счёт: ${result.accountNumber}.` : "Лицевой счёт: не найден.",
      result.amountDue !== undefined ? `К оплате/долг: ${money(result.amountDue)}.` : "К оплате/долг: не найден.",
      result.paymentsShown !== undefined ? `Оплаты, показанные в ЕПД: ${money(result.paymentsShown)}.` : null,
      result.suppliers.length ? `Поставщики/строки: ${result.suppliers.slice(0, 5).join("; ")}.` : "Поставщики: не удалось надёжно выделить.",
      "",
      "Можно загрузить банковский чек и спросить: «Почему долг, если оплатил?» — я сравню документы между собой.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "Документ принят, но я не смог надёжно определить его тип.",
    "Я не буду угадывать, ЕПД это или банковский чек. Загрузите более читаемый файл или задайте вопрос по конкретному полю.",
  ].join("\n");
}
