import type {
  ReceiptStructuredResult,
  ResidentDocumentRecord,
} from "@/lib/documents/types";

function money(value: number | undefined) {
  return value === undefined ? null : String(value);
}

function normalizeQuestion(question: string) {
  return question.toLowerCase().replace(/ё/g, "е");
}

function getStructured(document: ResidentDocumentRecord) {
  return document.structured_result ?? null;
}

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

export function isDocumentFollowUpQuestion(question: string) {
  const normalized = normalizeQuestion(question);

  return hasAny(normalized, [
    "документ",
    "pdf",
    "квитанц",
    "епд",
    "сумм",
    "итого",
    "долг",
    "задолж",
    "сальдо",
    "период",
    "месяц",
    "строк",
    "поставщик",
    "начисл",
    "оплат",
    "платеж",
    "платёж",
    "здесь",
    "это поле",
    "эта строка",
  ]);
}

function answerFromReceipt(question: string, receipt: ReceiptStructuredResult) {
  const normalized = normalizeQuestion(question);

  if (hasAny(normalized, ["период", "месяц", "за какой"])) {
    return receipt.period
      ? `В документе указан период: ${receipt.period}.`
      : "В извлечённом тексте документа период не найден. Я не буду его угадывать.";
  }

  if (hasAny(normalized, ["долг", "задолж", "сальдо"])) {
    return receipt.previousDebt !== undefined
      ? `В документе найден долг/сальдо: ${money(receipt.previousDebt)}. Для точной трактовки поля нужны утверждённые правила компании.`
      : "В извлечённых данных я не нашёл отдельное поле долга/задолженности.";
  }

  if (hasAny(normalized, ["оплат", "учтен", "учтен", "платеж", "платёж"])) {
    if (receipt.paymentAmount !== undefined || receipt.paymentDate) {
      return [
        receipt.paymentAmount !== undefined
          ? `В документе найдена оплата: ${money(receipt.paymentAmount)}.`
          : null,
        receipt.paymentDate ? `Дата оплаты: ${receipt.paymentDate}.` : null,
        "Если нужно сравнить с предыдущим месяцем или фактом поступления после 25 числа, нужен соответствующий документ/правило.",
      ]
        .filter(Boolean)
        .join("\n");
    }

    return "В извлечённых данных я не нашёл отдельную оплату или дату оплаты.";
  }

  if (hasAny(normalized, ["поставщик", "начислил", "услуга", "строка"])) {
    if (receipt.suppliers.length > 0) {
      return `В документе удалось выделить такие строки/поставщиков: ${receipt.suppliers.join("; ")}.`;
    }

    if (receipt.lineItems.length > 0) {
      return receipt.lineItems
        .slice(0, 8)
        .map((item) => `- ${item.raw}`)
        .join("\n");
    }

    return "В извлечённых данных я не смог надёжно выделить поставщиков или строки услуг.";
  }

  if (hasAny(normalized, ["сумм", "итого", "к оплате", "почему такая"])) {
    return receipt.totalDue !== undefined
      ? [
          `Итого к оплате в документе: ${money(receipt.totalDue)}.`,
          receipt.previousDebt !== undefined
            ? `Также найден долг/сальдо: ${money(receipt.previousDebt)}.`
            : null,
          receipt.lineItems.length > 0
            ? "Найденные строки с суммами:\n" +
              receipt.lineItems
                .slice(0, 8)
                .map((item) => `- ${item.raw}`)
                .join("\n")
            : "Разбивку по строкам надёжно выделить не удалось.",
        ]
          .filter(Boolean)
          .join("\n")
      : "В извлечённых данных я не нашёл поле «итого к оплате».";
  }

  return null;
}

export function buildDocumentGroundedAnswer(params: {
  question: string;
  document: ResidentDocumentRecord;
}) {
  const { document, question } = params;

  if (document.status === "deleted") {
    return "Этот документ удалён и больше недоступен для анализа.";
  }

  if (document.status === "ocr_required") {
    return "По этому PDF пока нельзя отвечать: он выглядит как скан, а OCR ещё не подключён. Я не буду угадывать данные по изображению.";
  }

  if (document.status !== "ready") {
    return "Документ ещё не готов к вопросам. Попробуйте после завершения обработки.";
  }

  const structured = getStructured(document);

  if (!structured) {
    return "По документу нет структурированных данных. Я не буду придумывать ответ.";
  }

  const receiptAnswer = answerFromReceipt(question, structured);

  if (receiptAnswer) {
    return receiptAnswer;
  }

  return [
    "Я могу отвечать только по данным, которые удалось извлечь из загруженного документа.",
    structured.period ? `Период: ${structured.period}.` : null,
    structured.totalDue !== undefined
      ? `Итого к оплате: ${structured.totalDue}.`
      : null,
    structured.accountNumber
      ? `Лицевой счёт найден: ${structured.accountNumber}.`
      : null,
    "Если вопрос про правило начисления, мне нужна verified база знаний компании; если поля нет в PDF — я не буду его угадывать.",
  ]
    .filter(Boolean)
    .join("\n");
}
