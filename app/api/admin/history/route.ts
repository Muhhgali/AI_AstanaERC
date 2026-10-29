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
// PostgREST returns at most 1000 rows per request.
const MESSAGES_PAGE_SIZE = 1000;
const MESSAGE_ID_BATCH = 100;
// Residents and staff are in Astana (UTC+5); a "day" in the filter is theirs.
const ASTANA_OFFSET = "+05:00";

function parseDay(value: string | null) {
  return value && /^d{4}-d{2}-d{2}$/.test(value) ? value : null;
}

// `to` is inclusive: "2026-10-31" covers the whole of 31 October.
function getDateRange(url: URL) {
  const from = parseDay(url.searchParams.get("from"));
  const to = parseDay(url.searchParams.get("to"));
  const end = to ? new Date(`${to}T00:00:00${ASTANA_OFFSET}`) : null;

  end?.setUTCDate(end.getUTCDate() + 1);

  return {
    from: from ? new Date(`${from}T00:00:00${ASTANA_OFFSET}`).toISOString() : null,
    toExclusive: end ? end.toISOString() : null,
  };
}

function inRange<T extends { gte: (column: string, value: string) => T; lt: (column: string, value: string) => T }>(
  query: T,
  range: { from: string | null; toExclusive: string | null }
) {
  let ranged = query;

  if (range.from) ranged = ranged.gte("created_at", range.from);
  if (range.toExclusive) ranged = ranged.lt("created_at", range.toExclusive);

  return ranged;
}

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

// Loads every message of the given dialogs: one request used to stop at the
// 1000-row cap and cut off the newest dialogs' messages.
async function loadMessages(admin: ReturnType<typeof getAdminClient>, ids: string[]) {
  const messages: ChatMessage[] = [];

  for (let start = 0; start < ids.length; start += MESSAGE_ID_BATCH) {
    const batch = ids.slice(start, start + MESSAGE_ID_BATCH);

    for (let page = 0; ; page += 1) {
      const { data, error } = await admin
        .from("chat_messages")
        .select("id,conversation_id,role,content,source,feedback,created_at")
        .in("conversation_id", batch)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(page * MESSAGES_PAGE_SIZE, (page + 1) * MESSAGES_PAGE_SIZE - 1);

      if (error) {
        return { messages, error };
      }

      messages.push(...((data ?? []) as ChatMessage[]));

      if ((data ?? []).length < MESSAGES_PAGE_SIZE) {
        break;
      }
    }
  }

  return { messages, error: null };
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
  const requestedOffset = Number(url.searchParams.get("offset") ?? 0);
  const offset = Number.isFinite(requestedOffset) ? Math.max(Math.floor(requestedOffset), 0) : 0;
  const range = getDateRange(url);
  const hasRange = Boolean(range.from || range.toExclusive);
  const admin = getAdminClient();

  const {
    data: conversations,
    error: conversationsError,
    count: totalConversations,
  } = await inRange(
    admin
      .from("chat_conversations")
      .select("id,title,created_at,updated_at", { count: "exact" }),
    range
  )
    // A period lists dialogs by when they started; the default view by activity.
    .order(hasRange ? "created_at" : "updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

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
      inRange(admin.from("chat_messages").select("id", { count: "exact", head: true }), range),
      inRange(
        admin.from("chat_messages").select("id", { count: "exact", head: true }).eq("role", "user"),
        range
      ),
      inRange(
        admin
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("role", "assistant"),
        range
      ),
    ]);

  const safeHistoryStats = {
    totalConversations: totalConversations ?? conversations?.length ?? 0,
    loadedConversations: offset + (conversations?.length ?? 0),
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

  const { messages, error: messagesError } = await loadMessages(admin, ids);

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
