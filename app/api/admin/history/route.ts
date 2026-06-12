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

let authClient: ReturnType<typeof createClient<any>> | null = null;
let adminClient: ReturnType<typeof createClient<any>> | null = null;

function getAuthClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  authClient ??= createClient<any>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
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
    return Response.json({ message: "Unauthorized" }, { status: 401 });
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

  const safeConversations = (conversations ?? []) as ChatConversation[];
  const ids = safeConversations.map((item) => item.id);

  if (ids.length === 0) {
    return Response.json({ conversations: [] });
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
  });
}
