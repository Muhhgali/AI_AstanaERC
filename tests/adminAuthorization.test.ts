import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  authorizeAdminRequest,
  hasTrustedAdminRole,
} from "../lib/auth/requireAdmin";

function request(options: { token?: string; body?: unknown } = {}) {
  return new Request("http://localhost/api/admin/faq", {
    method: "POST",
    headers: options.token
      ? { authorization: `Bearer ${options.token}`, "content-type": "application/json" }
      : { "content-type": "application/json" },
    body: JSON.stringify(options.body ?? {}),
  });
}

describe("admin authorization", () => {
  it("returns 401 for anonymous requests", async () => {
    const lookup = vi.fn();
    const result = await authorizeAdminRequest(request(), lookup);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.response.status).toBe(401);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("returns 403 for an authenticated non-admin", async () => {
    const result = await authorizeAdminRequest(request({ token: "valid" }), async () => ({
      user: { id: "user-1", app_metadata: {} },
    }));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.response.status).toBe(403);
  });

  it("allows an app_metadata admin", async () => {
    const result = await authorizeAdminRequest(request({ token: "valid" }), async () => ({
      user: { id: "admin-1", app_metadata: { role: "admin" } },
    }));

    expect(result.ok).toBe(true);
  });

  it("allows an app_metadata manager as internal admin access", async () => {
    const result = await authorizeAdminRequest(request({ token: "valid" }), async () => ({
      user: { id: "manager-1", app_metadata: { role: "manager" } },
    }));

    expect(result.ok).toBe(true);
  });

  it("allows an app_metadata roles array admin", async () => {
    const result = await authorizeAdminRequest(request({ token: "valid" }), async () => ({
      user: { id: "admin-2", app_metadata: { roles: ["support", "admin"] } },
    }));

    expect(result.ok).toBe(true);
  });

  it("ignores a role supplied in the request body", async () => {
    const result = await authorizeAdminRequest(
      request({ token: "valid", body: { role: "admin" } }),
      async () => ({ user: { id: "user-1", app_metadata: {} } })
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.response.status).toBe(403);
  });

  it("does not trust user_metadata", () => {
    expect(
      hasTrustedAdminRole({
        id: "user-1",
        app_metadata: {},
        user_metadata: { role: "admin" },
      })
    ).toBe(false);
  });
});
