/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";
import { requireAdmin } from "@/lib/auth/requireAdmin";

type ChatConversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type ChatMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  source: string | null;
  feedback: "up" | "down" | null;
  created_at: string;
};

type KnowledgeGap = {
  id: string;
  conversation_id: string | null;
  assistant_message_id: string | null;
  topic: string;
  user_question: string;
  assistant_answer: string | null;
  reason: string;
  status: "open" | "resolved";
  top_similarity: number | null;
  created_at: string;
  resolved_at: string | null;
};

const MAX_HISTORY_CONVERSATIONS = 500;

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

function isMissingHistoryTable(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST205" ||
    Boolean(error.message?.includes("chat_conversations")) ||
    Boolean(error.message?.includes("chat_messages"))
  );
}

function isMissingKnowledgeGapsTable(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST205" ||
    Boolean(error.message?.includes("knowledge_gaps"))
  );
}

export async function GET(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const url = new URL(req.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 100);
  const limit = Math.min(
    Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 100, 1),
    MAX_HISTORY_CONVERSATIONS
  );
  const admin = getAdminClient();

  const {
    data: conversations,
    error: conversationsError,
    count: totalConversations,
  } = await admin
      .from("chat_conversations")
      .select("id,title,created_at,updated_at", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(0, limit - 1);

  if (conversationsError) {
    if (isMissingHistoryTable(conversationsError)) {
      return Response.json({
        conversations: [],
        knowledgeGaps: [],
        historyStats: {
          totalConversations: 0,
          loadedConversations: 0,
          totalMessages: 0,
          totalUserMessages: 0,
          totalAssistantMessages: 0,
        },
        gapSetupRequired: false,
        setupRequired: true,
        message:
          "История еще не настроена. Выполни scripts/chatHistory.sql в Supabase SQL Editor.",
      });
    }

    return Response.json(
      { message: conversationsError.message },
      { status: 500 }
    );
  }

  const [messagesCount, userMessagesCount, assistantMessagesCount] =
    await Promise.all([
      admin.from("chat_messages").select("id", { count: "exact", head: true }),
      admin
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("role", "user"),
      admin
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("role", "assistant"),
    ]);

  const safeHistoryStats = {
    totalConversations: totalConversations ?? conversations?.length ?? 0,
    loadedConversations: conversations?.length ?? 0,
    totalMessages: messagesCount.error ? null : messagesCount.count ?? 0,
    totalUserMessages: userMessagesCount.error ? null : userMessagesCount.count ?? 0,
    totalAssistantMessages: assistantMessagesCount.error
      ? null
      : assistantMessagesCount.count ?? 0,
  };

  const { data: gaps, error: gapsError } = await admin
    .from("knowledge_gaps")
    .select(
      "id,conversation_id,assistant_message_id,topic,user_question,assistant_answer,reason,status,top_similarity,created_at,resolved_at"
    )
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(40);

  const safeGaps = gapsError ? [] : ((gaps ?? []) as KnowledgeGap[]);
  const gapSetupRequired = gapsError
    ? isMissingKnowledgeGapsTable(gapsError)
    : false;

  if (gapsError && !gapSetupRequired) {
    return Response.json({ message: gapsError.message }, { status: 500 });
  }

  const safeConversations = (conversations ?? []) as ChatConversation[];
  const ids = safeConversations.map((item) => item.id);

  if (ids.length === 0) {
    return Response.json({
      conversations: [],
      knowledgeGaps: safeGaps,
      historyStats: safeHistoryStats,
      gapSetupRequired,
    });
  }

  const { data: messages, error: messagesError } = await admin
    .from("chat_messages")
    .select("id,conversation_id,role,content,source,feedback,created_at")
    .in("conversation_id", ids)
    .order("created_at", { ascending: true });

  if (messagesError) {
    if (isMissingHistoryTable(messagesError)) {
      return Response.json({
        conversations: safeConversations.map((conversation) => ({
          ...conversation,
          messages: [],
        })),
        knowledgeGaps: safeGaps,
        historyStats: safeHistoryStats,
        gapSetupRequired,
        setupRequired: true,
        message:
          "Таблица сообщений истории еще не настроена. Выполни scripts/chatHistory.sql в Supabase SQL Editor.",
      });
    }

    return Response.json(
      { message: messagesError.message },
      { status: 500 }
    );
  }

  const grouped = ((messages ?? []) as ChatMessage[]).reduce<
    Record<string, ChatMessage[]>
  >((acc, message) => {
    acc[message.conversation_id] ??= [];
    acc[message.conversation_id].push(message);
    return acc;
  }, {});

  return Response.json({
    conversations: safeConversations.map((conversation) => ({
      ...conversation,
      messages: grouped[conversation.id] ?? [],
    })),
    knowledgeGaps: safeGaps,
    historyStats: safeHistoryStats,
    gapSetupRequired,
  });
}

export async function PATCH(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const body = (await req.json().catch(() => ({}))) as {
    gapId?: string;
    status?: "open" | "resolved";
  };

  if (!body.gapId || !body.status) {
    return Response.json(
      { message: "gapId and status are required" },
      { status: 400 }
    );
  }

  const { error } = await getAdminClient()
    .from("knowledge_gaps")
    .update({
      status: body.status,
      resolved_at: body.status === "resolved" ? new Date().toISOString() : null,
    })
    .eq("id", body.gapId);

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const url = new URL(req.url);
  const body = (await req.json().catch(() => ({}))) as {
    conversationId?: string;
  };
  const conversationId = body.conversationId ?? url.searchParams.get("conversationId");

  if (!conversationId) {
    return Response.json(
      { message: "conversationId is required" },
      { status: 400 }
    );
  }

  const { error } = await getAdminClient()
    .from("chat_conversations")
    .delete()
    .eq("id", conversationId);

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
