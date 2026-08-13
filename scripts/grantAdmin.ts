import "dotenv/config";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error("Usage: npm run admin:grant -- admin@example.com");
  process.exit(1);
}

const supabaseUrl = getSupabaseProjectUrl();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) {
    throw error;
  }

  const user = data.users.find((item) => item.email?.toLowerCase() === email);

  if (!user) {
    throw new Error(`User not found: ${email}`);
  }

  const appMetadata = {
    ...user.app_metadata,
    role: "admin",
  };

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    { app_metadata: appMetadata }
  );

  if (updateError) {
    throw updateError;
  }

  console.log(`Granted admin role to ${email}. Sign out and sign in again.`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
