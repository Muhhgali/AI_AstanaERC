import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { question, answer, keywords } = await req.json();

    // 🧠 создаём embedding
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: question + " " + keywords,
    });

    const embedding = embeddingRes.data[0].embedding;

    // 💾 сохраняем в Supabase
    const { error } = await supabase.from("faq").insert([
      {
        question,
        answer,
        keywords,
        embedding,
      },
    ]);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json(
      { error: e.message },
      { status: 500 }
    );
  }
}