import { describe, expect, it } from "vitest";
import { removeRepeatedMoreLinks } from "../lib/answerLinks";

const url = "https://www.aerc.kz/ru/abonentam/readings/";

describe("removeRepeatedMoreLinks", () => {
  it("drops a closing link that is already in the answer", () => {
    expect(
      removeRepeatedMoreLinks(`Передайте показания здесь: ${url}.\n\nПодробнее: ${url}`)
    ).toBe(`Передайте показания здесь: ${url}.`);
    expect(removeRepeatedMoreLinks(`Сайт: ${url}\n\nТолығырақ: ${url}`)).toBe(`Сайт: ${url}`);
  });

  it("keeps a closing link that adds a new page", () => {
    const message = `Передайте показания на сайте.\n\nПодробнее: ${url}`;

    expect(removeRepeatedMoreLinks(message)).toBe(message);
  });
});
