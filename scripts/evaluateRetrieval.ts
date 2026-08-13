import "dotenv/config";

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createEmbedding } from "@/lib/embedding";
import {
  searchKnowledge,
  searchKnowledgeLexical,
  type KnowledgeSearchResult,
} from "@/lib/retrieval";
import {
  hasResidentProblemSignal,
  resolveResidentIntent,
  type ResidentLanguage,
} from "@/lib/residentIntent";
import { retrieveKnowledgeV2 } from "@/lib/rag/hybridRetrieval";
import { understandQuery } from "@/lib/rag/queryUnderstanding";
import type {
  RagEvalCase,
  RetrievalCandidate,
  RetrievalConfidence,
} from "@/lib/rag/types";

type Pipeline = "legacy" | "v2";

type EvaluatedCandidate = {
  title: string | null;
  category: string | null;
  verified: boolean;
  score: number;
  semantic: number;
  lexical?: number;
};

type EvalResult = {
  id: string;
  category: string;
  query: string;
  normalizedQuery: string;
  rewrittenQueries: string[];
  expected: string[];
  expectedIntent?: string;
  routedIntent?: string;
  top: EvaluatedCandidate[];
  rank: number | null;
  confidence: RetrievalConfidence;
  pass: boolean;
  reason: string;
};

const args = process.argv.slice(2);
const pipeline = getArg("--pipeline", "v2") as Pipeline;
const savePath = getArg("--save");
const limit = Number(getArg("--limit", "0"));
const jsonOutput = args.includes("--json");

if (pipeline !== "legacy" && pipeline !== "v2") {
  throw new Error("--pipeline must be legacy or v2");
}

function getArg(name: string, fallback?: string) {
  const index = args.indexOf(name);

  if (index === -1) {
    return fallback;
  }

  return args[index + 1] ?? fallback;
}

function readCases() {
  const raw = readFileSync(
    resolve(process.cwd(), "data/retrieval-eval.json"),
    "utf8"
  );
  const parsed = JSON.parse(raw) as RagEvalCase[];

  return limit > 0 ? parsed.slice(0, limit) : parsed;
}

function detectSmallTalk(query: string) {
  const normalized = query.toLowerCase().replace(/[!?.,"\s]+/g, " ").trim();

  return [
    "привет",
    "здравствуйте",
    "добрый день",
    "сәлем",
    "что ты умеешь",
    "помощь",
  ].some((phrase) => normalized === phrase || normalized.startsWith(`${phrase} `));
}

function detectRouteIntent(testCase: RagEvalCase) {
  const resident = resolveResidentIntent(
    testCase.query,
    testCase.language as ResidentLanguage
  );

  if (resident) {
    return resident.source;
  }

  if (detectSmallTalk(testCase.query)) {
    return "small-talk";
  }

  if (/оператор|человек|живым/i.test(testCase.query)) {
    return "operator-handoff";
  }

  return undefined;
}

function toEvalCandidate(candidate: KnowledgeSearchResult): EvaluatedCandidate {
  return {
    title: candidate.title ?? null,
    category: candidate.category ?? null,
    verified: Boolean(candidate.verified),
    score: Number(candidate.score.toFixed(4)),
    semantic: Number(candidate.similarity.toFixed(4)),
  };
}

function toEvalCandidateV2(candidate: RetrievalCandidate): EvaluatedCandidate {
  return {
    title: candidate.title ?? null,
    category: candidate.category ?? null,
    verified: Boolean(candidate.verified),
    score: candidate.score,
    semantic: candidate.scoreBreakdown.semantic,
    lexical: candidate.scoreBreakdown.lexical,
  };
}

function legacyConfidence(top: KnowledgeSearchResult | undefined): RetrievalConfidence {
  if (!top) {
    return { level: "low", decision: "fallback", reasons: ["no candidates"] };
  }

  if (!top.verified || top.similarity < 0.62) {
    return {
      level: "low",
      decision: "fallback",
      reasons: ["legacy weak or unverified top candidate"],
    };
  }

  if (top.similarity > 0.72) {
    return {
      level: "high",
      decision: "answer",
      reasons: ["legacy direct threshold"],
    };
  }

  return {
    level: "medium",
    decision: "answer",
    reasons: ["legacy context threshold"],
  };
}

async function runLegacy(testCase: RagEvalCase) {
  const lexical = await searchKnowledgeLexical(testCase.query);
  const lexicalTop = lexical[0];
  const embedding = await createEmbedding(testCase.query);
  const semantic = await searchKnowledge(embedding, testCase.query);
  const useLexicalDirect =
    lexicalTop &&
    lexicalTop.score >= 0.72 &&
    lexicalTop.verified &&
    !hasResidentProblemSignal(testCase.query);
  const candidates = useLexicalDirect ? lexical : semantic;

  return {
    normalizedQuery: understandQuery({
      query: testCase.query,
      previousMessages: testCase.previousMessages,
    }).normalizedQuery,
    rewrittenQueries: [] as string[],
    candidates: candidates.map(toEvalCandidate),
    confidence: legacyConfidence(candidates[0]),
  };
}

async function runV2(testCase: RagEvalCase) {
  const result = await retrieveKnowledgeV2({
    query: testCase.query,
    previousMessages: testCase.previousMessages,
  });

  return {
    normalizedQuery: result.query.normalizedQuery,
    rewrittenQueries: result.query.rewrittenQueries,
    candidates: result.candidates.map(toEvalCandidateV2),
    confidence: result.confidence,
  };
}

function getRank(candidates: EvaluatedCandidate[], expectedTitles: string[]) {
  if (expectedTitles.length === 0) {
    return null;
  }

  const expected = new Set(expectedTitles.map((title) => title.toLowerCase()));
  const index = candidates.findIndex(
    (candidate) => candidate.title && expected.has(candidate.title.toLowerCase())
  );

  return index === -1 ? null : index + 1;
}

function isUnknownCase(testCase: RagEvalCase) {
  return Boolean(testCase.shouldRefuseOrFallback);
}

function evaluateCase(params: {
  testCase: RagEvalCase;
  routedIntent?: string;
  normalizedQuery: string;
  rewrittenQueries: string[];
  candidates: EvaluatedCandidate[];
  confidence: RetrievalConfidence;
}): EvalResult {
  const expected = params.testCase.expectedKnowledgeTitles ?? [];
  const rank = getRank(params.candidates, expected);
  const intentPass =
    params.testCase.expectedIntent &&
    params.routedIntent === params.testCase.expectedIntent;
  const unknownPass =
    isUnknownCase(params.testCase) &&
    params.confidence.decision !== "answer" &&
    params.confidence.level === "low";
  const retrievalPass = expected.length > 0 && rank !== null && rank <= 5;
  const pass = Boolean(intentPass || unknownPass || retrievalPass);
  const reason = intentPass
    ? "expected deterministic route matched"
    : unknownPass
      ? "unknown/out-of-domain kept low confidence"
      : retrievalPass
        ? `expected knowledge found at rank ${rank}`
        : "expected route/knowledge not found";

  return {
    id: params.testCase.id,
    category: params.testCase.category,
    query: params.testCase.query,
    normalizedQuery: params.normalizedQuery,
    rewrittenQueries: params.rewrittenQueries,
    expected,
    expectedIntent: params.testCase.expectedIntent,
    routedIntent: params.routedIntent,
    top: params.candidates.slice(0, 5),
    rank,
    confidence: params.confidence,
    pass,
    reason,
  };
}

function summarize(results: EvalResult[]) {
  const titleCases = results.filter((result) => result.expected.length > 0);
  const unknownCases = results.filter((result) =>
    ["no-answer", "out-of-domain"].includes(result.category)
  );
  const averageUsefulRank =
    titleCases
      .map((result) => result.rank)
      .filter((rank): rank is number => typeof rank === "number")
      .reduce((sum, rank) => sum + rank, 0) /
    Math.max(1, titleCases.filter((result) => result.rank !== null).length);
  const categories = new Map<string, EvalResult[]>();

  for (const result of results) {
    categories.set(result.category, [
      ...(categories.get(result.category) ?? []),
      result,
    ]);
  }

  return {
    pipeline,
    total: results.length,
    passed: results.filter((result) => result.pass).length,
    failed: results.filter((result) => !result.pass).length,
    hitAt1:
      titleCases.filter((result) => result.rank === 1).length /
      Math.max(1, titleCases.length),
    hitAt3:
      titleCases.filter((result) => result.rank !== null && result.rank <= 3)
        .length / Math.max(1, titleCases.length),
    hitAt5:
      titleCases.filter((result) => result.rank !== null && result.rank <= 5)
        .length / Math.max(1, titleCases.length),
    unknownCorrect:
      unknownCases.filter((result) => result.pass).length /
      Math.max(1, unknownCases.length),
    averageUsefulRank: Number(averageUsefulRank.toFixed(2)),
    byCategory: Object.fromEntries(
      Array.from(categories.entries()).map(([category, items]) => [
        category,
        {
          total: items.length,
          passed: items.filter((item) => item.pass).length,
          passRate:
            items.filter((item) => item.pass).length / Math.max(1, items.length),
        },
      ])
    ),
  };
}

function percent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

async function main() {
  const cases = readCases();
  const results: EvalResult[] = [];

  for (const testCase of cases) {
    const routedIntent = detectRouteIntent(testCase);
    const runResult =
      pipeline === "legacy" ? await runLegacy(testCase) : await runV2(testCase);

    results.push(
      evaluateCase({
        testCase,
        routedIntent,
        ...runResult,
      })
    );
  }

  const summary = summarize(results);
  const payload = { summary, results };

  if (savePath) {
    writeFileSync(
      resolve(process.cwd(), savePath),
      `${JSON.stringify(payload, null, 2)}\n`,
      "utf8"
    );
  }

  if (jsonOutput) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Retrieval evaluation (${pipeline})`);
  console.log(`Total: ${summary.total}`);
  console.log(`Passed: ${summary.passed}`);
  console.log(`Failed: ${summary.failed}`);
  console.log(`Hit@1: ${percent(summary.hitAt1)}`);
  console.log(`Hit@3: ${percent(summary.hitAt3)}`);
  console.log(`Hit@5: ${percent(summary.hitAt5)}`);
  console.log(`Unknown correctness: ${percent(summary.unknownCorrect)}`);
  console.log(`Average useful rank: ${summary.averageUsefulRank}`);
  console.log("By category:");

  for (const [category, item] of Object.entries(summary.byCategory)) {
    console.log(
      `  ${category}: ${item.passed}/${item.total} (${percent(item.passRate)})`
    );
  }

  const failed = results.filter((result) => !result.pass).slice(0, 12);

  if (failed.length > 0) {
    console.log("Failed cases:");
    for (const result of failed) {
      console.log(
        `  ${result.id}: ${result.query} -> ${result.top
          .map((candidate) => candidate.title)
          .join(" | ")}`
      );
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(message);
  process.exitCode = 1;
});
