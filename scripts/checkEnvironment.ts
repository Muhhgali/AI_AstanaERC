import { promises as dns } from "node:dns";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import {
  maskProjectRef,
  OPTIONAL_ENVIRONMENT_VARIABLES,
  REQUIRED_ENVIRONMENT_VARIABLES,
  validateEnvironment,
} from "../lib/environmentValidation";

const ciMode = process.argv.includes("--ci");
const networkMode = process.argv.includes("--network");

function readExampleEnvironment() {
  const content = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
  return dotenv.parse(content);
}

function loadLocalEnvironment() {
  dotenv.config({
    path: [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), ".env")],
    quiet: true,
  });

  return process.env;
}

async function checkDns(value: string | undefined) {
  if (!value) {
    return false;
  }

  try {
    await dns.lookup(new URL(value).hostname);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const environment = ciMode ? readExampleEnvironment() : loadLocalEnvironment();
  const issues = validateEnvironment(environment, { allowPlaceholders: ciMode });

  console.log(ciMode ? "Environment template check" : "Local environment check");

  for (const variable of REQUIRED_ENVIRONMENT_VARIABLES) {
    const issue = issues.find((item) => item.variable === variable);
    const detail = variable.endsWith("_URL")
      ? `, project ${maskProjectRef(environment[variable])}`
      : "";

    console.log(
      `${issue ? "[error]" : "[ok]"} ${variable}: ${
        issue?.kind ?? "configured"
      }${detail}`
    );
  }

  for (const variable of OPTIONAL_ENVIRONMENT_VARIABLES) {
    console.log(
      `[optional] ${variable}: ${environment[variable] ? "configured" : "not-configured"}`
    );
  }

  if (!ciMode && networkMode && issues.every((issue) => !issue.variable.endsWith("_URL"))) {
    const dnsAvailable = await checkDns(environment.SUPABASE_URL);
    console.log(`[${dnsAvailable ? "ok" : "error"}] Supabase DNS: ${dnsAvailable ? "resolved" : "unresolved"}`);

    if (!dnsAvailable) {
      process.exitCode = 1;
    }
  }

  if (issues.length > 0) {
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error("Environment check failed without exposing configuration details.");
  process.exitCode = 1;
});
