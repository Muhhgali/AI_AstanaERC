import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseProjectUrl } from "../supabaseEnv";

type TrustedUser = {
  id?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

export type TrustedRole = "admin" | "manager" | "knowledge_editor" | "reviewer";

type UserLookupResult = {
  user: TrustedUser | null;
  error?: unknown;
};

export type AdminAuthorizationResult =
  | { ok: true; user: TrustedUser }
  | { ok: false; response: Response };

export type StaffAuthorizationResult = AdminAuthorizationResult;

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

export function getTrustedRoles(user: TrustedUser | null): TrustedRole[] {
  if (!user?.app_metadata) {
    return [];
  }

  const role = user.app_metadata.role;
  const roles = user.app_metadata.roles;
  const allRoles = [
    typeof role === "string" ? role : null,
    ...(Array.isArray(roles) ? roles : []),
  ];

  return allRoles.filter((item): item is TrustedRole =>
    item === "admin" ||
    item === "manager" ||
    item === "knowledge_editor" ||
    item === "reviewer"
  );
}

export function hasTrustedRole(
  user: TrustedUser | null,
  allowedRoles: TrustedRole[]
) {
  const roles = getTrustedRoles(user);

  return roles.some((role) => allowedRoles.includes(role));
}

export function hasTrustedAdminRole(user: TrustedUser | null) {
  return hasTrustedRole(user, ["admin", "manager", "knowledge_editor", "reviewer"]);
}

async function authorizeRoleRequest(
  request: Request,
  lookupUser: (accessToken: string) => Promise<UserLookupResult>,
  allowedRoles: TrustedRole[],
  forbidden: { code: string; message: string }
): Promise<StaffAuthorizationResult> {
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

  if (!hasTrustedRole(user, allowedRoles)) {
    return {
      ok: false,
      response: Response.json(forbidden, { status: 403 }),
    };
  }

  return { ok: true, user };
}

export async function authorizeAdminRequest(
  request: Request,
  lookupUser: (accessToken: string) => Promise<UserLookupResult>
): Promise<AdminAuthorizationResult> {
  return authorizeRoleRequest(request, lookupUser, ["admin", "manager", "knowledge_editor", "reviewer"], {
    code: "ADMIN_ROLE_REQUIRED",
    message:
      "Доступ запрещён: пользователь вошёл, но ему не назначена роль admin в Supabase app_metadata.",
  });
}

async function authorizeWithSupabase(
  request: Request,
  allowedRoles: TrustedRole[],
  forbidden: { code: string; message: string }
) {
  try {
    return await authorizeRoleRequest(
      request,
      async (accessToken) => {
        const {
          data: { user },
          error,
        } = await getAuthClient().auth.getUser(accessToken);

        return { user, error };
      },
      allowedRoles,
      forbidden
    );
  } catch {
    return {
      ok: false as const,
      response: Response.json(
        { message: "Authentication service unavailable" },
        { status: 503 }
      ),
    };
  }
}

export async function requireAdmin(
  request: Request
): Promise<AdminAuthorizationResult> {
  return authorizeWithSupabase(request, ["admin", "manager", "knowledge_editor", "reviewer"], {
    code: "ADMIN_ROLE_REQUIRED",
    message:
      "Доступ запрещён: пользователь вошёл, но ему не назначена роль admin в Supabase app_metadata.",
  });
}

export async function requireStaff(
  request: Request
): Promise<StaffAuthorizationResult> {
  return authorizeWithSupabase(
    request,
    ["admin", "manager", "knowledge_editor", "reviewer"],
    {
      code: "STAFF_ROLE_REQUIRED",
      message:
        "Forbidden: user must have admin, manager, knowledge_editor or reviewer role in Supabase app_metadata.",
    }
  );
}

export async function requireReviewer(
  request: Request
): Promise<StaffAuthorizationResult> {
  return authorizeWithSupabase(request, ["admin", "reviewer"], {
    code: "REVIEWER_ROLE_REQUIRED",
    message:
      "Forbidden: user must have admin or reviewer role in Supabase app_metadata.",
  });
}
