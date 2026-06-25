export function normalizeSupabaseUrl(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value.trim()).origin;
  } catch {
    return value.trim();
  }
}

export function getSupabaseProjectUrl() {
  return normalizeSupabaseUrl(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}

export function getSupabaseAnonKey() {
  return process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
