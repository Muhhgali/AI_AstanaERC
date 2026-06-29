import { supabase } from "@/lib/supabaseClient";

type KnowledgeRow = {
  id?: string;
  title?: string | null;
  category?: string | null;
  content?: string | null;
  embedding?: number[] | string | null;
  priority?: number | null;
  verified?: boolean | null;
  source?: string | null;
};

export type KnowledgeSearchResult = KnowledgeRow & {
  embedding: number[];
  similarity: number;
  score: number;
};

const DEBUG_RETRIEVAL =
  process.env.DEBUG_RETRIEVAL === "true";
const KNOWLEDGE_CACHE_TTL_MS = 5 * 60 * 1000;

let knowledgeCache:
  | {
      loadedAt: number;
      rows: (KnowledgeRow & { embedding: number[] })[];
    }
  | null = null;

function cosineSimilarity(a: number[], b: number[]) {
  if (!a?.length || !b?.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  const len = Math.min(a.length, b.length);

  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function parseEmbedding(
  embedding: KnowledgeRow["embedding"]
) {
  if (Array.isArray(embedding)) {
    return embedding;
  }

  if (typeof embedding !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(embedding);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 2);
}

function textOverlapScore(
  queryText: string,
  item: KnowledgeRow
) {
  const queryTokens = new Set(tokenize(queryText));

  if (queryTokens.size === 0) {
    return 0;
  }

  const itemTokens = new Set(
    tokenize(
      `${item.title ?? ""} ${item.category ?? ""} ${
        item.content ?? ""
      }`
    )
  );

  let matches = 0;

  for (const token of queryTokens) {
    if (itemTokens.has(token)) {
      matches++;
    }
  }

  return matches / queryTokens.size;
}

function priorityBoost(item: KnowledgeRow) {
  const priority =
    typeof item.priority === "number" ? item.priority : 0;
  const normalizedPriority = Math.min(
    Math.max(priority, 0),
    100
  );

  return normalizedPriority / 1000 + (item.verified ? 0.08 : 0);
}

async function loadKnowledgeRows() {
  if (
    knowledgeCache &&
    Date.now() - knowledgeCache.loadedAt < KNOWLEDGE_CACHE_TTL_MS
  ) {
    return knowledgeCache.rows;
  }

  const { data, error } = await supabase
    .from("knowledge")
    .select("id,title,category,content,embedding,priority,verified,source");

  if (error) {
    console.error("SUPABASE ERROR:", error);
    return [];
  }

  const rows = ((data ?? []) as KnowledgeRow[])
    .map((item) => ({
      ...item,
      embedding: parseEmbedding(item.embedding),
    }))
    .filter(
      (item): item is KnowledgeRow & { embedding: number[] } =>
        Array.isArray(item.embedding) &&
        item.embedding.length > 0 &&
        Boolean(item.content)
    );

  knowledgeCache = {
    loadedAt: Date.now(),
    rows,
  };

  return rows;
}

export async function searchKnowledge(
  queryEmbedding: number[],
  queryText = ""
) {
  try {
    const valid = await loadKnowledgeRows();

    if (valid.length === 0) {
      if (DEBUG_RETRIEVAL) {
        console.log("KNOWLEDGE TABLE EMPTY");
      }
      return [];
    }

    const scored: KnowledgeSearchResult[] = valid.map(
      (item) => {
        const similarity = cosineSimilarity(
          queryEmbedding,
          item.embedding
        );
        const overlap = queryText
          ? textOverlapScore(queryText, item)
          : 0;

        return {
          ...item,
          similarity,
          score:
            similarity +
            overlap * 0.05 +
            priorityBoost(item),
        };
      }
    );

    const sorted = scored.sort(
      (a, b) => b.score - a.score
    );

    if (DEBUG_RETRIEVAL) {
      console.log(
        "TOP RESULTS:",
        sorted.slice(0, 5).map((x) => ({
          title: x.title,
          similarity: Number(x.similarity.toFixed(4)),
          score: Number(x.score.toFixed(4)),
          priority: x.priority ?? 0,
          verified: Boolean(x.verified),
        }))
      );
    }

    return sorted.slice(0, 5);
  } catch (err) {
    console.error(
      "SEARCH KNOWLEDGE ERROR:",
      err
    );

    return [];
  }
}
