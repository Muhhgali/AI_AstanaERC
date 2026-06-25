import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseAnonKey,
  normalizeSupabaseUrl,
} from "@/lib/supabaseEnv";

const supabaseUrl =
  normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ??
  normalizeSupabaseUrl(process.env.SUPABASE_URL);

const supabaseAnonKey = getSupabaseAnonKey();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes("missing-supabase-url") &&
    supabaseAnonKey !== "missing-supabase-anon-key"
);

export const supabase = createClient(
  supabaseUrl ?? "https://missing-supabase-url.supabase.co",
  supabaseAnonKey ?? "missing-supabase-anon-key"
);
