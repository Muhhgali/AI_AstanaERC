import type {
  BankPaymentReceiptAnalysis,
  DocumentRelationship,
  DocumentSetAnalysis,
  EpdReceiptAnalysis,
  ReceiptStructuredResult,
  ReconciliationSignal,
  ResidentDocumentRecord,
} from "@/lib/documents/types";

function isEpd(result: ReceiptStructuredResult | null | undefined): result is EpdReceiptAnalysis {
  return result?.documentType === "epd_receipt" || result?.documentType === "receipt";
}

function isBankPayment(
  result: ReceiptStructuredResult | null | undefined
): result is BankPaymentReceiptAnalysis {
  return (
    result?.documentType === "bank_payment_receipt" ||
    result?.documentType === "payment_receipt"
  );
}

function normalize(value: string | undefined) {
  return value?.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/gi, " ").trim();
}

function money(value: number | undefined) {
  return value === undefined ? "не найдено" : `${value.toLocaleString("ru-RU")} ₸`;
}

function almostEqual(a: number | undefined, b: number | undefined) {
  if (a === undefined || b === undefined) {
    return false;
  }

  return Math.abs(a - b) <= 1;
}

function hasRecipientOverlap(epd: EpdReceiptAnalysis, payment: BankPaymentReceiptAnalysis) {
  const recipient = normalize(payment.recipientName ?? payment.serviceName ?? payment.purpose);

  if (!recipient) {
    return false;
  }

  return [...epd.suppliers, ...epd.services].some((item) => {
    const normalized = normalize(item);

    return Boolean(
      normalized &&
        (recipient.includes(normalized) ||
          normalized.includes(recipient) ||
          (recipient.includes("ерц") && normalized.includes("ерц")) ||
          (recipient.includes("астана") && normalized.includes("астана")))
    );
  });
}

function pushSignal(signals: ReconciliationSignal[], signal: ReconciliationSignal) {
  signals.push(signal);
}

function chooseRelationship(params: {
  signals: ReconciliationSignal[];
  epd?: EpdReceiptAnalysis;
  payments: BankPaymentReceiptAnalysis[];
}): DocumentRelationship {
  const { signals, epd, payments } = params;

  if (!epd || payments.length === 0) {
    return "ambiguous";
  }

  if (signals.some((signal) => signal.type === "account_mismatch")) {
    return "no_match";
  }

  const positive = signals.filter((signal) => signal.severity === "positive");
  const hasAccount = signals.some((signal) => signal.type === "account_match");
  const hasAmount = signals.some((signal) => signal.type === "amount_match");
  const hasRecipient = signals.some((signal) => signal.type === "recipient_match");
  const amountOnly =
    hasAmount && !hasAccount && !hasRecipient && positive.length <= 1;

  if (amountOnly) {
    return "ambiguous";
  }

  if (hasAccount && (hasRecipient || hasAmount)) {
    return "strong_match";
  }

  if (positive.length >= 2) {
    return "probable_match";
  }

  return "ambiguous";
}

export function analyzeDocumentSet(
  documents: ResidentDocumentRecord[]
): DocumentSetAnalysis {
  const readyDocuments = documents.filter((document) => document.status === "ready");
  const epd = readyDocuments.map((document) => document.structured_result).find(isEpd);
  const payments = readyDocuments
    .map((document) => document.structured_result)
    .filter(isBankPayment);
  const signals: ReconciliationSignal[] = [];
  const timeline: string[] = [];
  const missingEvidence: string[] = [];

  if (!epd) {
    missingEvidence.push("ЕПД/квитанция с начислением");
  } else {
    timeline.push(
      `ЕПД${epd.period ? ` за ${epd.period}` : ""}: к оплате/долг ${money(
        epd.amountDue
      )}.`
    );
  }

  if (payments.length === 0) {
    missingEvidence.push("банковский чек оплаты");
  }

  const paymentTotal = payments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0);

  for (const payment of payments) {
    timeline.push(
      `${payment.bankName ?? "Банк"}${payment.paymentDate ? ` ${payment.paymentDate}` : ""}: ${
        payment.paymentStatus
      }, сумма ${money(payment.amount)}.`
    );

    if (payment.paymentStatus === "successful") {
      pushSignal(signals, {
        type: "status_successful",
        severity: "info",
        message:
          "В банковском чеке статус успешный. Это подтверждает операцию в банке, но не факт учёта в ЕРЦ.",
      });
    } else if (payment.paymentStatus !== "unknown") {
      pushSignal(signals, {
        type: "status_not_successful",
        severity: "negative",
        message: `Статус банковского платежа: ${payment.paymentStatus}.`,
      });
    }

    if (payment.paymentDate) {
      pushSignal(signals, {
        type: "date_available",
        severity: "info",
        message: `Дата банковской операции найдена: ${payment.paymentDate}. Правило учёта по датам нужно брать только из проверенной базы знаний.`,
      });
    }
  }

  if (epd) {
    if (!epd.accountNumber) {
      missingEvidence.push("лицевой счёт в ЕПД");
    }

    for (const payment of payments) {
      if (!payment.accountNumber) {
        missingEvidence.push("лицевой счёт в банковском чеке");
      } else if (epd.accountNumber && payment.accountNumber === epd.accountNumber) {
        pushSignal(signals, {
          type: "account_match",
          severity: "positive",
          message: `Лицевой счёт совпадает: ${payment.accountNumber}.`,
        });
      } else if (epd.accountNumber) {
        pushSignal(signals, {
          type: "account_mismatch",
          severity: "negative",
          message: `Лицевой счёт не совпадает: в ЕПД ${epd.accountNumber}, в чеке ${payment.accountNumber}.`,
        });
      }

      if (hasRecipientOverlap(epd, payment)) {
        pushSignal(signals, {
          type: "recipient_match",
          severity: "positive",
          message: "Получатель/услуга в чеке похожи на поставщика/строку из ЕПД.",
        });
      } else if (!payment.recipientName && !payment.serviceName && !payment.purpose) {
        pushSignal(signals, {
          type: "recipient_missing",
          severity: "warning",
          message: "В банковском чеке не найден получатель/назначение платежа.",
        });
      }
    }

    if (almostEqual(paymentTotal, epd.amountDue)) {
      pushSignal(signals, {
        type: "amount_match",
        severity: "positive",
        message: `Сумма банковских оплат совпадает с суммой в ЕПД: ${money(paymentTotal)}.`,
      });

      if (
        !signals.some((signal) => signal.type === "account_match") &&
        !signals.some((signal) => signal.type === "recipient_match")
      ) {
        pushSignal(signals, {
          type: "amount_only",
          severity: "warning",
          message:
            "Совпала только сумма. Этого недостаточно, чтобы считать документы связанными.",
        });
      }
    } else if (epd.amountDue !== undefined && paymentTotal > 0 && paymentTotal < epd.amountDue) {
      pushSignal(signals, {
        type: "partial_payment",
        severity: "warning",
        message: `Сумма чеков ${money(paymentTotal)} меньше суммы в ЕПД ${money(
          epd.amountDue
        )}. Это похоже на частичную оплату или неполный набор чеков.`,
      });
    } else if (epd.amountDue !== undefined && paymentTotal > epd.amountDue) {
      pushSignal(signals, {
        type: "over_payment",
        severity: "warning",
        message: `Сумма чеков ${money(paymentTotal)} больше суммы в ЕПД ${money(
          epd.amountDue
        )}. Нужна проверка назначения/периода платежей.`,
      });
    }
  }

  if (epd?.amountDue === undefined) {
    missingEvidence.push("сумма к оплате/долг в ЕПД");
  }

  if (epd?.carriedDebtAmount !== undefined && epd.carriedDebtAmount > 0) {
    pushSignal(signals, {
      type: "carried_debt",
      severity: "warning",
      message: `В ЕПД виден перенос остатка прошлого периода после оплат: ${money(
        epd.carriedDebtAmount
      )}. Поэтому итог может состоять из старого остатка плюс новое начисление.`,
    });
  }

  if (
    epd?.deferredOverpaymentAmount !== undefined &&
    epd.deferredOverpaymentAmount > 0
  ) {
    pushSignal(signals, {
      type: "deferred_overpayment",
      severity: "info",
      message: `В ЕПД видна оплата больше предыдущего сальдо: излишек ${money(
        epd.deferredOverpaymentAmount
      )} может храниться на транзитном счёте собственника и учитываться следующим расчётным периодом. Его нельзя автоматически вычитать из всех текущих начислений без проверки.`,
    });
  }

  if (epd?.paymentsShown !== undefined) {
    pushSignal(signals, {
      type: "epd_internal_payment",
      severity: "info",
      message: `В самом ЕПД уже отражены оплаты: ${money(
        epd.paymentsShown
      )}. Их нужно учитывать отдельно от банковских чеков, чтобы не посчитать оплату дважды.`,
    });
  }

  const relationship = chooseRelationship({ signals, epd, payments });

  return {
    relationship,
    epd,
    payments,
    paymentTotal: payments.length ? paymentTotal : undefined,
    matchedPaymentTotal: relationship === "strong_match" || relationship === "probable_match" ? paymentTotal : undefined,
    signals,
    timeline,
    missingEvidence: Array.from(new Set(missingEvidence)),
  };
}

function relationshipText(relationship: DocumentRelationship) {
  switch (relationship) {
    case "strong_match":
      return "Документы хорошо совпадают между собой.";
    case "probable_match":
      return "Документы, вероятно, относятся к одной оплате, но есть не все подтверждения.";
    case "no_match":
      return "Документы не выглядят связанными.";
    case "ambiguous":
    default:
      return "Данных недостаточно для уверенной связки документов.";
  }
}

export function buildDocumentSetAnswer(params: {
  question: string;
  documents: ResidentDocumentRecord[];
}) {
  const analysis = analyzeDocumentSet(params.documents);
  const positive = analysis.signals.filter((signal) => signal.severity === "positive");
  const warnings = analysis.signals.filter((signal) => signal.severity === "warning" || signal.severity === "negative");

  if (params.documents.length === 0) {
    return "Документы не найдены в этой сессии.";
  }

  if (!analysis.epd && analysis.payments.length > 0) {
    return [
      "Я вижу банковский чек, но не вижу ЕПД с начислением/долгом.",
      `По чеку: сумма ${money(analysis.paymentTotal)}, статус банка: ${analysis.payments[0]?.paymentStatus ?? "не найден"}.`,
      "Важно: успешный чек банка не доказывает, что ЕРЦ уже учёл оплату на лицевом счёте.",
      "Чтобы ответить «почему долг, если оплатил», загрузите ЕПД за нужный период.",
    ].join("\n");
  }

  if (analysis.epd && analysis.payments.length === 0) {
    return [
      `По ЕПД: период ${analysis.epd.period ?? "не найден"}, к оплате/долг ${money(
        analysis.epd.amountDue
      )}.`,
      "Банковского чека в активном наборе нет, поэтому я не могу подтвердить факт оплаты.",
      "Загрузите чек банка — сравню лицевой счёт, сумму, получателя и дату.",
    ].join("\n");
  }

  return [
    relationshipText(analysis.relationship),
    analysis.epd
      ? `ЕПД: ${analysis.epd.period ?? "период не найден"}, лицевой счёт ${
          analysis.epd.accountNumber ?? "не найден"
        }, к оплате/долг ${money(analysis.epd.amountDue)}.`
      : null,
    analysis.payments.length
      ? `Чеки банка: ${analysis.payments.length}, сумма без комиссии ${money(
          analysis.paymentTotal
        )}.`
      : null,
    positive.length ? `Что совпало: ${positive.map((signal) => signal.message).join(" ")}` : null,
    warnings.length ? `Что настораживает: ${warnings.map((signal) => signal.message).join(" ")}` : null,
    analysis.missingEvidence.length
      ? `Не хватает: ${analysis.missingEvidence.join(", ")}.`
      : null,
    "Я не утверждаю, что ЕРЦ уже получил/учёл оплату, если это не видно из ЕПД или проверенной базы. Банковский успех — это только статус операции в банке.",
  ]
    .filter(Boolean)
    .join("\n");
}
