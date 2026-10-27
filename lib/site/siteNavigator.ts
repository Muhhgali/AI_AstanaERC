// Finds aerc.kz pages that match a resident's question, so answers can point
// to the right section of the site ("подробнее и онлайн-форма — здесь").
import sitePagesData from "../../data/site-pages.json";
import type { SitePage } from "./extractPage";

export type SiteNavEntry = {
  url: string;
  lang: "ru" | "kk";
  title: string;
  description: string;
  searchText: string;
  forBusiness?: boolean;
};

type SitePagesFile = {
  pages: SitePage[];
  linkedButNotCrawled: string[];
};

const ORIGIN = "https://www.aerc.kz";

// Pages robots.txt or a login keeps us from reading, described by hand from
// the site menu. They are the most common destinations for residents.
const MANUAL_ENTRIES: Array<Omit<SiteNavEntry, "searchText"> & { keywords: string }> = [
  {
    url: `${ORIGIN}/ru/abonentam/readings/`,
    lang: "ru",
    title: "Передача показаний счётчиков онлайн",
    description: "Онлайн-форма Астана-ЕРЦ для передачи показаний приборов учёта.",
    keywords: "передать показания счетчик прибор учета вода газ свет электроэнергия онлайн форма",
  },
  {
    url: `${ORIGIN}/ru/personal/litsevye-scheta/moi-litsevye-scheta/`,
    lang: "ru",
    title: "Личный кабинет: лицевые счета",
    description: "Вход в личный кабинет абонента и список лицевых счетов.",
    keywords: "личный кабинет войти вход лицевой счет абонент регистрация",
  },
  {
    url: `${ORIGIN}/ru/personal/litsevye-scheta/moi-kvitantsii/`,
    lang: "ru",
    title: "Личный кабинет: мои квитанции",
    description: "Квитанции (ЕПД) в личном кабинете абонента.",
    keywords: "мои квитанции епд посмотреть скачать квитанцию личный кабинет",
  },
  {
    url: `${ORIGIN}/ru/personal/litsevye-scheta/akt-sverki-po-uslugam/`,
    lang: "ru",
    title: "Личный кабинет: акт сверки по услугам",
    description: "Акт сверки начислений и оплат по услугам в личном кабинете.",
    keywords: "акт сверки сверка начисления оплаты долг задолженность личный кабинет",
  },
  {
    url: `${ORIGIN}/kk/abonentam/readings/`,
    lang: "kk",
    title: "Есептегіш көрсеткіштерін онлайн беру",
    description: "Астана-ЕРЦ сайтындағы көрсеткіштерді беру онлайн-формасы.",
    keywords: "көрсеткіш беру есептегіш санауыш су газ жарық электр онлайн",
  },
  {
    url: `${ORIGIN}/kk/personal/litsevye-scheta/moi-litsevye-scheta/`,
    lang: "kk",
    title: "Жеке кабинет: дербес шоттар",
    description: "Абоненттің жеке кабинетіне кіру және дербес шоттар тізімі.",
    keywords: "жеке кабинет кіру дербес шот абонент тіркелу",
  },
  {
    url: `${ORIGIN}/kk/personal/litsevye-scheta/moi-kvitantsii/`,
    lang: "kk",
    title: "Жеке кабинет: менің түбіртектерім",
    description: "Жеке кабинеттегі түбіртектер (ЕПД).",
    keywords: "түбіртек епд қарау жүктеу жеке кабинет",
  },
  {
    url: `${ORIGIN}/ru/for-eknot/form.php`,
    lang: "ru",
    title: "Переход на электронную квитанцию",
    description: "Форма подписки на ЕПД по электронной почте.",
    keywords: "электронная квитанция email e-mail почта подписка рассылка отказ от бумажной",
  },
  {
    url: `${ORIGIN}/ru/for-eknot/reject.php`,
    lang: "ru",
    title: "Вернуть бумажную квитанцию",
    description: "Форма возврата к получению квитанции на бумажном носителе.",
    keywords: "бумажная квитанция вернуть бумажную отписаться от электронной рассылки",
  },
];

// Words residents use that the page itself does not contain.
const EXTRA_KEYWORDS: Record<string, string> = {
  "/ru/o-kompanii/rekvizity/":
    "адрес телефон контакты офис куда обращаться звонить whatsapp почта реквизиты 109",
  "/kk/o-kompanii/rekvizity/":
    "мекенжай телефон байланыс кеңсе қайда жүгіну whatsapp пошта деректемелер 109",
  "/ru/guide/oplata/": "оплатить оплата ошибся ошибочный платеж вернуть деньги банк kaspi каспи",
  "/kk/guide/oplata/": "төлеу төлем қате төлем ақшаны қайтару банк kaspi",
};

const STOP_WORDS = new Set([
  "как", "что", "где", "куда", "когда", "это", "для", "при", "или", "мне", "мой",
  "моя", "меня", "можно", "нужно", "надо", "есть", "если", "чтобы", "подскажите",
  "пожалуйста", "астана", "ерц", "қалай", "қайда", "қашан", "керек",
]);

// Fixed 5-letter stem: "көрсеткіш"/"көрсеткішті", "оплата"/"оплатить" match.
function stem(word: string) {
  return word.slice(0, 5);
}

export function navigatorTokens(text: string) {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/ё/g, "е")
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
        .map(stem)
    )
  );
}

function firstLine(text: string) {
  const line = text.split("\n").find((candidate) => candidate.trim().length > 3) ?? "";

  return line.length <= 120 ? line.trim() : "";
}

let cachedEntries: SiteNavEntry[] | null = null;

export function getSiteNavEntries(data: SitePagesFile = sitePagesData as SitePagesFile) {
  if (cachedEntries && data === sitePagesData) {
    return cachedEntries;
  }

  const entries: SiteNavEntry[] = [];
  const manualUrls = new Set(MANUAL_ENTRIES.map((entry) => entry.url));

  for (const manual of MANUAL_ENTRIES) {
    entries.push({
      url: manual.url,
      lang: manual.lang,
      title: manual.title,
      description: manual.description,
      searchText: `${manual.title} ${manual.description} ${manual.keywords}`,
    });
  }

  for (const page of data.pages ?? []) {
    if (manualUrls.has(page.url) || page.section === "home") {
      continue;
    }

    // Page <h1> is often the generic "Астана ЕРЦ"; the first content line is
    // the real heading ("ТОП 10 вопросов").
    const heading = firstLine(page.text);
    const genericTitle =
      // No \b here: in JS regexes it only knows Latin word characters.
      /астана ерц|^гид(\.|\s|$)|о компании|компания туралы/i.test(page.title) ||
      page.title.length > 60;
    const title = heading && genericTitle ? heading : page.title;
    const faqQuestions = page.faq.map((item) => item.question).join(" ");

    entries.push({
      url: page.url,
      lang: page.lang,
      title,
      description: page.text.replace(/\s+/g, " ").slice(0, 220),
      searchText: `${title} ${title} ${EXTRA_KEYWORDS[page.path] ?? ""} ${faqQuestions} ${page.text.slice(0, 3000)}`,
      forBusiness: page.section === "biznesu",
    });
  }

  if (data === sitePagesData) {
    cachedEntries = entries;
  }

  return entries;
}

export function findSitePages(params: {
  query: string;
  language: "ru" | "kk";
  limit?: number;
  data?: SitePagesFile;
}) {
  const queryTokens = navigatorTokens(params.query);
  // Supplier pages (contract samples) only for supplier-style questions.
  const asksAsBusiness = /договор|поставщик|кск|оси|пик|бизнес|юрлиц|шарт|жеткізуші/i.test(params.query);

  if (queryTokens.length === 0) {
    return [];
  }

  // Answers are in the resident's language, so links are too.
  const scored = getSiteNavEntries(params.data)
    .filter((entry) => entry.lang === params.language)
    .map((entry) => {
      const entryTokens = new Set(navigatorTokens(entry.searchText));
      const titleTokens = new Set(navigatorTokens(entry.title));
      const matches = queryTokens.filter((token) => entryTokens.has(token)).length;
      const titleMatches = queryTokens.filter((token) => titleTokens.has(token)).length;

      return {
        entry,
        matches,
        titleMatches,
        score:
          matches + titleMatches * 1.5 - (entry.forBusiness && !asksAsBusiness ? 2 : 0),
      };
    })
    .filter(
      ({ matches, titleMatches }) =>
        titleMatches >= 1 || matches >= Math.min(2, queryTokens.length)
    )
    .sort((a, b) => b.score - a.score);

  const results: SiteNavEntry[] = [];

  for (const { entry } of scored) {
    if (!results.some((existing) => existing.url === entry.url)) {
      results.push(entry);
    }

    if (results.length >= (params.limit ?? 2)) {
      break;
    }
  }

  return results;
}
