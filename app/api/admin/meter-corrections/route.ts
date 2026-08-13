/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";
import { requireAdmin } from "@/lib/auth/requireAdmin";

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

function isMissingTable(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST205" ||
    Boolean(error.message?.includes("meter_correction_requests"))
  );
}

export async function GET(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const { data, error } = await getAdminClient()
    .from("meter_correction_requests")
    .select(
      "id,request_number,account_number,meter_number,correct_reading,contact,service_type,comment,reason,status,created_at,updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    if (isMissingTable(error)) {
      return Response.json({
        requests: [],
        setupRequired: true,
        message:
          "Таблица заявок на корректировку еще не настроена. Выполни scripts/chatHistory.sql в Supabase SQL Editor.",
      });
    }

    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json({ requests: data ?? [] });
}

export async function PATCH(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    status?: "new" | "in_progress" | "done" | "rejected";
  };

  if (!body.id || !body.status) {
    return Response.json(
      { message: "id and status are required" },
      { status: 400 }
    );
  }

  const { error } = await getAdminClient()
    .from("meter_correction_requests")
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
