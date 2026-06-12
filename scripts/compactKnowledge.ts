import "dotenv/config";

import fs from "node:fs";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

type KnowledgeRow = {
  id: string;
  title: string | null;
  category: string | null;
  content: string | null;
  priority: number | null;
  verified: boolean | null;
  source: string | null;
};

type CompactKnowledgeItem = {
  title: string;
  category: string;
  content: string;
  priority: number;
  verified: boolean;
  source: string;
};

const MODEL = "gpt-4.1-mini";
const OUTPUT_FILE = "data/knowledge.compact.json";
const REPORT_FILE = "data/knowledge.compact.report.md";
const MAX_ITEMS_PER_CATEGORY = 10;

const CATEGORIES = [
  {
    id: "payments",
    label: "Оплата",
    aliases: ["payments", "payment"],
  },
  {
    id: "meters",
    label: "Показания",
    aliases: ["meters", "meter"],
  },
  {
    id: "receipts",
    label: "Квитанции",
    aliases: ["receipts", "receipt", "epd"],
  },
  {
    id: "accounts",
    label: "Лицевой счет",
    aliases: ["accounts", "account"],
  },
  {
    id: "billing",
    label: "Начисления",
    aliases: ["billing", "charges"],
  },
  {
    id: "support",
    label: "Поддержка",
    aliases: ["support", "company"],
  },
  {
    id: "services",
    label: "Онлайн-сервисы",
    aliases: ["services", "service"],
  },
];

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !serviceRoleKey || !openaiApiKey) {
  throw new Error(
    "Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY"
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

function canonicalCategory(category: string | null) {
  const normalized = (category ?? "").toLowerCase().trim();

  return (
    CATEGORIES.find((item) => item.aliases.includes(normalized))?.id ??
    CATEGORIES.find((item) => item.id === normalized)?.id ??
    "support"
  );
}

function cleanText(text: string | null) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function stripCodeFence(text: string) {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

async function fetchKnowledge() {
  const rows: KnowledgeRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("knowledge")
      .select("id,title,category,content,priority,verified,source")
      .range(from, to);

    if (error) {
      throw error;
    }

    rows.push(...((data ?? []) as KnowledgeRow[]));

    if (!data || data.length < pageSize) {
      break;
    }
  }

  return rows.filter((item) => cleanText(item.content));
}

function groupByCategory(rows: KnowledgeRow[]) {
  return rows.reduce<Record<string, KnowledgeRow[]>>((acc, row) => {
    const category = canonicalCategory(row.category);

    acc[category] ??= [];
    acc[category].push(row);

    return acc;
  }, {});
}

async function compactCategory(
  category: string,
  rows: KnowledgeRow[]
): Promise<CompactKnowledgeItem[]> {
  const categoryLabel =
    CATEGORIES.find((item) => item.id === category)?.label ?? category;

  const sourceText = rows
    .map((row, index) => {
      return [
        `#${index + 1}`,
        `title: ${cleanText(row.title)}`,
        `category: ${cleanText(row.category)}`,
        `verified: ${Boolean(row.verified)}`,
        `priority: ${row.priority ?? 0}`,
        `source: ${cleanText(row.source) || "unknown"}`,
        `content: ${cleanText(row.content)}`,
      ].join("\n");
    })
    .join("\n\n---\n\n");

  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: [
          "Ты сжимаешь базу знаний для RAG-бота.",
          "Нужно объединить повторы и сохранить все уникальные факты.",
          "Нельзя придумывать новые факты, номера, адреса, сроки или ссылки.",
          "Если факт неточный или общий, оставь его общим.",
          "Возвращай только JSON-массив без markdown.",
          "Каждый объект: title, category, content, priority, verified, source.",
          "category всегда должен быть одним из: payments, meters, receipts, accounts, billing, support, services.",
          "verified=true ставь только если хотя бы одна исходная запись verified=true.",
          "priority ставь 100 для verified=true, иначе 40.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `Раздел: ${categoryLabel} (${category})`,
          `Сожми эти записи максимум до ${MAX_ITEMS_PER_CATEGORY} итоговых записей.`,
          "Сохрани смысл и важные условия. Убери дубли.",
          "",
          sourceText,
        ].join("\n"),
      },
    ],
  });

  const raw = completion.choices[0].message.content ?? "[]";
  const parsed = JSON.parse(stripCodeFence(raw)) as CompactKnowledgeItem[];

  if (!Array.isArray(parsed)) {
    throw new Error(`Model returned non-array for ${category}`);
  }

  return parsed.map((item) => ({
    title: cleanText(item.title),
    category,
    content: cleanText(item.content),
    priority: item.verified ? 100 : 40,
    verified: Boolean(item.verified),
    source: item.source || "compact",
  }));
}

async function run() {
  const rows = await fetchKnowledge();
  const groups = groupByCategory(rows);
  const compactItems: CompactKnowledgeItem[] = [];
  const reportLines = [
    "# Knowledge Compact Report",
    "",
    `Original rows: ${rows.length}`,
    "",
  ];

  for (const category of CATEGORIES.map((item) => item.id)) {
    const group = groups[category] ?? [];

    if (group.length === 0) {
      continue;
    }

    console.log(`Compacting ${category}: ${group.length} rows`);
    const compacted = await compactCategory(category, group);
    compactItems.push(...compacted);

    reportLines.push(
      `- ${category}: ${group.length} -> ${compacted.length}`
    );
  }

  fs.writeFileSync(
    OUTPUT_FILE,
    `${JSON.stringify(compactItems, null, 2)}\n`,
    "utf-8"
  );

  reportLines.push("", `Compact rows: ${compactItems.length}`, "");
  reportLines.push(
    "This file is a draft. Review it before replacing Supabase data."
  );

  fs.writeFileSync(REPORT_FILE, `${reportLines.join("\n")}\n`, "utf-8");

  console.log(`Wrote ${OUTPUT_FILE}`);
  console.log(`Wrote ${REPORT_FILE}`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(message);
  process.exitCode = 1;
});
