/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";
import {
  getTrustedRoles,
  requireStaff,
  type TrustedRole,
} from "@/lib/auth/requireAdmin";
import { getKnowledgeContentHash } from "@/lib/knowledgeLifecycle";
import {
  buildManagerKnowledgeDraft,
  canPublishKnowledge,
  MANAGER_ACTIVE_TASK_LIMIT,
  sanitizeResidentQuestion,
  type ManagerWorkspaceGap,
} from "@/lib/managerWorkspace";

type WorkspaceAction =
  | "claim_next"
  | "start"
  | "submit_review"
  | "return_review"
  | "complete";

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

function isMissingManagerWorkspace(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };

  return (
    maybeError.code === "PGRST202" ||
    maybeError.code === "PGRST205" ||
    maybeError.code === "42703" ||
    Boolean(
      maybeError.message?.includes("claim_next_knowledge_gap") ||
        maybeError.message?.includes("assignment_status") ||
        maybeError.message?.includes("manager_version") ||
        maybeError.message?.includes("knowledge_gaps")
    )
  );
}

function isMissingKnowledgeLifecycleColumn(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };

  return (
    maybeError.code === "42703" ||
    Boolean(
      maybeError.message?.includes("language") ||
        maybeError.message?.includes("status") ||
        maybeError.message?.includes("metadata") ||
        maybeError.message?.includes("content_hash") ||
        maybeError.message?.includes("reviewed_at") ||
        maybeError.message?.includes("archived_at")
    )
  );
}

function isNoRows(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string };
  return maybeError.code === "PGRST116";
}

const GAP_SELECT =
  "id,conversation_id,assistant_message_id,topic,user_question,sanitized_user_question,assistant_answer,reason,status,assignment_status,assigned_to,assigned_at,started_at,submitted_at,completed_at,review_comment,prepared_answer,prepared_source,draft_knowledge_id,manager_version,frequency,priority,category,top_similarity,created_at,updated_at,last_seen_at";

function publicGap(gap: ManagerWorkspaceGap) {
  return {
    ...gap,
    user_question:
      gap.sanitized_user_question ||
      sanitizeResidentQuestion(gap.user_question),
    sanitized_user_question:
      gap.sanitized_user_question ||
      sanitizeResidentQuestion(gap.user_question),
  };
}

async function loadGap(gapId: string) {
  const { data, error } = await getAdminClient()
    .from("knowledge_gaps")
    .select(GAP_SELECT)
    .eq("id", gapId)
    .single();

  if (error) {
    throw error;
  }

  return data as ManagerWorkspaceGap;
}

async function loadMyWorkspace(userId: string) {
  const { data: items, error } = await getAdminClient()
    .from("knowledge_gaps")
    .select(GAP_SELECT)
    .eq("assigned_to", userId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    throw error;
  }

  const { count: unassignedCount, error: countError } = await getAdminClient()
    .from("knowledge_gaps")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .eq("assignment_status", "unassigned");

  if (countError) {
    throw countError;
  }

  return {
    items: ((items ?? []) as ManagerWorkspaceGap[]).map(publicGap),
    unassignedCount: unassignedCount ?? 0,
  };
}

async function insertKnowledgeDraft(params: {
  gap: ManagerWorkspaceGap;
  answer: string;
  source: string;
  authorId: string;
}) {
  const draft = buildManagerKnowledgeDraft(params);
  const record = {
    ...draft,
    content_hash: getKnowledgeContentHash(draft),
    reviewed_at: null,
    archived_at: null,
  };

  const insertResult = await getAdminClient()
    .from("knowledge")
    .insert(record)
    .select(
      "id,title,category,content,language,status,priority,verified,source,metadata,content_hash"
    )
    .single();
  let data = insertResult.data as Record<string, unknown> | null;
  let error = insertResult.error;

  if (error && isMissingKnowledgeLifecycleColumn(error)) {
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
      .select("id,title,category,content,priority,verified,source")
      .single();

    data = fallback.data as Record<string, unknown> | null;
    error = fallback.error;
  }

  if (error) {
    throw error;
  }

  return data as { id: string };
}

export async function GET(req: Request) {
  const authorization = await requireStaff(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const userId = authorization.user.id;
  const roles = getTrustedRoles(authorization.user);

  if (!userId) {
    return Response.json({ message: "User id is missing" }, { status: 401 });
  }

  try {
    const workspace = await loadMyWorkspace(userId);

    return Response.json({
      me: { id: userId, roles },
      activeLimit: MANAGER_ACTIVE_TASK_LIMIT,
      ...workspace,
    });
  } catch (error) {
    if (isMissingManagerWorkspace(error)) {
      return Response.json({
        me: { id: userId, roles },
        items: [],
        unassignedCount: 0,
        activeLimit: MANAGER_ACTIVE_TASK_LIMIT,
        setupRequired: true,
        message:
          "Manager Workspace ещё не настроен. Примени миграцию supabase/migrations/20260813003000_manager_workspace.sql.",
      });
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authorization = await requireStaff(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const userId = authorization.user.id;
  const roles = getTrustedRoles(authorization.user);

  if (!userId) {
    return Response.json({ message: "User id is missing" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: WorkspaceAction;
    gapId?: string;
    expectedVersion?: number;
    answer?: string;
    source?: string;
    reviewComment?: string;
  };
  const action = body.action;
  const gapId = cleanText(body.gapId);

  try {
    if (action === "claim_next") {
      const { data: claimedId, error } = await getAdminClient().rpc(
        "claim_next_knowledge_gap",
        {
          p_user_id: userId,
          p_active_limit: MANAGER_ACTIVE_TASK_LIMIT,
        }
      );

      if (error) {
        throw error;
      }

      if (!claimedId) {
        const workspace = await loadMyWorkspace(userId);
        return Response.json({
          claimed: null,
          message:
            workspace.unassignedCount === 0
              ? "В очереди пока нет свободных вопросов."
              : "У тебя уже достигнут лимит активных вопросов.",
          ...workspace,
        });
      }

      const claimed = await loadGap(String(claimedId));
      const workspace = await loadMyWorkspace(userId);

      return Response.json({
        claimed: publicGap(claimed),
        ...workspace,
      });
    }

    if (!gapId) {
      return Response.json({ message: "gapId is required" }, { status: 400 });
    }

    if (action === "start") {
      let query = getAdminClient()
        .from("knowledge_gaps")
        .update({
          assignment_status: "in_progress",
          started_at: new Date().toISOString(),
        })
        .eq("id", gapId)
        .eq("assigned_to", userId)
        .eq("assignment_status", "assigned");

      if (typeof body.expectedVersion === "number") {
        query = query.eq("manager_version", body.expectedVersion);
      }

      const { data, error } = await query.select(GAP_SELECT).single();

      if (error) {
        return Response.json(
          {
            message: isNoRows(error)
              ? "Задача уже изменилась или назначена другому пользователю. Обнови список."
              : error.message,
          },
          { status: isNoRows(error) ? 409 : 500 }
        );
      }

      return Response.json({ item: publicGap(data as ManagerWorkspaceGap) });
    }

    if (action === "submit_review") {
      const answer = cleanText(body.answer);
      const source = cleanText(body.source);

      if (!answer || !source) {
        return Response.json(
          { message: "answer and source are required" },
          { status: 400 }
        );
      }

      const gap = await loadGap(gapId);

      if (gap.assigned_to !== userId) {
        return Response.json({ message: "Forbidden" }, { status: 403 });
      }

      if (
        typeof body.expectedVersion === "number" &&
        gap.manager_version !== body.expectedVersion
      ) {
        return Response.json(
          { message: "Задача уже изменилась. Обнови список перед сохранением." },
          { status: 409 }
        );
      }

      const draft = await insertKnowledgeDraft({
        gap,
        answer,
        source,
        authorId: userId,
      });

      const { data, error } = await getAdminClient()
        .from("knowledge_gaps")
        .update({
          assignment_status: "review",
          prepared_answer: answer,
          prepared_source: source,
          draft_knowledge_id: draft.id,
          submitted_at: new Date().toISOString(),
        })
        .eq("id", gapId)
        .eq("assigned_to", userId)
        .eq("manager_version", gap.manager_version)
        .in("assignment_status", ["assigned", "in_progress"])
        .select(GAP_SELECT)
        .single();

      if (error) {
        return Response.json(
          {
            message: isNoRows(error)
              ? "Задача уже изменилась. Draft создан, но очередь не обновилась — сообщи админу."
              : error.message,
          },
          { status: isNoRows(error) ? 409 : 500 }
        );
      }

      await getAdminClient().from("manager_workspace_audit_events").insert({
        actor_id: userId,
        action: "submit_review",
        entity: "knowledge_gap",
        entity_id: gapId,
        previous_status: gap.assignment_status,
        new_status: "review",
        previous_assignee: userId,
        new_assignee: userId,
        metadata: { draftKnowledgeId: draft.id },
      });

      return Response.json({ item: publicGap(data as ManagerWorkspaceGap) });
    }

    if (action === "return_review") {
      if (!canPublishKnowledge(roles as TrustedRole[])) {
        return Response.json({ message: "Forbidden" }, { status: 403 });
      }

      const comment = cleanText(body.reviewComment);
      const gap = await loadGap(gapId);
      let query = getAdminClient()
        .from("knowledge_gaps")
        .update({
          assignment_status: "in_progress",
          review_comment: comment || "Нужно доработать ответ.",
        })
        .eq("id", gapId)
        .eq("assignment_status", "review");

      if (typeof body.expectedVersion === "number") {
        query = query.eq("manager_version", body.expectedVersion);
      }

      const { data, error } = await query.select(GAP_SELECT).single();

      if (error) {
        return Response.json(
          {
            message: isNoRows(error)
              ? "Задача уже изменилась. Обнови список."
              : error.message,
          },
          { status: isNoRows(error) ? 409 : 500 }
        );
      }

      await getAdminClient().from("manager_workspace_audit_events").insert({
        actor_id: userId,
        action: "return_review",
        entity: "knowledge_gap",
        entity_id: gapId,
        previous_status: gap.assignment_status,
        new_status: "in_progress",
        previous_assignee: gap.assigned_to,
        new_assignee: gap.assigned_to,
        metadata: { reviewComment: comment },
      });

      return Response.json({ item: publicGap(data as ManagerWorkspaceGap) });
    }

    if (action === "complete") {
      if (!canPublishKnowledge(roles as TrustedRole[])) {
        return Response.json({ message: "Forbidden" }, { status: 403 });
      }

      const gap = await loadGap(gapId);
      const { data, error } = await getAdminClient()
        .from("knowledge_gaps")
        .update({
          assignment_status: "completed",
          status: "resolved",
          completed_at: new Date().toISOString(),
          resolved_at: new Date().toISOString(),
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", gapId)
        .eq("assignment_status", "review")
        .select(GAP_SELECT)
        .single();

      if (error) {
        return Response.json(
          {
            message: isNoRows(error)
              ? "Задача уже изменилась. Обнови список."
              : error.message,
          },
          { status: isNoRows(error) ? 409 : 500 }
        );
      }

      await getAdminClient().from("manager_workspace_audit_events").insert({
        actor_id: userId,
        action: "complete",
        entity: "knowledge_gap",
        entity_id: gapId,
        previous_status: gap.assignment_status,
        new_status: "completed",
        previous_assignee: gap.assigned_to,
        new_assignee: gap.assigned_to,
        metadata: { draftKnowledgeId: gap.draft_knowledge_id },
      });

      return Response.json({ item: publicGap(data as ManagerWorkspaceGap) });
    }

    return Response.json({ message: "Unsupported action" }, { status: 400 });
  } catch (error) {
    if (isMissingManagerWorkspace(error)) {
      return Response.json({
        items: [],
        setupRequired: true,
        message:
          "Manager Workspace ещё не настроен. Примени миграцию supabase/migrations/20260813003000_manager_workspace.sql.",
      });
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ message }, { status: 500 });
  }
}
