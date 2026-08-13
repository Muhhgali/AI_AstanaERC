export const AI_TEST_SELECTED_LIMIT = 10;

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
};

export type AiTestRunRequest = {
  mode?: "single" | "selected" | "full";
  ids?: string[];
  confirmFullRun?: boolean;
};

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
