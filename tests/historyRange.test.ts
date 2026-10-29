import { describe, expect, it } from "vitest";
import { getHistoryDateRange } from "../lib/historyRange";

describe("history date range", () => {
  it("turns Astana days into UTC bounds with an inclusive end day", () => {
    expect(getHistoryDateRange(new URLSearchParams("from=2026-10-01&to=2026-10-31"))).toEqual({
      from: "2026-09-30T19:00:00.000Z",
      toExclusive: "2026-10-31T19:00:00.000Z",
    });
  });

  it("ignores missing or malformed dates", () => {
    expect(getHistoryDateRange(new URLSearchParams("from=oct&to="))).toEqual({
      from: null,
      toExclusive: null,
    });
  });
});
