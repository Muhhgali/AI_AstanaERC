/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { enforceRateLimit, RATE_LIMIT_POLICIES } from "@/lib/rateLimit";
import { getVerifiedVisitorId } from "@/lib/security/visitorOwnership";
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isMissingVisitorIdColumn(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };

  return (
    maybeError.code === "42703" ||
    Boolean(maybeError.message?.includes("visitor_id"))
  );
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

    if (!isUuid(body.messageId) || !["up", "down"].includes(body.feedback)) {
      return Response.json({ message: "Invalid feedback payload" }, { status: 400 });
    }

    const visitorId = getVerifiedVisitorId(req);

    if (!visitorId) {
      return Response.json({ message: "Forbidden" }, { status: 403 });
    }

    const { data: message, error: messageError } = await getSupabase()
      .from("chat_messages")
      .select("id,conversation_id")
      .eq("id", body.messageId)
      .eq("role", "assistant")
      .single();

    if (messageError || !message?.conversation_id) {
      return Response.json({ message: "Forbidden" }, { status: 403 });
    }

    const { data: conversation, error: conversationError } = await getSupabase()
      .from("chat_conversations")
      .select("id")
      .eq("id", message.conversation_id)
      .eq("visitor_id", visitorId)
      .single();

    if (conversationError || !conversation) {
      if (conversationError && !isMissingVisitorIdColumn(conversationError)) {
        console.error("CHAT FEEDBACK OWNERSHIP CHECK FAILED:", conversationError.code);
      }

      return Response.json({ message: "Forbidden" }, { status: 403 });
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
