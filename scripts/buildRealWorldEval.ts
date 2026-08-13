import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { retrieveKnowledgeV2 } from "@/lib/rag/hybridRetrieval";
import type { RagEvalMessage } from "@/lib/rag/types";
import {
  buildKnowledgeGapCandidates,
  classifyRealWorldQuery,
  detectEvalLanguage,
  inferExpectedBehavior,
  isUsableSanitizedText,
  sanitizeForEval,
  stableHash,
  type RealWorldEvalCase,
} from "@/lib/eval/realWorld";

type ChatMessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  source?: string | null;
  feedback?: "up" | "down" | null;
  created_at: string;
};

type KnowledgeGapRow = {
  id: string;
  conversation_id?: string | null;
  topic?: string | null;
  user_question: string;
  reason?: string | null;
  top_similarity?: number | null;
  created_at: string;
};

type Candidate = {
  source: "historical" | "knowledge_gap";
  query: string;
  createdAt: string;
  conversationId?: string | null;
  previousContext?: RagEvalMessage[];
  diagnostics?: RealWorldEvalCase["historicalDiagnostics"];
};

const args = process.argv.slice(2);
const maxCases = Number(getArg("--max", "150"));
const outputPath = getArg("--out", "data/real-world-eval.json");
const gapsOutputPath = getArg("--gaps-out", "data/knowledge-gap-candidates.json");

function getArg(name: string, fallback: string) {
  const index = args.indexOf(name);

  return index === -1 ? fallback : args[index + 1] ?? fallback;
}

function getSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

function ensureParent(path: string) {
  mkdirSync(dirname(resolve(process.cwd(), path)), { recursive: true });
}

function isLikelyFollowUp(text: string) {
  const normalized = text.toLowerCase();

  return (
    text.split(/[^\p{L}\p{N}]+/u).filter(Boolean).length <= 7 &&
    [
      "а где",
      "а как",
      "а сколько",
      "тогда",
      "это",
      "через сайт",
      "уже пробовал",
      "дальше",
    ].some((phrase) => normalized.includes(phrase))
  );
}

function buildPreviousContext(
  rows: ChatMessageRow[],
  currentIndex: number
): RagEvalMessage[] | undefined {
  const current = rows[currentIndex];
  if (!current || !isLikelyFollowUp(current.content)) return undefined;

  const previous = rows
    .slice(Math.max(0, currentIndex - 4), currentIndex)
    .filter((row) => row.content?.trim())
    .slice(-4)
    .map((row) => {
      const sanitized = sanitizeForEval(row.content);
      return {
        role: row.role,
        content: sanitized.text,
      };
    })
    .filter((message) => message.content);

  return previous.length > 0 ? previous : undefined;
}

function candidateKey(query: string) {
  return sanitizeForEval(query).text.toLowerCase();
}

function pickRepresentative(candidates: Candidate[]) {
  const byKey = new Map<string, Candidate>();

  for (const candidate of candidates) {
    const key = candidateKey(candidate.query);
    if (!isUsableSanitizedText(key)) continue;
    if (!byKey.has(key)) byKey.set(key, candidate);
  }

  const unique = Array.from(byKey.values());
  const buckets = new Map<string, Candidate[]>();

  for (const candidate of unique) {
    const sanitized = sanitizeForEval(candidate.query).text;
    const { category } = classifyRealWorldQuery(sanitized);
    buckets.set(category, [...(buckets.get(category) ?? []), candidate]);
  }

  for (const items of buckets.values()) {
    items.sort(
      (a, b) => stableHash(candidateKey(a.query)) - stableHash(candidateKey(b.query))
    );
  }

  const selected: Candidate[] = [];
  const seen = new Set<string>();
  const categoryQuota = Math.max(3, Math.ceil(maxCases / Math.max(1, buckets.size)));

  for (const items of buckets.values()) {
    for (const candidate of items.slice(0, categoryQuota)) {
      const key = candidateKey(candidate.query);
      if (!seen.has(key) && selected.length < maxCases) {
        seen.add(key);
        selected.push(candidate);
      }
    }
  }

  const rest = unique
    .filter((candidate) => !seen.has(candidateKey(candidate.query)))
    .sort(
      (a, b) => stableHash(`${candidateKey(a.query)}:${a.createdAt}`) -
        stableHash(`${candidateKey(b.query)}:${b.createdAt}`)
    );

  for (const candidate of rest) {
    if (selected.length >= maxCases) break;
    const key = candidateKey(candidate.query);
    if (!seen.has(key)) {
      seen.add(key);
      selected.push(candidate);
    }
  }

  return selected;
}

function toFactSnippets(content?: string | null) {
  if (!content) return [];

  return content
    .split(/(?<=[.!?])\s+/u)
    .map((item) => sanitizeForEval(item).text)
    .filter((item) => item.length >= 20)
    .slice(0, 2);
}

async function buildCase(candidate: Candidate, index: number): Promise<RealWorldEvalCase> {
  const sanitized = sanitizeForEval(candidate.query);
  const language = detectEvalLanguage(sanitized.text);
  const retrieval = await retrieveKnowledgeV2({
    query: sanitized.text,
    previousMessages: candidate.previousContext,
  });
  const { category, tags } = classifyRealWorldQuery(sanitized.text);
  const expected = inferExpectedBehavior({
    sanitizedQuery: sanitized.text,
    language,
    source: candidate.source,
    confidence: retrieval.confidence.level,
  });
  const top = retrieval.candidates[0];
  const expectedKnowledge =
    expected.labelQuality !== "needs_human_review" && top?.verified && top.title
      ? [top.title]
      : [];

  return {
    id: `rw-${String(index + 1).padStart(3, "0")}`,
    source: candidate.source,
    sanitizedQuery: sanitized.text,
    previousContext: candidate.previousContext,
    language,
    category,
    tags: Array.from(new Set(tags)),
    expectedKnowledge,
    expectedBehavior: expected.behavior,
    expectedAnswerFacts: expectedKnowledge.length > 0 ? toFactSnippets(top?.content) : [],
    forbiddenClaims: [
      "RAG",
      "retrieval",
      "confidence",
      "similarity",
      "embedding",
      "knowledge ID",
      "system prompt content",
    ],
    shouldClarify: expected.behavior === "clarify",
    shouldEscalate: expected.behavior === "escalate",
    shouldAnswer: ["answer", "multi_intent", "escalate"].includes(expected.behavior),
    labelQuality: expected.labelQuality,
    piiRedactions: sanitized.redactions,
    historicalDiagnostics: candidate.diagnostics,
    notes:
      expected.labelQuality === "needs_human_review"
        ? "Real user query; expected behavior needs owner/human review before treating as ground truth."
        : "Silver/deterministic label generated from verified KB, deterministic route, or out-of-domain rule.",
  };
}

async function main() {
  const supabase = getSupabase();
  const { data: messages, error: messagesError } = await supabase
    .from("chat_messages")
    .select("id,conversation_id,role,content,source,feedback,created_at")
    .order("created_at", { ascending: true })
    .limit(2000);

  if (messagesError) throw messagesError;

  const { data: gaps, error: gapsError } = await supabase
    .from("knowledge_gaps")
    .select("id,conversation_id,topic,user_question,reason,top_similarity,created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (gapsError) throw gapsError;

  const rows = (messages ?? []) as ChatMessageRow[];
  const gapRows = (gaps ?? []) as KnowledgeGapRow[];
  const byConversation = new Map<string, ChatMessageRow[]>();

  for (const row of rows) {
    byConversation.set(row.conversation_id, [
      ...(byConversation.get(row.conversation_id) ?? []),
      row,
    ]);
  }

  const candidates: Candidate[] = [];

  for (const conversationRows of byConversation.values()) {
    for (let index = 0; index < conversationRows.length; index += 1) {
      const row = conversationRows[index];
      if (row.role !== "user" || !row.content.trim()) continue;
      candidates.push({
        source: "historical",
        query: row.content,
        createdAt: row.created_at,
        conversationId: row.conversation_id,
        previousContext: buildPreviousContext(conversationRows, index),
        diagnostics: {
          source: row.source,
        },
      });
    }
  }

  for (const gap of gapRows) {
    candidates.push({
      source: "knowledge_gap",
      query: gap.user_question,
      createdAt: gap.created_at,
      conversationId: gap.conversation_id,
      diagnostics: {
        gapReason: gap.reason,
        topSimilarity: gap.top_similarity,
      },
    });
  }

  const selected = pickRepresentative(candidates);
  const cases: RealWorldEvalCase[] = [];

  for (let index = 0; index < selected.length; index += 1) {
    cases.push(await buildCase(selected[index], index));
  }

  const gapCandidates = buildKnowledgeGapCandidates(gapRows);

  ensureParent(outputPath);
  writeFileSync(
    resolve(process.cwd(), outputPath),
    `${JSON.stringify(cases, null, 2)}\n`,
    "utf8"
  );

  ensureParent(gapsOutputPath);
  writeFileSync(
    resolve(process.cwd(), gapsOutputPath),
    `${JSON.stringify(gapCandidates, null, 2)}\n`,
    "utf8"
  );

  const byCategory = cases.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + 1;
    return acc;
  }, {});
  const redacted = cases.filter((item) => item.piiRedactions.length > 0).length;

  console.log(
    JSON.stringify(
      {
        outputPath,
        gapsOutputPath,
        cases: cases.length,
        redactedCases: redacted,
        byCategory,
        labelQuality: cases.reduce<Record<string, number>>((acc, item) => {
          acc[item.labelQuality] = (acc[item.labelQuality] ?? 0) + 1;
          return acc;
        }, {}),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(message);
  process.exitCode = 1;
});
