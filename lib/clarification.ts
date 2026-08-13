import type {
  RetrievalConfidence,
  RetrievalIntentHint,
} from "./rag/types";
import { normalizeQueryText } from "./rag/queryUnderstanding";

export type ClarificationLanguage = "ru" | "kk";

export type ClarificationAction = "answer" | "clarify" | "fallback" | "handoff";

export type ClarificationReason =
  | "HIGH_CONFIDENCE_ANSWER"
  | "LOW_CONFIDENCE_FALLBACK"
  | "OUT_OF_DOMAIN"
  | "AMBIGUOUS_INTENT"
  | "MISSING_PARAMETER"
  | "PERSONAL_DATA_REQUIRED"
  | "MULTIPLE_POSSIBLE_PROCESSES"
  | "SUPPLIER_AMBIGUITY"
  | "RECEIPT_AMBIGUITY"
  | "CONTACT_AMBIGUITY"
  | "TECHNICAL_AMBIGUITY"
  | "MEDIUM_SAFE_TO_ANSWER";

export type ClarificationCandidate = {
  title?: string | null;
  category?: string | null;
  verified?: boolean | null;
  score?: number | null;
};

export type ClarificationDecision = {
  action: ClarificationAction;
  reason: ClarificationReason;
  missingInformation?: string;
  clarificationQuestion?: string;
  candidateIntents?: string[];
};

export type ClarificationDecisionInput = {
  query: string;
  language: ClarificationLanguage;
  confidence: Pick<RetrievalConfidence, "level" | "decision" | "reasons">;
  intentHints: RetrievalIntentHint[];
  isOutOfDomain: boolean;
  requiresPrivateAccountLookup: boolean;
  candidates?: ClarificationCandidate[];
};

function hasAny(text: string, phrases: string[]) {
  return phrases.some((phrase) => text.includes(phrase));
}

function tokenCount(text: string) {
  return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean).length;
}

function candidateText(candidates: ClarificationCandidate[] = []) {
  return candidates
    .map((candidate) => `${candidate.title ?? ""} ${candidate.category ?? ""}`)
    .join(" ")
    .toLowerCase();
}

function hasHint(input: ClarificationDecisionInput, hints: RetrievalIntentHint[]) {
  return hints.some((hint) => input.intentHints.includes(hint));
}

function isClearHowToPayment(query: string) {
  return (
    hasAny(query, ["как оплат", "оплатить через kaspi", "kaspi"]) &&
    !hasAny(query, [
      "долг",
      "задолж",
      "не отраз",
      "не прош",
      "ошиб",
      "вернуть",
      "двойн",
      "сумм",
      "у меня",
    ])
  );
}

function isSupplierNameOnly(originalQuery: string, normalizedQuery: string) {
  const compact = normalizedQuery.replace(/[?.!,]/g, " ").replace(/\s+/g, " ").trim();
  const mentionsSupplierEntity = /(?:^|\s)(тоо|ип|ооо|service|сервис|кск|пк|жк)(?:\s|$)/i.test(
    originalQuery
  );
  const asksAction = hasAny(compact, [
    "как",
    "где",
    "когда",
    "контакт",
    "телефон",
    "менеджер",
    "услуг",
    "найти",
  ]);

  return mentionsSupplierEntity && !asksAction && tokenCount(compact) <= 5;
}

function ru(question: string) {
  return question;
}

function kk(question: string) {
  return question;
}

function buildDecision(
  action: ClarificationAction,
  reason: ClarificationReason,
  params: Omit<ClarificationDecision, "action" | "reason"> = {}
): ClarificationDecision {
  return {
    action,
    reason,
    ...params,
  };
}

function questionFor(
  input: ClarificationDecisionInput,
  reason: ClarificationReason,
  normalizedQuery: string
) {
  const language = input.language;
  const candidates = candidateText(input.candidates);

  if (reason === "PERSONAL_DATA_REQUIRED") {
    return language === "kk"
      ? kk("Мен жеке лицевой счёт бойынша соманы көре алмаймын. Сізге қарызды қай жерден тексеруді түсіндірейін бе, әлде түбіртектегі нақты жолды талқылаймыз ба?")
      : ru("Я не вижу персональные начисления по лицевому счёту. Вам подсказать, где проверить долг, или разобрать конкретную строку в квитанции?");
  }

  if (reason === "SUPPLIER_AMBIGUITY") {
    const supplierName = input.query.match(/(?:^|\s)(?:ТОО|ИП|ООО|ПК|КСК)\s+[^\n?.!,]{2,80}/i)?.[0]?.trim();

    if (supplierName) {
      return language === "kk"
        ? kk(`${supplierName} бойынша нақты нені білгіңіз келеді: байланыс деректері, қызмет түрі немесе менеджер ме?`)
        : ru(`Что именно хотите узнать про ${supplierName}: контакты, услугу или менеджера?`);
    }

    return language === "kk"
      ? kk("Қай жеткізуші бойынша ақпарат керек: атауы/БСН бойынша іздеу ме, әлде менеджердің байланысы ма?")
      : ru("По какому поставщику нужна информация: хотите найти его по названию/БИН или нужен контакт менеджера?");
  }

  if (reason === "RECEIPT_AMBIGUITY") {
    if (hasAny(normalizedQuery, ["не достав", "бумаж"])) {
      return language === "kk"
        ? kk("Қай түбіртек келмеді: қағаз түбіртек пе, әлде электрондық түбіртек пе?")
        : ru("Какая квитанция не пришла: бумажная в ящик или электронная?");
    }

    if (hasAny(normalizedQuery, ["электрон", "почт"])) {
      return language === "kk"
        ? kk("Электрондық түбіртек бойынша не керек: email-ге қосуды ма, әлде дайын түбіртекті қайдан көруді ме?")
        : ru("Что нужно по электронной квитанции: подключить доставку на email или посмотреть уже сформированную квитанцию?");
    }

    return language === "kk"
      ? kk("Түбіртек бойынша нақты не болды: келмеді ме, сома дұрыс емес пе, әлде төлем онда көрінбей тұр ма?")
      : ru("Что именно произошло с квитанцией: она не пришла, сумма кажется неправильной или оплата в ней не отразилась?");
  }

  if (reason === "CONTACT_AMBIGUITY") {
    return language === "kk"
      ? kk("Қандай байланыс керек: Астана-ЕРЦ телефоны, кеңсе мекенжайы немесе жұмыс уақыты ма?")
      : ru("Какой контакт нужен: телефон Астана-ЕРЦ, адрес офиса или режим работы?");
  }

  if (reason === "TECHNICAL_AMBIGUITY") {
    return language === "kk"
      ? kk("Қай жерде қате болып тұр: сайтқа кіргенде ме, нысанды жібергенде ме, әлде көрсеткіш/өтініш жібергенде ме?")
      : ru("Где именно возникает ошибка: при входе на сайт, при отправке формы или при передаче показаний/обращения?");
  }

  if (reason === "MISSING_PARAMETER" && hasHint(input, ["meter"])) {
    return language === "kk"
      ? kk("Есептегіш бойынша не істегіңіз келеді: ағымдағы көрсеткішті жіберу ме, әлде бұрын жіберілген көрсеткішті түзету ме?")
      : ru("Что нужно сделать со счётчиком: передать текущие показания или исправить уже отправленные?");
  }

  if (reason === "MISSING_PARAMETER" && hasHint(input, ["account", "ownership"])) {
    return language === "kk"
      ? kk("Сізге лицевой счёт нөмірін табу керек пе, әлде пәтер иесін/деректерді өзгерту керек пе?")
      : ru("Вам нужно узнать номер лицевого счёта или изменить владельца/данные по квартире?");
  }

  if (reason === "MULTIPLE_POSSIBLE_PROCESSES" || hasHint(input, ["payment", "billing"])) {
    return language === "kk"
      ? kk("Төлем бойынша нақты не болды: ақша картадан списание болды, бірақ ЕПД-де көрінбейді ме, әлде төлем мүлде өтпеді ме?")
      : ru("Что именно с оплатой: деньги списались, но не отразились в ЕПД, или платёж вообще не прошёл?");
  }

  if (candidates.includes("квитанц")) {
    return language === "kk"
      ? kk("Сұрақ түбіртек туралы ма: жеткізу, сома немесе төлемнің көрінуі бойынша ма?")
      : ru("Вопрос про квитанцию: доставку, сумму или отображение оплаты?");
  }

  return language === "kk"
    ? kk("Нақтылап жіберіңізші: төлем, түбіртек, көрсеткіш, дербес шот, жеткізуші немесе өтініш бойынша сұрап тұрсыз ба?")
    : ru("Уточните, пожалуйста: вопрос про оплату, квитанцию, показания, лицевой счёт, поставщика или обращение?");
}

export function decideClarification(
  input: ClarificationDecisionInput
): ClarificationDecision {
  const normalizedQuery = normalizeQueryText(input.query);
  const candidates = candidateText(input.candidates);

  if (input.isOutOfDomain) {
    return buildDecision("fallback", "OUT_OF_DOMAIN");
  }

  if (input.confidence.level === "high") {
    return buildDecision("answer", "HIGH_CONFIDENCE_ANSWER");
  }

  if (input.confidence.level === "low") {
    return buildDecision("fallback", "LOW_CONFIDENCE_FALLBACK");
  }

  if (input.requiresPrivateAccountLookup || input.query.includes("[ACCOUNT_NUMBER]")) {
    return buildDecision("clarify", "PERSONAL_DATA_REQUIRED", {
      missingInformation: "personal-account-scope",
      clarificationQuestion: questionFor(input, "PERSONAL_DATA_REQUIRED", normalizedQuery),
      candidateIntents: ["check-debt", "explain-receipt-line"],
    });
  }

  if (
    isSupplierNameOnly(input.query, normalizedQuery) ||
    hasHint(input, ["supplier"]) ||
    hasAny(candidates, ["поставщик", "бин", "менеджер"])
  ) {
    return buildDecision("clarify", "SUPPLIER_AMBIGUITY", {
      missingInformation: "supplier-info-type",
      clarificationQuestion: questionFor(input, "SUPPLIER_AMBIGUITY", normalizedQuery),
      candidateIntents: ["supplier-search", "supplier-service", "supplier-manager"],
    });
  }

  if (
    hasHint(input, ["technical"]) ||
    hasAny(normalizedQuery, ["техническ", "не работает", "ошиб", "сайт"]) ||
    hasAny(candidates, ["техническ", "ошибк", "сайт не"])
  ) {
    return buildDecision("clarify", "TECHNICAL_AMBIGUITY", {
      missingInformation: "technical-failure-point",
      clarificationQuestion: questionFor(input, "TECHNICAL_AMBIGUITY", normalizedQuery),
      candidateIntents: ["site-login", "form-submit", "meter-submit", "appeal-submit"],
    });
  }

  if (
    hasHint(input, ["support"]) ||
    hasAny(normalizedQuery, [
      "адрес",
      "офис",
      "режим",
      "график",
      "109",
      "телефон",
      "оператор",
      "специалист",
      "позовите",
      "куда обратиться",
    ]) ||
    (input.query.includes("[ADDRESS]") &&
      hasAny(normalizedQuery, ["когда", "работает", "куда", "обратиться"])) ||
    (hasAny(candidates, ["куда обращаться", "оператор", "официальный сайт"]) &&
      hasAny(normalizedQuery, ["когда", "куда", "работает", "обратиться"]))
  ) {
    return buildDecision("clarify", "CONTACT_AMBIGUITY", {
      missingInformation: "contact-type",
      clarificationQuestion: questionFor(input, "CONTACT_AMBIGUITY", normalizedQuery),
      candidateIntents: ["phone", "office-address", "working-hours"],
    });
  }

  if (
    hasHint(input, ["payment", "billing"]) &&
    !isClearHowToPayment(normalizedQuery)
  ) {
    return buildDecision("clarify", "MULTIPLE_POSSIBLE_PROCESSES", {
      missingInformation: "payment-scenario",
      clarificationQuestion: questionFor(input, "MULTIPLE_POSSIBLE_PROCESSES", normalizedQuery),
      candidateIntents: ["payment-failed", "payment-not-reflected", "remaining-debt"],
    });
  }

  if (
    hasHint(input, ["receipt"]) &&
    !hasAny(normalizedQuery, ["как оплат", "оплатить через"])
  ) {
    return buildDecision("clarify", "RECEIPT_AMBIGUITY", {
      missingInformation: "receipt-scenario",
      clarificationQuestion: questionFor(input, "RECEIPT_AMBIGUITY", normalizedQuery),
      candidateIntents: ["paper-receipt", "email-receipt", "receipt-status", "wrong-amount"],
    });
  }

  if (hasHint(input, ["meter"]) && !hasAny(normalizedQuery, ["как передать", "куда передав"])) {
    return buildDecision("clarify", "MISSING_PARAMETER", {
      missingInformation: "meter-action",
      clarificationQuestion: questionFor(input, "MISSING_PARAMETER", normalizedQuery),
      candidateIntents: ["submit-meter-reading", "correct-meter-reading"],
    });
  }

  if (
    hasHint(input, ["account", "ownership"]) &&
    (hasAny(normalizedQuery, ["купил", "продал", "квартира", "владелец", "данные"]) ||
      tokenCount(normalizedQuery) <= 6)
  ) {
    return buildDecision("clarify", "MISSING_PARAMETER", {
      missingInformation: "account-or-ownership-action",
      clarificationQuestion: questionFor(input, "MISSING_PARAMETER", normalizedQuery),
      candidateIntents: ["find-account-number", "change-owner", "update-flat-data"],
    });
  }

  if (tokenCount(normalizedQuery) <= 4 && !input.query.includes("?")) {
    return buildDecision("clarify", "AMBIGUOUS_INTENT", {
      missingInformation: "user-goal",
      clarificationQuestion: questionFor(input, "AMBIGUOUS_INTENT", normalizedQuery),
    });
  }

  return buildDecision("answer", "MEDIUM_SAFE_TO_ANSWER");
}

export function clarificationAnswer(decision: ClarificationDecision) {
  return decision.clarificationQuestion ?? "";
}
