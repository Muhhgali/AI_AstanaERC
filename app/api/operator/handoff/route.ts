/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";

let adminClient: ReturnType<typeof createClient<any>> | null = null;

function getAdminClient() {
  const supabaseUrl = getSupabaseProjectUrl();

  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  adminClient ??= createClient<any>(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  return adminClient;
}

function cleanText(value: unknown, maxLength = 2000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isMissingTable(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST205" ||
    Boolean(error.message?.includes("operator_handoffs"))
  );
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    conversationId?: string;
    visitorId?: string;
    message?: string;
    reason?: string;
  };

  const userMessage = cleanText(body.message);

  if (!userMessage) {
    return Response.json({ message: "message is required" }, { status: 400 });
  }

  const payload = {
    conversation_id: cleanText(body.conversationId, 120) || null,
    visitor_id: cleanText(body.visitorId, 120) || null,
    user_message: userMessage,
    reason: cleanText(body.reason, 120) || "manual-request",
    status: "new",
    priority: 80,
  };

  const { data, error } = await getAdminClient()
    .from("operator_handoffs")
    .insert(payload)
    .select("id,status,created_at")
    .single();

  if (error) {
    if (isMissingTable(error)) {
      return Response.json({
        setupRequired: true,
        message:
          "Запрос на оператора принят в диалоге, но таблица operator_handoffs еще не создана. Выполните scripts/chatHistory.sql.",
      });
    }

    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json({ handoff: data }, { status: 201 });
}
