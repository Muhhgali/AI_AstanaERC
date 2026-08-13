import realWorldCases from "@/data/real-world-eval.json";
import {
  filterAiTestCases,
  normalizeAiTestCases,
  planAiTestRun,
  type AiTestRunRequest,
} from "@/lib/aiTestCenter";
import { requireAdmin } from "@/lib/auth/requireAdmin";

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
  const result = planAiTestRun(normalizeAiTestCases(realWorldCases), body);

  return Response.json(result, { status: result.status });
}
