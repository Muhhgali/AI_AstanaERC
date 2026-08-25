import { supabase } from "@/lib/supabaseClient";
import { createEmbedding } from "@/lib/embedding";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { enforceRateLimit, RATE_LIMIT_POLICIES } from "@/lib/rateLimit";

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

    const embedding = await createEmbedding(question + " " + answer);

    const { data, error } = await supabase.from("faq").insert({
      question,
      answer,
      keywords,
      embedding,
    });

    if (error) {
      return Response.json(
        { message: "Failed to create FAQ entry" },
        { status: 500 }
      );
    }

    return Response.json({ success: true, data });
  } catch {
    return Response.json(
      { message: "Failed to create FAQ entry" },
      { status: 500 }
    );
  }
}
