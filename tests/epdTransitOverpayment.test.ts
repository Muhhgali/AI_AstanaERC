import { describe, expect, it } from "vitest";
import {
  buildEpdTransitOverpaymentAnswer,
  isEpdTransitOverpaymentIntent,
} from "../lib/epdTransitOverpayment";

describe("EPD transit overpayment guard", () => {
  it("detects questions where payment is above saldo but current charges remain", () => {
    expect(
      isEpdTransitOverpaymentIntent(
        "Почему оплата больше чем сальдо, но начисления за 03.2026 есть? Переплата где учитывается?"
      )
    ).toBe(true);
  });

  it("answers with transit account and next-period guidance", () => {
    const answer = buildEpdTransitOverpaymentAnswer("ru");

    expect(answer).toContain("транзитных счетах собственника");
    expect(answer).toContain("следующем расчётном периоде");
    expect(answer).toContain("не должен автоматически вычитать");
  });
});
