// Date filter for the admin dialogs list. Residents and staff are in Astana
// (UTC+5), so a "day" is an Astana calendar day.
const ASTANA_OFFSET = "+05:00";

function parseDay(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

// `to` is inclusive: "2026-10-31" covers the whole of 31 October.
export function getHistoryDateRange(params: URLSearchParams) {
  const from = parseDay(params.get("from"));
  const to = parseDay(params.get("to"));
  const end = to ? new Date(`${to}T00:00:00${ASTANA_OFFSET}`) : null;

  end?.setUTCDate(end.getUTCDate() + 1);

  return {
    from: from ? new Date(`${from}T00:00:00${ASTANA_OFFSET}`).toISOString() : null,
    toExclusive: end ? end.toISOString() : null,
  };
}
