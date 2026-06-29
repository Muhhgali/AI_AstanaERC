/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseProjectUrl } from "@/lib/supabaseEnv";

let authClient: ReturnType<typeof createClient<any>> | null = null;
let adminClient: ReturnType<typeof createClient<any>> | null = null;

type ChatConversation = {
  id: string;
  title: string;
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

type KnowledgeItem = {
  id: string;
  category: string | null;
  verified: boolean | null;
};

type KnowledgeGap = {
  id: string;
  conversation_id: string | null;
  topic: string;
  user_question: string;
  assistant_answer: string | null;
  reason: string;
  status: "open" | "resolved";
  created_at: string;
};

type RequestRow = {
  id: string;
  status: string;
  created_at: string;
};

type OperatorHandoff = {
  id: string;
  conversation_id: string | null;
  visitor_id: string | null;
  user_message: string;
  reason: string;
  status: "new" | "in_progress" | "done" | "cancelled";
  priority: number;
  created_at: string;
  updated_at: string;
};

function getAuthClient() {
  const supabaseUrl = getSupabaseProjectUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  authClient ??= createClient<any>(supabaseUrl, supabaseAnonKey);

  return authClient;
}

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

function isMissingTable(error: { code?: string; message?: string }, table: string) {
  return error.code === "PGRST205" || Boolean(error.message?.includes(table));
}

async function loadRows<T>(
  table: string,
  select: string,
  limit = 120,
  orderBy?: string
): Promise<{ rows: T[]; missing: boolean }> {
  let query = getAdminClient()
    .from(table)
    .select(select)
    .limit(limit);

  if (orderBy) {
    query = query.order(orderBy, { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTable(error, table)) {
      return { rows: [], missing: true };
    }

    throw error;
  }

  return { rows: (data ?? []) as T[], missing: false };
}

function countStatuses(rows: RequestRow[], statuses: string[]) {
  return rows.filter((row) => statuses.includes(row.status)).length;
}

function buildInsights(params: {
  feedbackDown: number;
  gapsOpen: number;
  handoffsOpen: number;
  requestsNew: number;
  verifiedKnowledge: number;
  knowledgeTotal: number;
}) {
  const insights: string[] = [];

  if (params.handoffsOpen > 0) {
    insights.push(
      `Операторская очередь: ${params.handoffsOpen} обращ. ждут ручного ответа.`
    );
  }

  if (params.requestsNew > 0) {
    insights.push(`Новые заявки: ${params.requestsNew} шт. нужно принять в работу.`);
  }

  if (params.gapsOpen > 0) {
    insights.push(
      `База знаний: ${params.gapsOpen} вопросов требуют нового проверенного ответа.`
    );
  }

  if (params.feedbackDown > 0) {
    insights.push(
      `Качество: ${params.feedbackDown} отриц. оценок, стоит разобрать формулировки.`
    );
  }

  if (params.knowledgeTotal > 0 && params.verifiedKnowledge < params.knowledgeTotal) {
    insights.push(
      `Проверка базы: ${params.knowledgeTotal - params.verifiedKnowledge} записей еще не подтверждены.`
    );
  }

  if (insights.length === 0) {
    insights.push("Критичных очередей нет. Можно спокойно расширять базу и тестировать сценарии.");
  }

  return insights;
}

export async function GET(req: Request) {
  const user = await requireUser(req);

  if (!user) {
    return Response.json(
      { message: "Сессия администратора не прошла проверку." },
      { status: 401 }
    );
  }

  try {
    const [
      knowledge,
      conversations,
      messages,
      gaps,
      meterRequests,
      appealRequests,
      appointments,
      receiptRequests,
      handoffs,
    ] = await Promise.all([
      loadRows<KnowledgeItem>("knowledge", "id,category,verified", 500),
      loadRows<ChatConversation>(
        "chat_conversations",
        "id,title,updated_at",
        120,
        "updated_at"
      ),
      loadRows<ChatMessage>(
        "chat_messages",
        "id,conversation_id,role,content,source,feedback,created_at",
        400,
        "created_at"
      ),
      loadRows<KnowledgeGap>(
        "knowledge_gaps",
        "id,conversation_id,topic,user_question,assistant_answer,reason,status,created_at",
        80,
        "created_at"
      ),
      loadRows<RequestRow>(
        "meter_correction_requests",
        "id,status,created_at",
        120,
        "created_at"
      ),
      loadRows<RequestRow>(
        "appeal_requests",
        "id,status,created_at",
        120,
        "created_at"
      ),
      loadRows<RequestRow>(
        "leadership_appointments",
        "id,status,created_at",
        120,
        "created_at"
      ),
      loadRows<RequestRow>(
        "receipt_analysis_requests",
        "id,status,created_at",
        120,
        "created_at"
      ),
      loadRows<OperatorHandoff>(
        "operator_handoffs",
        "id,conversation_id,visitor_id,user_message,reason,status,priority,created_at,updated_at",
        60,
        "created_at"
      ),
    ]);

    const conversationTitle = new Map(
      conversations.rows.map((conversation) => [
        conversation.id,
        conversation.title,
      ])
    );
    const assistantMessages = messages.rows.filter(
      (message) => message.role === "assistant"
    );
    const downFeedbackRows = assistantMessages.filter(
      (message) => message.feedback === "down"
    );
    const downFeedback = downFeedbackRows
      .slice(0, 12)
      .map((message) => ({
        ...message,
        conversationTitle:
          conversationTitle.get(message.conversation_id) ?? "Диалог",
      }));
    const openGapRows = gaps.rows.filter((gap) => gap.status === "open");
    const openGaps = openGapRows.slice(0, 12);
    const requests = [
      ...meterRequests.rows.map((row) => ({ ...row, type: "meter" as const })),
      ...appealRequests.rows.map((row) => ({ ...row, type: "appeal" as const })),
      ...appointments.rows.map((row) => ({ ...row, type: "appointment" as const })),
      ...receiptRequests.rows.map((row) => ({ ...row, type: "receipt" as const })),
    ];
    const requestsNew = countStatuses(requests, ["new"]);
    const requestsActive = countStatuses(requests, ["in_progress", "confirmed"]);
    const handoffsOpen = handoffs.rows.filter((row) =>
      ["new", "in_progress"].includes(row.status)
    );
    const verifiedKnowledge = knowledge.rows.filter(
      (item) => item.verified
    ).length;

    return Response.json({
      overview: {
        knowledgeTotal: knowledge.rows.length,
        knowledgeVerified: verifiedKnowledge,
        conversations: conversations.rows.length,
        messages: messages.rows.length,
        feedbackUp: assistantMessages.filter((message) => message.feedback === "up").length,
        feedbackDown: downFeedbackRows.length,
        gapsOpen: openGapRows.length,
        requestsNew,
        requestsActive,
        receiptsNew: countStatuses(receiptRequests.rows, ["new"]),
        handoffsOpen: handoffsOpen.length,
      },
      queues: {
        handoffs: handoffsOpen.slice(0, 12),
        gaps: openGaps,
        downFeedback,
      },
      insights: buildInsights({
        feedbackDown: downFeedbackRows.length,
        gapsOpen: openGapRows.length,
        handoffsOpen: handoffsOpen.length,
        requestsNew,
        verifiedKnowledge,
        knowledgeTotal: knowledge.rows.length,
      }),
      setupRequired: handoffs.missing,
      setupMessage: handoffs.missing
        ? "Для операторской очереди выполните обновленный scripts/chatHistory.sql в Supabase SQL Editor."
        : undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось загрузить сводку";

    return Response.json({ message }, { status: 500 });
  }
}
