// Date ranges for the dialogs list. Days are counted in Astana time (UTC+5),
// the same way the history API reads `from` / `to`.

export type HistoryPeriodPreset =
  | "latest"
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "prev-month";

export type HistoryPeriod = {
  id: HistoryPeriodPreset | "custom-day" | "custom-month";
  label: string;
  // YYYY-MM-DD, inclusive; null means no bound.
  from: string | null;
  to: string | null;
};

const ASTANA_OFFSET_MS = 5 * 60 * 60 * 1000;

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function toDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Calendar date in Astana as a UTC-midnight Date, so day arithmetic is plain.
function astanaDate(now: Date) {
  const shifted = new Date(now.getTime() + ASTANA_OFFSET_MS);

  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
  );
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDayLabel(day: string) {
  const [year, month, date] = day.split("-");
  return `${date}.${month}.${year}`;
}

export const HISTORY_PERIOD_PRESETS: { id: HistoryPeriodPreset; label: string }[] = [
  { id: "latest", label: "Последние" },
  { id: "today", label: "Сегодня" },
  { id: "yesterday", label: "Вчера" },
  { id: "week", label: "7 дней" },
  { id: "month", label: "Этот месяц" },
  { id: "prev-month", label: "Прошлый месяц" },
];

export function monthPeriod(month: string): HistoryPeriod {
  const [year, monthIndex] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthIndex - 1, 1));
  const last = new Date(Date.UTC(year, monthIndex, 0));

  return {
    id: "custom-month",
    label: `${MONTHS[monthIndex - 1]} ${year}`,
    from: toDay(first),
    to: toDay(last),
  };
}

export function dayPeriod(day: string): HistoryPeriod {
  return { id: "custom-day", label: formatDayLabel(day), from: day, to: day };
}

export function presetPeriod(id: HistoryPeriodPreset, now = new Date()): HistoryPeriod {
  const today = astanaDate(now);
  const label = HISTORY_PERIOD_PRESETS.find((preset) => preset.id === id)?.label ?? "";

  switch (id) {
    case "today":
      return { id, label, from: toDay(today), to: toDay(today) };
    case "yesterday": {
      const yesterday = toDay(addDays(today, -1));
      return { id, label, from: yesterday, to: yesterday };
    }
    case "week":
      return { id, label, from: toDay(addDays(today, -6)), to: toDay(today) };
    case "month":
      return {
        ...monthPeriod(toDay(today).slice(0, 7)),
        id,
        label: `${label} (${MONTHS[today.getUTCMonth()].toLowerCase()})`,
      };
    case "prev-month": {
      const previous = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      return { ...monthPeriod(toDay(previous).slice(0, 7)), id };
    }
    default:
      return { id: "latest", label, from: null, to: null };
  }
}

export function historyPeriodQuery(period: HistoryPeriod) {
  const params = new URLSearchParams();

  if (period.from) params.set("from", period.from);
  if (period.to) params.set("to", period.to);

  return params;
}
