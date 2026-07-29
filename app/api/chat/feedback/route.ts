/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { enforceRateLimit, RATE_LIMIT_POLICIES } from "@/lib/rateLimit";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";

type FeedbackPayload = {
  messageId?: string;
  feedback?: "up" | "down";
};

let supabase: ReturnType<typeof createClient<any>> | null = null;

function getSupabase() {
  const supabaseUrl = getSupabaseProjectUrl();

  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  supabase ??= createClient<any>(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  return supabase;
}

export async function POST(req: Request) {
  const rateLimitResponse = enforceRateLimit(
    req,
    RATE_LIMIT_POLICIES.publicMutation
  );

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = (await req.json()) as FeedbackPayload;

    if (!body.messageId || !body.feedback) {
      return Response.json(
        { message: "messageId and feedback are required" },
        { status: 400 }
      );
    }

    const { error } = await getSupabase()
      .from("chat_messages")
      .update({ feedback: body.feedback })
      .eq("id", body.messageId)
      .eq("role", "assistant");

    if (error) {
      console.error("CHAT FEEDBACK UPDATE FAILED:", error.code);
      return Response.json(
        { message: "Не удалось сохранить оценку." },
        { status: 500 }
      );
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { message: "Не удалось сохранить оценку." },
      { status: 500 }
    );
  }
}
