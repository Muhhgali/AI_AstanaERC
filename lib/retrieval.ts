import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase as anonSupabase } from "@/lib/supabaseClient";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";
import {
  isArchivedKnowledge,
  isPublishedKnowledge,
} from "@/lib/knowledgeLifecycle";
import { isOutdatedReadingsKnowledge } from "@/lib/site/outdatedContent";

const KNOWLEDGE_PAGE_SIZE = 1000;

let serverSupabase: SupabaseClient | null = null;

// The security migration enables RLS on `knowledge` with an admin-only policy.
// Reading it with the anon key then returns zero rows without an error, and the
// bot answers "нет подтверждённой информации" to everything. Retrieval runs on
// the server only, so it reads with the service-role key when available.
function getKnowledgeReader(): SupabaseClient {
  const url = getSupabaseProjectUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return anonSupabase;
  }

  serverSupabase ??= createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return serverSupabase;
}

async function selectAllKnowledge(columns: string) {
  const reader = getKnowledgeReader();
  const rows: KnowledgeRow[] = [];

  for (let from = 0; ; from += KNOWLEDGE_PAGE_SIZE) {
    const { data, error } = await reader
      .from("knowledge")
      .select(columns)
      .range(from, from + KNOWLEDGE_PAGE_SIZE - 1);

    if (error) {
      return { data: null, error };
    }

    const page = (data ?? []) as unknown as KnowledgeRow[];
    rows.push(...page);

    if (page.length < KNOWLEDGE_PAGE_SIZE) {
      return { data: rows, error: null };
    }
  }
}

export type KnowledgeRow = {
  id?: string;
  title?: string | null;
  category?: string | null;
  content?: string | null;
  embedding?: number[] | string | null;
  priority?: number | null;
  verified?: boolean | null;
  source?: string | null;
  language?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  content_hash?: string | null;
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

export function cosineSimilarity(a: number[], b: number[]) {
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

const RETRIEVAL_STOP_WORDS = new Set([
  "как",
  "что",
  "где",
  "это",
  "для",
  "при",
  "или",
  "мне",
  "мой",
  "моя",
  "мои",
  "меня",
  "нас",
  "вас",
  "все",
  "так",
  "его",
  "она",
  "они",
  "если",
  "можно",
  "нужно",
  "надо",
  "есть",
  "был",
  "была",
  "уже",
  "еще",
  "там",
  "тут",
  "подскажите",
  "скажите",
  "пожалуйста",
]);

// Crude Russian/Kazakh stemming: a fixed 5-letter prefix, so that
// "показания"/"показаниях", "оплата"/"оплатить" or "көрсеткіш"/"көрсеткішті"
// share one token regardless of the ending length.
function stemToken(token: string) {
  return token.slice(0, 5);
}

export function tokenizeForRetrieval(text: string) {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 2 && !RETRIEVAL_STOP_WORDS.has(token))
    .map(stemToken);
}

function textOverlapScore(
  queryText: string,
  item: KnowledgeRow
) {
  const queryTokens = new Set(tokenizeForRetrieval(queryText));

  if (queryTokens.size === 0) {
    return 0;
  }

  const itemTokens = new Set(
    tokenizeForRetrieval(
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

export function priorityBoost(item: KnowledgeRow) {
  const priority =
    typeof item.priority === "number" ? item.priority : 0;
  const normalizedPriority = Math.min(
    Math.max(priority, 0),
    100
  );

  return normalizedPriority / 1000 + (item.verified ? 0.08 : 0);
}

export async function loadKnowledgeRows() {
  if (
    knowledgeCache &&
    Date.now() - knowledgeCache.loadedAt < KNOWLEDGE_CACHE_TTL_MS
  ) {
    return knowledgeCache.rows;
  }

  const initialResult = await selectAllKnowledge(
    "id,title,category,content,embedding,priority,verified,source,language,status,metadata,content_hash"
  );
  let data = initialResult.data;
  let error = initialResult.error;

  if (
    error &&
    (error.code === "42703" ||
      error.message?.includes("status") ||
      error.message?.includes("language") ||
      error.message?.includes("content_hash") ||
      error.message?.includes("metadata"))
  ) {
    const fallback = await selectAllKnowledge(
      "id,title,category,content,embedding,priority,verified,source"
    );

    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.error("SUPABASE ERROR:", error);
    return [];
  }

  if ((data ?? []).length === 0) {
    console.warn(
      "KNOWLEDGE TABLE RETURNED 0 ROWS: check SUPABASE_SERVICE_ROLE_KEY and RLS on public.knowledge"
    );
  }

  const rows = (data ?? []).reduce<
    (KnowledgeRow & { embedding: number[] })[]
  >((rows, item) => {
    if (isArchivedKnowledge(item) || isOutdatedReadingsKnowledge(item)) {
      return rows;
    }

    const embedding = parseEmbedding(item.embedding);

    if (
      Array.isArray(embedding) &&
      embedding.length > 0 &&
      Boolean(item.content)
    ) {
      rows.push({
        ...item,
        verified: isPublishedKnowledge(item),
        embedding,
      });
    }

    return rows;
  }, []);

  // Do not keep an empty result for five minutes: it is usually a config error.
  if (rows.length > 0) {
    knowledgeCache = {
      loadedAt: Date.now(),
      rows,
    };
  }

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

export async function searchKnowledgeLexical(queryText: string) {
  try {
    const valid = await loadKnowledgeRows();

    if (!queryText.trim() || valid.length === 0) {
      return [];
    }

    const scored: KnowledgeSearchResult[] = valid
      .map((item) => {
        const overlap = textOverlapScore(queryText, item);

        return {
          ...item,
          similarity: overlap,
          score: overlap + priorityBoost(item),
        };
      })
      .filter((item) => item.similarity > 0);

    return scored.sort((a, b) => b.score - a.score).slice(0, 5);
  } catch (err) {
    console.error("LEXICAL KNOWLEDGE SEARCH ERROR:", err);
    return [];
  }
}
