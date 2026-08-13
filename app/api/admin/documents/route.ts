/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";

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

function isMissingDocumentsTable(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };

  return (
    maybeError.code === "PGRST205" ||
    maybeError.code === "42P01" ||
    Boolean(maybeError.message?.includes("resident_documents"))
  );
}

export async function GET(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const { data, error } = await getAdminClient()
    .from("resident_documents")
    .select(
      "id,conversation_id,file_name,file_type,file_size,status,document_type,extraction_method,page_count,structured_result,warnings,error_message,created_at,updated_at,deleted_at"
    )
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    if (isMissingDocumentsTable(error)) {
      return Response.json({
        documents: [],
        setupRequired: true,
        message:
          "Stage 5 table resident_documents is not configured yet. Apply the Document Intelligence migration.",
      });
    }

    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json({
    documents: data ?? [],
  });
}
