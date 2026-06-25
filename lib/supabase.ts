import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseProjectUrl } from "@/lib/supabaseEnv";

export const supabase = createClient(
  getSupabaseProjectUrl()!,
  getSupabaseAnonKey()!
);
