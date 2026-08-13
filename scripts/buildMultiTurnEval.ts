import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  detectEvalLanguage,
  isUsableSanitizedText,
  sanitizeForEval,
} from "@/lib/eval/realWorld";
import { understandQuery } from "@/lib/rag/queryUnderstanding";
import type { RagEvalMessage, RetrievalIntentHint } from "@/lib/rag/types";

type ChatMessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type MultiTurnEvalCase = {
  id: string;
  source: "historical" | "synthetic";
  previousUser: string;
  previousAssistant: string;
  followUp: string;
  previousContext: RagEvalMessage[];
  language: "ru" | "kk";
  expectedReferent: "previous-topic" | "new-topic";
  expectedBehavior: "answer" | "clarify" | "fallback";
  expectedIntentHints: RetrievalIntentHint[];
  forbiddenIntentHints: RetrievalIntentHint[];
  piiRedactions: string[];
  notes: string;
};

const args = process.argv.slice(2);
const maxCases = Number(getArg("--max", "30"));
const outputPath = getArg("--out", "data/multi-turn-eval.json");

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

function hasAny(text: string, phrases: string[]) {
  return phrases.some((phrase) => text.includes(phrase));
}

function tokenCount(text: string) {
  return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean).length;
}

function isLikelyFollowUp(text: string) {
  const normalized = text.toLowerCase();

  return (
    tokenCount(normalized) <= 8 &&
    hasAny(normalized, [
      "а как",
      "а где",
      "а сколько",
      "тогда",
      "это",
      "там",
      "да",
      "нет",
      "не помогло",
      "через сайт",
      "я уже пробовал",
      "дальше",
    ])
  );
}

function expectedBehaviorFor(text: string): MultiTurnEvalCase["expectedBehavior"] {
  const tokens = tokenCount(text);

  if (tokens <= 3 || hasAny(text.toLowerCase(), ["да", "нет", "не помогло"])) {
    return "clarify";
  }

  return "answer";
}

function sanitizeMessage(text: string) {
  const sanitized = sanitizeForEval(text);

  return {
    text: sanitized.text,
    redactions: sanitized.redactions,
  };
}

function makeSyntheticTopicShiftCases(startIndex: number): MultiTurnEvalCase[] {
  const samples = [
    {
      previousUser: "У меня проблема со счётчиком",
      previousAssistant: "Что нужно сделать со счётчиком: передать текущие показания или исправить уже отправленные?",
      followUp: "Квитанция не пришла",
      expectedIntentHints: ["receipt"] as RetrievalIntentHint[],
      forbiddenIntentHints: ["meter"] as RetrievalIntentHint[],
      notes: "Topic shift: meter -> receipt.",
    },
    {
      previousUser: "Оплата не отразилась",
      previousAssistant: "Что именно с оплатой: деньги списались или платёж не прошёл?",
      followUp: "Какой адрес офиса?",
      expectedIntentHints: ["support"] as RetrievalIntentHint[],
      forbiddenIntentHints: ["payment", "billing"] as RetrievalIntentHint[],
      notes: "Topic shift: payment -> contact.",
    },
    {
      previousUser: "ТОО Sanat Service",
      previousAssistant: "Что именно хотите узнать про ТОО Sanat Service: контакты, услугу или менеджера?",
      followUp: "Когда формируется квитанция?",
      expectedIntentHints: ["receipt"] as RetrievalIntentHint[],
      forbiddenIntentHints: ["supplier"] as RetrievalIntentHint[],
      notes: "Topic shift: supplier -> receipt.",
    },
  ];

  return samples.map((sample, index) => ({
    id: `mt-${String(startIndex + index + 1).padStart(3, "0")}`,
    source: "synthetic",
    previousUser: sample.previousUser,
    previousAssistant: sample.previousAssistant,
    followUp: sample.followUp,
    previousContext: [
      { role: "user", content: sample.previousUser },
      { role: "assistant", content: sample.previousAssistant },
    ],
    language: "ru",
    expectedReferent: "new-topic",
    expectedBehavior: "answer",
    expectedIntentHints: sample.expectedIntentHints,
    forbiddenIntentHints: sample.forbiddenIntentHints,
    piiRedactions: [],
    notes: sample.notes,
  }));
}

async function main() {
  const { data, error } = await getSupabase()
    .from("chat_messages")
    .select("id,conversation_id,role,content,created_at")
    .order("created_at", { ascending: true })
    .limit(2500);

  if (error) throw error;

  const byConversation = new Map<string, ChatMessageRow[]>();

  for (const row of (data ?? []) as ChatMessageRow[]) {
    if (!row.conversation_id || !row.content?.trim()) continue;
    byConversation.set(row.conversation_id, [
      ...(byConversation.get(row.conversation_id) ?? []),
      row,
    ]);
  }

  const cases: MultiTurnEvalCase[] = [];

  for (const rows of byConversation.values()) {
    for (let index = 2; index < rows.length; index += 1) {
      const previousUser = rows[index - 2];
      const previousAssistant = rows[index - 1];
      const followUp = rows[index];

      if (
        previousUser.role !== "user" ||
        previousAssistant.role !== "assistant" ||
        followUp.role !== "user" ||
        !isLikelyFollowUp(followUp.content)
      ) {
        continue;
      }

      const sanitizedPreviousUser = sanitizeMessage(previousUser.content);
      const sanitizedPreviousAssistant = sanitizeMessage(previousAssistant.content);
      const sanitizedFollowUp = sanitizeMessage(followUp.content);

      if (
        !isUsableSanitizedText(sanitizedPreviousUser.text) ||
        !isUsableSanitizedText(sanitizedPreviousAssistant.text) ||
        !isUsableSanitizedText(sanitizedFollowUp.text)
      ) {
        continue;
      }

      const previousHints = understandQuery({
        query: sanitizedPreviousUser.text,
      }).intentHints.filter((hint) => hint !== "unknown");
      const followUpAlone = understandQuery({
        query: sanitizedFollowUp.text,
      }).intentHints.filter((hint) => hint !== "unknown");
      const expectedReferent =
        followUpAlone.length > 0 ? "new-topic" : "previous-topic";
      const expectedIntentHints =
        expectedReferent === "new-topic" ? followUpAlone : previousHints;
      const forbiddenIntentHints =
        expectedReferent === "new-topic"
          ? previousHints.filter((hint) => !expectedIntentHints.includes(hint))
          : [];
      const redactions = Array.from(
        new Set([
          ...sanitizedPreviousUser.redactions,
          ...sanitizedPreviousAssistant.redactions,
          ...sanitizedFollowUp.redactions,
        ])
      ).sort();

      cases.push({
        id: `mt-${String(cases.length + 1).padStart(3, "0")}`,
        source: "historical",
        previousUser: sanitizedPreviousUser.text,
        previousAssistant: sanitizedPreviousAssistant.text,
        followUp: sanitizedFollowUp.text,
        previousContext: [
          { role: "user", content: sanitizedPreviousUser.text },
          { role: "assistant", content: sanitizedPreviousAssistant.text },
        ],
        language: detectEvalLanguage(sanitizedFollowUp.text),
        expectedReferent,
        expectedBehavior: expectedBehaviorFor(sanitizedFollowUp.text),
        expectedIntentHints,
        forbiddenIntentHints,
        piiRedactions: redactions,
        notes:
          expectedReferent === "new-topic"
            ? "Real topic shift candidate."
            : "Real follow-up candidate.",
      });

      if (cases.length >= maxCases) break;
    }

    if (cases.length >= maxCases) break;
  }

  const withSynthetic = [
    ...cases,
    ...makeSyntheticTopicShiftCases(cases.length),
  ];

  ensureParent(outputPath);
  writeFileSync(
    resolve(process.cwd(), outputPath),
    `${JSON.stringify(withSynthetic, null, 2)}\n`,
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        outputPath,
        historicalCases: cases.length,
        syntheticCases: withSynthetic.length - cases.length,
        total: withSynthetic.length,
        redactedCases: withSynthetic.filter((item) => item.piiRedactions.length > 0).length,
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
