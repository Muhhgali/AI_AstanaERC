// Turns an aerc.kz HTML page into plain text the assistant can cite.
// No DOM library: the site is a Bitrix template with a stable layout, and the
// page content is treated as untrusted data (it never becomes instructions).

export const SITE_ORIGIN = "https://www.aerc.kz";

export type SiteFaqItem = {
  question: string;
  answer: string;
};

export type SitePage = {
  url: string;
  path: string;
  lang: "ru" | "kk";
  section: string;
  title: string;
  text: string;
  faq: SiteFaqItem[];
  links: string[];
};

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  quot: "\"",
  apos: "'",
  lt: "<",
  gt: ">",
  laquo: "«",
  raquo: "»",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  bull: "•",
  copy: "©",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  times: "×",
  deg: "°",
};

export function decodeEntities(text: string) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function stripNoise(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|form|button|select|textarea)\b[\s\S]*?<\/\1>/gi, " ")
    // "Помог ли Вам ответ? Да / Нет" voting blocks under FAQ answers.
    .replace(/<div class="acc_footer">[\s\S]*?<div style="clear: both;"><\/div>/gi, " ");
}

function linkText(attributes: string, inner: string) {
  const href = attributes.match(/href\s*=\s*"([^"]*)"/i)?.[1] ?? "";
  const text = htmlToText(inner).trim();

  if (/^mailto:/i.test(href)) {
    return text || href.replace(/^mailto:/i, "");
  }

  if (/^https?:\/\//i.test(href) && text && !href.includes(text.replace(/^www\./, ""))) {
    return `${text} (${href})`;
  }

  return text || href;
}

export function htmlToText(html: string): string {
  const withLinks = html.replace(
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
    (_, attributes: string, inner: string) => linkText(attributes, inner)
  );

  const text = withLinks
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|table|ul|ol|section|article|blockquote)>/gi, "\n")
    .replace(/<(td|th)\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && line !== "-")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function contentRegion(html: string) {
  const endIndex = (() => {
    const footer = html.search(/<footer\b/i);
    return footer > 0 ? footer : html.length;
  })();
  // Main column of the Bitrix template; the left column is the section menu.
  const contentStart = html.search(/class="[^"]*\bcontent-md\b[^"]*"/i);

  if (contentStart > 0 && contentStart < endIndex) {
    return html.slice(html.lastIndexOf("<", contentStart), endIndex);
  }

  const mainStart = html.search(/<main\b/i);

  if (mainStart > 0 && mainStart < endIndex) {
    return html.slice(mainStart, endIndex);
  }

  const bodyStart = html.search(/<body\b/i);

  return html.slice(Math.max(bodyStart, 0), endIndex);
}

function extractFaq(region: string): SiteFaqItem[] {
  const items: SiteFaqItem[] = [];
  const pattern =
    /<div class="acc_head">([\s\S]*?)<div class="acc_content">([\s\S]*?)(?=<div class="accordion_in"|<div class="acc_head">|$)/gi;

  for (const match of region.matchAll(pattern)) {
    const question = htmlToText(match[1]).replace(/\s+/g, " ").trim();
    const answer = htmlToText(match[2]);

    if (question && answer) {
      items.push({ question, answer });
    }
  }

  return items;
}

function extractTitle(html: string) {
  const heading =
    html.match(/<h1[^>]*id="pagetitle"[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ??
    html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ??
    "";

  return htmlToText(heading).replace(/\s+/g, " ").trim();
}

export function normalizeSiteUrl(href: string, baseUrl: string) {
  let url: URL;

  try {
    url = new URL(decodeEntities(href.trim()), baseUrl);
  } catch {
    return null;
  }

  if (!/^(www\.)?aerc\.kz$/i.test(url.hostname) || !/^https?:$/.test(url.protocol)) {
    return null;
  }

  const path = url.pathname.replace(/\/{2,}/g, "/");

  if (!/^\/(ru|kk)(\/|$)/.test(path)) {
    return null;
  }

  // Pages only: skip PDFs, images and other downloads.
  if (/\.(?!php$|html?$)[a-z0-9]{2,5}$/i.test(path)) {
    return null;
  }

  // "/ru/o-kompanii" and "/ru/o-kompanii/" are the same page.
  return /\.[a-z0-9]{2,5}$/i.test(path) || path.endsWith("/") ? path : `${path}/`;
}

export function extractSitePage(html: string, url: string): SitePage {
  const parsed = new URL(url);
  const path = parsed.pathname;
  const lang = path.startsWith("/kk") ? "kk" : "ru";
  const cleaned = stripNoise(html);
  const region = contentRegion(cleaned);
  const faq = extractFaq(region);
  const links = Array.from(cleaned.matchAll(/href\s*=\s*"([^"]+)"/gi), (match) => match[1]);
  const section = path.split("/").filter(Boolean)[1] ?? "home";

  return {
    url: `${SITE_ORIGIN}${path}`,
    path,
    lang,
    section,
    title: extractTitle(cleaned) || path,
    text: htmlToText(region).slice(0, 20_000),
    faq,
    links,
  };
}
