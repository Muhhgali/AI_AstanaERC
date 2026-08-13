import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("production chat core reset", () => {
  const routeSource = readFileSync(
    resolve(process.cwd(), "app/api/chat/route.ts"),
    "utf8"
  );

  it("keeps clarification and resident intent disconnected from normal chat route", () => {
    expect(routeSource).not.toContain("@/lib/clarification");
    expect(routeSource).not.toContain("@/lib/residentIntent");
    expect(routeSource).not.toContain("decideClarification(");
    expect(routeSource).not.toContain("resolveResidentIntent(");
  });

  it("uses prompt v3 for grounded knowledge answers", () => {
    expect(routeSource).toContain("@/lib/ai/prompts/assistantPromptV3");
    expect(routeSource).toContain("buildAssistantPromptV3");
    expect(routeSource).not.toContain("buildAssistantPromptV2");
  });

  it("uses a simple no-knowledge fallback without asking follow-up questions", () => {
    expect(routeSource).toContain("В базе пока нет подтверждённой информации");
    expect(routeSource).not.toContain(
      "Уточните, пожалуйста, что именно нужно проверить"
    );
  });
});
