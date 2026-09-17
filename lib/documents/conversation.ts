import type {
  BankPaymentReceiptAnalysis,
  EpdReceiptAnalysis,
  ReceiptStructuredResult,
  ResidentDocumentRecord,
} from "@/lib/documents/types";
import { buildDocumentSetAnswer } from "./reconciliation";

function money(value: number | undefined) {
  return value === undefined ? null : `${value.toLocaleString("ru-RU")} ₸`;
}

function normalizeQuestion(question: string) {
  return question.toLowerCase().replace(/ё/g, "е");
}

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function isEpd(result: ReceiptStructuredResult): result is EpdReceiptAnalysis {
  return result.documentType === "epd_receipt" || result.documentType === "receipt";
}

function isBank(result: ReceiptStructuredResult): result is BankPaymentReceiptAnalysis {
  return (
    result.documentType === "bank_payment_receipt" ||
    result.documentType === "payment_receipt"
  );
}

export function isDocumentFollowUpQuestion(question: string) {
  const normalized = normalizeQuestion(question);

  return hasAny(normalized, [
    "документ",
    "pdf",
    "файл",
    "скрин",
    "фото",
    "чек",
    "квитанц",
    "епд",
    "сумм",
    "итого",
    "долг",
    "задолж",
    "сальдо",
    "переплат",
    "транзит",
    "период",
    "месяц",
    "строк",
    "поставщик",
    "начисл",
    "оплат",
    "платеж",
    "платеж",
    "учтен",
    "учтен",
    "почему долг",
    "если оплатил",
    "здесь",
    "это поле",
    "эта строка",
  ]);
}

function answerFromEpd(question: string, epd: EpdReceiptAnalysis) {
  const normalized = normalizeQuestion(question);
  const parts: string[] = [];

  if (hasAny(normalized, ["период", "месяц", "за какой"])) {
    parts.push(
      epd.period
        ? `В ЕПД указан период: ${epd.period}.`
        : "В извлечённых данных ЕПД период не найден. Я не буду его угадывать."
    );
  }

  if (hasAny(normalized, ["долг", "задолж", "сальдо"])) {
    parts.push(
      [
        epd.debtAmount !== undefined ? `Долг/задолженность в ЕПД: ${money(epd.debtAmount)}.` : null,
        epd.previousBalance !== undefined ? `Предыдущее сальдо: ${money(epd.previousBalance)}.` : null,
        epd.paymentsShown !== undefined ? `Оплаты, показанные в ЕПД: ${money(epd.paymentsShown)}.` : null,
        epd.carriedDebtAmount !== undefined ? `Перенесённый остаток после оплат: ${money(epd.carriedDebtAmount)}.` : null,
        epd.deferredOverpaymentAmount !== undefined ? `Переплата/излишек после закрытия сальдо: ${money(epd.deferredOverpaymentAmount)}.` : null,
        epd.chargesAmount !== undefined ? `Новое начисление: ${money(epd.chargesAmount)}.` : null,
        epd.amountDue !== undefined ? `К оплате/итого: ${money(epd.amountDue)}.` : null,
        ...(epd.calculationNotes ?? []),
        epd.debtAmount === undefined && epd.previousBalance === undefined && epd.amountDue === undefined
          ? "В ЕПД не найдено отдельное поле долга/сальдо/к оплате."
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (hasAny(normalized, ["оплат", "учтен", "учтен", "платеж"]) && !hasAny(normalized, ["сумм", "итого", "к оплате"])) {
    parts.push(
      [
        epd.paymentsShown !== undefined
          ? `В самом ЕПД найдено поле оплат: ${money(epd.paymentsShown)}.`
          : "В ЕПД не найдено отдельное поле оплат.",
        epd.carriedDebtAmount !== undefined
          ? `Остаток после предыдущего сальдо и оплат: ${money(epd.carriedDebtAmount)}.`
          : null,
        epd.deferredOverpaymentAmount !== undefined
          ? `Оплата больше предыдущего сальдо на ${money(epd.deferredOverpaymentAmount)}. Этот излишек может храниться на транзитном счёте собственника и учитываться в следующем расчётном периоде.`
          : null,
        ...(epd.calculationNotes ?? []),
        "Если нужно проверить банковский чек, загрузите его вместе с ЕПД. Чек банка сам по себе не доказывает, что ЕРЦ уже учёл оплату.",
      ].join("\n")
    );
  }

  if (
    hasAny(normalized, ["переплат", "транзит", "больше чем сальдо", "следующ"])
  ) {
    parts.push(
      [
        epd.deferredOverpaymentAmount !== undefined
          ? `В ЕПД видна переплата/излишек после закрытия предыдущего сальдо: ${money(epd.deferredOverpaymentAmount)}.`
          : "Если оплата больше предыдущего сальдо, это нужно трактовать как возможную переплату/излишек, а не как ошибку начисления.",
        "Такие деньги могут храниться на транзитных счетах собственника и учитываться в следующем расчётном периоде или по правилам конкретного поставщика.",
        "Поэтому бот не должен самовольно вычитать переплату из всех текущих начислений. Главные ориентиры — колонка «К оплате», следующий ЕПД и внутренняя проверка зачисления.",
        ...(epd.calculationNotes ?? []),
      ].join("\n")
    );
  }

  if (
    hasAny(normalized, ["домофон", "не приш", "нет строк", "аннулир", "обнул"])
  ) {
    parts.push(
      [
        "Если по услуге были оплаты за прошлый период и они полностью закрыли сальдо, долг по этой строке может обнулиться.",
        "Это не означает автоматическую переплату: если оплачено ровно сколько нужно, строка закрывается без дополнительной суммы к оплате.",
        "Чтобы проверить конкретную услугу, нужны строка ЕПД и чеки оплат за прошлый период.",
      ].join("\n")
    );
  }

  if (hasAny(normalized, ["поставщик", "начислил", "услуга", "строка"])) {
    if (epd.suppliers.length > 0) {
      parts.push(
        `В ЕПД удалось выделить поставщиков/строки: ${epd.suppliers.join("; ")}.`
      );
    } else if (epd.lineItems.length > 0) {
      parts.push(
        epd.lineItems
          .slice(0, 8)
          .map((item) => `- ${item.raw}`)
          .join("\n")
      );
    } else {
      parts.push(
        "В извлечённых данных ЕПД я не смог надёжно выделить поставщиков или строки услуг."
      );
    }
  }

  if (hasAny(normalized, ["сумм", "итого", "к оплате", "почему такая"])) {
    parts.push(
      epd.amountDue !== undefined
        ? [
            `Итого/к оплате в ЕПД: ${money(epd.amountDue)}.`,
            epd.chargesAmount !== undefined ? `Начислено: ${money(epd.chargesAmount)}.` : null,
            epd.paymentsShown !== undefined ? `Оплаты в ЕПД: ${money(epd.paymentsShown)}.` : null,
            epd.deferredOverpaymentAmount !== undefined ? `Возможная переплата/излишек к учёту позже: ${money(epd.deferredOverpaymentAmount)}.` : null,
            epd.lineItems.length > 0
              ? "Найденные строки с суммами:\n" +
                epd.lineItems
                  .slice(0, 8)
                  .map((item) => `- ${item.raw}`)
                  .join("\n")
              : null,
          ]
            .filter(Boolean)
            .join("\n")
        : "В извлечённых данных ЕПД я не нашёл поле «итого к оплате»."
    );
  }

  if (parts.length > 0) {
    return parts.join("\n");
  }

  return null;
}

function answerFromBank(question: string, receipt: BankPaymentReceiptAnalysis) {
  const normalized = normalizeQuestion(question);

  if (hasAny(normalized, ["сумм", "сколько", "оплат"])) {
    return [
      receipt.amount !== undefined ? `Сумма оплаты по банковскому чеку: ${money(receipt.amount)}.` : "Сумма оплаты в чеке не найдена.",
      receipt.feeAmount !== undefined ? `Комиссия отдельно: ${money(receipt.feeAmount)}.` : null,
      receipt.lineItems?.length
        ? "Строки оплаты в чеке:\n" +
          receipt.lineItems
            .slice(0, 10)
            .map((item) =>
              `- ${[item.service, money(item.amount)].filter(Boolean).join(": ")}`
            )
            .join("\n")
        : null,
      "Комиссия не считается суммой оплаты по ЕПД.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (hasAny(normalized, ["статус", "успеш", "прошел", "прошел"])) {
    return [
      `Статус в банковском чеке: ${receipt.paymentStatus}.`,
      "Важно: успешный статус в банке не означает автоматически, что ЕРЦ уже учёл оплату на лицевом счёте.",
    ].join("\n");
  }

  if (hasAny(normalized, ["дата", "когда"])) {
    return receipt.paymentDate
      ? `Дата банковской операции: ${receipt.paymentDate}${receipt.paymentTime ? ` ${receipt.paymentTime}` : ""}.`
      : "Дата операции в чеке не найдена.";
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
    return "По этому документу пока нельзя отвечать: OCR/vision не смог распознать текст. Загрузите текстовый PDF или более чёткое фото.";
  }

  if (document.status !== "ready") {
    return "Документ ещё не готов к вопросам. Попробуйте после завершения обработки.";
  }

  const structured = document.structured_result;

  if (!structured) {
    return "По документу нет структурированных данных. Я не буду придумывать ответ.";
  }

  const answer = isEpd(structured)
    ? answerFromEpd(question, structured)
    : isBank(structured)
      ? answerFromBank(question, structured)
      : null;

  if (answer) {
    return answer;
  }

  return [
    "Я могу отвечать только по данным, которые удалось извлечь из загруженного документа.",
    isEpd(structured) && structured.period ? `Период: ${structured.period}.` : null,
    isEpd(structured) && structured.amountDue !== undefined
      ? `К оплате/долг: ${money(structured.amountDue)}.`
      : null,
    isBank(structured) && structured.amount !== undefined
      ? `Сумма банковского чека: ${money(structured.amount)}.`
      : null,
    "Если вопрос про «почему долг, если оплатил», нужны оба документа: ЕПД и банковский чек.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function isDocumentSetReconciliationQuestion(question: string) {
  const normalized = normalizeQuestion(question);

  return hasAny(normalized, [
    "почему долг",
    "если оплатил",
    "свер",
    "сравн",
    "совпад",
    "учтён",
    "учтен",
    "оба документ",
    "два документ",
    "вместе",
    "чек и епд",
    "епд и чек",
    "банковск",
    "отразил",
    "не отраж",
  ]);
}

export function buildMultiDocumentGroundedAnswer(params: {
  question: string;
  documents: ResidentDocumentRecord[];
}) {
  if (params.documents.length <= 1) {
    const document = params.documents[0];

    return document
      ? buildDocumentGroundedAnswer({ question: params.question, document })
      : "Документ не найден в этой сессии.";
  }

  const ready = params.documents.filter((document) => document.status === "ready");
  const epd = ready.find((document) =>
    document.structured_result
      ? isEpd(document.structured_result)
      : false
  );
  const bank = ready.find((document) =>
    document.structured_result
      ? isBank(document.structured_result)
      : false
  );
  const normalized = normalizeQuestion(params.question);
  const wantsReconciliation =
    isDocumentSetReconciliationQuestion(params.question) ||
    Boolean(
      epd &&
        bank &&
        hasAny(normalized, ["долг", "оплат", "сумм", "итого", "сальдо", "задолж"])
    );

  if (wantsReconciliation) {
    return buildDocumentSetAnswer(params);
  }

  if (
    bank &&
    hasAny(normalized, ["чек", "банк", "kaspi", "halyk", "транзак", "комисс"])
  ) {
    const answer = buildDocumentGroundedAnswer({
      question: params.question,
      document: bank,
    });
    return epd
      ? `${answer}\n\nТакже загружен ЕПД — могу сравнить оплату с начислениями, если спросите «почему долг, если оплатил?»`
      : answer;
  }

  if (epd) {
    const answer = buildDocumentGroundedAnswer({
      question: params.question,
      document: epd,
    });
    return bank
      ? `${answer}\n\nТакже загружен банковский чек — могу сверить документы по запросу.`
      : answer;
  }

  return buildDocumentSetAnswer(params);
}
