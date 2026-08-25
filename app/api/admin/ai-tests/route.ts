/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import realWorldCases from "@/data/real-world-eval.json";
import {
  AI_TEST_RUN_LIMIT,
  evaluateAiTestAnswer,
  filterAiTestCases,
  generateAiTestCasesFromKnowledge,
  normalizeAiTestCases,
  planAiTestRun,
  selectAiTestRunCases,
  type AiTestRunRequest,
  type AiTestKnowledgeSeed,
} from "@/lib/aiTestCenter";
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

async function loadVerifiedKnowledge(category?: string) {
  let query = getAdminClient()
    .from("knowledge")
    .select("id,title,category,content,language,status,verified")
    .eq("verified", true)
    .order("priority", { ascending: false })
    .limit(100);

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as AiTestKnowledgeSeed[];
}

async function runAiTestCases(req: Request, body: AiTestRunRequest) {
  if (!body.confirmRun) {
    return Response.json(
      {
        ok: false,
        status: 409,
        message:
          "Running AI tests can call /api/chat and may spend OpenAI credits. Send confirmRun=true.",
        openAiCalls: 0,
        results: [],
      },
      { status: 409 }
    );
  }

  const allCases = normalizeAiTestCases(realWorldCases);
  const cases = selectAiTestRunCases(allCases, body);
  const origin = new URL(req.url).origin;
  const results = [];

  for (const testCase of cases) {
    const startedAt = Date.now();
    const response = await fetch(`${origin}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: req.headers.get("cookie") ?? "",
        "X-AI-Test-Center": "true",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: testCase.sanitizedQuery }],
      }),
    });
    const payload = await response.json().catch(() => ({
      error: `Invalid JSON response with status ${response.status}`,
    }));

    results.push(
      evaluateAiTestAnswer(testCase, payload, Date.now() - startedAt)
    );
  }

  const summary = results.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { pass: 0, fail: 0, needs_review: 0 }
  );

  return Response.json({
    ok: true,
    status: 200,
    message: `Ran ${results.length} AI test case(s). Limit per run: ${AI_TEST_RUN_LIMIT}.`,
    openAiCalls: results.length,
    results,
    summary,
  });
}

export async function GET(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const url = new URL(req.url);
  const cases = filterAiTestCases(normalizeAiTestCases(realWorldCases), {
    query: url.searchParams.get("query"),
    category: url.searchParams.get("category"),
    language: url.searchParams.get("language"),
  });

  return Response.json({
    items: cases,
    total: cases.length,
    openAiCalls: 0,
    costPolicy:
      "Opening AI Test Center is read-only and never calls OpenAI automatically.",
  });
}

export async function POST(req: Request) {
  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const body = (await req.json().catch(() => ({}))) as AiTestRunRequest;

  if (body.mode === "run") {
    return runAiTestCases(req, body);
  }

  if (body.mode === "generate") {
    const knowledge = await loadVerifiedKnowledge(body.category?.trim());
    const generated = generateAiTestCasesFromKnowledge({
      knowledge,
      category: body.category,
      count: body.count,
      difficulty: body.difficulty,
      generationModes: body.generationModes,
    });

    return Response.json({
      ok: true,
      status: 200,
      message:
        "Generated deterministic test cases from verified knowledge. No OpenAI calls were made.",
      openAiCalls: 0,
      totalKnowledge: knowledge.length,
      cases: generated,
    });
  }

  const result = planAiTestRun(normalizeAiTestCases(realWorldCases), body);

  return Response.json(result, { status: result.status });
}
