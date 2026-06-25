/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { createEmbedding } from "@/lib/embedding";

type KnowledgePayload = {
  id?: string;
  title?: string;
  category?: string;
  content?: string;
  priority?: number;
  verified?: boolean;
  source?: string;
};

let authClient: ReturnType<typeof createClient<any>> | null = null;
let adminClient: ReturnType<typeof createClient<any>> | null = null;

function getAuthClient() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  authClient ??= createClient<any>(
    supabaseUrl,
    supabaseAnonKey
  );

  return authClient;
}

function getAdminClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  adminClient ??= createClient<any>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  return adminClient;
}

async function requireUser(req: Request) {
  // Temporary production diagnostic bypass. Re-enable Supabase Auth after testing.
  if (process.env.ADMIN_AUTH_DISABLED !== "false") {
    return { id: "temporary-admin" };
  }

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
    priority: cleanPriority(payload.priority),
    verified: Boolean(payload.verified),
    source: cleanText(payload.source) || "admin",
  };
}

async function buildRecord(payload: KnowledgePayload) {
  const record = validatePayload(payload);
  const embeddingInput = [
    record.title,
    record.category,
    record.content,
    record.verified ? "Проверенная информация" : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const embedding = await createEmbedding(embeddingInput);

  return {
    ...record,
    embedding,
  };
}

export async function GET(req: Request) {
  const user = await requireUser(req);

  if (!user) {
    return Response.json(
      {
        message:
          "Сессия администратора не прошла проверку. Войди заново и проверь Supabase env-переменные на Vercel.",
      },
      { status: 401 }
    );
  }

  const { data, error } = await getAdminClient()
    .from("knowledge")
    .select("id,title,category,content,priority,verified,source")
    .order("verified", { ascending: false })
    .order("priority", { ascending: false })
    .order("title", { ascending: true });

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  const user = await requireUser(req);

  if (!user) {
    return Response.json(
      {
        message:
          "Сессия администратора не прошла проверку. Войди заново и проверь Supabase env-переменные на Vercel.",
      },
      { status: 401 }
    );
  }

  try {
    const payload = (await req.json()) as KnowledgePayload;
    const record = await buildRecord(payload);

    const { data, error } = await getAdminClient()
      .from("knowledge")
      .insert(record)
      .select("id,title,category,content,priority,verified,source")
      .single();

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
  const user = await requireUser(req);

  if (!user) {
    return Response.json(
      {
        message:
          "Сессия администратора не прошла проверку. Войди заново и проверь Supabase env-переменные на Vercel.",
      },
      { status: 401 }
    );
  }

  try {
    const payload = (await req.json()) as KnowledgePayload;
    const id = cleanText(payload.id);

    if (!id) {
      return Response.json({ message: "ID is required" }, { status: 400 });
    }

    const record = await buildRecord(payload);

    const { data, error } = await getAdminClient()
      .from("knowledge")
      .update(record)
      .eq("id", id)
      .select("id,title,category,content,priority,verified,source")
      .single();

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
  const user = await requireUser(req);

  if (!user) {
    return Response.json(
      {
        message:
          "Сессия администратора не прошла проверку. Войди заново и проверь Supabase env-переменные на Vercel.",
      },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const id = cleanText(url.searchParams.get("id"));

  if (!id) {
    return Response.json({ message: "ID is required" }, { status: 400 });
  }

  const { error } = await getAdminClient()
    .from("knowledge")
    .delete()
    .eq("id", id);

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
