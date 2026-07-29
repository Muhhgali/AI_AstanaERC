import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseProjectUrl } from "@/lib/supabaseEnv";

type TrustedUser = {
  id?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

type UserLookupResult = {
  user: TrustedUser | null;
  error?: unknown;
};

export type AdminAuthorizationResult =
  | { ok: true; user: TrustedUser }
  | { ok: false; response: Response };

let authClient: ReturnType<typeof createClient> | null = null;

function getAuthClient() {
  const supabaseUrl = getSupabaseProjectUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Admin authentication is not configured");
  }

  authClient ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return authClient;
}

export function hasTrustedAdminRole(user: TrustedUser | null) {
  if (!user?.app_metadata) {
    return false;
  }

  const role = user.app_metadata.role;
  const roles = user.app_metadata.roles;

  return (
    role === "admin" ||
    (Array.isArray(roles) && roles.some((item) => item === "admin"))
  );
}

export async function authorizeAdminRequest(
  request: Request,
  lookupUser: (accessToken: string) => Promise<UserLookupResult>
): Promise<AdminAuthorizationResult> {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const accessToken = match?.[1]?.trim();

  if (!accessToken) {
    return {
      ok: false,
      response: Response.json({ message: "Unauthorized" }, { status: 401 }),
    };
  }

  const { user, error } = await lookupUser(accessToken);

  if (error || !user) {
    return {
      ok: false,
      response: Response.json({ message: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!hasTrustedAdminRole(user)) {
    return {
      ok: false,
      response: Response.json({ message: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, user };
}

export async function requireAdmin(
  request: Request
): Promise<AdminAuthorizationResult> {
  try {
    return await authorizeAdminRequest(request, async (accessToken) => {
      const {
        data: { user },
        error,
      } = await getAuthClient().auth.getUser(accessToken);

      return { user, error };
    });
  } catch {
    return {
      ok: false,
      response: Response.json(
        { message: "Authentication service unavailable" },
        { status: 503 }
      ),
    };
  }
}

