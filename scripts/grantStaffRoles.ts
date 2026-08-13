import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";

type StaffRole = "admin" | "manager";

type StaffRoleInput = {
  email: string;
  name?: string;
  role: StaffRole;
};

dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: false });

const inputPath = process.argv[2];
const inviteMissing = process.argv.includes("--invite-missing");

if (!inputPath) {
  console.error("Usage: npx tsx scripts/grantStaffRoles.ts staff-roles.json");
  process.exit(1);
}

const supabaseUrl = getSupabaseProjectUrl();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const raw = fs.readFileSync(path.resolve(inputPath), "utf8");
const staff = JSON.parse(raw) as StaffRoleInput[];

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function listAllUsers() {
  const users = [];
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    users.push(...data.users);

    if (data.users.length < perPage) {
      return users;
    }
  }
}

async function main() {
  const users = await listAllUsers();
  const byEmail = new Map(
    users
      .filter((user) => user.email)
      .map((user) => [user.email!.toLowerCase(), user])
  );
  const results = [];

  for (const item of staff) {
    const email = item.email.trim().toLowerCase();
    const user = byEmail.get(email);

    let targetUser = user;

    if (!targetUser && inviteMissing) {
      const { data: inviteData, error: inviteError } =
        await supabase.auth.admin.inviteUserByEmail(email, {
          data: {
            full_name: item.name,
            role: item.role,
          },
        });

      if (inviteError || !inviteData.user) {
        results.push({
          email,
          role: item.role,
          status: "invite_error",
          message: inviteError?.message ?? "Invite did not return a user",
        });
        continue;
      }

      targetUser = inviteData.user;
    }

    if (!targetUser) {
      results.push({ email, role: item.role, status: "not_found" });
      continue;
    }

    const appMetadata = {
      ...targetUser.app_metadata,
      role: item.role,
      roles: Array.from(
        new Set([
          ...(Array.isArray(targetUser.app_metadata?.roles)
            ? targetUser.app_metadata.roles
            : []),
          item.role,
        ])
      ),
    };
    const userMetadata = item.name
      ? { ...targetUser.user_metadata, full_name: item.name }
      : targetUser.user_metadata;

    const { error } = await supabase.auth.admin.updateUserById(targetUser.id, {
      app_metadata: appMetadata,
      user_metadata: userMetadata,
    });

    if (error) {
      results.push({
        email,
        role: item.role,
        status: "error",
        message: error.message,
      });
      continue;
    }

    results.push({ email, role: item.role, status: "updated" });
  }

  console.table(results);

  const failed = results.filter((item) => item.status === "error");

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
