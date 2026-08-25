import { createHash } from "node:crypto";

export type RateLimitPolicy = {
  namespace: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
};

export interface RateLimitStore {
  consume(key: string, policy: RateLimitPolicy, now?: number): RateLimitResult;
}

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export class InMemoryRateLimitStore implements RateLimitStore {
  private entries = new Map<string, RateLimitEntry>();
  private operations = 0;

  consume(key: string, policy: RateLimitPolicy, now = Date.now()) {
    this.operations += 1;

    if (this.operations % 100 === 0) {
      for (const [entryKey, entry] of this.entries) {
        if (entry.resetAt <= now) {
          this.entries.delete(entryKey);
        }
      }
    }

    const current = this.entries.get(key);
    const entry =
      !current || current.resetAt <= now
        ? { count: 0, resetAt: now + policy.windowMs }
        : current;

    entry.count += 1;
    this.entries.set(key, entry);

    const allowed = entry.count <= policy.limit;

    return {
      allowed,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - entry.count),
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      resetAt: entry.resetAt,
    };
  }
}

export const RATE_LIMIT_POLICIES = {
  chat: { namespace: "chat", limit: 40, windowMs: 60_000 },
  publicMutation: {
    namespace: "public-mutation",
    limit: 12,
    windowMs: 10 * 60_000,
  },
  historyRead: {
    namespace: "history-read",
    limit: 60,
    windowMs: 10 * 60_000,
  },
  documentAnalysis: {
    namespace: "document-analysis",
    limit: 10,
    windowMs: 10 * 60_000,
  },
  adminAiMutation: {
    namespace: "admin-ai-mutation",
    // Staff review/publish of knowledge is bursty (one PATCH per card).
    // This is not a public endpoint; OpenAI spend is still bounded.
    limit: 180,
    windowMs: 10 * 60_000,
  },
} satisfies Record<string, RateLimitPolicy>;

const DEV_BYPASS_NAMESPACES = new Set(["admin-ai-mutation"]);

const defaultStore = new InMemoryRateLimitStore();

export function shouldBypassRateLimit(policy: RateLimitPolicy) {
  return (
    process.env.NODE_ENV === "development" &&
    DEV_BYPASS_NAMESPACES.has(policy.namespace)
  );
}

function getClientSignal(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const userAgent = request.headers.get("user-agent")?.slice(0, 160) ?? "unknown-agent";
  const rawSignal = `${forwardedFor || realIp || "unknown-ip"}|${userAgent}`;

  return createHash("sha256").update(rawSignal).digest("hex");
}

export function enforceRateLimit(
  request: Request,
  policy: RateLimitPolicy,
  store: RateLimitStore = defaultStore,
  now = Date.now()
) {
  if (shouldBypassRateLimit(policy)) {
    return null;
  }

  const pathname = new URL(request.url).pathname;
  const clientKey = `${policy.namespace}:${pathname}:${getClientSignal(request)}`;
  const result = store.consume(clientKey, policy, now);

  if (result.allowed) {
    return null;
  }

  return Response.json(
    {
      message: "Too many requests. Please try again later.",
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
      },
    }
  );
}
