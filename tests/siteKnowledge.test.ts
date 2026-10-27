import { describe, expect, it } from "vitest";
import { extractSitePage, normalizeSiteUrl } from "../lib/site/extractPage";
import { buildSiteKnowledgeChunks } from "../lib/site/siteKnowledge";
import { findSitePages } from "../lib/site/siteNavigator";

const faqHtml = `
<html><head><title>Астана ЕРЦ</title></head><body>
<header><a href="/ru/novosti/">Новости</a></header>
<h1 id="pagetitle">ГИД</h1>
<div class="col-md-9 content-md">
<h1>Передача показаний</h1>
<div class="accordion_in">
  <div class="acc_head"><table><tr><td>КУДА ПЕРЕДАТЬ ПОКАЗАНИЯ ГАЗА?</td></tr></table></div>
  <div class="acc_content"><div class="acc_panel">
    Call-центр: 69-58-49<br>Почта: <a href="mailto:pokazaniegaz@mail.ru">pokazaniegaz@mail.ru</a>
  </div>
  <div class="acc_footer"><span class="text">Помог ли Вам ответ?</span><div style="clear: both;"></div>
  </div>
</div>
<script>alert("x")</script>
</div>
<footer>© 2026</footer>
</body></html>`;

describe("site page extraction", () => {
  it("extracts FAQ pairs and readable text without scripts or voting widgets", () => {
    const page = extractSitePage(faqHtml, "https://www.aerc.kz/ru/guide/peredacha-pokazaniy-/");

    expect(page.lang).toBe("ru");
    expect(page.section).toBe("guide");
    expect(page.faq).toEqual([
      {
        question: "КУДА ПЕРЕДАТЬ ПОКАЗАНИЯ ГАЗА?",
        answer: "Call-центр: 69-58-49\nПочта: pokazaniegaz@mail.ru",
      },
    ]);
    expect(page.text).toContain("Передача показаний");
    expect(page.text).not.toContain("alert");
    expect(page.text).not.toContain("Помог ли Вам ответ");
    expect(page.text).not.toContain("©");
  });

  it("keeps only aerc.kz pages and normalizes trailing slashes", () => {
    const base = "https://www.aerc.kz/ru/";

    expect(normalizeSiteUrl("/ru/o-kompanii", base)).toBe("/ru/o-kompanii/");
    expect(normalizeSiteUrl("/ru/for-eknot/form.php?x=1#top", base)).toBe("/ru/for-eknot/form.php");
    expect(normalizeSiteUrl("https://instagram.com/astana.erc", base)).toBeNull();
    expect(normalizeSiteUrl("/upload/doc.pdf", base)).toBeNull();
    expect(normalizeSiteUrl("/en/page/", base)).toBeNull();
  });
});

describe("site knowledge chunks", () => {
  it("turns FAQ answers into linked rows and skips news", () => {
    const page = extractSitePage(faqHtml, "https://www.aerc.kz/ru/guide/gazosnabzhenie/");
    const news = { ...page, section: "novosti", url: "https://www.aerc.kz/ru/novosti/1/" };
    const chunks = buildSiteKnowledgeChunks([page, news]);
    const faqChunk = chunks.find((chunk) => chunk.priority === 80);

    expect(faqChunk).toMatchObject({
      title: "Куда передать показания газа?",
      category: "meters",
      source: "https://www.aerc.kz/ru/guide/gazosnabzhenie/",
      language: "ru",
    });
    expect(chunks.some((chunk) => chunk.source.includes("/novosti/"))).toBe(false);
  });
});

describe("outdated site content", () => {
  it("keeps the old supplier readings channels out of the knowledge base", () => {
    const readingsPage = extractSitePage(
      faqHtml,
      "https://www.aerc.kz/ru/guide/peredacha-pokazaniy-/"
    );
    const topTen = {
      ...extractSitePage(faqHtml, "https://www.aerc.kz/ru/guide/top-10-voprosov/"),
      faq: [
        { question: "КОНТАКТНЫЕ НОМЕРА ДЛЯ ПЕРЕДАЧИ ПОКАЗАНИЙ", answer: "Call-центр 1302, 270-370 и другие" },
        { question: "ГДЕ МОЖНО ОПЛАТИТЬ ЕПД?", answer: "Интернет-банкинг, кассы банков и терминалы оплаты." },
      ],
    };
    const titles = buildSiteKnowledgeChunks([readingsPage, topTen]).map((chunk) => chunk.title);

    expect(titles).toContain("Где можно оплатить епд?");
    expect(titles).not.toContain("Контактные номера для передачи показаний");
    expect(titles).not.toContain("Куда передать показания газа?");
  });

  it("sends readings questions to the Astana-ERC form, not the outdated guide page", () => {
    const urls = findSitePages({ query: "как передать показания", language: "ru" }).map(
      (page) => page.url
    );

    expect(urls[0]).toBe("https://www.aerc.kz/ru/abonentam/readings/");
    expect(urls.some((url) => url.includes("peredacha-pokazaniy"))).toBe(false);
  });
});

describe("site navigator", () => {
  it("points meter questions to the readings pages", () => {
    const urls = findSitePages({
      query: "куда передать показания счетчика воды",
      language: "ru",
    }).map((page) => page.url);

    expect(
      urls.some((url) => url.includes("peredacha-pokazaniy") || url.includes("abonentam/readings"))
    ).toBe(true);
  });

  it("points paper receipt questions to the e-receipt forms", () => {
    const urls = findSitePages({
      query: "как перейти на электронную квитанцию на почту",
      language: "ru",
    }).map((page) => page.url);

    expect(urls.some((url) => url.includes("for-eknot"))).toBe(true);
  });

  it("returns nothing for unrelated questions", () => {
    expect(findSitePages({ query: "какая завтра погода", language: "ru" })).toEqual([]);
  });
});
