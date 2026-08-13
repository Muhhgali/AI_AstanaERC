export type RagLanguage = "ru" | "kk";

export type RagEvalCategory =
  | "exact"
  | "paraphrase"
  | "conversational"
  | "typos"
  | "very-short"
  | "situation"
  | "multi-intent"
  | "follow-up"
  | "no-answer"
  | "out-of-domain"
  | "ru"
  | "kk";

export type RagEvalMessage = {
  role: "user" | "assistant";
  content: string;
};

export type RagEvalCase = {
  id: string;
  category: RagEvalCategory;
  query: string;
  language: RagLanguage;
  previousMessages?: RagEvalMessage[];
  expectedKnowledgeTitles?: string[];
  expectedIntent?: string;
  shouldAnswer?: boolean;
  shouldAskClarification?: boolean;
  shouldRefuseOrFallback?: boolean;
  knowledgeGap?: boolean;
  notes?: string;
};

export type KnowledgeRecord = {
  id?: string;
  title?: string | null;
  category?: string | null;
  content?: string | null;
  embedding: number[];
  priority?: number | null;
  verified?: boolean | null;
  source?: string | null;
};

export type RetrievalIntentHint =
  | "payment"
  | "receipt"
  | "meter"
  | "account"
  | "ownership"
  | "appeal"
  | "supplier"
  | "support"
  | "technical"
  | "billing"
  | "out-of-domain"
  | "unknown";

export type QueryUnderstanding = {
  originalQuery: string;
  normalizedQuery: string;
  conversationContext?: string;
  rewrittenQueries: string[];
  searchTexts: string[];
  intentHints: RetrievalIntentHint[];
  isOutOfDomain: boolean;
  requiresPrivateAccountLookup: boolean;
};

export type ScoreBreakdown = {
  semantic: number;
  lexical: number;
  title: number;
  category: number;
  verified: number;
  priority: number;
  final: number;
};

export type RetrievalCandidate = KnowledgeRecord & {
  rank: number;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  matchedBy: ("semantic" | "lexical" | "title" | "category")[];
};

export type RetrievalConfidenceLevel = "high" | "medium" | "low";

export type RetrievalDecision = "answer" | "clarify" | "fallback";

export type RetrievalConfidence = {
  level: RetrievalConfidenceLevel;
  decision: RetrievalDecision;
  reasons: string[];
};

export type RetrievalTrace = {
  pipeline: "legacy" | "v2";
  originalQuery: string;
  normalizedQuery: string;
  rewrittenQueries: string[];
  intentHints: RetrievalIntentHint[];
  lexicalCandidates: RetrievalCandidate[];
  semanticCandidates: RetrievalCandidate[];
  combinedCandidates: RetrievalCandidate[];
  selectedContext: RetrievalCandidate[];
  confidence: RetrievalConfidence;
  timingMs: {
    normalization: number;
    embedding: number;
    retrieval: number;
    reranking: number;
    total: number;
  };
};

export type HybridRetrievalResult = {
  query: QueryUnderstanding;
  candidates: RetrievalCandidate[];
  selectedContext: RetrievalCandidate[];
  confidence: RetrievalConfidence;
  trace: RetrievalTrace;
};
