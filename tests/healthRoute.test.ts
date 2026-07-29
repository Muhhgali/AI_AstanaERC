import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/health/route";

describe("health endpoint", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports ok without returning configuration values", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "secret-anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret-service");
    vi.stubEnv("OPENAI_API_KEY", "secret-openai");

    const response = await GET();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(serialized).not.toContain("secret-");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("reports degraded when required configuration is missing", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
  });
});
