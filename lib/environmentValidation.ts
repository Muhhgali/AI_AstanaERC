export const REQUIRED_ENVIRONMENT_VARIABLES = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "OPENAI_API_KEY",
] as const;

export const OPTIONAL_ENVIRONMENT_VARIABLES = [
  "OPENAI_ANALYSIS_MODEL",
  "RESEND_API_KEY",
  "MAIL_FROM",
] as const;

export type EnvironmentIssue = {
  variable: string;
  kind: "missing" | "placeholder" | "invalid-url";
};

function isPlaceholder(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    normalized.includes("your-project") ||
    normalized.includes("your-anon-key") ||
    normalized.includes("your-service-role") ||
    normalized.includes("your-api-key") ||
    normalized.includes("missing-supabase")
  );
}

export function validateEnvironment(
  environment: Record<string, string | undefined>,
  options: { allowPlaceholders?: boolean } = {}
) {
  const issues: EnvironmentIssue[] = [];

  for (const variable of REQUIRED_ENVIRONMENT_VARIABLES) {
    const value = environment[variable]?.trim();

    if (!value) {
      issues.push({ variable, kind: "missing" });
      continue;
    }

    if (isPlaceholder(value) && !options.allowPlaceholders) {
      issues.push({ variable, kind: "placeholder" });
    }
  }

  for (const variable of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    const value = environment[variable]?.trim();

    if (!value || (isPlaceholder(value) && !options.allowPlaceholders)) {
      continue;
    }

    try {
      const url = new URL(value);

      if (url.protocol !== "https:" || !url.hostname) {
        issues.push({ variable, kind: "invalid-url" });
      }
    } catch {
      issues.push({ variable, kind: "invalid-url" });
    }
  }

  return issues;
}

export function maskProjectRef(value: string | undefined) {
  if (!value) {
    return "not-configured";
  }

  try {
    const projectRef = new URL(value).hostname.split(".")[0] ?? "";

    if (projectRef.length <= 8) {
      return "configured";
    }

    return `${projectRef.slice(0, 4)}...${projectRef.slice(-4)}`;
  } catch {
    return "invalid-url";
  }
}
