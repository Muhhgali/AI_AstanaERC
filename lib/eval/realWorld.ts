import type { RagEvalMessage, RetrievalConfidenceLevel } from "@/lib/rag/types";
import { understandQuery } from "@/lib/rag/queryUnderstanding";
import {
  resolveResidentIntent,
  type ResidentLanguage,
} from "@/lib/residentIntent";

export type RealWorldEvalCategory =
  | "payments"
  | "debt"
  | "receipts"
  | "meters"
  | "accounts"
  | "ownership"
  | "appeals"
  | "suppliers"
  | "technical"
  | "contacts"
  | "short-or-unclear"
  | "conversational"
  | "typos"
  | "kk"
  | "multi-turn"
  | "multi-intent"
  | "out-of-domain"
  | "knowledge-gap";

export type ExpectedBehavior =
  | "answer"
  | "clarify"
  | "fallback"
  | "escalate"
  | "multi_intent";

export type RealWorldEvalCase = {
  id: string;
  source: "historical" | "knowledge_gap";
  sanitizedQuery: string;
  previousContext?: RagEvalMessage[];
  language: ResidentLanguage;
  category: RealWorldEvalCategory;
  tags: string[];
  expectedKnowledge: string[];
  expectedBehavior: ExpectedBehavior;
  expectedAnswerFacts: string[];
  forbiddenClaims: string[];
  shouldClarify: boolean;
  shouldEscalate: boolean;
  shouldAnswer: boolean;
  labelQuality: "deterministic" | "silver" | "needs_human_review";
  piiRedactions: string[];
  historicalDiagnostics?: {
    source?: string | null;
    gapReason?: string | null;
    topSimilarity?: number | null;
  };
  notes: string;
};

export type KnowledgeGapCandidate = {
  topic: string;
  category: RealWorldEvalCategory;
  frequency: number;
  exampleQueries: string[];
  reasons: Record<string, number>;
  informationRequiredFromOwner: string;
};

export function normalizeEvalText(text: string) {
  return text
    .normalize("NFKC")
    .replace(/ё/g, "е")
    .replace(/Ё/g, "Е")
    .replace(/\s+/g, " ")
    .trim();
}

function redact(
  text: string,
  pattern: RegExp,
  placeholder: string,
  redactions: Set<string>
) {
  return text.replace(pattern, () => {
    redactions.add(placeholder);
    return placeholder;
  });
}

export function sanitizeForEval(text: string) {
  const redactions = new Set<string>();
  let sanitized = normalizeEvalText(text);

  sanitized = redact(
    sanitized,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    "[EMAIL]",
    redactions
  );
  sanitized = redact(
    sanitized,
    /(?:\+?\d[\s()_-]*){10,}/g,
    "[PHONE]",
    redactions
  );
  sanitized = redact(
    sanitized,
    /\b\d{12}\b/g,
    "[IIN]",
    redactions
  );
  sanitized = redact(
    sanitized,
    /\b(?:л\/?с|лицев(?:ой|ого)?\s+сч[её]т(?:а)?|дербес\s+шот)\s*[:№#-]?\s*\d{4,}\b/giu,
    "[ACCOUNT_NUMBER]",
    redactions
  );
  sanitized = redact(
    sanitized,
    /\b\d{6,}\b/g,
    "[ACCOUNT_NUMBER]",
    redactions
  );
  sanitized = redact(
    sanitized,
    /(?:ул\.?|улица|пр\.?|проспект|мкр\.?|микрорайон|дом|кв\.?|квартира)\s+[^\n,.!?;]{2,80}/giu,
    "[ADDRESS]",
    redactions
  );
  sanitized = redact(
    sanitized,
    /(?:г\.?\s*)?(?:астана|нур-султан)?\s*(?:ул\.?|улица|пр\.?|проспект|мкр\.?|микрорайон)\s*\.?\s*[^\n,;!?]{2,120}/giu,
    "[ADDRESS]",
    redactions
  );
  sanitized = redact(
    sanitized,
    /г\.?\s*(?:астана|нур-султан)(?=\s*,?\s*\[ADDRESS\]|\s*$)/giu,
    "[ADDRESS]",
    redactions
  );
  sanitized = redact(
    sanitized,
    /(?:дом|д\.?|кв\.?|квартира)\s*\.?\s*\d+[^\n,;!?]{0,80}/giu,
    "[ADDRESS]",
    redactions
  );
  sanitized = redact(
    sanitized,
    /\b[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){1,2}\b/g,
    "[PERSON]",
    redactions
  );

  return {
    text: normalizeEvalText(sanitized),
    redactions: Array.from(redactions).sort(),
  };
}

export function isUsableSanitizedText(text: string) {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;

  const questionMarks = (trimmed.match(/\?/g) ?? []).length;
  const letters = (trimmed.match(/\p{L}/gu) ?? []).length;

  if (questionMarks >= 4 && questionMarks / Math.max(1, trimmed.length) > 0.2) {
    return false;
  }

  return letters >= 2;
}

export function detectEvalLanguage(text: string): ResidentLanguage {
  const normalized = text.toLowerCase();
  const hasKazakhChars = /[әғқңөұүһі]/i.test(text);
  const hasKazakhWords = [
    "сәлем",
    "рахмет",
    "төлем",
    "түбіртек",
    "көрсеткіш",
    "дербес шот",
    "өтініш",
    "берешек",
  ].some((word) => normalized.includes(word));

  return hasKazakhChars || hasKazakhWords ? "kk" : "ru";
}

function hasAny(text: string, phrases: string[]) {
  return phrases.some((phrase) => text.includes(phrase));
}

function tokenCount(text: string) {
  return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean).length;
}

export function classifyRealWorldQuery(text: string): {
  category: RealWorldEvalCategory;
  tags: string[];
} {
  const normalized = text.toLowerCase().replace(/ё/g, "е");
  const tags: string[] = [];
  const language = detectEvalLanguage(text);

  if (language === "kk") tags.push("kk");
  if (tokenCount(normalized) <= 3) tags.push("short");
  if (/[a-z]/i.test(normalized) || hasAny(normalized, ["пердать", "покоз", "атправ", "лецев"])) {
    tags.push("typo-or-mixed");
  }

  const payment = hasAny(normalized, ["оплат", "платеж", "заплат", "каспи", "kaspi", "деньги", "төле", "төлем"]);
  const debt = hasAny(normalized, ["долг", "задолж", "начисл", "сумм", "берешек"]);
  const meter = hasAny(normalized, ["показан", "счетчик", "счётчик", "электр", "көрсеткіш", "есептегіш"]);
  const meterFailure = meter && hasAny(normalized, ["не отправ", "не работает", "не получается", "ошиб", "жұмыс істем", "қате"]);

  if ((payment || debt) && meterFailure) {
    return { category: "multi-intent", tags: [...tags, "payment", "meter"] };
  }

  if (hasAny(normalized, ["биткоин", "погода", "футбол", "чемпионат мира", "курс доллара"])) {
    return { category: "out-of-domain", tags };
  }

  if (hasAny(normalized, ["привет", "здравствуйте", "спасибо", "рахмет", "что ты умеешь"])) {
    return { category: "conversational", tags };
  }

  if (payment) return { category: debt ? "debt" : "payments", tags };
  if (debt) return { category: "debt", tags };
  if (hasAny(normalized, ["квитанц", "епд", "түбіртек", "бумаж"])) {
    return { category: "receipts", tags };
  }
  if (meter) return { category: "meters", tags };
  if (hasAny(normalized, ["лицев", "счет", "счёт", "абонент", "дербес шот"])) {
    return { category: "accounts", tags };
  }
  if (hasAny(normalized, ["квартир", "собствен", "купил", "продал", "пәтер"])) {
    return { category: "ownership", tags };
  }
  if (hasAny(normalized, ["обращ", "заявк", "прием", "приём", "руковод", "өтініш"])) {
    return { category: "appeals", tags };
  }
  if (hasAny(normalized, ["поставщик", "бин", "бсн", "менеджер", "договор"])) {
    return { category: "suppliers", tags };
  }
  if (hasAny(normalized, ["ошиб", "сайт", "не работает", "тех", "whatsapp", "ватсап"])) {
    return { category: "technical", tags };
  }
  if (hasAny(normalized, ["телефон", "адрес", "офис", "контакт", "график"])) {
    return { category: "contacts", tags };
  }

  return { category: tokenCount(normalized) <= 5 ? "short-or-unclear" : "knowledge-gap", tags };
}

export function inferExpectedBehavior(params: {
  sanitizedQuery: string;
  language: ResidentLanguage;
  source: "historical" | "knowledge_gap";
  confidence?: RetrievalConfidenceLevel;
}) {
  const { sanitizedQuery, language, source, confidence } = params;
  const resident = resolveResidentIntent(sanitizedQuery, language);
  const query = understandQuery({ query: sanitizedQuery });
  const classification = classifyRealWorldQuery(sanitizedQuery);

  if (resident?.kind === "multi-intent-payment-meter") {
    return {
      behavior: "multi_intent" as const,
      labelQuality: "deterministic" as const,
    };
  }

  if (resident?.kind === "meter-vague-problem") {
    return {
      behavior: "clarify" as const,
      labelQuality: "deterministic" as const,
    };
  }

  if (resident) {
    return {
      behavior: resident.support === "technical" ? "escalate" as const : "answer" as const,
      labelQuality: "deterministic" as const,
    };
  }

  if (query.isOutOfDomain || classification.category === "out-of-domain") {
    return {
      behavior: "fallback" as const,
      labelQuality: "silver" as const,
    };
  }

  if (source === "knowledge_gap") {
    return {
      behavior: "fallback" as const,
      labelQuality: "needs_human_review" as const,
    };
  }

  if (confidence === "high") {
    return {
      behavior: "answer" as const,
      labelQuality: "silver" as const,
    };
  }

  if (confidence === "medium") {
    return {
      behavior: "clarify" as const,
      labelQuality: "silver" as const,
    };
  }

  return {
    behavior: "clarify" as const,
    labelQuality: "needs_human_review" as const,
  };
}

export function stableHash(text: string) {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function buildKnowledgeGapCandidates(
  gaps: Array<{ user_question: string; reason?: string | null; topic?: string | null }>
) {
  const grouped = new Map<string, KnowledgeGapCandidate>();

  for (const gap of gaps) {
    const sanitized = sanitizeForEval(gap.user_question).text;
    if (!isUsableSanitizedText(sanitized)) continue;

    const { category } = classifyRealWorldQuery(sanitized);
    const key = `${category}:${(gap.topic ?? category).toLowerCase().slice(0, 80)}`;
    const current =
      grouped.get(key) ??
      {
        topic: gap.topic ? sanitizeForEval(gap.topic).text : category,
        category,
        frequency: 0,
        exampleQueries: [],
        reasons: {},
        informationRequiredFromOwner:
          "Нужен проверенный официальный ответ/правило от владельца проекта; не заполнять догадками.",
      };

    current.frequency += 1;
    if (current.exampleQueries.length < 5 && !current.exampleQueries.includes(sanitized)) {
      current.exampleQueries.push(sanitized);
    }

    const reason = gap.reason ?? "unknown";
    current.reasons[reason] = (current.reasons[reason] ?? 0) + 1;
    grouped.set(key, current);
  }

  return Array.from(grouped.values()).sort((a, b) => b.frequency - a.frequency);
}
