/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";

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

let authClient: ReturnType<typeof createClient<any>> | null = null;
let adminClient: ReturnType<typeof createClient<any>> | null = null;

function getAuthClient() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  authClient ??= createClient<any>(
    supabaseUrl,
    supabaseAnonKey
  );

  return authClient;
}

function getAdminClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  adminClient ??= createClient<any>(
    process.env.SUPABASE_URL,
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

async function requireUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await getAuthClient().auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

export async function GET(req: Request) {
  const user = await requireUser(req);

  if (!user) {
    return Response.json(
      {
        message:
          "Сессия администратора не прошла проверку. Войди заново и проверь Supabase env-переменные на Vercel.",
      },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);

  const { data: conversations, error: conversationsError } =
    await getAdminClient()
      .from("chat_conversations")
      .select("id,title,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100));

  if (conversationsError) {
    if (isMissingHistoryTable(conversationsError)) {
      return Response.json({
        conversations: [],
        knowledgeGaps: [],
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

  const { data: gaps, error: gapsError } = await getAdminClient()
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
      gapSetupRequired,
    });
  }

  const { data: messages, error: messagesError } = await getAdminClient()
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
    gapSetupRequired,
  });
}

export async function PATCH(req: Request) {
  const user = await requireUser(req);

  if (!user) {
    return Response.json(
      {
        message:
          "Сессия администратора не прошла проверку. Войди заново и проверь Supabase env-переменные на Vercel.",
      },
      { status: 401 }
    );
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
