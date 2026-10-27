import OpenAI from "openai";

let openai: OpenAI | null = null;
const embeddingCache = new Map<string, number[]>();
const MAX_CACHE_ITEMS = 200;

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  openai ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  return openai;
}

export const EMBEDDING_MODEL = "text-embedding-3-small";

/** Embeds many texts in batches of 100 (one API call per batch). */
export async function createEmbeddings(texts: string[]) {
  const embeddings: number[][] = [];

  for (let start = 0; start < texts.length; start += 100) {
    const batch = texts.slice(start, start + 100);
    const res = await getOpenAI().embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });

    for (const item of [...res.data].sort((a, b) => a.index - b.index)) {
      embeddings.push(item.embedding);
    }
  }

  return embeddings;
}

export async function createEmbedding(text: string) {
  const cacheKey = text.replace(/\s+/g, " ").trim().toLowerCase();
  const cached = embeddingCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const res = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  const embedding = res.data[0].embedding;

  embeddingCache.set(cacheKey, embedding);

  if (embeddingCache.size > MAX_CACHE_ITEMS) {
    const firstKey = embeddingCache.keys().next().value;

    if (firstKey) {
      embeddingCache.delete(firstKey);
    }
  }

  return embedding;
}
