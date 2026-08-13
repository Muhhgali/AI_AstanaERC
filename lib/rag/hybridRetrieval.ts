import { createEmbedding } from "@/lib/embedding";
import {
  cosineSimilarity,
  loadKnowledgeRows,
  tokenizeForRetrieval,
} from "@/lib/retrieval";
import { understandQuery } from "./queryUnderstanding";
import type {
  HybridRetrievalResult,
  KnowledgeRecord,
  QueryUnderstanding,
  RagEvalMessage,
  RetrievalCandidate,
  RetrievalConfidence,
  RetrievalIntentHint,
  RetrievalTrace,
  ScoreBreakdown,
} from "./types";

export const HYBRID_RETRIEVAL_CONFIG = {
  topK: 5,
  contextK: 4,
  semanticWeight: 0.7,
  lexicalWeight: 0.18,
  titleWeight: 0.08,
  categoryWeight: 0.06,
  verifiedWeight: 0.04,
  priorityWeight: 0.04,
  highScore: 0.62,
  mediumScore: 0.48,
  minimumSemanticForHigh: 0.5,
  minimumLexicalForHigh: 0.12,
  lowClarifyScore: 0.36,
} as const;

const CATEGORY_HINTS: Record<RetrievalIntentHint, string[]> = {
  payment: ["payments", "billing", "support"],
  receipt: ["receipts", "epd", "support"],
  meter: ["meters", "support"],
  account: ["accounts", "support"],
  ownership: ["accounts", "billing"],
  appeal: ["requests", "support"],
  supplier: ["suppliers", "services"],
  support: ["support", "technical-support", "services"],
  technical: ["technical-support", "services", "support"],
  billing: ["billing", "payments", "support"],
  "out-of-domain": [],
  unknown: [],
};

function nowMs() {
  return performance.now();
}

function round(value: number) {
  return Number(value.toFixed(4));
}

function textOverlapScore(queryText: string, item: KnowledgeRecord) {
  const queryTokens = new Set(tokenizeForRetrieval(queryText));

  if (queryTokens.size === 0) {
    return 0;
  }

  const itemTokens = new Set(
    tokenizeForRetrieval(
      `${item.title ?? ""} ${item.category ?? ""} ${item.content ?? ""}`
    )
  );

  let matches = 0;

  for (const token of queryTokens) {
    if (itemTokens.has(token)) {
      matches++;
    }
  }

  return matches / queryTokens.size;
}

function titleScore(query: QueryUnderstanding, item: KnowledgeRecord) {
  const title = (item.title ?? "").toLowerCase();

  if (!title) {
    return 0;
  }

  const normalizedTitle = title.replace(/ё/g, "е");

  if (
    query.searchTexts.some((text) =>
      text.length > 4 ? text.includes(normalizedTitle) : false
    )
  ) {
    return 1;
  }

  const titleTokens = new Set(tokenizeForRetrieval(normalizedTitle));
  const queryTokens = new Set(tokenizeForRetrieval(query.searchTexts.join(" ")));

  if (titleTokens.size === 0 || queryTokens.size === 0) {
    return 0;
  }

  let matches = 0;

  for (const token of titleTokens) {
    if (queryTokens.has(token)) {
      matches++;
    }
  }

  return matches / titleTokens.size;
}

function categoryScore(query: QueryUnderstanding, item: KnowledgeRecord) {
  const category = item.category ?? "";

  if (!category) {
    return 0;
  }

  return query.intentHints.some((hint) =>
    CATEGORY_HINTS[hint]?.includes(category)
  )
    ? 1
    : 0;
}

function maxLexicalScore(query: QueryUnderstanding, item: KnowledgeRecord) {
  return Math.max(
    ...query.searchTexts.map((text) => textOverlapScore(text, item)),
    0
  );
}

function buildBreakdown(
  query: QueryUnderstanding,
  item: KnowledgeRecord,
  queryEmbedding: number[]
): ScoreBreakdown {
  const semantic = cosineSimilarity(queryEmbedding, item.embedding);
  const lexical = maxLexicalScore(query, item);
  const title = titleScore(query, item);
  const category = categoryScore(query, item);
  const verified = item.verified ? 1 : 0;
  const priority = Math.min(Math.max(item.priority ?? 0, 0), 100) / 100;
  const final =
    semantic * HYBRID_RETRIEVAL_CONFIG.semanticWeight +
    lexical * HYBRID_RETRIEVAL_CONFIG.lexicalWeight +
    title * HYBRID_RETRIEVAL_CONFIG.titleWeight +
    category * HYBRID_RETRIEVAL_CONFIG.categoryWeight +
    verified * HYBRID_RETRIEVAL_CONFIG.verifiedWeight +
    priority * HYBRID_RETRIEVAL_CONFIG.priorityWeight;

  return {
    semantic: round(semantic),
    lexical: round(lexical),
    title: round(title),
    category: round(category),
    verified: round(verified),
    priority: round(priority),
    final: round(final),
  };
}

function toCandidate(
  item: KnowledgeRecord,
  rank: number,
  breakdown: ScoreBreakdown
): RetrievalCandidate {
  const matchedBy: RetrievalCandidate["matchedBy"] = [];

  if (breakdown.semantic >= 0.45) matchedBy.push("semantic");
  if (breakdown.lexical >= 0.12) matchedBy.push("lexical");
  if (breakdown.title >= 0.25) matchedBy.push("title");
  if (breakdown.category > 0) matchedBy.push("category");

  return {
    ...item,
    rank,
    score: breakdown.final,
    scoreBreakdown: breakdown,
    matchedBy,
  };
}

function getConfidence(
  query: QueryUnderstanding,
  candidates: RetrievalCandidate[]
): RetrievalConfidence {
  const top = candidates[0];
  const second = candidates[1];
  const reasons: string[] = [];

  if (query.isOutOfDomain) {
    return {
      level: "low",
      decision: "fallback",
      reasons: ["out-of-domain signal without Astana-ERC intent"],
    };
  }

  if (query.requiresPrivateAccountLookup) {
    return {
      level: "low",
      decision: "fallback",
      reasons: ["question requires private account balance lookup"],
    };
  }

  if (!top) {
    return {
      level: "low",
      decision: "fallback",
      reasons: ["no candidates"],
    };
  }

  const gap = top.score - (second?.score ?? 0);

  if (top.verified) reasons.push("top candidate is verified");
  if (top.score >= HYBRID_RETRIEVAL_CONFIG.highScore) reasons.push("high combined score");
  if (top.score >= HYBRID_RETRIEVAL_CONFIG.mediumScore) reasons.push("medium combined score");
  if (gap >= 0.08) reasons.push("clear gap to second candidate");
  if (top.scoreBreakdown.lexical >= HYBRID_RETRIEVAL_CONFIG.minimumLexicalForHigh) reasons.push("lexical confirmation");
  if (top.scoreBreakdown.category > 0) reasons.push("intent/category consistency");

  if (
    top.score >= HYBRID_RETRIEVAL_CONFIG.highScore &&
    top.scoreBreakdown.semantic >= HYBRID_RETRIEVAL_CONFIG.minimumSemanticForHigh &&
    (top.scoreBreakdown.lexical >= HYBRID_RETRIEVAL_CONFIG.minimumLexicalForHigh ||
      top.scoreBreakdown.title >= 0.3 ||
      top.scoreBreakdown.category > 0)
  ) {
    return { level: "high", decision: "answer", reasons };
  }

  if (
    top.score >= HYBRID_RETRIEVAL_CONFIG.mediumScore ||
    (top.score >= HYBRID_RETRIEVAL_CONFIG.lowClarifyScore &&
      query.intentHints.some((hint) => hint !== "unknown"))
  ) {
    return {
      level: "medium",
      decision: "clarify",
      reasons: reasons.length ? reasons : ["partial retrieval evidence"],
    };
  }

  return {
    level: "low",
    decision: "fallback",
    reasons: reasons.length ? reasons : ["weak retrieval evidence"],
  };
}

function sanitizeTraceCandidates(candidates: RetrievalCandidate[]) {
  return candidates.map((candidate) => ({
    ...candidate,
    content:
      candidate.content && candidate.content.length > 240
        ? `${candidate.content.slice(0, 240)}...`
        : candidate.content,
  }));
}

export async function retrieveKnowledgeV2(params: {
  query: string;
  previousMessages?: RagEvalMessage[];
}): Promise<HybridRetrievalResult> {
  const startedAt = nowMs();
  const normalizationStart = nowMs();
  const query = understandQuery({
    query: params.query,
    previousMessages: params.previousMessages,
  });
  const normalizationMs = nowMs() - normalizationStart;

  if (query.isOutOfDomain) {
    const confidence = getConfidence(query, []);
    const trace: RetrievalTrace = {
      pipeline: "v2",
      originalQuery: query.originalQuery,
      normalizedQuery: query.normalizedQuery,
      rewrittenQueries: query.rewrittenQueries,
      intentHints: query.intentHints,
      lexicalCandidates: [],
      semanticCandidates: [],
      combinedCandidates: [],
      selectedContext: [],
      confidence,
      timingMs: {
        normalization: round(normalizationMs),
        embedding: 0,
        retrieval: 0,
        reranking: 0,
        total: round(nowMs() - startedAt),
      },
    };

    return {
      query,
      candidates: [],
      selectedContext: [],
      confidence,
      trace,
    };
  }

  const embeddingStart = nowMs();
  const semanticQuery =
    query.rewrittenQueries[0] ?? query.normalizedQuery ?? query.originalQuery;
  const queryEmbedding = await createEmbedding(semanticQuery);
  const embeddingMs = nowMs() - embeddingStart;
  const retrievalStart = nowMs();
  const rows = (await loadKnowledgeRows()) as KnowledgeRecord[];
  const retrievalMs = nowMs() - retrievalStart;
  const rerankStart = nowMs();
  const candidates = rows
    .map((item) => buildBreakdown(query, item, queryEmbedding))
    .map((breakdown, index) => toCandidate(rows[index], 0, breakdown))
    .sort((a, b) => b.score - a.score)
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }))
    .slice(0, HYBRID_RETRIEVAL_CONFIG.topK);
  const rerankingMs = nowMs() - rerankStart;
  const confidence = getConfidence(query, candidates);
  const selectedContext =
    confidence.level === "low"
      ? []
      : candidates.slice(0, HYBRID_RETRIEVAL_CONFIG.contextK);
  const lexicalCandidates = [...candidates]
    .sort((a, b) => b.scoreBreakdown.lexical - a.scoreBreakdown.lexical)
    .slice(0, HYBRID_RETRIEVAL_CONFIG.topK);
  const semanticCandidates = [...candidates]
    .sort((a, b) => b.scoreBreakdown.semantic - a.scoreBreakdown.semantic)
    .slice(0, HYBRID_RETRIEVAL_CONFIG.topK);
  const trace: RetrievalTrace = {
    pipeline: "v2",
    originalQuery: query.originalQuery,
    normalizedQuery: query.normalizedQuery,
    rewrittenQueries: query.rewrittenQueries,
    intentHints: query.intentHints,
    lexicalCandidates: sanitizeTraceCandidates(lexicalCandidates),
    semanticCandidates: sanitizeTraceCandidates(semanticCandidates),
    combinedCandidates: sanitizeTraceCandidates(candidates),
    selectedContext: sanitizeTraceCandidates(selectedContext),
    confidence,
    timingMs: {
      normalization: round(normalizationMs),
      embedding: round(embeddingMs),
      retrieval: round(retrievalMs),
      reranking: round(rerankingMs),
      total: round(nowMs() - startedAt),
    },
  };

  if (
    process.env.DEBUG_RETRIEVAL === "true" &&
    process.env.NODE_ENV !== "production"
  ) {
    console.log("RETRIEVAL TRACE:", JSON.stringify(trace));
  }

  return {
    query,
    candidates,
    selectedContext,
    confidence,
    trace,
  };
}

export function toLegacyKnowledgeResult(candidate: RetrievalCandidate) {
  return {
    id: candidate.id,
    title: candidate.title,
    category: candidate.category,
    content: candidate.content,
    embedding: candidate.embedding,
    priority: candidate.priority,
    verified: candidate.verified,
    source: candidate.source,
    similarity: candidate.scoreBreakdown.semantic,
    score: candidate.score,
  };
}
