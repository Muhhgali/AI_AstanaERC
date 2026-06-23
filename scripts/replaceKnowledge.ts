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

const DEFAULT_FILE = "data/knowledge.compact.json";
const EMBEDDING_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 20;

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

function clampPriority(priority: unknown) {
  if (typeof priority !== "number" || !Number.isFinite(priority)) {
    return 0;
  }

  return Math.min(Math.max(priority, 0), 100);
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeItem(item: KnowledgeItem, index: number) {
  const normalized = {
    title: cleanText(item.title),
    category: cleanText(item.category),
    content: cleanText(item.content),
    priority: clampPriority(item.priority),
    verified: Boolean(item.verified),
    source: cleanText(item.source) || "compact",
  };

  const missing = [];
  if (!normalized.title) missing.push("title");
  if (!normalized.category) missing.push("category");
  if (!normalized.content) missing.push("content");

  if (missing.length > 0) {
    throw new Error(
      `Invalid knowledge item at index ${index}: missing ${missing.join(", ")}`
    );
  }

  return normalized;
}

function readKnowledge(filePath: string) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(absolutePath, "utf-8");
  const parsed = JSON.parse(raw) as KnowledgeItem[];

  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON array`);
  }

  return parsed.map(normalizeItem);
}

async function createEmbedding(item: ReturnType<typeof normalizeItem>) {
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

async function deleteExistingKnowledge() {
  const { error } = await supabase.from("knowledge").delete().not("id", "is", null);

  if (error) {
    throw error;
  }
}

async function run() {
  const filePath = process.argv[2] ?? DEFAULT_FILE;
  const confirmed = process.argv.includes("--yes");

  if (!confirmed) {
    throw new Error(
      "This replaces all rows in public.knowledge. Re-run with --yes to confirm."
    );
  }

  const items = readKnowledge(filePath);

  await ensureMetadataColumns();

  const records = [];

  console.log(`Preparing ${items.length} knowledge items from ${filePath}`);

  for (const item of items) {
    const embedding = await createEmbedding(item);

    records.push({
      ...item,
      embedding,
    });

    console.log(`embedded: ${item.title}`);
  }

  console.log("Deleting existing knowledge rows");
  await deleteExistingKnowledge();

  for (let index = 0; index < records.length; index += BATCH_SIZE) {
    const batch = records.slice(index, index + BATCH_SIZE);
    const { error } = await supabase.from("knowledge").insert(batch);

    if (error) {
      throw error;
    }

    console.log(`inserted: ${Math.min(index + BATCH_SIZE, records.length)}/${records.length}`);
  }

  console.log(`Done. Replaced knowledge with ${records.length} rows.`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(message);
  process.exitCode = 1;
});
