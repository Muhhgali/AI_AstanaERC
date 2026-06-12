import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

function getSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
}

export async function POST(req: Request) {
  try {
    const { question, answer, keywords } = await req.json();

    // 🧠 создаём embedding
    const embeddingRes = await getOpenAI().embeddings.create({
      model: "text-embedding-3-small",
      input: question + " " + keywords,
    });

    const embedding = embeddingRes.data[0].embedding;

    // 💾 сохраняем в Supabase
    const { error } = await getSupabase().from("faq").insert([
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
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Unknown error";

    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
