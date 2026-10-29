"use client";

import { useEffect, useState } from "react";
import type { ResidentRequestSettings } from "@/lib/residentRequests";

type ApiRequest = <T>(url: string, init?: RequestInit) => Promise<T>;

const OPTIONS: { key: keyof ResidentRequestSettings; title: string; hint: string }[] = [
  {
    key: "appeals",
    title: "Обращения",
    hint: "Форма «Оставить обращение» в чате и виджете.",
  },
  {
    key: "appointments",
    title: "Запись на приём",
    hint: "Форма записи на приём к руководству.",
  },
  {
    key: "operator",
    title: "Передача оператору",
    hint: "Бот ставит диалог в очередь оператора по просьбе жителя.",
  },
];

// Switches for resident request forms. When one is off the bot hides the form
// and answers with the 109 contact centre instead.
export function ResidentRequestsSettings({ apiRequest }: { apiRequest: ApiRequest }) {
  const [settings, setSettings] = useState<ResidentRequestSettings | null>(null);
  const [setupMessage, setSetupMessage] = useState("");
  const [saving, setSaving] = useState<keyof ResidentRequestSettings | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    apiRequest<{
      residentRequests: ResidentRequestSettings;
      setupRequired?: boolean;
      message?: string;
    }>("/api/admin/settings")
      .then((data) => {
        if (cancelled) return;
        setSettings(data.residentRequests);
        setSetupMessage(data.setupRequired ? data.message ?? "" : "");
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Не удалось загрузить настройки");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiRequest]);

  const toggle = async (key: keyof ResidentRequestSettings) => {
    if (!settings) return;

    const next = { ...settings, [key]: !settings[key] };
    setSaving(key);
    setError("");

    try {
      const data = await apiRequest<{ residentRequests: ResidentRequestSettings }>(
        "/api/admin/settings",
        { method: "PUT", body: JSON.stringify({ residentRequests: next }) }
      );
      setSettings(data.residentRequests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="mb-5 rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-200 p-4">
        <h2 className="font-semibold">Приём заявок от жителей</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Выключенная форма пропадает из чата, а бот отвечает контактами Центра
          городских услуг (109). Изменение доходит до бота в течение минуты.
        </p>
      </div>

      {setupMessage && (
        <div className="border-b border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
          {setupMessage} Пока таблицы нет, все формы выключены.
        </div>
      )}
      {error && (
        <div className="border-b border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <div className="divide-y divide-neutral-200">
        {OPTIONS.map((option) => {
          const enabled = settings?.[option.key] ?? false;

          return (
            <div key={option.key} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <div className="font-medium text-neutral-900">{option.title}</div>
                <p className="mt-0.5 text-sm text-neutral-500">{option.hint}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span
                  className={`text-sm font-medium ${enabled ? "text-emerald-700" : "text-neutral-500"}`}
                >
                  {enabled ? "Включено" : "Выключено"}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={option.title}
                  disabled={!settings || Boolean(setupMessage) || saving !== null}
                  onClick={() => void toggle(option.key)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-50 ${
                    enabled ? "bg-blue-600" : "bg-neutral-300"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-[var(--on-accent)] shadow transition ${
                      enabled ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
