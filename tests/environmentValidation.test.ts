import { describe, expect, it } from "vitest";
import {
  maskProjectRef,
  validateEnvironment,
} from "../lib/environmentValidation";

const validEnvironment = {
  SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_ANON_KEY: "anon-value",
  SUPABASE_SERVICE_ROLE_KEY: "service-value",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-value",
  OPENAI_API_KEY: "openai-value",
};

describe("environment validation", () => {
  it("detects a missing required variable", () => {
    expect(validateEnvironment({ ...validEnvironment, OPENAI_API_KEY: "" })).toContainEqual({
      variable: "OPENAI_API_KEY",
      kind: "missing",
    });
  });

  it("detects an invalid URL", () => {
    expect(validateEnvironment({ ...validEnvironment, SUPABASE_URL: "not-a-url" })).toContainEqual({
      variable: "SUPABASE_URL",
      kind: "invalid-url",
    });
  });

  it("never includes secret values in validation output", () => {
    const secret = "secret-that-must-not-appear";
    const output = JSON.stringify(
      validateEnvironment({ ...validEnvironment, SUPABASE_SERVICE_ROLE_KEY: secret })
    );

    expect(output).not.toContain(secret);
    expect(maskProjectRef(validEnvironment.SUPABASE_URL)).toBe("abcd...qrst");
  });
});
