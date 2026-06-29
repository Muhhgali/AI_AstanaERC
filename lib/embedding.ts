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

export async function createEmbedding(text: string) {
  const cacheKey = text.replace(/\s+/g, " ").trim().toLowerCase();
  const cached = embeddingCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const res = await getOpenAI().embeddings.create({
    model: "text-embedding-3-small",
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
