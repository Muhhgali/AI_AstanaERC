import { supabase } from "@/lib/supabaseClient";

function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0,
    normA = 0,
    normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function searchFaq(queryEmbedding: number[]) {
  const { data, error } = await supabase
    .from("faq")
    .select("*");

  if (error) {
    console.error("SUPABASE ERROR:", error);
    return [];
  }

  if (!data) return [];

  const results = data
    .filter((faq) => faq.embedding)
    .map((faq) => ({
      ...faq,
      score: cosineSimilarity(queryEmbedding, faq.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  console.log("TOP RESULT:", results[0]);

  return results;
}