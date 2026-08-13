import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { understandQuery } from "@/lib/rag/queryUnderstanding";
import type { RagEvalMessage, RetrievalIntentHint } from "@/lib/rag/types";

type MultiTurnEvalCase = {
  id: string;
  source: "historical" | "synthetic";
  previousUser: string;
  previousAssistant: string;
  followUp: string;
  previousContext: RagEvalMessage[];
  expectedReferent: "previous-topic" | "new-topic";
  expectedBehavior: "answer" | "clarify" | "fallback";
  expectedIntentHints: RetrievalIntentHint[];
  forbiddenIntentHints: RetrievalIntentHint[];
};

const args = process.argv.slice(2);
const inputPath = getArg("--input", "data/multi-turn-eval.json");
const savePath = getArg("--save", ".tmp/multi-turn-eval.json");
const jsonOutput = args.includes("--json");

function getArg(name: string, fallback: string) {
  const index = args.indexOf(name);

  return index === -1 ? fallback : args[index + 1] ?? fallback;
}

function readCases() {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), inputPath), "utf8")
  ) as MultiTurnEvalCase[];
}

function ensureParent(path: string) {
  mkdirSync(dirname(resolve(process.cwd(), path)), { recursive: true });
}

function ratio(count: number, total: number) {
  return total === 0 ? 0 : Number((count / total).toFixed(4));
}

function hasAll(haystack: RetrievalIntentHint[], needles: RetrievalIntentHint[]) {
  return needles.every((needle) => haystack.includes(needle));
}

function hasNone(haystack: RetrievalIntentHint[], needles: RetrievalIntentHint[]) {
  return needles.every((needle) => !haystack.includes(needle));
}

function main() {
  const cases = readCases();
  const results = cases.map((testCase) => {
    const understood = understandQuery({
      query: testCase.followUp,
      previousMessages: testCase.previousContext,
    });
    const intentHints = understood.intentHints.filter((hint) => hint !== "unknown");
    const expectedHintsOk =
      testCase.expectedIntentHints.length === 0 ||
      hasAll(intentHints, testCase.expectedIntentHints);
    const forbiddenHintsOk = hasNone(intentHints, testCase.forbiddenIntentHints);
    const topicShiftCorrect =
      testCase.expectedReferent !== "new-topic" || forbiddenHintsOk;
    const followUpCorrect =
      testCase.expectedReferent !== "previous-topic" || expectedHintsOk;
    const pass = expectedHintsOk && forbiddenHintsOk;

    return {
      id: testCase.id,
      source: testCase.source,
      followUp: testCase.followUp,
      expectedReferent: testCase.expectedReferent,
      expectedIntentHints: testCase.expectedIntentHints,
      forbiddenIntentHints: testCase.forbiddenIntentHints,
      actualIntentHints: intentHints,
      includeConversationContext: Boolean(understood.conversationContext),
      topicShiftCorrect,
      followUpCorrect,
      pass,
    };
  });
  const topicShift = results.filter((item) => item.expectedReferent === "new-topic");
  const followUp = results.filter((item) => item.expectedReferent === "previous-topic");
  const summary = {
    total: results.length,
    historical: results.filter((item) => item.source === "historical").length,
    synthetic: results.filter((item) => item.source === "synthetic").length,
    passed: results.filter((item) => item.pass).length,
    correctness: ratio(results.filter((item) => item.pass).length, results.length),
    topicShiftTotal: topicShift.length,
    topicShiftCorrect: topicShift.filter((item) => item.topicShiftCorrect).length,
    topicShiftCorrectness: ratio(
      topicShift.filter((item) => item.topicShiftCorrect).length,
      topicShift.length
    ),
    followUpTotal: followUp.length,
    followUpCorrect: followUp.filter((item) => item.followUpCorrect).length,
    followUpCorrectness: ratio(
      followUp.filter((item) => item.followUpCorrect).length,
      followUp.length
    ),
  };
  const payload = {
    evaluator: {
      version: "multi-turn-eval-v1",
      inputPath,
      note:
        "Static multi-turn/topic-shift evaluation. It does not call OpenAI.",
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

  console.log(`Multi-turn evaluation (${summary.total} cases)`);
  console.log(`Passed: ${summary.passed}/${summary.total}`);
  console.log(
    `Topic shift correctness: ${summary.topicShiftCorrect}/${summary.topicShiftTotal}`
  );
  console.log(
    `Follow-up correctness: ${summary.followUpCorrect}/${summary.followUpTotal}`
  );
  console.log(`Saved: ${savePath}`);
}

main();
