/* eslint-disable @typescript-eslint/no-explicit-any */
// Loads the crawled aerc.kz pages (data/site-pages.json) into public.knowledge.
// Admin-only. Runs on the server with the service-role key, so the owner does
// not need any keys on their own computer. Safe to run again after re-crawling:
// unchanged rows are skipped, changed rows re-embedded, removed pages archived.
import { createClient } from "@supabase/supabase-js";
import sitePagesData from "@/data/site-pages.json";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createEmbeddings } from "@/lib/embedding";
import { getKnowledgeContentHash } from "@/lib/knowledgeLifecycle";
import { enforceRateLimit, RATE_LIMIT_POLICIES } from "@/lib/rateLimit";
import type { SitePage } from "@/lib/site/extractPage";
import {
  buildSiteKnowledgeChunks,
  SITE_SOURCE_PREFIX,
  type SiteKnowledgeChunk,
} from "@/lib/site/siteKnowledge";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";

export const maxDuration = 300;

type ExistingSiteRow = {
  id: string;
  title: string | null;
  content: string | null;
  source: string | null;
  content_hash?: string | null;
  status?: string | null;
};

let adminClient: ReturnType<typeof createClient<any>> | null = null;

function getAdminClient() {
  const supabaseUrl = getSupabaseProjectUrl();

  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  adminClient ??= createClient<any>(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);

  return adminClient;
}

function isMissingLifecycleColumn(error: unknown) {
  const maybeError = (error ?? {}) as { code?: string; message?: string };

  return (
    maybeError.code === "42703" ||
    /status|language|content_hash|metadata/.test(maybeError.message ?? "")
  );
}

function rowKey(source: string | null | undefined, title: string | null | undefined) {
  return `${source ?? ""}|${title ?? ""}`;
}

async function loadExistingSiteRows() {
  const supabase = getAdminClient();
  const full = await supabase
    .from("knowledge")
    .select("id,title,content,source,content_hash,status")
    .like("source", `${SITE_SOURCE_PREFIX}%`)
    .range(0, 4999);

  if (!full.error) {
    return { rows: (full.data ?? []) as ExistingSiteRow[], lifecycle: true };
  }

  if (!isMissingLifecycleColumn(full.error)) {
    throw full.error;
  }

  const legacy = await supabase
    .from("knowledge")
    .select("id,title,content,source")
    .like("source", `${SITE_SOURCE_PREFIX}%`)
    .range(0, 4999);

  if (legacy.error) {
    throw legacy.error;
  }

  return { rows: (legacy.data ?? []) as ExistingSiteRow[], lifecycle: false };
}

function buildRecord(
  chunk: SiteKnowledgeChunk,
  embedding: number[],
  contentHash: string,
  lifecycle: boolean
) {
  const base = {
    title: chunk.title,
    category: chunk.category,
    content: chunk.content,
    embedding,
    priority: chunk.priority,
    // Text published on the official site counts as confirmed by the company.
    verified: true,
    source: chunk.source,
  };

  return lifecycle
    ? {
        ...base,
        language: chunk.language,
        status: "verified",
        content_hash: contentHash,
        metadata: { origin: "site-sync", url: chunk.source },
      }
    : base;
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
    const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean };
    const data = sitePagesData as { crawledAt?: string; pages: SitePage[] };
    const chunks = buildSiteKnowledgeChunks(data.pages ?? []);
    const { rows: existingRows, lifecycle } = await loadExistingSiteRows();
    const existingByKey = new Map(
      existingRows.map((row) => [rowKey(row.source, row.title), row])
    );

    const toWrite: Array<{
      chunk: SiteKnowledgeChunk;
      hash: string;
      existing?: ExistingSiteRow;
    }> = [];
    let unchanged = 0;

    for (const chunk of chunks) {
      const hash = getKnowledgeContentHash(chunk);
      const existing = existingByKey.get(rowKey(chunk.source, chunk.title));
      const sameContent = existing
        ? existing.content_hash
          ? existing.content_hash === hash
          : existing.content === chunk.content
        : false;

      if (existing && sameContent && existing.status !== "archived") {
        unchanged++;
      } else {
        toWrite.push({ chunk, hash, existing });
      }
    }

    const currentKeys = new Set(chunks.map((chunk) => rowKey(chunk.source, chunk.title)));
    const stale = existingRows.filter(
      (row) => !currentKeys.has(rowKey(row.source, row.title)) && row.status !== "archived"
    );
    const summary = {
      crawledAt: data.crawledAt ?? null,
      pages: data.pages?.length ?? 0,
      chunks: chunks.length,
      inserted: toWrite.filter((item) => !item.existing).length,
      updated: toWrite.filter((item) => item.existing).length,
      unchanged,
      archived: stale.length,
      dryRun: Boolean(body.dryRun),
    };

    if (body.dryRun || (toWrite.length === 0 && stale.length === 0)) {
      return Response.json(summary);
    }

    const supabase = getAdminClient();
    const embeddings = await createEmbeddings(
      toWrite.map(({ chunk }) => `${chunk.title}\n\n${chunk.content}`)
    );
    const inserts = toWrite
      .map((item, index) => ({ ...item, embedding: embeddings[index] }))
      .filter((item) => !item.existing)
      .map((item) => buildRecord(item.chunk, item.embedding, item.hash, lifecycle));

    for (let start = 0; start < inserts.length; start += 100) {
      const { error } = await supabase.from("knowledge").insert(inserts.slice(start, start + 100));

      if (error) {
        throw error;
      }
    }

    for (const [index, item] of toWrite.entries()) {
      if (!item.existing) {
        continue;
      }

      const { error } = await supabase
        .from("knowledge")
        .update(buildRecord(item.chunk, embeddings[index], item.hash, lifecycle))
        .eq("id", item.existing.id);

      if (error) {
        throw error;
      }
    }

    for (const row of stale) {
      const { error } = await supabase
        .from("knowledge")
        .update(lifecycle ? { status: "archived", verified: false } : { verified: false })
        .eq("id", row.id);

      if (error) {
        throw error;
      }
    }

    return Response.json(summary);
  } catch (error) {
    console.error("SITE SYNC FAILED:", error);

    return Response.json(
      {
        message:
          error instanceof Error
            ? `Не удалось загрузить сайт в базу: ${error.message}`
            : "Не удалось загрузить сайт в базу",
      },
      { status: 500 }
    );
  }
}
