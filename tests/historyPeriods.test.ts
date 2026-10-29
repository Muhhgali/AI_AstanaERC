import { describe, expect, it } from "vitest";
import { dayPeriod, monthPeriod, presetPeriod } from "../components/admin/historyPeriods";

// 28 Oct 2026, 21:30 UTC is already 29 Oct in Astana (UTC+5).
const lateEvening = new Date("2026-10-28T21:30:00Z");

describe("history periods", () => {
  it("counts days in Astana time", () => {
    expect(presetPeriod("today", lateEvening)).toMatchObject({ from: "2026-10-29", to: "2026-10-29" });
    expect(presetPeriod("yesterday", lateEvening)).toMatchObject({ from: "2026-10-28", to: "2026-10-28" });
    expect(presetPeriod("week", lateEvening)).toMatchObject({ from: "2026-10-23", to: "2026-10-29" });
  });

  it("covers whole months", () => {
    expect(presetPeriod("month", lateEvening)).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetPeriod("prev-month", lateEvening)).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
      label: "Сентябрь 2026",
    });
    expect(monthPeriod("2027-02")).toMatchObject({ from: "2027-02-01", to: "2027-02-28" });
  });

  it("keeps the latest view unbounded and labels a picked day", () => {
    expect(presetPeriod("latest")).toMatchObject({ from: null, to: null });
    expect(dayPeriod("2026-10-05").label).toBe("05.10.2026");
  });
});
