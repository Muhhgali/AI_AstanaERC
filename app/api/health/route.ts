import { NextResponse } from "next/server";
import packageMetadata from "../../../package.json";
import { getSupabaseAnonKey, getSupabaseProjectUrl } from "../../../lib/supabaseEnv";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = Boolean(
    getSupabaseProjectUrl() &&
      getSupabaseAnonKey() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.OPENAI_API_KEY
  );

  return NextResponse.json(
    {
      status: configured ? "ok" : "degraded",
      version: packageMetadata.version,
      timestamp: new Date().toISOString(),
    },
    {
      status: configured ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
