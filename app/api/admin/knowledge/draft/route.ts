/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseProjectUrl } from "@/lib/supabaseEnv";

let authClient: ReturnType<typeof createClient<any>> | null = null;
let adminClient: ReturnType<typeof createClient<any>> | null = null;

type KnowledgeGap = {
  id: string;
  topic: string;
  user_question: string;
  assistant_answer: string | null;
  reason: string;
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

function inferCategory(question: string) {
  const normalized = question.toLowerCase();

  if (/оплат|kaspi|платеж|сумм|төлем/.test(normalized)) {
    return "payments";
  }

  if (/показан|счетчик|счётчик|су|есептегіш|көрсеткіш/.test(normalized)) {
    return "meters";
  }

  if (/квитанц|епд|түбіртек/.test(normalized)) {
    return "receipts";
  }

  if (/лицев|дербес|владел|счет|шот/.test(normalized)) {
    return "accounts";
  }

  if (/начисл|перерасчет|долг|қарыз|есептеу/.test(normalized)) {
    return "billing";
  }

  return "support";
}

function buildDraftContent(gap: KnowledgeGap) {
  const sourceAnswer = gap.assistant_answer?.trim();
  const blocks = [
    "Короткий ответ:",
    sourceAnswer && !/нет точной|не удалось|не знаю/i.test(sourceAnswer)
      ? sourceAnswer
      : "Укажите проверенный ответ для жителя своими словами.",
    "",
    "Что важно проверить перед публикацией:",
    "- точные сроки, суммы, телефоны и адреса;",
    "- когда нужно отправлять в 109/Qalaqyzmet, а когда можно решить через бот;",
    "- нужны ли документы, номер лицевого счета или контакты заявителя.",
    "",
    `Исходный вопрос: ${gap.user_question}`,
  ];

  return blocks.filter(Boolean).join("\n");
}

export async function POST(req: Request) {
  const user = await requireUser(req);

  if (!user) {
    return Response.json(
      { message: "Сессия администратора не прошла проверку." },
      { status: 401 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { gapId?: string };

  if (!body.gapId) {
    return Response.json({ message: "gapId is required" }, { status: 400 });
  }

  const { data, error } = await getAdminClient()
    .from("knowledge_gaps")
    .select("id,topic,user_question,assistant_answer,reason")
    .eq("id", body.gapId)
    .single();

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  const gap = data as KnowledgeGap;

  return Response.json({
    draft: {
      title: gap.topic || gap.user_question.slice(0, 90),
      category: inferCategory(`${gap.topic} ${gap.user_question}`),
      content: buildDraftContent(gap),
      priority: 90,
      verified: false,
      source: "knowledge-gap-draft",
    },
  });
}
