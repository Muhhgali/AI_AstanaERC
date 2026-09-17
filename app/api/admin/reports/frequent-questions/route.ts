/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";

type ChatMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type FrequentQuestion = {
  question: string;
  occurrences: number;
  conversations: Set<string>;
  latestAnswer: string;
  latestSeenAt: string;
};

const PAGE_SIZE = 1_000;
const MAX_MESSAGES = 20_000;

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

function normalizeQuestion(value: string) {
  return value
    .toLocaleLowerCase("ru")
    .replace(/[?!.,;:()[\]{}"'«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeCsv(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function loadAllMessages() {
  const messages: ChatMessage[] = [];
  const admin = getAdminClient();

  for (let from = 0; from < MAX_MESSAGES; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("chat_messages")
      .select("id,conversation_id,role,content,created_at")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    const page = (data ?? []) as ChatMessage[];
    messages.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return messages;
}

export async function GET(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const messages = await loadAllMessages();
    const groupedByConversation = new Map<string, ChatMessage[]>();

    for (const message of messages) {
      const conversation = groupedByConversation.get(message.conversation_id) ?? [];
      conversation.push(message);
      groupedByConversation.set(message.conversation_id, conversation);
    }

    const questions = new Map<string, FrequentQuestion>();

    for (const [conversationId, conversation] of groupedByConversation) {
      for (let index = 0; index < conversation.length; index += 1) {
        const message = conversation[index];

        if (message.role !== "user") {
          continue;
        }

        const question = message.content.trim();
        const key = normalizeQuestion(question);

        if (key.length < 3) {
          continue;
        }

        const nextAnswer = conversation
          .slice(index + 1)
          .find((candidate) => candidate.role === "assistant")?.content.trim() ?? "";
        const existing = questions.get(key);

        if (existing) {
          existing.occurrences += 1;
          existing.conversations.add(conversationId);

          if (message.created_at >= existing.latestSeenAt) {
            existing.latestSeenAt = message.created_at;
            existing.latestAnswer = nextAnswer;
          }
          continue;
        }

        questions.set(key, {
          question,
          occurrences: 1,
          conversations: new Set([conversationId]),
          latestAnswer: nextAnswer,
          latestSeenAt: message.created_at,
        });
      }
    }

    const rows = [...questions.values()]
      .sort(
        (left, right) =>
          right.occurrences - left.occurrences ||
          right.conversations.size - left.conversations.size ||
          right.latestSeenAt.localeCompare(left.latestSeenAt)
      )
      .map((item) => [
        item.question,
        item.occurrences,
        item.conversations.size,
        item.latestAnswer || "Ответ бота не сохранён",
        new Date(item.latestSeenAt).toLocaleString("ru-RU"),
      ]);

    const csv = [
      [
        "Вопрос жителя",
        "Повторений",
        "Разных диалогов",
        "Последний ответ бота",
        "Последнее обращение",
      ],
      ...rows,
    ]
      .map((row) => row.map(escapeCsv).join(";"))
      .join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="astana-erc-questions-report-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build questions report";
    return Response.json({ message }, { status: 500 });
  }
}
