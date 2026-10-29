import { describe, expect, it } from "vitest";
import {
  buildRequestsDisabledAnswer,
  normalizeResidentRequestSettings,
} from "../lib/residentRequests";

describe("resident request settings", () => {
  it("treats anything but an explicit true as off", () => {
    expect(normalizeResidentRequestSettings({ appeals: true, appointments: "yes" })).toEqual({
      appeals: true,
      appointments: false,
      operator: false,
    });
    expect(normalizeResidentRequestSettings(null)).toEqual({
      appeals: false,
      appointments: false,
      operator: false,
    });
  });

  it("points residents to the city contact centre when a form is off", () => {
    const ru = buildRequestsDisabledAnswer("appeals", "ru");
    const kk = buildRequestsDisabledAnswer("operator", "kk");

    expect(ru).toContain("не принимает обращения");
    expect(ru).toContain("109");
    expect(kk).toContain("операторға бермейді");
    expect(kk).toContain("109");
  });
});
