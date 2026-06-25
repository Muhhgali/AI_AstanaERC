/* eslint-disable @typescript-eslint/no-explicit-any */
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { createEmbedding } from "@/lib/embedding";
import { searchKnowledge } from "@/lib/retrieval";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";

let openai: OpenAI | null = null;
let adminSupabase: ReturnType<typeof createClient<any>> | null = null;

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  openai ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  return openai;
}

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

type ChatBodyMessage = {
  role?: "user" | "assistant";
  content?: string;
};

type KnowledgeGapReason =
  | "no-match"
  | "weak-match"
  | "unverified-match"
  | "gpt-answer";

async function ensureConversation(
  conversationId: string | undefined,
  title: string
) {
  if (conversationId) {
    const { data, error } = await getAdminSupabase()
      .from("chat_conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();

    if (!error && data?.id) {
      return data.id as string;
    }
  }

  const { data, error } = await getAdminSupabase()
    .from("chat_conversations")
    .insert({
      title: title.slice(0, 90),
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id as string;
}

async function saveChatMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  source?: string
) {
  const { data, error } = await getAdminSupabase()
    .from("chat_messages")
    .insert({
      conversation_id: conversationId,
      role,
      content,
      source,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  await getAdminSupabase()
    .from("chat_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return data.id as string;
}

async function saveTurn(params: {
  conversationId?: string;
  userMessage: string;
  assistantMessage: string;
  source: string;
}) {
  try {
    const conversationId = await ensureConversation(
      params.conversationId,
      params.userMessage
    );

    await saveChatMessage(conversationId, "user", params.userMessage);
    const assistantMessageId = await saveChatMessage(
      conversationId,
      "assistant",
      params.assistantMessage,
      params.source
    );

    return {
      conversationId,
      messageId: assistantMessageId,
    };
  } catch (error) {
    console.warn("CHAT HISTORY SAVE SKIPPED:", error);
    return {
      conversationId: params.conversationId,
      messageId: undefined,
    };
  }
}

function inferGapTopic(question: string) {
  const normalized = question.toLowerCase();

  const matches = [
    {
      topic: "Оплата",
      keywords: ["оплат", "kaspi", "каспи", "платеж", "банк"],
    },
    {
      topic: "Показания счетчиков",
      keywords: ["показан", "счетчик", "счётчик", "электр", "вода", "газ"],
    },
    {
      topic: "Квитанции и ЕПД",
      keywords: ["квитанц", "епд", "достав", "дубликат"],
    },
    {
      topic: "Лицевой счет",
      keywords: ["лицев", "счет", "счёт", "владел", "прожива"],
    },
    {
      topic: "Начисления и перерасчет",
      keywords: ["начисл", "перерасчет", "перерасчёт", "долг", "ошиб"],
    },
    {
      topic: "Контакты и офис",
      keywords: ["адрес", "офис", "телефон", "график", "поддерж"],
    },
    {
      topic: "Онлайн-сервисы",
      keywords: ["сайт", "кабинет", "telegram", "телеграм", "онлайн"],
    },
  ];

  return (
    matches.find((item) =>
      item.keywords.some((keyword) => normalized.includes(keyword))
    )?.topic ?? question.trim().slice(0, 90)
  );
}

function hasMissingInfoAnswer(answer: string) {
  const normalized = answer.toLowerCase();

  return [
    "точной информации нет",
    "нет точной информации",
    "информации нет",
    "нет в базе",
    "уточнить",
    "обратиться в поддержку",
  ].some((phrase) => normalized.includes(phrase));
}

function getGapReason(params: {
  top?: { similarity: number; verified?: boolean | null };
  assistantMessage: string;
}): KnowledgeGapReason | null {
  if (!params.top) {
    return "no-match";
  }

  if (hasMissingInfoAnswer(params.assistantMessage)) {
    return "gpt-answer";
  }

  if (!params.top.verified) {
    return "unverified-match";
  }

  if (params.top.similarity < 0.72) {
    return "weak-match";
  }

  return null;
}

async function saveKnowledgeGap(params: {
  conversationId?: string;
  assistantMessageId?: string;
  userQuestion: string;
  assistantAnswer: string;
  reason: KnowledgeGapReason;
  topSimilarity?: number;
}) {
  try {
    const { error } = await getAdminSupabase()
      .from("knowledge_gaps")
      .insert({
        conversation_id: params.conversationId,
        assistant_message_id: params.assistantMessageId,
        topic: inferGapTopic(params.userQuestion),
        user_question: params.userQuestion,
        assistant_answer: params.assistantAnswer,
        reason: params.reason,
        top_similarity: params.topSimilarity ?? null,
      });

    if (error) {
      console.warn("KNOWLEDGE GAP SAVE SKIPPED:", error);
    }
  } catch (error) {
    console.warn("KNOWLEDGE GAP SAVE SKIPPED:", error);
  }
}

export async function POST(req: Request) {
  try {
    // ===== BODY =====
    const body = await req.json().catch(() => ({}));

    const messages: ChatBodyMessage[] = Array.isArray(body?.messages)
      ? body.messages
      : [];
    const conversationId =
      typeof body?.conversationId === "string"
        ? body.conversationId
        : undefined;

    if (messages.length === 0) {
      return Response.json(
        {
          message: "No messages provided",
        },
        {
          status: 400,
        }
      );
    }

    // ===== LAST MESSAGE =====
    const lastMessage =
      messages[messages.length - 1]?.content;

    if (!lastMessage) {
      return Response.json(
        {
          message: "Empty message",
        },
        {
          status: 400,
        }
      );
    }

    // ===== CREATE QUERY EMBEDDING =====
    const queryEmbedding =
      await createEmbedding(lastMessage);

    // ===== SEARCH KNOWLEDGE =====
    const results =
      await searchKnowledge(queryEmbedding, lastMessage);

    if (process.env.DEBUG_RETRIEVAL === "true") {
      console.log(
        "TOP RESULTS:",
        results.map((r) => ({
          title: r.title,
          similarity: r.similarity,
          score: r.score,
        }))
      );
    }

    const top = results?.[0];

    // ===== DIRECT ANSWER IF VERY STRONG MATCH =====
    if (top && top.similarity > 0.72 && top.verified) {
      const saved = await saveTurn({
        conversationId,
        userMessage: lastMessage,
        assistantMessage: top.content ?? "",
        source: "knowledge-direct",
      });

      return Response.json({
        message: top.content,
        source: "knowledge-direct",
        conversationId: saved.conversationId,
        messageId: saved.messageId,
      });
    }

    // ===== BUILD CONTEXT =====
    const context = results
      .slice(0, 5)
      .map(
        (r) => `
TITLE:
${r.title}

CONTENT:
${r.content}
`
      )
      .join("\n\n");

    // ===== GPT =====
    const completion =
      await getOpenAI().chat.completions.create({
        model: "gpt-4.1-mini",

        temperature: 0.3,

        messages: [
          {
            role: "system",

            content: `
Ты AI помощник компании Астана ЕРЦ.

Отвечай только по информации из базы знаний ниже.

Если есть несколько похожих фрагментов, в первую очередь используй проверенные и более точные.

Если точного ответа в базе нет, честно скажи, что точной информации нет, и предложи обратиться в поддержку или уточнить вопрос.

Не придумывай факты, номера телефонов, адреса, сроки или способы оплаты.

Отвечай кратко, понятно и по делу на русском языке.

БАЗА ЗНАНИЙ:
${context}
            `.trim(),
          },

          ...messages
            .filter(
              (message) =>
                message.role &&
                ["user", "assistant"].includes(message.role) &&
                message.content
            )
            .map((message) => ({
              role: message.role!,
              content: message.content!,
            })),
        ],
      });

    const assistantMessage =
      completion.choices[0].message.content ??
      "Не удалось получить ответ.";
    const saved = await saveTurn({
      conversationId,
      userMessage: lastMessage,
      assistantMessage,
      source: "gpt",
    });

    const gapReason = getGapReason({
      top,
      assistantMessage,
    });

    if (gapReason) {
      await saveKnowledgeGap({
        conversationId: saved.conversationId,
        assistantMessageId: saved.messageId,
        userQuestion: lastMessage,
        assistantAnswer: assistantMessage,
        reason: gapReason,
        topSimilarity: top?.similarity,
      });
    }

    // ===== RESPONSE =====
    return Response.json({
      message: assistantMessage,
      source: "gpt",
      conversationId: saved.conversationId,
      messageId: saved.messageId,
    });

  } catch (err) {
    console.error(
      "CHAT API ERROR:",
      err
    );

    return Response.json(
      {
        message: "Internal server error",
      },
      {
        status: 500,
      }
    );
  }
}
