/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { createEmbedding } from "@/lib/embedding";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";
import { enforceRateLimit, RATE_LIMIT_POLICIES } from "@/lib/rateLimit";
import {
  buildLearningKnowledgeContent,
  buildLearningKnowledgeTitle,
  buildLearningQuestion,
  inferLearningCategory,
  type LearningGap,
} from "@/lib/learningMode";
import { getKnowledgeContentHash } from "@/lib/knowledgeLifecycle";

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

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isMissingLifecycleColumn(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };

  return (
    maybeError.code === "42703" ||
    Boolean(
      maybeError.message?.includes("status") ||
        maybeError.message?.includes("language") ||
        maybeError.message?.includes("content_hash") ||
        maybeError.message?.includes("metadata")
    )
  );
}

function isMissingKnowledgeGapsTable(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };

  return (
    maybeError.code === "PGRST205" ||
    Boolean(maybeError.message?.includes("knowledge_gaps"))
  );
}

async function loadGap(gapId?: string) {
  let query = getAdminClient()
    .from("knowledge_gaps")
    .select(
      "id,topic,user_question,assistant_answer,reason,status,top_similarity,created_at"
    )
    .eq("status", "open");

  query = gapId
    ? query.eq("id", gapId)
    : query.order("created_at", { ascending: false }).limit(1);

  const { data, error } = gapId ? await query.single() : await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data as LearningGap | null;
}

export async function GET(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const url = new URL(req.url);
    const gap = await loadGap(cleanText(url.searchParams.get("gapId")) || undefined);

    if (!gap) {
      return Response.json({
        gap: null,
        question:
          "Сейчас нет открытых пробелов знаний. Можно вернуться позже или добавить вопрос вручную в базу знаний.",
      });
    }

    return Response.json({
      gap,
      question: buildLearningQuestion(gap),
      suggestedCategory: inferLearningCategory(
        `${gap.topic ?? ""} ${gap.user_question ?? ""}`
      ),
    });
  } catch (error) {
    if (isMissingKnowledgeGapsTable(error)) {
      return Response.json({
        gap: null,
        setupRequired: true,
        question:
          "Таблица knowledge_gaps ещё не настроена. Сначала нужно применить SQL для истории/пробелов.",
      });
    }

    const message = error instanceof Error ? error.message : "Unknown error";

    return Response.json({ message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const rateLimited = enforceRateLimit(req, RATE_LIMIT_POLICIES.adminAiMutation);

  if (rateLimited) {
    return rateLimited;
  }

  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const body = (await req.json().catch(() => ({}))) as {
    gapId?: string;
    explanation?: string;
    category?: string;
    publishNow?: boolean;
  };
  const gapId = cleanText(body.gapId);
  const explanation = cleanText(body.explanation);

  if (!gapId || !explanation) {
    return Response.json(
      { message: "gapId and explanation are required" },
      { status: 400 }
    );
  }

  try {
    const gap = await loadGap(gapId);

    if (!gap) {
      return Response.json(
        { message: "Open knowledge gap was not found" },
        { status: 404 }
      );
    }

    const title = buildLearningKnowledgeTitle(gap);
    const category =
      cleanText(body.category) ||
      inferLearningCategory(`${gap.topic ?? ""} ${gap.user_question ?? ""}`);
    const content = buildLearningKnowledgeContent({
      ownerExplanation: explanation,
      gap,
    });
    const status = body.publishNow ? "verified" : "review";
    const verified = body.publishNow === true;
    const embedding = await createEmbedding(
      [title, category, content, verified ? "Проверенная информация" : ""]
        .filter(Boolean)
        .join("\n\n")
    );
    const record = {
      title,
      category,
      content,
      language: "ru",
      status,
      priority: 95,
      verified,
      source: "owner-learning",
      metadata: {
        learnedFromGapId: gap.id,
        learningMode: true,
      },
      content_hash: getKnowledgeContentHash({ title, category, content }),
      reviewed_at: verified ? new Date().toISOString() : null,
      embedding,
    };

    const insertResult = await getAdminClient()
      .from("knowledge")
      .insert(record)
      .select("id,title,category,content,language,status,priority,verified,source")
      .single();
    let data = insertResult.data as Record<string, unknown> | null;
    let error = insertResult.error;

    if (error && isMissingLifecycleColumn(error)) {
      const fallback = await getAdminClient()
        .from("knowledge")
        .insert({
          title,
          category,
          content,
          priority: 95,
          verified,
          source: "owner-learning",
          embedding,
        })
        .select("id,title,category,content,priority,verified,source")
        .single();

      data = fallback.data as Record<string, unknown> | null;
      error = fallback.error;
    }

    if (error) {
      return Response.json({ message: error.message }, { status: 500 });
    }

    await getAdminClient()
      .from("knowledge_gaps")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", gap.id);

    return Response.json({
      item: data,
      status,
      message: verified
        ? "Объяснение опубликовано. Бот сможет использовать его в ответах."
        : "Объяснение сохранено на проверку. После публикации бот начнёт использовать его в ответах.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return Response.json({ message }, { status: 500 });
  }
}
