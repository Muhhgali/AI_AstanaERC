export const AI_TEST_SELECTED_LIMIT = 10;
export const AI_TEST_RUN_LIMIT = 5;

export type AiTestCase = {
  id: string;
  sanitizedQuery: string;
  language?: string;
  category?: string;
  expectedBehavior?: string;
  tags?: string[];
  labelQuality?: string;
  shouldClarify?: boolean;
  shouldEscalate?: boolean;
  shouldAnswer?: boolean;
  sourceKnowledgeId?: string;
  sourceKnowledgeTitle?: string;
  generationMode?: AiTestGenerationMode;
  difficulty?: AiTestDifficulty;
};

export type AiTestResultStatus = "pass" | "fail" | "needs_review";

export type AiTestAnswerPayload = {
  message?: unknown;
  source?: unknown;
  error?: unknown;
};

export type AiTestExecutionResult = {
  id: string;
  status: AiTestResultStatus;
  source: string | null;
  answer: string;
  reasons: string[];
  durationMs?: number;
};

export type AiTestDifficulty = "basic" | "medium" | "hard";
export type AiTestGenerationMode =
  | "normal"
  | "paraphrase"
  | "typo"
  | "conflict";

export type AiTestKnowledgeSeed = {
  id?: string | null;
  title?: string | null;
  category?: string | null;
  content?: string | null;
  language?: string | null;
  verified?: boolean | null;
  status?: string | null;
};

export type AiTestRunRequest = {
  mode?: "single" | "selected" | "full" | "generate" | "run";
  ids?: string[];
  cases?: AiTestCase[];
  confirmRun?: boolean;
  confirmFullRun?: boolean;
  category?: string;
  count?: number;
  difficulty?: AiTestDifficulty;
  generationModes?: AiTestGenerationMode[];
};

export const AI_TEST_GENERATION_LIMIT = 25;

function normalizeForComparison(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAiTestCases(raw: unknown): AiTestCase[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.reduce<AiTestCase[]>((items, item) => {
      if (!item || typeof item !== "object") {
      return items;
      }

      const candidate = item as Partial<AiTestCase>;

      if (
        typeof candidate.id !== "string" ||
        typeof candidate.sanitizedQuery !== "string"
      ) {
      return items;
      }

    items.push({
        id: candidate.id,
        sanitizedQuery: candidate.sanitizedQuery,
        language: candidate.language,
        category: candidate.category,
        expectedBehavior: candidate.expectedBehavior,
        tags: Array.isArray(candidate.tags) ? candidate.tags : [],
        labelQuality: candidate.labelQuality,
        shouldClarify: Boolean(candidate.shouldClarify),
        shouldEscalate: Boolean(candidate.shouldEscalate),
        shouldAnswer: Boolean(candidate.shouldAnswer),
        sourceKnowledgeId: candidate.sourceKnowledgeId,
        sourceKnowledgeTitle: candidate.sourceKnowledgeTitle,
        generationMode: candidate.generationMode,
        difficulty: candidate.difficulty,
    });

    return items;
  }, []);
}

export function filterAiTestCases(
  cases: AiTestCase[],
  params: {
    query?: string | null;
    category?: string | null;
    language?: string | null;
  }
) {
  const query = params.query?.trim().toLowerCase() ?? "";
  const category = params.category?.trim();
  const language = params.language?.trim();

  return cases.filter((item) => {
    const matchesQuery =
      !query ||
      [
        item.id,
        item.sanitizedQuery,
        item.category ?? "",
        item.expectedBehavior ?? "",
        ...(item.tags ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    const matchesCategory = !category || item.category === category;
    const matchesLanguage = !language || item.language === language;

    return matchesQuery && matchesCategory && matchesLanguage;
  });
}

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function stableHash(input: string) {
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

function dedupeGeneratedCases(cases: AiTestCase[]) {
  const seen = new Set<string>();
  const unique: AiTestCase[] = [];

  for (const testCase of cases) {
    const key = testCase.sanitizedQuery.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(testCase);
  }

  return unique;
}

function topicFromKnowledge(seed: AiTestKnowledgeSeed) {
  const title = cleanText(seed.title);
  const content = cleanText(seed.content);

  if (title) {
    return title.replace(/[?.!]+$/g, "");
  }

  return content.split(/[.!?]/u)[0]?.slice(0, 120) || "услуга Астана-ЕРЦ";
}

function buildGeneratedQuestion(params: {
  seed: AiTestKnowledgeSeed;
  mode: AiTestGenerationMode;
  difficulty: AiTestDifficulty;
}) {
  const topic = topicFromKnowledge(params.seed);
  const category = cleanText(params.seed.category) || "support";

  if (params.mode === "typo") {
    return `а как по ${topic.toLowerCase()} подскажите пжлст`;
  }

  if (params.mode === "paraphrase") {
    return `Подскажите простыми словами: ${topic.toLowerCase()}?`;
  }

  if (params.mode === "conflict") {
    return params.difficulty === "hard"
      ? `Мне сказали другое, но в квитанции/кабинете не сходится: ${topic.toLowerCase()} — что правильно?`
      : `Почему по теме «${topic}» может быть иначе, чем я ожидал?`;
  }

  if (category === "payments") {
    return `Как разобраться с оплатой: ${topic}?`;
  }

  if (category === "meters") {
    return `Как передать или проверить показания: ${topic}?`;
  }

  if (category === "receipts") {
    return `Что делать с квитанцией или ЕПД: ${topic}?`;
  }

  return `Что нужно знать по теме: ${topic}?`;
}

export function generateAiTestCasesFromKnowledge(params: {
  knowledge: AiTestKnowledgeSeed[];
  category?: string | null;
  count?: number | null;
  difficulty?: AiTestDifficulty | null;
  generationModes?: AiTestGenerationMode[] | null;
}) {
  const requestedCount = Math.max(
    1,
    Math.min(params.count ?? 10, AI_TEST_GENERATION_LIMIT)
  );
  const difficulty = params.difficulty ?? "medium";
  const modes =
    params.generationModes && params.generationModes.length > 0
      ? params.generationModes
      : (["normal", "paraphrase", "typo", "conflict"] satisfies AiTestGenerationMode[]);
  const category = params.category?.trim();
  const eligible = params.knowledge.filter((seed) => {
    const isVerified = seed.verified === true || seed.status === "verified";
    const hasContent = Boolean(cleanText(seed.title) || cleanText(seed.content));
    const matchesCategory = !category || seed.category === category;

    return isVerified && hasContent && matchesCategory;
  });
  const cases: AiTestCase[] = [];

  for (const seed of eligible) {
    for (const mode of modes) {
      const query = buildGeneratedQuestion({ seed, mode, difficulty });
      const id = `gen-${stableHash(`${seed.id ?? seed.title}:${mode}:${query}`)}`;

      cases.push({
        id,
        sanitizedQuery: query,
        language: seed.language === "kk" ? "kk" : "ru",
        category: seed.category ?? "support",
        expectedBehavior: "answer",
        tags: ["generated", mode, difficulty],
        labelQuality: "silver",
        shouldAnswer: true,
        shouldClarify: mode === "conflict" && difficulty === "hard",
        shouldEscalate: false,
        sourceKnowledgeId: seed.id ?? undefined,
        sourceKnowledgeTitle: seed.title ?? undefined,
        generationMode: mode,
        difficulty,
      });
    }
  }

  return dedupeGeneratedCases(cases).slice(0, requestedCount);
}

export function selectAiTestRunCases(
  cases: AiTestCase[],
  request: AiTestRunRequest
) {
  if (request.cases && request.cases.length > 0) {
    return normalizeAiTestCases(request.cases).slice(0, AI_TEST_RUN_LIMIT);
  }

  const ids = Array.from(new Set(request.ids ?? []));
  const selected =
    ids.length > 0 ? cases.filter((item) => ids.includes(item.id)) : cases;

  return selected.slice(0, AI_TEST_RUN_LIMIT);
}

export function evaluateAiTestAnswer(
  testCase: AiTestCase,
  payload: AiTestAnswerPayload,
  durationMs?: number
): AiTestExecutionResult {
  const answer =
    typeof payload.message === "string" ? payload.message.trim() : "";
  const source = typeof payload.source === "string" ? payload.source : null;
  const reasons: string[] = [];

  if (payload.error) {
    reasons.push("chat returned error");
  }

  if (!answer) {
    reasons.push("empty answer");
  }

  const normalizedAnswer = normalizeForComparison(answer);
  const normalizedQuestion = normalizeForComparison(testCase.sanitizedQuery);

  if (
    normalizedQuestion.length > 20 &&
    normalizedAnswer.includes(normalizedQuestion)
  ) {
    reasons.push("answer repeats the user question");
  }

  if (/^правильно ли я понимаю/i.test(answer)) {
    reasons.push("starts with unnecessary clarification preamble");
  }

  if (
    testCase.shouldAnswer &&
    (!source || source === "uncertain" || source === "verified-gap")
  ) {
    reasons.push("expected grounded answer but got uncertain source");
  }

  if (
    testCase.shouldClarify &&
    !/уточн|какой|какая|какие|пожалуйста|нақты|қай/i.test(answer)
  ) {
    reasons.push("expected clarification question");
  }

  if (testCase.shouldEscalate && source !== "operator-handoff") {
    reasons.push("expected operator handoff");
  }

  let status: AiTestResultStatus = "pass";

  if (reasons.some((reason) => reason === "chat returned error" || reason === "empty answer")) {
    status = "fail";
  } else if (reasons.length > 0) {
    status = "needs_review";
  }

  return {
    id: testCase.id,
    status,
    source,
    answer,
    reasons,
    durationMs,
  };
}

export function planAiTestRun(
  cases: AiTestCase[],
  request: AiTestRunRequest
) {
  const mode = request.mode ?? "selected";
  const ids = Array.from(new Set(request.ids ?? []));

  if (mode === "full" && !request.confirmFullRun) {
    return {
      ok: false,
      status: 409,
      message:
        "Full AI evaluation requires explicit confirmFullRun=true to protect OpenAI credits.",
      openAiCalls: 0,
      cases: [],
    };
  }

  if (mode === "full") {
    return {
      ok: true,
      status: 200,
      message:
        "Full run is confirmed but execution is intentionally manual in this endpoint.",
      openAiCalls: 0,
      cases,
    };
  }

  if (mode === "single" && ids.length !== 1) {
    return {
      ok: false,
      status: 400,
      message: "Single test mode requires exactly one id.",
      openAiCalls: 0,
      cases: [],
    };
  }

  if (ids.length > AI_TEST_SELECTED_LIMIT) {
    return {
      ok: false,
      status: 400,
      message: `Selected run is limited to ${AI_TEST_SELECTED_LIMIT} cases.`,
      openAiCalls: 0,
      cases: [],
    };
  }

  const selected = cases.filter((item) => ids.includes(item.id));

  return {
    ok: true,
    status: 200,
    message:
      "Dry-run plan created. The endpoint does not call OpenAI automatically.",
    openAiCalls: 0,
    cases: selected,
  };
}
