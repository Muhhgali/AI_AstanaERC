import { describe, expect, it } from "vitest";
import {
  buildEpdEarlyPaymentDifferenceAnswer,
  isEpdEarlyPaymentDifferenceIntent,
} from "../lib/epdEarlyPaymentDifference";

describe("EPD early payment difference guard", () => {
  it("detects early bank payment before a new EPD is issued", () => {
    expect(
      isEpdEarlyPaymentDifferenceIntent(
        "Оплатил через Халык раньше чем квитанция вышла, новая ЕПД пришла больше, нужно отминусовать чек и оплатить разницу?"
      )
    ).toBe(true);
  });

  it("explains paying only the difference and keeps the arithmetic honest", () => {
    const answer = buildEpdEarlyPaymentDifferenceAnswer("ru");

    expect(answer).toContain("только разницу");
    expect(answer).toContain("до 25 числа");
    expect(answer).toContain("20 000");
    expect(answer).toContain("9 000");
  });
});
