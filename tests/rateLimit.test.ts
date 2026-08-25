import { describe, expect, it, vi } from "vitest";
import {
  enforceRateLimit,
  InMemoryRateLimitStore,
  RATE_LIMIT_POLICIES,
  shouldBypassRateLimit,
  type RateLimitPolicy,
} from "../lib/rateLimit";

const policy: RateLimitPolicy = {
  namespace: "test",
  limit: 2,
  windowMs: 1_000,
};

function request(path = "/api/chat") {
  return new Request(`http://localhost${path}`, {
    headers: {
      "x-forwarded-for": "192.0.2.10",
      "user-agent": "rate-limit-test",
    },
  });
}

describe("rate limiting", () => {
  it("allows requests up to the limit and then returns 429", async () => {
    const store = new InMemoryRateLimitStore();

    expect(enforceRateLimit(request(), policy, store, 0)).toBeNull();
    expect(enforceRateLimit(request(), policy, store, 100)).toBeNull();

    const response = enforceRateLimit(request(), policy, store, 200);
    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("1");
    await expect(response?.json()).resolves.toMatchObject({
      message: "Too many requests. Please try again later.",
      retryAfterSeconds: 1,
    });
  });

  it("keeps endpoint counters separate", () => {
    const store = new InMemoryRateLimitStore();

    expect(enforceRateLimit(request("/api/chat"), policy, store, 0)).toBeNull();
    expect(enforceRateLimit(request("/api/chat"), policy, store, 10)).toBeNull();
    expect(
      enforceRateLimit(request("/api/requests/appeal"), policy, store, 20)
    ).toBeNull();
  });

  it("allows requests again after the window expires", () => {
    const store = new InMemoryRateLimitStore();

    enforceRateLimit(request(), policy, store, 0);
    enforceRateLimit(request(), policy, store, 10);
    expect(enforceRateLimit(request(), policy, store, 20)?.status).toBe(429);
    expect(enforceRateLimit(request(), policy, store, 1_001)).toBeNull();
  });

  it("gives staff knowledge review a burst-friendly write budget", () => {
    expect(RATE_LIMIT_POLICIES.adminAiMutation.limit).toBeGreaterThanOrEqual(180);
  });

  it("skips admin write limits during local development", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(shouldBypassRateLimit(RATE_LIMIT_POLICIES.adminAiMutation)).toBe(true);
    expect(shouldBypassRateLimit(RATE_LIMIT_POLICIES.chat)).toBe(false);
    expect(
      enforceRateLimit(
        request("/api/admin/knowledge"),
        RATE_LIMIT_POLICIES.adminAiMutation
      )
    ).toBeNull();

    vi.unstubAllEnvs();
  });
});
