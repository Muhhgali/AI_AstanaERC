import { describe, expect, it } from "vitest";
import { hasPhrase, hasWord, hasWordPrefix } from "../lib/textMatch";
import {
  buildMeterCorrectionSupplierAnswer,
  isMeterCorrectionIntent,
  isMeterValueCorrectionQuestion,
} from "../lib/meterCorrection";
import { understandQuery } from "../lib/rag/queryUnderstanding";

describe("word-aware matching", () => {
  it("matches whole words and word prefixes, not fragments inside other words", () => {
    expect(hasWord("Как войти в личный кабинет?", ["бин"])).toBe(false);
    expect(hasWord("БИН 123456789012", ["бин"])).toBe(true);
    expect(hasWordPrefix("сайт не работает", ["бот"])).toBe(false);
    expect(hasWordPrefix("бот не отвечает", ["бот"])).toBe(true);
    expect(hasPhrase("оплата не отразилась в ЕПД", ["не отраз"])).toBe(true);
    expect(hasPhrase("оплатане отразилась", ["не отраз"])).toBe(false);
  });
});

describe("meter correction intent", () => {
  it.each([
    "Как передать показания счетчика?",
    "Куда передавать показания электроэнергии",
    "Когда можно передавать показания",
    "показания газа",
  ])("does not treat a normal readings question as a correction: %s", (query) => {
    expect(isMeterCorrectionIntent(query)).toBe(false);
  });

  it.each([
    "передал неверные показания счетчика, как исправить",
    "ошибся в показаниях воды",
    "показания завышены",
  ])("detects a correction request: %s", (query) => {
    expect(isMeterCorrectionIntent(query)).toBe(true);
  });
});

describe("account intent hint", () => {
  it("does not read 'счет' inside 'счетчик' or 'перерасчет' as a personal account", () => {
    expect(understandQuery({ query: "как передать показания счетчика" }).intentHints).not.toContain("account");
    expect(understandQuery({ query: "как сделать перерасчет за воду" }).intentHints).not.toContain("account");
    expect(understandQuery({ query: "как узнать номер лицевого счета" }).intentHints).toContain("account");
  });

  it("does not rewrite a recalculation question into the account-number article", () => {
    const query = understandQuery({ query: "как сделать перерасчет за воду" });

    expect(query.rewrittenQueries.join("\n")).not.toContain("номер лицевого счета");
  });
});

describe("meter correction goes to the supplier", () => {
  it("separates corrections from trouble with the readings form", () => {
    expect(isMeterValueCorrectionQuestion("как исправить показания счетчика")).toBe(true);
    expect(isMeterValueCorrectionQuestion("не могу передать показания")).toBe(false);
  });

  it("links the supplier page of the named service", () => {
    const answer = buildMeterCorrectionSupplierAnswer("неверные показания газа", "ru");

    expect(answer).toContain("по данным базы поставщика");
    expect(answer).toContain("https://www.aerc.kz/ru/guide/gazosnabzhenie/");
    expect(answer).not.toContain("vodosnabzhenie");
  });

  it("recognises water in any case form", () => {
    const answer = buildMeterCorrectionSupplierAnswer("в квитанции завышены показания воды", "ru");

    expect(answer).toContain("vodosnabzhenie-i-vodootvedenie");
    expect(answer).not.toContain("gazosnabzhenie");
  });

  it("lists every supplier page when the service is unknown", () => {
    const answer = buildMeterCorrectionSupplierAnswer("көрсеткішті қалай түзетемін", "kk");

    expect(answer).toContain("жеткізушісіне хабарласыңыз");
    expect(answer).toContain("https://www.aerc.kz/kk/guide/gazosnabzhenie/");
    expect(answer).toContain("https://www.aerc.kz/kk/guide/energosnabzhenie-i-teplosnabzhenie-/");
  });
});
