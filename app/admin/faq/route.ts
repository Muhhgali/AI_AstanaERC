import { supabase } from "@/lib/supabaseClient";
import { createEmbedding } from "@/lib/embedding";

export async function POST(req: Request) {
  const { question, answer, keywords } = await req.json();

  const embedding = await createEmbedding(question + " " + answer);

  const { data, error } = await supabase.from("faq").insert({
    question,
    answer,
    keywords,
    embedding,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true, data });
}