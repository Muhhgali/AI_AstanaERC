/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";
import {
  getOrCreateVisitorOwnership,
  jsonWithVisitorOwnership,
  normalizeUuid,
} from "@/lib/security/visitorOwnership";
import {
  loadOwnedResidentDocument,
  softDeleteOwnedResidentDocument,
} from "@/lib/documents/repository";
import { enforceRateLimit, RATE_LIMIT_POLICIES } from "@/lib/rateLimit";

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

type DocumentRouteContext = {
  params: Promise<{ documentId: string }>;
};

async function getDocumentId(ctx: DocumentRouteContext) {
  const params = await ctx.params;

  return normalizeUuid(params.documentId);
}

export async function GET(
  req: Request,
  ctx: DocumentRouteContext
) {
  const visitorOwnership = getOrCreateVisitorOwnership(req);
  const jsonResponse = (body: unknown, init?: ResponseInit) =>
    jsonWithVisitorOwnership(body, visitorOwnership, init);
  const rateLimited = enforceRateLimit(req, RATE_LIMIT_POLICIES.historyRead);

  if (rateLimited) {
    if (visitorOwnership.cookieHeader) {
      rateLimited.headers.append("Set-Cookie", visitorOwnership.cookieHeader);
    }

    return rateLimited;
  }

  const documentId = await getDocumentId(ctx);

  if (!documentId) {
    return jsonResponse({ message: "Invalid document id" }, { status: 400 });
  }

  const document = await loadOwnedResidentDocument({
    supabase: getAdminClient(),
    documentId,
    visitorId: visitorOwnership.visitorId,
  });

  if (!document) {
    return jsonResponse({ message: "Document not found" }, { status: 404 });
  }

  return jsonResponse({
    document: {
      id: document.id,
      fileName: document.file_name,
      status: document.status,
      documentType: document.document_type,
      extractionMethod: document.extraction_method,
      pageCount: document.page_count,
      structuredResult: document.structured_result,
      warnings: document.warnings ?? [],
      createdAt: document.created_at,
    },
  });
}

export async function DELETE(
  req: Request,
  ctx: DocumentRouteContext
) {
  const visitorOwnership = getOrCreateVisitorOwnership(req);
  const jsonResponse = (body: unknown, init?: ResponseInit) =>
    jsonWithVisitorOwnership(body, visitorOwnership, init);
  const documentId = await getDocumentId(ctx);

  if (!documentId) {
    return jsonResponse({ message: "Invalid document id" }, { status: 400 });
  }

  const deleted = await softDeleteOwnedResidentDocument({
    supabase: getAdminClient(),
    documentId,
    visitorId: visitorOwnership.visitorId,
  });

  if (!deleted) {
    return jsonResponse({ message: "Document not found" }, { status: 404 });
  }

  return jsonResponse({ ok: true });
}
