/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";
import { requireAdmin } from "@/lib/auth/requireAdmin";

let adminClient: ReturnType<typeof createClient<any>> | null = null;

type KnowledgeGap = {
  id: string;
  topic: string;
  user_question: string;
  assistant_answer: string | null;
  reason: string;
};

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
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
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
      title: gap.user_question || gap.topic,
      category: inferCategory(`${gap.topic} ${gap.user_question}`),
      content: buildDraftContent(gap),
      language: "ru",
      status: "draft",
      priority: 90,
      verified: false,
      source: "knowledge-gap-draft",
    },
  });
}
