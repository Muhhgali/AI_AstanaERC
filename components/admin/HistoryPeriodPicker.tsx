"use client";

import { CalendarDays } from "lucide-react";
import {
  dayPeriod,
  HISTORY_PERIOD_PRESETS,
  monthPeriod,
  presetPeriod,
  type HistoryPeriod,
} from "./historyPeriods";

export function HistoryPeriodPicker({
  value,
  onChange,
  disabled,
}: {
  value: HistoryPeriod;
  onChange: (period: HistoryPeriod) => void;
  disabled?: boolean;
}) {
  const pickedMonth = value.id === "custom-month" && value.from ? value.from.slice(0, 7) : "";
  const pickedDay = value.id === "custom-day" && value.from ? value.from : "";

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Период">
        {HISTORY_PERIOD_PRESETS.map((preset) => {
          const isActive = value.id === preset.id;

          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              aria-pressed={isActive}
              onClick={() => onChange(presetPeriod(preset.id))}
              className={`h-9 rounded-full border px-3.5 text-sm font-medium transition disabled:opacity-60 ${
                isActive
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-neutral-300 bg-white text-neutral-700 hover:border-blue-300 hover:text-blue-700"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CalendarDays className="h-4 w-4 text-neutral-400" aria-hidden />
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          Месяц
          <input
            type="month"
            value={pickedMonth}
            disabled={disabled}
            onChange={(event) => {
              if (event.target.value) onChange(monthPeriod(event.target.value));
            }}
            className={`h-9 rounded-md border bg-white px-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 ${
              pickedMonth ? "border-blue-600" : "border-neutral-300"
            }`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          День
          <input
            type="date"
            value={pickedDay}
            disabled={disabled}
            onChange={(event) => {
              if (event.target.value) onChange(dayPeriod(event.target.value));
            }}
            className={`h-9 rounded-md border bg-white px-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 ${
              pickedDay ? "border-blue-600" : "border-neutral-300"
            }`}
          />
        </label>
      </div>
    </div>
  );
}
