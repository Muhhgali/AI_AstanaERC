/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";

type FeedbackPayload = {
  messageId?: string;
  feedback?: "up" | "down";
};

let supabase: ReturnType<typeof createClient<any>> | null = null;

function getSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  supabase ??= createClient<any>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  return supabase;
}

export async function POST(req: Request) {
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
      return Response.json({ message: error.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    return Response.json({ message }, { status: 500 });
  }
}
