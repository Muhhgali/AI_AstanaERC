// Which resident requests the bot accepts: appeals, appointments with the
// management and operator handoffs. Staff switch them in the admin panel; a
// request nobody reads is worse than a clear "call 109", so all are off by
// default and whenever the setting cannot be read.
import { createClient } from "@supabase/supabase-js";
import { getSupabaseProjectUrl } from "./supabaseEnv";

export type ResidentRequestSettings = {
  appeals: boolean;
  appointments: boolean;
  operator: boolean;
};

export type ResidentRequestKind = keyof ResidentRequestSettings;

export const RESIDENT_REQUESTS_KEY = "resident_requests";

export const DEFAULT_RESIDENT_REQUEST_SETTINGS: ResidentRequestSettings = {
  appeals: false,
  appointments: false,
  operator: false,
};

// Several serverless instances each keep a copy; a change reaches all of them
// within this time.
const SETTINGS_CACHE_TTL_MS = 30_000;

let cached: { settings: ResidentRequestSettings; setupRequired: boolean; loadedAt: number } | null =
  null;
let settingsClient: ReturnType<typeof createClient> | null = null;

function getSettingsClient() {
  const supabaseUrl = getSupabaseProjectUrl();

  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  settingsClient ??= createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return settingsClient;
}

export function normalizeResidentRequestSettings(value: unknown): ResidentRequestSettings {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    appeals: source.appeals === true,
    appointments: source.appointments === true,
    operator: source.operator === true,
  };
}

export function isMissingSettingsTable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error && (error.code === "PGRST205" || error.code === "42P01" || error.message?.includes("app_settings"))
  );
}

// `setupRequired` tells the admin panel that the app_settings migration has
// not been run yet.
export async function loadResidentRequestSettings(options?: { fresh?: boolean }) {
  if (!options?.fresh && cached && Date.now() - cached.loadedAt < SETTINGS_CACHE_TTL_MS) {
    return cached;
  }

  const client = getSettingsClient();

  if (!client) {
    return { settings: DEFAULT_RESIDENT_REQUEST_SETTINGS, setupRequired: false };
  }

  const { data, error } = await client
    .from("app_settings")
    .select("value")
    .eq("key", RESIDENT_REQUESTS_KEY)
    .maybeSingle();

  if (error && !isMissingSettingsTable(error)) {
    console.error("RESIDENT REQUEST SETTINGS READ FAILED:", error);
  }

  const settings = error
    ? DEFAULT_RESIDENT_REQUEST_SETTINGS
    : normalizeResidentRequestSettings((data as { value?: unknown } | null)?.value);

  cached = { settings, setupRequired: isMissingSettingsTable(error), loadedAt: Date.now() };

  return cached;
}

export async function getResidentRequestSettings() {
  return (await loadResidentRequestSettings()).settings;
}

export async function saveResidentRequestSettings(
  settings: ResidentRequestSettings,
  userId?: string
) {
  const client = getSettingsClient();

  if (!client) {
    return { ok: false as const, setupRequired: false, message: "Supabase is not configured" };
  }

  const { error } = await client.from("app_settings").upsert(
    {
      key: RESIDENT_REQUESTS_KEY,
      value: settings,
      updated_at: new Date().toISOString(),
      updated_by: userId ?? null,
    } as never,
    { onConflict: "key" }
  );

  if (error) {
    return {
      ok: false as const,
      setupRequired: isMissingSettingsTable(error),
      message: error.message,
    };
  }

  cached = { settings, setupRequired: false, loadedAt: Date.now() };

  return { ok: true as const };
}

// Contacts from aerc.kz "Реквизиты и контакты", section "Для абонентов".
export function buildRequestsDisabledAnswer(
  kind: ResidentRequestKind,
  language: "ru" | "kk"
) {
  if (language === "kk") {
    const lead = {
      appeals: "Қазір бот арқылы өтініш қабылданбайды.",
      appointments: "Қазір бот арқылы басшылықтың қабылдауына жазылу жүргізілмейді.",
      operator: "Қазір бот диалогты операторға бермейді.",
    }[kind];

    return [
      lead,
      "Коммуналдық қызметтер бойынша (төлем, қайта ресімдеу, түзетулер, кеңес) Қалалық қызметтер орталығына хабарласыңыз: QALAQYZMET.KZ, телефон 109, Астана қ., Сәкен Сейфуллин к-сі, 27.",
      "Сұрағыңызды осында жазсаңыз, көмектесуге тырысамын.",
    ].join("\n\n");
  }

  const lead = {
    appeals: "Сейчас бот не принимает обращения.",
    appointments: "Запись на приём к руководству через бот сейчас не ведётся.",
    operator: "Сейчас бот не передаёт диалог оператору.",
  }[kind];

  return [
    lead,
    "По вопросам коммунальных услуг (оплата, переоформление, корректировки, консультации) обратитесь в Центр городских услуг QALAQYZMET.KZ: телефон 109, г. Астана, ул. Сәкен Сейфуллин, 27.",
    "Если напишете вопрос здесь, я постараюсь помочь.",
  ].join("\n\n");
}
