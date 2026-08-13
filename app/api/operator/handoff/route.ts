/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";
import { enforceRateLimit, RATE_LIMIT_POLICIES } from "@/lib/rateLimit";
import {
  getOrCreateVisitorOwnership,
  getOwnedConversationId,
  jsonWithVisitorOwnership,
} from "@/lib/security/visitorOwnership";

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
  const visitorOwnership = getOrCreateVisitorOwnership(req);
  const jsonResponse = (body: unknown, init?: ResponseInit) =>
    jsonWithVisitorOwnership(body, visitorOwnership, init);
  const rateLimited = enforceRateLimit(req, RATE_LIMIT_POLICIES.publicMutation);

  if (rateLimited) {
    if (visitorOwnership.cookieHeader) {
      rateLimited.headers.append("Set-Cookie", visitorOwnership.cookieHeader);
    }

    return rateLimited;
  }

  const body = (await req.json().catch(() => ({}))) as {
    conversationId?: string;
    message?: string;
    reason?: string;
  };

  const userMessage = cleanText(body.message);

  if (!userMessage) {
    return jsonResponse({ message: "message is required" }, { status: 400 });
  }

  const admin = getAdminClient();
  const conversationId = await getOwnedConversationId(
    admin,
    body.conversationId,
    visitorOwnership.visitorId
  );
  const payload = {
    conversation_id: conversationId,
    visitor_id: visitorOwnership.visitorId,
    user_message: userMessage,
    reason: cleanText(body.reason, 120) || "manual-request",
    status: "new",
    priority: 80,
  };

  const { data, error } = await admin
    .from("operator_handoffs")
    .insert(payload)
    .select("id,status,created_at")
    .single();

  if (error) {
    if (isMissingTable(error)) {
      return jsonResponse({
        setupRequired: true,
        message:
          "Запрос на оператора принят в диалоге, но таблица operator_handoffs еще не создана. Выполните scripts/chatHistory.sql.",
      });
    }

    return jsonResponse({ message: "Failed to create handoff" }, { status: 500 });
  }

  return jsonResponse({ handoff: data }, { status: 201 });
}
