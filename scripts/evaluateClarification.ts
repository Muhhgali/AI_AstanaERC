import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  decideClarification,
  type ClarificationDecision,
} from "@/lib/clarification";
import { understandQuery } from "@/lib/rag/queryUnderstanding";
import { resolveResidentIntent } from "@/lib/residentIntent";
import type {
  ExpectedBehavior,
  RealWorldEvalCase,
} from "@/lib/eval/realWorld";

type AnswerEvalResult = {
  id: string;
  query: string;
  category: string;
  expectedBehavior: ExpectedBehavior;
  source: string;
  answer: string;
  confidence: {
    level: string;
    decision: string;
    reasons: string[];
  };
  behaviorCorrect: boolean;
  pass: boolean;
  failureType: string | null;
  notes: string[];
  topKnowledge: Array<{
    title: string | null;
    score: number;
    verified: boolean;
  }>;
};

type AnswerEvalPayload = {
  results: AnswerEvalResult[];
};

const args = process.argv.slice(2);
const casesPath = getArg("--cases", "data/real-world-eval.json");
const baselinePath = getArg("--baseline", ".tmp/answer-eval-real-world.json");
const savePath = getArg("--save", ".tmp/clarification-eval.json");
const jsonOutput = args.includes("--json");

function getArg(name: string, fallback: string) {
  const index = args.indexOf(name);

  return index === -1 ? fallback : args[index + 1] ?? fallback;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as T;
}

function ensureParent(path: string) {
  mkdirSync(dirname(resolve(process.cwd(), path)), { recursive: true });
}

function expectedAction(expected: ExpectedBehavior) {
  if (expected === "clarify") return "clarify";
  if (expected === "fallback") return "fallback";
  if (expected === "escalate") return "handoff";
  if (expected === "multi_intent") return "clarify";

  return "answer";
}

function decisionMatchesExpected(
  decision: ClarificationDecision,
  expected: ExpectedBehavior
) {
  const action = expectedAction(expected);

  if (action === "handoff") {
    return decision.action === "handoff" || decision.action === "clarify";
  }

  return decision.action === action;
}

function classifyMediumRootCause(
  result: AnswerEvalResult,
  decision: ClarificationDecision
) {
  if (result.behaviorCorrect) return "BASELINE_PASS";
  if (decision.reason === "SUPPLIER_AMBIGUITY") return "SUPPLIER_AMBIGUITY";
  if (decision.reason === "RECEIPT_AMBIGUITY") return "RECEIPT_AMBIGUITY";
  if (decision.reason === "CONTACT_AMBIGUITY") return "CONTACT_AMBIGUITY";
  if (decision.reason === "PERSONAL_DATA_REQUIRED") return "PERSONAL_DATA_REQUIRED";
  if (decision.reason === "MULTIPLE_POSSIBLE_PROCESSES") return "MULTIPLE_POSSIBLE_PROCESSES";
  if (decision.reason === "TECHNICAL_AMBIGUITY") return "TECHNICAL_AMBIGUITY";
  if (decision.reason === "MISSING_PARAMETER") return "MISSING_PARAMETER";
  if (result.failureType === "KNOWLEDGE_GAP") return "KNOWLEDGE_GAP";

  return "AMBIGUOUS_INTENT";
}

function ratio(count: number, total: number) {
  return total === 0 ? 0 : Number((count / total).toFixed(4));
}

function main() {
  const cases = readJson<RealWorldEvalCase[]>(casesPath);
  const baseline = readJson<AnswerEvalPayload>(baselinePath);
  const casesById = new Map(cases.map((item) => [item.id, item]));
  const medium = baseline.results.filter(
    (item) => item.confidence.level === "medium"
  );
  const results = medium.map((result) => {
    const testCase = casesById.get(result.id);

    if (!testCase) {
      throw new Error(`Missing real-world case for ${result.id}`);
    }

    const preResolvedResidentIntent = resolveResidentIntent(
      testCase.sanitizedQuery,
      testCase.language
    );
    const understood = understandQuery({
      query: testCase.sanitizedQuery,
      previousMessages: testCase.previousContext,
    });
    const decision = preResolvedResidentIntent
      ? ({
          action: "answer",
          reason: "MEDIUM_SAFE_TO_ANSWER",
          candidateIntents: [preResolvedResidentIntent.kind],
        } as ClarificationDecision)
      : decideClarification({
          query: testCase.sanitizedQuery,
          language: testCase.language,
          confidence: {
            level: "medium",
            decision: result.confidence.decision === "answer" ? "answer" : "clarify",
            reasons: result.confidence.reasons,
          },
          intentHints: understood.intentHints,
          isOutOfDomain: understood.isOutOfDomain,
          requiresPrivateAccountLookup: understood.requiresPrivateAccountLookup,
          candidates: result.topKnowledge,
        });
    const staticCorrect = decisionMatchesExpected(
      decision,
      testCase.expectedBehavior
    );

    return {
      id: result.id,
      query: testCase.sanitizedQuery,
      category: testCase.category,
      expectedBehavior: testCase.expectedBehavior,
      baselineSource: result.source,
      baselineBehaviorCorrect: result.behaviorCorrect,
      baselinePass: result.pass,
      baselineFailureType: result.failureType,
      preResolvedResidentIntent: preResolvedResidentIntent?.kind ?? null,
      decision,
      staticCorrect,
      unnecessaryClarification:
        testCase.expectedBehavior === "answer" && decision.action === "clarify",
      wrongIntent:
        testCase.expectedBehavior === "clarify" && decision.action === "answer",
      rootCause: classifyMediumRootCause(result, decision),
      topKnowledge: result.topKnowledge.slice(0, 3),
    };
  });
  const expectedClarify = results.filter(
    (item) => item.expectedBehavior === "clarify"
  );
  const shouldAnswer = results.filter(
    (item) => item.expectedBehavior === "answer"
  );
  const taxonomy = results.reduce<Record<string, number>>((acc, item) => {
    if (!item.baselineBehaviorCorrect) {
      acc[item.rootCause] = (acc[item.rootCause] ?? 0) + 1;
    }
    return acc;
  }, {});
  const byDecision = results.reduce<Record<string, number>>((acc, item) => {
    acc[item.decision.reason] = (acc[item.decision.reason] ?? 0) + 1;
    return acc;
  }, {});
  const summary = {
    totalMedium: results.length,
    baselineBehaviorCorrect: results.filter((item) => item.baselineBehaviorCorrect)
      .length,
    baselineBehaviorCorrectRate: ratio(
      results.filter((item) => item.baselineBehaviorCorrect).length,
      results.length
    ),
    staticCorrect: results.filter((item) => item.staticCorrect).length,
    staticCorrectRate: ratio(
      results.filter((item) => item.staticCorrect).length,
      results.length
    ),
    expectedClarify: expectedClarify.length,
    correctlyClarified: expectedClarify.filter(
      (item) => item.decision.action === "clarify"
    ).length,
    shouldAnswer: shouldAnswer.length,
    correctlyAnsweredOrRouted: shouldAnswer.filter(
      (item) => item.decision.action === "answer"
    ).length,
    unnecessaryClarification: results.filter(
      (item) => item.unnecessaryClarification
    ).length,
    wrongIntent: results.filter((item) => item.wrongIntent).length,
    clarificationAccuracy: ratio(
      expectedClarify.filter((item) => item.decision.action === "clarify").length,
      expectedClarify.length
    ),
    taxonomy,
    byDecision,
  };
  const payload = {
    evaluator: {
      version: "clarification-eval-v1",
      casesPath,
      baselinePath,
      note:
        "Static deterministic MEDIUM-confidence evaluation. It does not call OpenAI.",
    },
    summary,
    results,
  };

  ensureParent(savePath);
  writeFileSync(
    resolve(process.cwd(), savePath),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );

  if (jsonOutput) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Clarification evaluation (${summary.totalMedium} MEDIUM cases)`);
  console.log(
    `Baseline behavior correctness: ${summary.baselineBehaviorCorrect}/${summary.totalMedium} (${Math.round(summary.baselineBehaviorCorrectRate * 1000) / 10}%)`
  );
  console.log(
    `Static clarification correctness: ${summary.staticCorrect}/${summary.totalMedium} (${Math.round(summary.staticCorrectRate * 1000) / 10}%)`
  );
  console.log(
    `Expected clarify: ${summary.expectedClarify}, correctly clarified: ${summary.correctlyClarified}`
  );
  console.log(
    `Should answer: ${summary.shouldAnswer}, correctly answered/routed: ${summary.correctlyAnsweredOrRouted}`
  );
  console.log(`Unnecessary clarification: ${summary.unnecessaryClarification}`);
  console.log(`Wrong intent: ${summary.wrongIntent}`);
  console.log("Failure taxonomy:", JSON.stringify(summary.taxonomy));
  console.log("Decision distribution:", JSON.stringify(summary.byDecision));
  console.log(`Saved: ${savePath}`);
}

main();
