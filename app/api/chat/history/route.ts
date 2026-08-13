/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { enforceRateLimit, RATE_LIMIT_POLICIES } from "@/lib/rateLimit";
import {
  getOrCreateVisitorOwnership,
  jsonWithVisitorOwnership,
} from "@/lib/security/visitorOwnership";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";

let adminSupabase: ReturnType<typeof createClient<any>> | null = null;

function getAdminSupabase() {
  const supabaseUrl = getSupabaseProjectUrl();

  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  adminSupabase ??= createClient<any>(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  return adminSupabase;
}

function normalizeIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter(
        (item): item is string =>
          typeof item === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            item
          )
      )
    )
  ).slice(0, 30);
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
  const visitorOwnership = getOrCreateVisitorOwnership(req);
  const jsonResponse = (body: unknown, init?: ResponseInit) =>
    jsonWithVisitorOwnership(body, visitorOwnership, init);
  const rateLimited = enforceRateLimit(req, RATE_LIMIT_POLICIES.historyRead);

  if (rateLimited) {
    if (visitorOwnership.cookieHeader) {
      rateLimited.headers.append("Set-Cookie", visitorOwnership.cookieHeader);
    }

    return rateLimited;
  }

  try {
    const body = await req.json().catch(() => ({}));
    const ids = normalizeIds(body?.conversationIds);
    const visitorId = visitorOwnership.visitorId;

    const supabase = getAdminSupabase();
    let conversationsQuery = supabase
      .from("chat_conversations")
      .select("id,title,created_at,updated_at")
      .eq("visitor_id", visitorId)
      .order("updated_at", { ascending: false })
      .limit(30);

    if (ids.length > 0) {
      conversationsQuery = conversationsQuery.in("id", ids);
    }

    const byVisitor = await conversationsQuery;
    const visitorData =
      byVisitor.error && isMissingVisitorIdColumn(byVisitor.error)
        ? []
        : byVisitor.data ?? [];
    const visitorError =
      byVisitor.error && isMissingVisitorIdColumn(byVisitor.error)
        ? null
        : byVisitor.error;

    if (visitorError) {
      return jsonResponse(
        { message: "Failed to load chat history" },
        { status: 500 }
      );
    }

    const conversations = visitorData
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
      .slice(0, 30);
    const conversationIds = conversations.map((item) => item.id);

    if (conversationIds.length === 0) {
      return jsonResponse({ conversations: [] });
    }

    const { data: messages, error: messagesError } = await getAdminSupabase()
      .from("chat_messages")
      .select("id,conversation_id,role,content,source,feedback,created_at")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: true });

    if (messagesError) {
      return jsonResponse(
        { message: "Failed to load chat history" },
        { status: 500 }
      );
    }

    const grouped = (messages ?? []).reduce<Record<string, any[]>>(
      (acc, message) => {
        acc[message.conversation_id] ??= [];
        acc[message.conversation_id].push(message);
        return acc;
      },
      {}
    );

    return jsonResponse({
      conversations: conversations.map((conversation) => ({
        ...conversation,
        messages: grouped[conversation.id] ?? [],
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load chat history";

    return jsonResponse({ message }, { status: 500 });
  }
}
