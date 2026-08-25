import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseProjectUrl } from "@/lib/supabaseEnv";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { enforceRateLimit, RATE_LIMIT_POLICIES } from "@/lib/rateLimit";

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

function getSupabase() {
  const supabaseUrl = getSupabaseProjectUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  return createClient(
    supabaseUrl,
    supabaseAnonKey
  );
}

export async function POST(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const rateLimited = enforceRateLimit(req, RATE_LIMIT_POLICIES.adminAiMutation);

  if (rateLimited) {
    return rateLimited;
  }

  try {
    const body = await req.json().catch(() => ({}));
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const answer = typeof body.answer === "string" ? body.answer.trim() : "";
    const keywords = typeof body.keywords === "string" ? body.keywords.trim() : "";

    if (!question || !answer) {
      return Response.json(
        { message: "question and answer are required" },
        { status: 400 }
      );
    }

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
      return Response.json(
        { message: "Failed to create FAQ entry" },
        { status: 500 }
      );
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { message: "Failed to create FAQ entry" },
      { status: 500 }
    );
  }
}
