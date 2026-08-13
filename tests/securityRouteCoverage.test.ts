import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return walk(fullPath);
    }

    return entry.isFile() && entry.name === "route.ts" ? [fullPath] : [];
  });
}

describe("security route coverage", () => {
  it("requires the central admin guard in every admin route", () => {
    const adminRoutes = [
      ...walk(path.join(process.cwd(), "app", "api", "admin")),
      ...walk(path.join(process.cwd(), "app", "admin")),
    ];

    expect(adminRoutes.length).toBeGreaterThan(0);

    const missingGuard = adminRoutes.filter((routePath) => {
      const source = fs.readFileSync(routePath, "utf8");
      return !source.includes("requireAdmin(");
    });

    expect(missingGuard.map((routePath) => path.relative(process.cwd(), routePath))).toEqual([]);
  });

  it("does not expose the Supabase service role as NEXT_PUBLIC", () => {
    const files = [
      ...walk(path.join(process.cwd(), "app")),
      ...walk(path.join(process.cwd(), "lib")),
      path.join(process.cwd(), ".env.example"),
    ].filter((filePath) => fs.existsSync(filePath));

    const offenders = files.filter((filePath) =>
      fs.readFileSync(filePath, "utf8").includes("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE")
    );

    expect(offenders.map((filePath) => path.relative(process.cwd(), filePath))).toEqual([]);
  });

  it("keeps public history/status endpoints behind visitor ownership", () => {
    const endpoints = [
      path.join(process.cwd(), "app", "api", "chat", "history", "route.ts"),
      path.join(process.cwd(), "app", "api", "requests", "status", "route.ts"),
      path.join(process.cwd(), "app", "api", "chat", "feedback", "route.ts"),
    ];

    const missingOwnership = endpoints.filter((routePath) => {
      const source = fs.readFileSync(routePath, "utf8");
      return !source.includes("VisitorId") && !source.includes("VisitorOwnership");
    });

    expect(missingOwnership.map((routePath) => path.relative(process.cwd(), routePath))).toEqual([]);
  });
});
