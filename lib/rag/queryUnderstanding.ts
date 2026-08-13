import type {
  QueryUnderstanding,
  RagEvalMessage,
  RetrievalIntentHint,
} from "./types";

const TYPO_REPLACEMENTS: Array<[RegExp, string]> = [
  [/пердать/gi, "передать"],
  [/покозания/gi, "показания"],
  [/паказания/gi, "показания"],
  [/атправить/gi, "отправить"],
  [/аплатить/gi, "оплатить"],
  [/черес/gi, "через"],
  [/квитанцыя/gi, "квитанция"],
  [/непришла/gi, "не пришла"],
  [/што/gi, "что"],
  [/лецевой/gi, "лицевой"],
  [/счот/gi, "счет"],
  [/узнат/gi, "узнать"],
];

const OUT_OF_DOMAIN_SIGNALS = [
  "чемпионат мира",
  "ресторан",
  "биткоин",
  "сочинение",
  "ауа райы",
  "погода",
  "курс доллара",
  "футбол",
];

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

export function normalizeQueryText(text: string) {
  let normalized = text
    .normalize("NFKC")
    .replace(/ё/g, "е")
    .replace(/Ё/g, "Е")
    .replace(/[“”«»]/g, "\"")
    .replace(/[^\p{L}\p{N}\s?!.,"'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const [pattern, replacement] of TYPO_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.replace(/\s+/g, " ").trim().toLowerCase();
}

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function getTokens(text: string) {
  return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function hasToken(text: string, tokens: string[]) {
  const source = new Set(getTokens(text));

  return tokens.some((token) => source.has(token));
}

function hasTokenPrefix(text: string, prefixes: string[]) {
  return getTokens(text).some((token) =>
    prefixes.some((prefix) => token.startsWith(prefix))
  );
}

export function detectIntentHints(normalizedQuery: string): RetrievalIntentHint[] {
  const hints: RetrievalIntentHint[] = [];

  if (hasAny(normalizedQuery, ["епд", "оплат", "kaspi", "каспи", "плат", "заплат", "төле", "төлем", "деньги"])) {
    hints.push("payment");
  }
  if (hasAny(normalizedQuery, ["квитанц", "бумажк", "түбіртек", "епд", "пришла", "дубликат"])) {
    hints.push("receipt");
  }
  if (
    hasAny(normalizedQuery, ["показан", "счетчик", "счётчик", "көрсеткіш", "есептегіш"]) ||
    hasToken(normalizedQuery, ["свет", "вода", "газ", "жарық", "су"]) ||
    hasTokenPrefix(normalizedQuery, ["электроэнерг"])
  ) {
    hints.push("meter");
  }
  if (hasAny(normalizedQuery, ["лицев", "счет", "счёт", "дербес шот", "абонент"])) {
    hints.push("account");
  }
  if (hasAny(normalizedQuery, ["купил", "купила", "продал", "продали", "квартир", "пәтер", "собственник", "владелец"])) {
    hints.push("ownership");
  }
  if (hasAny(normalizedQuery, ["обращ", "заявк", "статус", "прием", "руковод", "өтініш"])) {
    hints.push("appeal");
  }
  if (hasAny(normalizedQuery, ["поставщик", "бин", "бсн", "менеджер", "куратор", "договор"])) {
    hints.push("supplier");
  }
  if (hasAny(normalizedQuery, ["телефон", "адрес", "офис", "поддерж", "109", "куда звонить"])) {
    hints.push("support");
  }
  if (hasAny(normalizedQuery, ["не работает", "не получается", "ошиб", "сайт", "завис", "жұмыс істем"])) {
    hints.push("technical");
  }
  if (hasAny(normalizedQuery, ["долг", "начисл", "сумм", "задолж", "домофон", "перерасчет", "берешек"])) {
    hints.push("billing");
  }

  return unique(hints.length > 0 ? hints : ["unknown"]);
}

function isOutOfDomain(normalizedQuery: string, hints: RetrievalIntentHint[]) {
  if (hints.some((hint) => hint !== "unknown")) {
    return false;
  }

  return OUT_OF_DOMAIN_SIGNALS.some((signal) => normalizedQuery.includes(signal));
}

function requiresPrivateAccountLookup(normalizedQuery: string) {
  const hasPersonalDebtQuestion =
    hasAny(normalizedQuery, ["сколько у меня", "мой долг", "моя задолж"]) &&
    hasAny(normalizedQuery, ["долг", "задолж", "лицев"]);
  const hasAccountNumberLikeValue = /\b\d{5,}\b/.test(normalizedQuery);

  return hasPersonalDebtQuestion || (hasAccountNumberLikeValue && hasAny(normalizedQuery, ["долг", "задолж"]));
}

function buildConversationContext(previousMessages: RagEvalMessage[] = []) {
  return previousMessages
    .slice(-4)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n")
    .trim();
}

function shouldUseConversationContextForQuery(
  normalizedQuery: string,
  currentHints: RetrievalIntentHint[]
) {
  const tokens = getTokens(normalizedQuery);
  const hasConcreteCurrentIntent = currentHints.some((hint) => hint !== "unknown");
  const hasFollowUpWording = hasAny(normalizedQuery, [
    "а сколько",
    "а где",
    "а как",
    "тогда",
    "это",
    "его",
    "ее",
    "её",
    "они",
    "там",
    "туда",
    "такой",
    "такое",
    "дальше",
  ]);

  return (
    !hasConcreteCurrentIntent &&
    (tokens.length <= 7 || hasFollowUpWording)
  );
}

export function rewriteQuery(params: {
  normalizedQuery: string;
  intentHints: RetrievalIntentHint[];
  conversationContext?: string;
  includeConversationContext?: boolean;
}) {
  const {
    normalizedQuery,
    intentHints,
    conversationContext,
    includeConversationContext,
  } = params;
  const rewrites: string[] = [];

  if (intentHints.includes("payment") && intentHints.includes("billing")) {
    const hasLatePaymentSignal = hasAny(normalizedQuery, [
      "после 25",
      "после двадцать пят",
      "поздн",
      "опозд",
      "кеш",
      "после формирован",
    ]);

    rewrites.push(
      hasLatePaymentSignal
        ? "платеж не отразился задолженность в новой квитанции поздняя оплата после формирования квитанции"
        : "платеж не отразился задолженность в квитанции проверка оплаты"
    );
  }

  if (intentHints.includes("payment") && normalizedQuery.includes("kaspi")) {
    rewrites.push("оплата епд через kaspi коммунальные услуги");
  }

  if (intentHints.includes("meter")) {
    const utility = hasToken(normalizedQuery, ["свет", "жарық"]) ||
      hasTokenPrefix(normalizedQuery, ["электроэнерг"])
      ? "электроэнергии"
      : hasToken(normalizedQuery, ["вода", "воды", "су"]) ||
          hasTokenPrefix(normalizedQuery, ["вод"])
        ? "воды"
        : "";
    rewrites.push(`передача показаний счетчика ${utility}`.trim());
  }

  if (intentHints.includes("account") && intentHints.includes("ownership")) {
    rewrites.push(
      "купил квартиру новый собственник узнать номер лицевого счета переоформление владельца"
    );
  } else if (intentHints.includes("account")) {
    rewrites.push("как узнать номер лицевого счета");
  }

  if (intentHints.includes("receipt") && hasAny(normalizedQuery, ["не приш", "келм", "где", "посмотреть"])) {
    rewrites.push("квитанция не пришла где посмотреть епд сроки доставки квитанции");
  }

  if (intentHints.includes("technical")) {
    rewrites.push("техническая ошибка сайт не работает куда писать поддержка");
  }

  if (intentHints.includes("appeal")) {
    if (hasAny(normalizedQuery, ["статус", "проверить"])) {
      rewrites.push("как проверить статус заявки обращения");
    } else if (hasAny(normalizedQuery, ["прием", "руковод"])) {
      rewrites.push("как записаться на прием к руководству");
    } else {
      rewrites.push("как оставить обращение через бот какие данные указать в обращении");
    }
  }

  if (conversationContext && includeConversationContext) {
    rewrites.push(`${conversationContext}\n${normalizedQuery}`);
  }

  return unique(rewrites.filter((rewrite) => rewrite !== normalizedQuery));
}

export function understandQuery(params: {
  query: string;
  previousMessages?: RagEvalMessage[];
}): QueryUnderstanding {
  const normalizedQuery = normalizeQueryText(params.query);
  const conversationContext = buildConversationContext(params.previousMessages);
  const currentIntentHints = detectIntentHints(normalizedQuery);
  const includeConversationContext = Boolean(
    conversationContext &&
      shouldUseConversationContextForQuery(normalizedQuery, currentIntentHints)
  );
  const intentHints = includeConversationContext
    ? detectIntentHints(normalizeQueryText(`${conversationContext}\n${normalizedQuery}`))
    : currentIntentHints;
  const rewrittenQueries = rewriteQuery({
    normalizedQuery,
    intentHints,
    conversationContext,
    includeConversationContext,
  });
  const searchTexts = unique([
    params.query.trim(),
    normalizedQuery,
    ...rewrittenQueries,
  ].filter(Boolean));

  return {
    originalQuery: params.query,
    normalizedQuery,
    conversationContext: conversationContext || undefined,
    rewrittenQueries,
    searchTexts,
    intentHints,
    isOutOfDomain: isOutOfDomain(normalizedQuery, currentIntentHints),
    requiresPrivateAccountLookup: requiresPrivateAccountLookup(normalizedQuery),
  };
}
