import { describe, expect, it } from "vitest";
import { isThemeName } from "../lib/theme";

describe("theme helpers", () => {
  it("accepts only light and dark", () => {
    expect(isThemeName("light")).toBe(true);
    expect(isThemeName("dark")).toBe(true);
    expect(isThemeName("system")).toBe(false);
    expect(isThemeName("")).toBe(false);
  });
});
