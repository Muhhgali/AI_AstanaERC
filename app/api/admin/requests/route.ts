/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseProjectUrl } from "@/lib/supabaseEnv";

let authClient: ReturnType<typeof createClient<any>> | null = null;
let adminClient: ReturnType<typeof createClient<any>> | null = null;

type RequestType = "meter" | "appeal" | "appointment";

type AppealAttachment = {
  name: string;
  path?: string;
  size: number;
  type: string;
  url?: string;
};

type AppealRequestRow = {
  attachments?: AppealAttachment[] | null;
  [key: string]: unknown;
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

function isMissingTable(error: { code?: string; message?: string }) {
  return error.code === "PGRST205";
}

async function loadTable<T>(
  table: string,
  select: string
): Promise<{ data: T[]; setupRequired: boolean; error?: string }> {
  const { data, error } = await getAdminClient()
    .from(table)
    .select(select)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    if (isMissingTable(error) || error.message?.includes(table)) {
      return { data: [], setupRequired: true, error: error.message };
    }

    throw error;
  }

  return { data: (data ?? []) as T[], setupRequired: false };
}

function getRequestTable(type: RequestType) {
  if (type === "meter") {
    return {
      table: "meter_correction_requests",
      allowed: ["new", "in_progress", "done", "rejected"],
    };
  }

  if (type === "appeal") {
    return {
      table: "appeal_requests",
      allowed: ["new", "in_progress", "done", "rejected"],
    };
  }

  return {
    table: "leadership_appointments",
    allowed: ["new", "confirmed", "done", "cancelled"],
  };
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
    const [meter, appeals, appointments] = await Promise.all([
      loadTable(
        "meter_correction_requests",
        "id,request_number,account_number,meter_number,correct_reading,contact,service_type,comment,reason,status,created_at,updated_at"
      ),
      loadTable(
        "appeal_requests",
        "id,name,topic,message,contact,attachments,status,created_at,updated_at"
      ),
      loadTable(
        "leadership_appointments",
        "id,first_name,last_name,leader_key,leader_title,leader_name,appointment_date,appointment_time,phone,email,status,created_at,updated_at"
      ),
    ]);

    const appealsWithLinks = await Promise.all(
      (appeals.data as AppealRequestRow[]).map(async (appeal) => {
        const attachments = Array.isArray(appeal.attachments)
          ? await Promise.all(
              appeal.attachments.map(async (file) => {
                if (!file.path) {
                  return file;
                }

                const { data } = await getAdminClient().storage
                  .from("request-attachments")
                  .createSignedUrl(file.path, 60 * 60);

                return {
                  ...file,
                  url: data?.signedUrl,
                };
              })
            )
          : appeal.attachments;

        return {
          ...appeal,
          attachments,
        };
      })
    );

    return Response.json({
      meterCorrections: meter.data,
      appeals: appealsWithLinks,
      appointments: appointments.data,
      setupRequired:
        meter.setupRequired || appeals.setupRequired || appointments.setupRequired,
      setupMessage:
        meter.setupRequired || appeals.setupRequired || appointments.setupRequired
          ? "Часть таблиц заявок еще не настроена. Выполни scripts/chatHistory.sql в Supabase SQL Editor."
          : undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось загрузить заявки";

    return Response.json({ message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const user = await requireUser(req);

  if (!user) {
    return Response.json(
      { message: "Сессия администратора не прошла проверку." },
      { status: 401 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    type?: RequestType;
    id?: string;
    status?: string;
  };

  if (!body.type || !body.id || !body.status) {
    return Response.json(
      { message: "type, id and status are required" },
      { status: 400 }
    );
  }

  const config = getRequestTable(body.type);

  if (!config.allowed.includes(body.status)) {
    return Response.json({ message: "Unsupported status" }, { status: 400 });
  }

  const { error } = await getAdminClient()
    .from(config.table)
    .update({
      status: body.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.id);

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
