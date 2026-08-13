/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";
import { sanitizeResidentQuestion, type ManagerWorkspaceGap } from "@/lib/managerWorkspace";

type AdminWorkspaceAction =
  | "assign"
  | "return_to_queue"
  | "return_to_work"
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

const GAP_SELECT =
  "id,conversation_id,assistant_message_id,topic,user_question,sanitized_user_question,assistant_answer,reason,status,assignment_status,assigned_to,assigned_at,started_at,submitted_at,completed_at,reviewed_by,reviewed_at,review_comment,prepared_answer,prepared_source,draft_knowledge_id,manager_version,frequency,priority,category,top_similarity,created_at,updated_at,last_seen_at";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

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

function isMissingManagerWorkspace(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };

  return (
    maybeError.code === "PGRST205" ||
    maybeError.code === "42703" ||
    Boolean(
      maybeError.message?.includes("assignment_status") ||
        maybeError.message?.includes("manager_version") ||
        maybeError.message?.includes("knowledge_gaps")
    )
  );
}

function isNoRows(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (error as { code?: string }).code === "PGRST116";
}

export async function GET(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const { data, error } = await getAdminClient()
      .from("knowledge_gaps")
      .select(GAP_SELECT)
      .eq("status", "open")
      .order("assignment_status", { ascending: true })
      .order("priority", { ascending: false })
      .order("frequency", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      throw error;
    }

    const items = ((data ?? []) as ManagerWorkspaceGap[]).map(publicGap);
    const managerIds = Array.from(
      new Set(items.map((item) => item.assigned_to).filter(Boolean))
    );
    const stats = {
      unassigned: items.filter((item) => item.assignment_status === "unassigned").length,
      assigned: items.filter((item) => item.assignment_status === "assigned").length,
      inProgress: items.filter((item) => item.assignment_status === "in_progress").length,
      review: items.filter((item) => item.assignment_status === "review").length,
      managers: managerIds.map((managerId) => ({
        id: managerId,
        active: items.filter(
          (item) =>
            item.assigned_to === managerId &&
            ["assigned", "in_progress", "review"].includes(
              item.assignment_status ?? ""
            )
        ).length,
      })),
    };

    return Response.json({ items, stats });
  } catch (error) {
    if (isMissingManagerWorkspace(error)) {
      return Response.json({
        items: [],
        stats: { unassigned: 0, assigned: 0, inProgress: 0, review: 0, managers: [] },
        setupRequired: true,
        message:
          "Manager Workspace ещё не настроен. Примени миграцию supabase/migrations/20260813003000_manager_workspace.sql.",
      });
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const actorId = authorization.user.id;
  const body = (await req.json().catch(() => ({}))) as {
    action?: AdminWorkspaceAction;
    gapId?: string;
    assignedTo?: string | null;
    expectedVersion?: number;
    reviewComment?: string;
  };
  const action = body.action;
  const gapId = cleanText(body.gapId);
  const assignedTo = cleanText(body.assignedTo);

  if (!gapId || !action) {
    return Response.json(
      { message: "gapId and action are required" },
      { status: 400 }
    );
  }

  try {
    const { data: previous, error: previousError } = await getAdminClient()
      .from("knowledge_gaps")
      .select(GAP_SELECT)
      .eq("id", gapId)
      .single();

    if (previousError) {
      throw previousError;
    }

    let update: Record<string, unknown>;

    if (action === "assign") {
      if (!assignedTo) {
        return Response.json(
          { message: "assignedTo is required for assign action" },
          { status: 400 }
        );
      }

      update = {
        assignment_status: "assigned",
        assigned_to: assignedTo,
        assigned_at: new Date().toISOString(),
        review_comment: null,
      };
    } else if (action === "return_to_queue") {
      update = {
        assignment_status: "unassigned",
        assigned_to: null,
        assigned_at: null,
        started_at: null,
        submitted_at: null,
        review_comment: cleanText(body.reviewComment) || null,
      };
    } else if (action === "return_to_work") {
      update = {
        assignment_status: "in_progress",
        review_comment:
          cleanText(body.reviewComment) || "Админ вернул ответ на доработку.",
      };
    } else if (action === "complete") {
      update = {
        assignment_status: "completed",
        status: "resolved",
        resolved_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        reviewed_by: actorId,
        reviewed_at: new Date().toISOString(),
      };
    } else {
      return Response.json({ message: "Unsupported action" }, { status: 400 });
    }

    let query = getAdminClient()
      .from("knowledge_gaps")
      .update(update)
      .eq("id", gapId);

    if (typeof body.expectedVersion === "number") {
      query = query.eq("manager_version", body.expectedVersion);
    }

    const { data, error } = await query.select(GAP_SELECT).single();

    if (error) {
      return Response.json(
        {
          message: isNoRows(error)
            ? "Задача уже изменилась. Обнови очередь."
            : error.message,
        },
        { status: isNoRows(error) ? 409 : 500 }
      );
    }

    await getAdminClient().from("manager_workspace_audit_events").insert({
      actor_id: actorId,
      action,
      entity: "knowledge_gap",
      entity_id: gapId,
      previous_status: (previous as ManagerWorkspaceGap).assignment_status,
      new_status: (data as ManagerWorkspaceGap).assignment_status,
      previous_assignee: (previous as ManagerWorkspaceGap).assigned_to,
      new_assignee: (data as ManagerWorkspaceGap).assigned_to,
      metadata: { reviewComment: cleanText(body.reviewComment) || null },
    });

    return Response.json({ item: publicGap(data as ManagerWorkspaceGap) });
  } catch (error) {
    if (isMissingManagerWorkspace(error)) {
      return Response.json({
        setupRequired: true,
        message:
          "Manager Workspace ещё не настроен. Примени миграцию supabase/migrations/20260813003000_manager_workspace.sql.",
      });
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ message }, { status: 500 });
  }
}
