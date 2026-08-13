import fs from "node:fs";
import path from "node:path";

type GateCheck = {
  name: string;
  ok: boolean;
  detail?: string;
};

function walk(dir: string, predicate: (filePath: string) => boolean): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (["node_modules", ".next", ".open-next", ".git"].includes(entry.name)) {
        return [];
      }

      return walk(fullPath, predicate);
    }

    return entry.isFile() && predicate(fullPath) ? [fullPath] : [];
  });
}

function relativeList(files: string[]) {
  return files.map((filePath) => path.relative(process.cwd(), filePath)).join(", ");
}

function adminRoutes() {
  return [
    ...walk(path.join(process.cwd(), "app", "api", "admin"), (filePath) =>
      filePath.endsWith(`${path.sep}route.ts`)
    ),
    ...walk(path.join(process.cwd(), "app", "admin"), (filePath) =>
      filePath.endsWith(`${path.sep}route.ts`)
    ),
  ];
}

const appSourceFiles = [
  ...walk(path.join(process.cwd(), "app"), (filePath) =>
    /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)
  ),
  ...walk(path.join(process.cwd(), "lib"), (filePath) =>
    /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)
  ),
];
const envTemplateFiles = [path.join(process.cwd(), ".env.example")].filter((filePath) =>
  fs.existsSync(filePath)
);
const checks: GateCheck[] = [];

const routes = adminRoutes();
const routesMissingGuard = routes.filter(
  (routePath) => !fs.readFileSync(routePath, "utf8").includes("requireAdmin(")
);

checks.push({
  name: "All admin routes use requireAdmin",
  ok: routes.length > 0 && routesMissingGuard.length === 0,
  detail: routesMissingGuard.length ? relativeList(routesMissingGuard) : `${routes.length} route files`,
});

const publicServiceRole = [...appSourceFiles, ...envTemplateFiles].filter((filePath) =>
  fs.readFileSync(filePath, "utf8").includes("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE")
);

checks.push({
  name: "Service role is not public-prefixed",
  ok: publicServiceRole.length === 0,
  detail: publicServiceRole.length ? relativeList(publicServiceRole) : "no offenders",
});

const clientServiceRole = appSourceFiles.filter((filePath) => {
  const source = fs.readFileSync(filePath, "utf8");
  return (
    source.includes('"use client"') &&
    source.includes("SUPABASE_SERVICE_ROLE_KEY")
  );
});

checks.push({
  name: "Service role is not used in client modules",
  ok: clientServiceRole.length === 0,
  detail: clientServiceRole.length ? relativeList(clientServiceRole) : "no offenders",
});

const ownershipEndpoints = [
  "app/api/chat/history/route.ts",
  "app/api/requests/status/route.ts",
  "app/api/chat/feedback/route.ts",
  "app/api/chat/route.ts",
];
const missingOwnership = ownershipEndpoints.filter((routePath) => {
  const absolutePath = path.join(process.cwd(), routePath);

  return (
    !fs.existsSync(absolutePath) ||
    !fs.readFileSync(absolutePath, "utf8").includes("visitorOwnership") &&
      !fs.readFileSync(absolutePath, "utf8").includes("VisitorId")
  );
});

checks.push({
  name: "Public chat/history/status endpoints use visitor ownership",
  ok: missingOwnership.length === 0,
  detail: missingOwnership.length ? missingOwnership.join(", ") : "covered",
});

const rlsSource = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260811000000_security_rls_source_of_truth.sql"
);

checks.push({
  name: "RLS source-of-truth migration exists",
  ok: fs.existsSync(rlsSource),
  detail: path.relative(process.cwd(), rlsSource),
});

const checklist = path.join(process.cwd(), "docs", "security-release-checklist.md");

checks.push({
  name: "Security release checklist exists",
  ok: fs.existsSync(checklist),
  detail: path.relative(process.cwd(), checklist),
});

let failed = 0;

for (const check of checks) {
  const status = check.ok ? "PASS" : "FAIL";
  console.log(`[${status}] ${check.name}${check.detail ? ` - ${check.detail}` : ""}`);

  if (!check.ok) {
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`Security release gate failed: ${failed} check(s).`);
  process.exit(1);
}

console.log("Security release gate passed.");
