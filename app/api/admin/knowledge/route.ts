/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { createEmbedding } from "@/lib/embedding";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";
import { enforceRateLimit, RATE_LIMIT_POLICIES } from "@/lib/rateLimit";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import {
  getKnowledgeContentHash,
  nextStatusAfterEdit,
  normalizeKnowledgeStatus,
  shouldRefreshEmbedding,
  type KnowledgeStatus,
} from "@/lib/knowledgeLifecycle";

type KnowledgePayload = {
  id?: string;
  title?: string;
  category?: string;
  content?: string;
  language?: string;
  status?: KnowledgeStatus;
  priority?: number;
  verified?: boolean;
  source?: string;
  metadata?: Record<string, unknown>;
};

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

function cleanPriority(value: unknown) {
  const priority =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : 0;

  return Math.min(Math.max(priority, 0), 100);
}

function cleanLanguage(value: unknown) {
  return value === "kk" ? "kk" : "ru";
}

function validatePayload(payload: KnowledgePayload) {
  const title = cleanText(payload.title);
  const category = cleanText(payload.category);
  const content = cleanText(payload.content);

  if (!title || !category || !content) {
    throw new Error("Title, category, and content are required");
  }

  return {
    title,
    category,
    content,
    language: cleanLanguage(payload.language),
    priority: cleanPriority(payload.priority),
    status: normalizeKnowledgeStatus(payload.status, payload.verified),
    verified: Boolean(payload.verified),
    source: cleanText(payload.source) || "admin",
    metadata:
      payload.metadata && typeof payload.metadata === "object"
        ? payload.metadata
        : {},
  };
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
        maybeError.message?.includes("metadata") ||
        maybeError.message?.includes("reviewed_at") ||
        maybeError.message?.includes("archived_at")
    )
  );
}

function selectKnowledge() {
  return "id,title,category,content,language,status,priority,verified,source,metadata,content_hash,created_at,updated_at,reviewed_at,archived_at";
}

function legacySelectKnowledge() {
  return "id,title,category,content,priority,verified,source";
}

async function buildRecord(
  payload: KnowledgePayload,
  previous?: {
    title?: string | null;
    category?: string | null;
    content?: string | null;
    content_hash?: string | null;
    embedding?: unknown;
    status?: string | null;
    verified?: boolean | null;
  } | null
) {
  const record = validatePayload(payload);
  const nextHash = getKnowledgeContentHash(record);
  const previousHash =
    previous?.content_hash ??
    (previous
      ? getKnowledgeContentHash({
          title: previous.title,
          category: previous.category,
          content: previous.content,
        })
      : null);
  const textChanged = previous ? previousHash !== nextHash : true;
  const lifecycle = nextStatusAfterEdit({
    previousStatus: previous?.status,
    previousVerified: previous?.verified,
    textChanged,
    requestedStatus: record.status,
    requestedVerified: record.verified,
  });
  const embeddingInput = [
    record.title,
    record.category,
    record.content,
    lifecycle.verified ? "Проверенная информация" : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const embeddingNeeded = shouldRefreshEmbedding({
    previousHash,
    nextHash,
    hasExistingEmbedding: Boolean(previous?.embedding),
  });
  const embedding = embeddingNeeded
    ? await createEmbedding(embeddingInput)
    : undefined;

  return {
    ...record,
    ...lifecycle,
    content_hash: nextHash,
    reviewed_at: lifecycle.status === "verified" ? new Date().toISOString() : null,
    archived_at: lifecycle.status === "archived" ? new Date().toISOString() : null,
    ...(embedding ? { embedding } : {}),
  };
}

export async function GET(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  let { data, error } = await getAdminClient()
    .from("knowledge")
    .select(selectKnowledge())
    .order("verified", { ascending: false })
    .order("priority", { ascending: false })
    .order("title", { ascending: true });

  if (error && isMissingLifecycleColumn(error)) {
    const fallback = await getAdminClient()
      .from("knowledge")
      .select(legacySelectKnowledge())
      .order("verified", { ascending: false })
      .order("priority", { ascending: false })
      .order("title", { ascending: true });

    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const rateLimited = enforceRateLimit(req, RATE_LIMIT_POLICIES.adminAiMutation);

  if (rateLimited) {
    return rateLimited;
  }

  try {
    const payload = (await req.json()) as KnowledgePayload;
    const record = await buildRecord(payload);

    let { data, error } = await getAdminClient()
      .from("knowledge")
      .insert(record)
      .select(selectKnowledge())
      .single();

    if (error && isMissingLifecycleColumn(error)) {
      const { language, status, metadata, content_hash, reviewed_at, archived_at, ...legacyRecord } =
        record;
      void language;
      void status;
      void metadata;
      void content_hash;
      void reviewed_at;
      void archived_at;

      const fallback = await getAdminClient()
        .from("knowledge")
        .insert(legacyRecord)
        .select(legacySelectKnowledge())
        .single();

      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      return Response.json({ message: error.message }, { status: 500 });
    }

    return Response.json({ item: data }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    return Response.json({ message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const rateLimited = enforceRateLimit(req, RATE_LIMIT_POLICIES.adminAiMutation);

  if (rateLimited) {
    return rateLimited;
  }

  try {
    const payload = (await req.json()) as KnowledgePayload;
    const id = cleanText(payload.id);

    if (!id) {
      return Response.json({ message: "ID is required" }, { status: 400 });
    }

    const { data: previous } = await getAdminClient()
      .from("knowledge")
      .select("id,title,category,content,embedding,verified,source,content_hash,status")
      .eq("id", id)
      .single()
      .then(async (result) => {
        if (result.error && isMissingLifecycleColumn(result.error)) {
          return await getAdminClient()
            .from("knowledge")
            .select("id,title,category,content,embedding,verified,source")
            .eq("id", id)
            .single();
        }

        return result;
      });

    const record = await buildRecord(payload, previous);

    let { data, error } = await getAdminClient()
      .from("knowledge")
      .update(record)
      .eq("id", id)
      .select(selectKnowledge())
      .single();

    if (error && isMissingLifecycleColumn(error)) {
      const { language, status, metadata, content_hash, reviewed_at, archived_at, ...legacyRecord } =
        record;
      void language;
      void status;
      void metadata;
      void content_hash;
      void reviewed_at;
      void archived_at;

      const fallback = await getAdminClient()
        .from("knowledge")
        .update(legacyRecord)
        .eq("id", id)
        .select(legacySelectKnowledge())
        .single();

      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      return Response.json({ message: error.message }, { status: 500 });
    }

    return Response.json({ item: data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    return Response.json({ message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const url = new URL(req.url);
  const id = cleanText(url.searchParams.get("id"));

  if (!id) {
    return Response.json({ message: "ID is required" }, { status: 400 });
  }

  let { error } = await getAdminClient()
    .from("knowledge")
    .update({
      status: "archived",
      verified: false,
      archived_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error && isMissingLifecycleColumn(error)) {
    const fallback = await getAdminClient()
      .from("knowledge")
      .delete()
      .eq("id", id);

    error = fallback.error;
  }

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
