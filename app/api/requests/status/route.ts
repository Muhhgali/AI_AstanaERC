/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";

let adminSupabase: ReturnType<typeof createClient<any>> | null = null;

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

function normalizeIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter(
        (item): item is string =>
          typeof item === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            item
          )
      )
    )
  ).slice(0, 30);
}

function normalizeVisitorId(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return /^[A-Za-z0-9_-]{12,120}$/.test(trimmed) ? trimmed : undefined;
}

function isMissingVisitorIdColumn(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };

  return (
    maybeError.code === "42703" ||
    Boolean(maybeError.message?.includes("visitor_id"))
  );
}

function isMissingRelation(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };

  return (
    maybeError.code === "PGRST205" ||
    maybeError.code === "42703" ||
    Boolean(maybeError.message?.includes("conversation_id")) ||
    Boolean(maybeError.message?.includes("visitor_id"))
  );
}

async function safeQuery<T>(query: PromiseLike<{ data: T[] | null; error: any }>) {
  const { data, error } = await query;

  if (error) {
    if (isMissingRelation(error)) {
      return [];
    }

    throw error;
  }

  return data ?? [];
}

function mergeRows<T extends { id: string }>(...groups: T[][]) {
  return Array.from(
    new Map(groups.flat().map((item) => [item.id, item])).values()
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const suppliedIds = normalizeIds(body?.conversationIds);
    const visitorId = normalizeVisitorId(body?.visitorId);

    if (suppliedIds.length === 0 && !visitorId) {
      return Response.json({ requests: [] });
    }

    const supabase = getAdminSupabase();
    let visitorIds: string[] = [];

    if (visitorId) {
      const { data, error } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("visitor_id", visitorId)
        .limit(30);

      if (error) {
        if (!isMissingVisitorIdColumn(error)) {
          return Response.json({ message: error.message }, { status: 500 });
        }
      } else {
        visitorIds = (data ?? []).map((item) => item.id as string);
      }
    }

    const ids = Array.from(new Set([...suppliedIds, ...visitorIds])).slice(
      0,
      30
    );

    const [
      meterByConversation,
      appealsByConversation,
      appointmentsByConversation,
      meterByVisitor,
      appealsByVisitor,
      appointmentsByVisitor,
    ] = await Promise.all([
      ids.length > 0
        ? safeQuery<any>(
            supabase
              .from("meter_correction_requests")
              .select(
                "id,request_number,conversation_id,visitor_id,account_number,service_type,status,created_at,updated_at"
              )
              .in("conversation_id", ids)
              .order("created_at", { ascending: false })
          )
        : Promise.resolve([]),
      ids.length > 0
        ? safeQuery<any>(
            supabase
              .from("appeal_requests")
              .select(
                "id,conversation_id,visitor_id,topic,status,created_at,updated_at"
              )
              .in("conversation_id", ids)
              .order("created_at", { ascending: false })
          )
        : Promise.resolve([]),
      ids.length > 0
        ? safeQuery<any>(
            supabase
              .from("leadership_appointments")
              .select(
                "id,conversation_id,visitor_id,leader_title,leader_name,appointment_date,appointment_time,status,created_at,updated_at"
              )
              .in("conversation_id", ids)
              .order("created_at", { ascending: false })
          )
        : Promise.resolve([]),
      visitorId
        ? safeQuery<any>(
            supabase
              .from("meter_correction_requests")
              .select(
                "id,request_number,conversation_id,visitor_id,account_number,service_type,status,created_at,updated_at"
              )
              .eq("visitor_id", visitorId)
              .order("created_at", { ascending: false })
          )
        : Promise.resolve([]),
      visitorId
        ? safeQuery<any>(
            supabase
              .from("appeal_requests")
              .select(
                "id,conversation_id,visitor_id,topic,status,created_at,updated_at"
              )
              .eq("visitor_id", visitorId)
              .order("created_at", { ascending: false })
          )
        : Promise.resolve([]),
      visitorId
        ? safeQuery<any>(
            supabase
              .from("leadership_appointments")
              .select(
                "id,conversation_id,visitor_id,leader_title,leader_name,appointment_date,appointment_time,status,created_at,updated_at"
              )
              .eq("visitor_id", visitorId)
              .order("created_at", { ascending: false })
          )
        : Promise.resolve([]),
    ]);
    const meter = mergeRows(meterByConversation, meterByVisitor);
    const appeals = mergeRows(appealsByConversation, appealsByVisitor);
    const appointments = mergeRows(
      appointmentsByConversation,
      appointmentsByVisitor
    );

    return Response.json({
      requests: [
        ...meter.map((item) => ({
          id: item.id,
          type: "meter",
          title: item.request_number
            ? `Корректировка ${item.request_number}`
            : "Корректировка показаний",
          detail: item.service_type || item.account_number || "",
          status: item.status,
          conversationId: item.conversation_id,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        })),
        ...appeals.map((item) => ({
          id: item.id,
          type: "appeal",
          title: "Обычное обращение",
          detail: item.topic || "",
          status: item.status,
          conversationId: item.conversation_id,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        })),
        ...appointments.map((item) => ({
          id: item.id,
          type: "appointment",
          title: "Запись к руководству",
          detail: [item.leader_title, item.leader_name, item.appointment_date]
            .filter(Boolean)
            .join(" · "),
          status: item.status,
          conversationId: item.conversation_id,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          time: item.appointment_time,
        })),
      ].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load request statuses";

    return Response.json({ message }, { status: 500 });
  }
}
