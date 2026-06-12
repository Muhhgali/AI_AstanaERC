import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

type KnowledgeItem = {
  title: string;
  category: string;
  content: string;
  priority?: number;
  verified?: boolean;
  source?: string;
};

type ExistingKnowledge = {
  id: string;
  title: string | null;
  category: string | null;
};

const DEFAULT_FILE = "data/knowledge.json";
const EMBEDDING_MODEL = "text-embedding-3-small";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !serviceRoleKey || !openaiApiKey) {
  throw new Error(
    "Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY"
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const openai = new OpenAI({
  apiKey: openaiApiKey,
});

function clampPriority(priority: number | undefined) {
  if (typeof priority !== "number") {
    return 0;
  }

  return Math.min(Math.max(priority, 0), 100);
}

function normalizeItem(item: KnowledgeItem): KnowledgeItem {
  return {
    title: item.title.trim(),
    category: item.category.trim(),
    content: item.content.trim(),
    priority: clampPriority(item.priority),
    verified: Boolean(item.verified),
    source: item.source?.trim() || "knowledge.json",
  };
}

function validateItem(item: KnowledgeItem, index: number) {
  const missing = [];

  if (!item.title?.trim()) missing.push("title");
  if (!item.category?.trim()) missing.push("category");
  if (!item.content?.trim()) missing.push("content");

  if (missing.length > 0) {
    throw new Error(
      `Invalid knowledge item at index ${index}: missing ${missing.join(
        ", "
      )}`
    );
  }
}

function readKnowledge(filePath: string) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(absolutePath, "utf-8");
  const parsed = JSON.parse(raw) as KnowledgeItem[];

  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON array`);
  }

  return parsed.map((item, index) => {
    validateItem(item, index);
    return normalizeItem(item);
  });
}

async function createEmbedding(item: KnowledgeItem) {
  const input = [
    item.title,
    item.category,
    item.content,
    item.verified ? "Проверенная информация" : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input,
  });

  return res.data[0].embedding;
}

async function findExisting(item: KnowledgeItem) {
  const { data, error } = await supabase
    .from("knowledge")
    .select("id,title,category")
    .eq("title", item.title)
    .eq("category", item.category)
    .limit(2);

  if (error) {
    throw error;
  }

  return (data ?? []) as ExistingKnowledge[];
}

async function ensureMetadataColumns() {
  const { error } = await supabase
    .from("knowledge")
    .select("priority,verified,source")
    .limit(1);

  if (!error) {
    return;
  }

  throw new Error(
    [
      "The knowledge table is missing priority/verified/source metadata columns.",
      "Run scripts/knowledgeMetadata.sql in the Supabase SQL Editor first.",
      `Supabase error: ${error.message}`,
    ].join(" ")
  );
}

async function upsertItem(item: KnowledgeItem) {
  const embedding = await createEmbedding(item);
  const existing = await findExisting(item);

  const record = {
    title: item.title,
    category: item.category,
    content: item.content,
    priority: item.priority,
    verified: item.verified,
    source: item.source,
    embedding,
  };

  if (existing.length === 0) {
    const { error } = await supabase
      .from("knowledge")
      .insert(record);

    if (error) {
      throw error;
    }

    return "inserted";
  }

  const { error } = await supabase
    .from("knowledge")
    .update(record)
    .eq("id", existing[0].id);

  if (error) {
    throw error;
  }

  if (existing.length > 1) {
    console.log(
      `Duplicate rows found for "${item.title}" / "${item.category}". Updated first row only.`
    );
  }

  return "updated";
}

async function run() {
  const filePath = process.argv[2] ?? DEFAULT_FILE;
  const items = readKnowledge(filePath);

  await ensureMetadataColumns();

  let inserted = 0;
  let updated = 0;
  let failed = 0;

  console.log(`Upserting ${items.length} knowledge items from ${filePath}`);

  for (const item of items) {
    try {
      const result = await upsertItem(item);

      if (result === "inserted") inserted++;
      if (result === "updated") updated++;

      console.log(`${result}: ${item.title}`);
    } catch (error) {
      failed++;
      const message =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`failed: ${item.title} - ${message}`);
    }
  }

  console.log(
    `Done. Inserted: ${inserted}. Updated: ${updated}. Failed: ${failed}.`
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
