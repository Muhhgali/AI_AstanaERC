import "dotenv/config";

import OpenAI from "openai";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildAssistantPromptV2 } from "@/lib/ai/prompts/assistantPromptV2";
import { retrieveKnowledgeV2 } from "@/lib/rag/hybridRetrieval";
import {
  hasResidentProblemSignal,
  resolveResidentIntent,
  type ResidentLanguage,
} from "@/lib/residentIntent";
import {
  clarificationAnswer,
  decideClarification,
} from "@/lib/clarification";
import type {
  ExpectedBehavior,
  RealWorldEvalCase,
} from "@/lib/eval/realWorld";

type AnswerEvalResult = {
  id: string;
  query: string;
  category: string;
  labelQuality: RealWorldEvalCase["labelQuality"];
  expectedBehavior: ExpectedBehavior;
  source: string;
  answer: string;
  topKnowledge: Array<{
    title: string | null;
    score: number;
    verified: boolean;
  }>;
  confidence: {
    level: string;
    decision: string;
    reasons: string[];
  };
  retrievalCorrect: boolean | null;
  behaviorCorrect: boolean;
  grounded: boolean;
  hallucination: boolean;
  clarificationAppropriate: boolean | null;
  outOfDomainCorrect: boolean | null;
  toneOk: boolean;
  actionable: boolean;
  pass: boolean;
  failureType: FailureType | null;
  notes: string[];
};

type FailureType =
  | "RETRIEVAL_FAILURE"
  | "KNOWLEDGE_GAP"
  | "PROMPT_FAILURE"
  | "CONFIDENCE_FAILURE"
  | "INTENT_FAILURE"
  | "MULTI_TURN_FAILURE"
  | "MULTI_INTENT_FAILURE"
  | "LANGUAGE_FAILURE"
  | "UX_FAILURE";

const args = process.argv.slice(2);
const inputPath = getArg("--input", "data/real-world-eval.json");
const savePath = getArg("--save", ".tmp/answer-eval-real-world.json");
const limit = Number(getArg("--limit", "0"));
const noLlm = args.includes("--no-llm");
const jsonOutput = args.includes("--json");

let openai: OpenAI | null = null;

function getArg(name: string, fallback: string) {
  const index = args.indexOf(name);

  return index === -1 ? fallback : args[index + 1] ?? fallback;
}

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

function ensureParent(path: string) {
  mkdirSync(dirname(resolve(process.cwd(), path)), { recursive: true });
}

function readCases() {
  const parsed = JSON.parse(
    readFileSync(resolve(process.cwd(), inputPath), "utf8")
  ) as RealWorldEvalCase[];

  return limit > 0 ? parsed.slice(0, limit) : parsed;
}

function hasPromptSafetySignal(question: string) {
  const normalized = question.toLowerCase().replace(/ё/g, "е");

  return [
    "системн",
    "system prompt",
    "system instructions",
    "покажи промт",
    "покажи prompt",
    "скрытые инструк",
    "внутренние инструк",
    "игнорируй инструк",
    "игнорируй предыдущ",
    "ignore previous",
    "ignore instructions",
    "не используй базу",
    "придумай номер",
    "скажи api ключ",
    "api key",
    "секрет",
    "стань другим ботом",
  ].some((phrase) => normalized.includes(phrase));
}

function buildPromptSafetyAnswer(language: ResidentLanguage) {
  if (language === "kk") {
    return "Ішкі нұсқауларды, жүйелік prompt-ты немесе құпия деректерді көрсете алмаймын. Астана-ЕРЦ қызметтері бойынша сұрағыңызды жазыңыз — қолымдағы тексерілген ақпаратпен көмектесемін.";
  }

  return "Я не могу показывать внутренние инструкции, системный prompt или секретные данные. Если вопрос по услугам Астана-ЕРЦ — напишите его обычными словами, помогу по проверенной информации.";
}

function buildFallbackAnswer(language: ResidentLanguage, outOfDomain = false) {
  if (language === "kk") {
    return outOfDomain
      ? "Мен Астана-ЕРЦ қызметтері бойынша көмектесемін: ЕПД, төлем, түбіртек, көрсеткіштер және өтініштер. Осы тақырып бойынша сұрағыңызды жазыңыз."
      : "Бұл сұрақ бойынша базада әзірге нақты тексерілген ақпарат жоқ. Қате мәлімет бермеу үшін жауапты ойдан шығармаймын. Нақтылап жіберіңізші: төлем, түбіртек, көрсеткіш, дербес шот, жеткізуші немесе өтініш бойынша сұрап тұрсыз ба?";
  }

  return outOfDomain
    ? "Я помогаю с вопросами по услугам Астана-ЕРЦ: ЕПД, оплатой, квитанциями, показаниями и обращениями. Напишите вопрос по этой теме — помогу разобраться."
    : "По этому вопросу в базе пока нет точной проверенной информации. Я не буду придумывать ответ, чтобы не дать неверные данные. Уточните, пожалуйста, что именно нужно проверить: оплата, квитанция, показания, лицевой счёт, поставщик или обращение?";
}

function buildContext(
  selectedContext: Array<{ title?: string | null; content?: string | null }>
) {
  return selectedContext
    .map((item) =>
      [`TITLE:`, item.title ?? "", "", "CONTENT:", item.content ?? ""].join("\n")
    )
    .join("\n\n");
}

async function generateAnswer(testCase: RealWorldEvalCase) {
  if (hasPromptSafetySignal(testCase.sanitizedQuery)) {
    return {
      source: "uncertain",
      answer: buildPromptSafetyAnswer(testCase.language),
      retrieval: await retrieveKnowledgeV2({
        query: testCase.sanitizedQuery,
        previousMessages: testCase.previousContext,
      }),
    };
  }

  const resident = resolveResidentIntent(
    testCase.sanitizedQuery,
    testCase.language
  );

  if (resident) {
    return {
      source: resident.source,
      answer: resident.answer,
      retrieval: await retrieveKnowledgeV2({
        query: testCase.sanitizedQuery,
        previousMessages: testCase.previousContext,
      }),
    };
  }

  const retrieval = await retrieveKnowledgeV2({
    query: testCase.sanitizedQuery,
    previousMessages: testCase.previousContext,
  });

  if (retrieval.query.isOutOfDomain || retrieval.confidence.level === "low") {
    return {
      source: "uncertain",
      answer: buildFallbackAnswer(testCase.language, retrieval.query.isOutOfDomain),
      retrieval,
    };
  }

  const top = retrieval.candidates[0];

  if (
    retrieval.confidence.level === "high" &&
    top?.verified &&
    !hasResidentProblemSignal(testCase.sanitizedQuery)
  ) {
    return {
      source: "knowledge-direct",
      answer: top.content ?? "",
      retrieval,
    };
  }

  const clarificationDecision = decideClarification({
    query: testCase.sanitizedQuery,
    language: testCase.language,
    confidence: retrieval.confidence,
    intentHints: retrieval.query.intentHints,
    isOutOfDomain: retrieval.query.isOutOfDomain,
    requiresPrivateAccountLookup: retrieval.query.requiresPrivateAccountLookup,
    candidates: retrieval.candidates,
  });

  if (clarificationDecision.action === "clarify") {
    return {
      source: `clarification:${clarificationDecision.reason}`,
      answer: clarificationAnswer(clarificationDecision),
      retrieval,
    };
  }

  if (noLlm) {
    return {
      source: "eval-no-llm",
      answer:
        retrieval.confidence.level === "medium"
          ? "Уточните, пожалуйста, какой именно вопрос нужно решить?"
          : top?.content ?? buildFallbackAnswer(testCase.language),
      retrieval,
    };
  }

  const context = buildContext(retrieval.selectedContext);
  const prompt = buildAssistantPromptV2({
    language: testCase.language,
    knowledgeContext: context,
    confidence: retrieval.confidence.level,
  });
  const completion = await getOpenAI().chat.completions.create({
    model: process.env.OPENAI_ANSWER_EVAL_MODEL ?? "gpt-4-turbo",
    temperature: 0.2,
    messages: [
      { role: "system", content: prompt },
      ...(testCase.previousContext ?? []),
      { role: "user", content: testCase.sanitizedQuery },
    ],
  });

  return {
    source: "gpt",
    answer: completion.choices[0].message.content ?? "",
    retrieval,
  };
}

function includesAny(text: string, needles: string[]) {
  const normalized = text.toLowerCase();

  return needles.some((needle) => normalized.includes(needle.toLowerCase()));
}

function isClarification(answer: string) {
  return includesAny(answer, [
    "уточните",
    "подскажите",
    "какой именно",
    "о какой",
    "что происходит",
    "нақтылап",
    "қай",
  ]) || answer.includes("?");
}

function isFallback(answer: string) {
  return includesAny(answer, [
    "нет точной",
    "не буду придумывать",
    "предназначен для вопросов",
    "помогаю с вопросами по услугам",
    "әзірге нақты",
    "ойдан шығармаймын",
  ]);
}

function isActionable(answer: string) {
  return includesAny(answer, [
    "напишите",
    "уточните",
    "проверьте",
    "приложите",
    "перейдите",
    "обратитесь",
    "жазыңыз",
    "нақтыла",
    "тексер",
  ]);
}

function hasInternalLeak(answer: string) {
  return includesAny(answer, [
    "RAG",
    "retrieval",
    "confidence",
    "similarity",
    "embedding",
    "knowledge id",
  ]);
}

function expectedBehaviorPass(
  expected: ExpectedBehavior,
  answer: string,
  source: string
) {
  if (expected === "clarify") return isClarification(answer);
  if (expected === "fallback") return isFallback(answer);
  if (expected === "escalate") {
    return includesAny(answer, ["поддерж", "оператор", "whatsapp", "техник"]);
  }
  if (expected === "multi_intent") {
    return (
      source.includes("multi-intent") ||
      (includesAny(answer, ["плат", "оплат", "төлем"]) &&
        includesAny(answer, ["показан", "счетчик", "көрсеткіш"]))
    );
  }

  return !isFallback(answer);
}

function classifyFailure(params: {
  testCase: RealWorldEvalCase;
  retrievalCorrect: boolean | null;
  behaviorCorrect: boolean;
  hallucination: boolean;
  confidenceLevel: string;
  pass: boolean;
}): FailureType | null {
  if (params.pass) return null;
  if (params.confidenceLevel === "high") return "CONFIDENCE_FAILURE";
  if (params.testCase.expectedBehavior === "multi_intent") return "MULTI_INTENT_FAILURE";
  if (params.testCase.previousContext?.length) return "MULTI_TURN_FAILURE";
  if (params.retrievalCorrect === false) return "RETRIEVAL_FAILURE";
  if (params.testCase.labelQuality === "needs_human_review") return "KNOWLEDGE_GAP";
  if (!params.behaviorCorrect) return "INTENT_FAILURE";
  if (params.hallucination) return "PROMPT_FAILURE";

  return "UX_FAILURE";
}

async function evaluateCase(testCase: RealWorldEvalCase): Promise<AnswerEvalResult> {
  const generated = await generateAnswer(testCase);
  const topKnowledge = generated.retrieval.candidates.slice(0, 5).map((item) => ({
    title: item.title ?? null,
    score: item.score,
    verified: Boolean(item.verified),
  }));
  const expectedKnowledge = new Set(
    testCase.expectedKnowledge.map((title) => title.toLowerCase())
  );
  const retrievalCorrect =
    expectedKnowledge.size === 0
      ? null
      : topKnowledge.some(
          (item) => item.title && expectedKnowledge.has(item.title.toLowerCase())
        );
  const forbiddenHit = testCase.forbiddenClaims.some((claim) =>
    generated.answer.toLowerCase().includes(claim.toLowerCase())
  );
  const internalLeak = hasInternalLeak(generated.answer);
  const behaviorCorrect = expectedBehaviorPass(
    testCase.expectedBehavior,
    generated.answer,
    generated.source
  );
  const hallucination = forbiddenHit || internalLeak;
  const clarificationAppropriate = testCase.shouldClarify
    ? isClarification(generated.answer)
    : null;
  const outOfDomainCorrect =
    testCase.category === "out-of-domain" ? isFallback(generated.answer) : null;
  const toneOk =
    generated.answer.length <= 900 &&
    !includesAny(generated.answer, ["как искусственный интеллект", "RAG", "retrieval"]);
  const actionable =
    testCase.expectedBehavior === "fallback" || isActionable(generated.answer);
  const pass = Boolean(
    behaviorCorrect &&
      !hallucination &&
      toneOk &&
      (retrievalCorrect !== false)
  );
  const failureType = classifyFailure({
    testCase,
    retrievalCorrect,
    behaviorCorrect,
    hallucination,
    confidenceLevel: generated.retrieval.confidence.level,
    pass,
  });
  const notes: string[] = [];

  if (forbiddenHit) notes.push("Forbidden claim/internal wording detected.");
  if (internalLeak) notes.push("Internal technical term leaked.");
  if (!behaviorCorrect) notes.push("Expected behavior did not match.");
  if (retrievalCorrect === false) notes.push("Expected knowledge was not in top candidates.");
  if (!actionable) notes.push("No clear next step detected.");

  return {
    id: testCase.id,
    query: testCase.sanitizedQuery,
    category: testCase.category,
    labelQuality: testCase.labelQuality,
    expectedBehavior: testCase.expectedBehavior,
    source: generated.source,
    answer: generated.answer,
    topKnowledge,
    confidence: generated.retrieval.confidence,
    retrievalCorrect,
    behaviorCorrect,
    grounded: !hallucination,
    hallucination,
    clarificationAppropriate,
    outOfDomainCorrect,
    toneOk,
    actionable,
    pass,
    failureType,
    notes,
  };
}

function ratio(count: number, total: number) {
  return total === 0 ? 0 : Number((count / total).toFixed(4));
}

function summarize(results: AnswerEvalResult[]) {
  const byFailure = results.reduce<Record<string, number>>((acc, item) => {
    if (item.failureType) acc[item.failureType] = (acc[item.failureType] ?? 0) + 1;
    return acc;
  }, {});
  const confidence = results.reduce<Record<string, { total: number; passed: number }>>(
    (acc, item) => {
      const level = item.confidence.level;
      acc[level] ??= { total: 0, passed: 0 };
      acc[level].total += 1;
      if (item.pass) acc[level].passed += 1;
      return acc;
    },
    {}
  );
  const falseHigh = results.filter(
    (item) => item.confidence.level === "high" && !item.pass
  );

  return {
    total: results.length,
    passed: results.filter((item) => item.pass).length,
    failed: results.filter((item) => !item.pass).length,
    answerCorrectness: ratio(results.filter((item) => item.pass).length, results.length),
    groundedness: ratio(results.filter((item) => item.grounded).length, results.length),
    hallucinationRate: ratio(results.filter((item) => item.hallucination).length, results.length),
    clarificationCorrectness: ratio(
      results.filter((item) => item.clarificationAppropriate === true).length,
      results.filter((item) => item.clarificationAppropriate !== null).length
    ),
    outOfDomainCorrectness: ratio(
      results.filter((item) => item.outOfDomainCorrect === true).length,
      results.filter((item) => item.outOfDomainCorrect !== null).length
    ),
    actionableRate: ratio(results.filter((item) => item.actionable).length, results.length),
    byFailure,
    confidenceCalibration: Object.fromEntries(
      Object.entries(confidence).map(([level, item]) => [
        level,
        {
          ...item,
          passRate: ratio(item.passed, item.total),
        },
      ])
    ),
    falseHigh: falseHigh.map((item) => ({
      id: item.id,
      query: item.query,
      source: item.source,
      failureType: item.failureType,
      notes: item.notes,
      topKnowledge: item.topKnowledge.slice(0, 3),
    })),
  };
}

async function main() {
  const cases = readCases();
  const results: AnswerEvalResult[] = [];

  for (const testCase of cases) {
    results.push(await evaluateCase(testCase));
  }

  const summary = summarize(results);
  const payload = {
    evaluator: {
      version: "answer-eval-v1",
      inputPath,
      noLlm,
      note:
        "Deterministic answer-level evaluator. It is useful for regression/root-cause triage, not a substitute for human review.",
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

  console.log(`Answer evaluation (${cases.length} cases)`);
  console.log(`Passed: ${summary.passed}/${summary.total}`);
  console.log(`Answer correctness: ${Math.round(summary.answerCorrectness * 1000) / 10}%`);
  console.log(`Groundedness: ${Math.round(summary.groundedness * 1000) / 10}%`);
  console.log(`Hallucination rate: ${Math.round(summary.hallucinationRate * 1000) / 10}%`);
  console.log(`Clarification correctness: ${Math.round(summary.clarificationCorrectness * 1000) / 10}%`);
  console.log(`Out-of-domain correctness: ${Math.round(summary.outOfDomainCorrectness * 1000) / 10}%`);
  console.log("Failure distribution:", JSON.stringify(summary.byFailure));
  console.log("Confidence calibration:", JSON.stringify(summary.confidenceCalibration));
  console.log(`False HIGH: ${summary.falseHigh.length}`);
  console.log(`Saved: ${savePath}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(message);
  process.exitCode = 1;
});
