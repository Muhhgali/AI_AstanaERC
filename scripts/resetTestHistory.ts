import "dotenv/config";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ResetTable = {
  name: string;
  description: string;
  mode: "delete" | "preserve";
  reason: string;
};

const CONFIRMATION = "RESET_TEST_HISTORY";

const RESET_TABLES: ResetTable[] = [
  {
    name: "knowledge_gaps",
    description: "unknown questions, fallback cases, review queue items",
    mode: "delete",
    reason: "clears old unanswered/test questions for a fresh QA cycle",
  },
  {
    name: "chat_messages",
    description: "chat messages and feedback flags",
    mode: "delete",
    reason: "clears old user/test dialog history and feedback",
  },
  {
    name: "chat_conversations",
    description: "chat conversation shells",
    mode: "delete",
    reason: "clears old conversation index after messages are removed",
  },
  {
    name: "receipt_analysis_requests",
    description: "legacy receipt analysis request log",
    mode: "delete",
    reason: "clears old document-question history without deleting resident_documents",
  },
  {
    name: "meter_correction_requests",
    description: "meter correction business requests",
    mode: "preserve",
    reason: "may contain real operational requests; cannot safely separate tests",
  },
  {
    name: "appeal_requests",
    description: "resident appeal business requests",
    mode: "preserve",
    reason: "may contain real operational requests; cannot safely separate tests",
  },
  {
    name: "leadership_appointments",
    description: "leadership appointment requests",
    mode: "preserve",
    reason: "may contain real operational requests; cannot safely separate tests",
  },
  {
    name: "operator_handoffs",
    description: "operator handoff requests",
    mode: "preserve",
    reason: "may contain real operational requests; cannot safely separate tests",
  },
  {
    name: "resident_documents",
    description: "uploaded resident documents and extracted structured facts",
    mode: "preserve",
    reason: "explicitly preserved by Stage 6/document-intelligence rules",
  },
  {
    name: "knowledge",
    description: "knowledge base records",
    mode: "preserve",
    reason: "verified/draft/review knowledge must not be wiped by history reset",
  },
  {
    name: "faq",
    description: "FAQ records",
    mode: "preserve",
    reason: "FAQ must be preserved",
  },
  {
    name: "suppliers",
    description: "supplier directory",
    mode: "preserve",
    reason: "supplier reference data must be preserved",
  },
  {
    name: "knowledge_audit_events",
    description: "knowledge audit log",
    mode: "preserve",
    reason: "audit/security history must be preserved",
  },
  {
    name: "manager_workspace_audit_events",
    description: "manager workspace audit log",
    mode: "preserve",
    reason: "audit/security history must be preserved",
  },
];

function getSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

async function countRows(supabase: SupabaseClient, table: string) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true });

  if (error) {
    return { table, count: null, error: error.message };
  }

  return { table, count: count ?? 0, error: null };
}

async function deleteRows(supabase: SupabaseClient, table: string) {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }

  return count ?? 0;
}

function hasConfirmation() {
  const confirmArg = process.argv.find((arg) => arg.startsWith("--confirm="));

  return confirmArg === `--confirm=${CONFIRMATION}`;
}

async function main() {
  const supabase = getSupabase();
  const execute = hasConfirmation();
  const before = await Promise.all(
    RESET_TABLES.map((table) => countRows(supabase, table.name))
  );
  const beforeByTable = new Map(before.map((item) => [item.table, item]));
  const deleted: Record<string, number> = {};

  if (execute) {
    for (const table of RESET_TABLES.filter((item) => item.mode === "delete")) {
      deleted[table.name] = await deleteRows(supabase, table.name);
    }
  }

  const after = execute
    ? await Promise.all(RESET_TABLES.map((table) => countRows(supabase, table.name)))
    : [];
  const afterByTable = new Map(after.map((item) => [item.table, item]));

  const report = RESET_TABLES.map((table) => ({
    table: table.name,
    description: table.description,
    action: table.mode === "delete" ? (execute ? "deleted" : "would_delete") : "preserved",
    before: beforeByTable.get(table.name)?.count,
    deleted: deleted[table.name] ?? 0,
    after: execute ? afterByTable.get(table.name)?.count : undefined,
    reason: table.reason,
    error: beforeByTable.get(table.name)?.error ?? afterByTable.get(table.name)?.error ?? undefined,
  }));

  console.log(
    JSON.stringify(
      {
        mode: execute ? "EXECUTE" : "DRY_RUN",
        confirmationRequired: execute ? null : `--confirm=${CONFIRMATION}`,
        report,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
