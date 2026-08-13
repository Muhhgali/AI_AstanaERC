import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  VISITOR_COOKIE_NAME,
  getOrCreateVisitorOwnership,
  getVerifiedVisitorId,
  jsonWithVisitorOwnership,
} from "../lib/security/visitorOwnership";

function request(cookie?: string) {
  return new Request("http://localhost/api/chat", {
    headers: cookie ? { cookie } : {},
  });
}

describe("visitor ownership", () => {
  it("creates an HttpOnly signed visitor cookie and hashed visitor id", () => {
    vi.stubEnv("VISITOR_TOKEN_SECRET", "x".repeat(40));

    const ownership = getOrCreateVisitorOwnership(request());

    expect(ownership.visitorId).toMatch(/^[0-9a-f]{64}$/);
    expect(ownership.cookieHeader).toContain(`${VISITOR_COOKIE_NAME}=`);
    expect(ownership.cookieHeader).toContain("HttpOnly");
    expect(ownership.cookieHeader).toContain("SameSite=Lax");
  });

  it("verifies an existing signed cookie without issuing a new one", () => {
    vi.stubEnv("VISITOR_TOKEN_SECRET", "x".repeat(40));

    const first = getOrCreateVisitorOwnership(request());
    const cookie = first.cookieHeader?.split(";")[0] ?? "";
    const second = getOrCreateVisitorOwnership(request(cookie));

    expect(second.visitorId).toBe(first.visitorId);
    expect(second.cookieHeader).toBeUndefined();
  });

  it("rejects a tampered signed cookie", () => {
    vi.stubEnv("VISITOR_TOKEN_SECRET", "x".repeat(40));

    const first = getOrCreateVisitorOwnership(request());
    const cookie = (first.cookieHeader?.split(";")[0] ?? "").replace(/.$/, "x");

    expect(getVerifiedVisitorId(request(cookie))).toBeNull();
  });

  it("attaches visitor cookie to JSON responses", () => {
    vi.stubEnv("VISITOR_TOKEN_SECRET", "x".repeat(40));

    const ownership = getOrCreateVisitorOwnership(request());
    const response = jsonWithVisitorOwnership({ ok: true }, ownership);

    expect(response.headers.get("set-cookie")).toContain(VISITOR_COOKIE_NAME);
  });
});
