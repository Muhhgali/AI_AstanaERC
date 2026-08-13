/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";
import { requireAdmin } from "@/lib/auth/requireAdmin";

let adminClient: ReturnType<typeof createClient<any>> | null = null;

const ALLOWED_STATUSES = ["new", "in_progress", "done", "cancelled"];

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

export async function PATCH(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
  };

  if (!body.id || !body.status) {
    return Response.json(
      { message: "id and status are required" },
      { status: 400 }
    );
  }

  if (!ALLOWED_STATUSES.includes(body.status)) {
    return Response.json({ message: "Unsupported status" }, { status: 400 });
  }

  const { error } = await getAdminClient()
    .from("operator_handoffs")
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
