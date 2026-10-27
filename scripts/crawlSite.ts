/**
 * Crawls the public pages of aerc.kz into data/site-pages.json.
 *
 * Respects robots.txt (Disallow paths and Crawl-delay), never touches the
 * personal account area, and keeps only public text. Re-run whenever the
 * site changes, then press "Загрузить сайт в базу" in the admin panel.
 *
 * Usage: npx tsx scripts/crawlSite.ts [--max-pages 150] [--news 12]
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  extractSitePage,
  normalizeSiteUrl,
  SITE_ORIGIN,
  type SitePage,
} from "../lib/site/extractPage";

const USER_AGENT = "AstanaERC-Assistant-SiteSync/1.0 (+https://ai-astana-erc.vercel.app)";
const START_PATHS = ["/ru/", "/kk/"];
// Login-only or form-processing areas: link to them, never crawl them.
const ALWAYS_SKIP = ["/personal/", "/auth/", "/bitrix/", "/search/", "/upload/"];

function argNumber(name: string, fallback: number) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? Number(process.argv[index + 1]) : NaN;

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const MAX_PAGES = argNumber("--max-pages", 150);
const MAX_NEWS_PER_LANGUAGE = argNumber("--news", 12);

async function sleep(ms: number) {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,text/plain" },
    redirect: "follow",
  });

  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    finalUrl: response.url,
    text: await response.text(),
  };
}

async function readRobots() {
  const { text } = await fetchText(`${SITE_ORIGIN}/robots.txt`);
  const disallow: string[] = [];
  let crawlDelaySeconds = 3;
  let appliesToUs = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();

    if (/^user-agent$/i.test(key)) {
      appliesToUs = value === "*";
    } else if (appliesToUs && /^disallow$/i.test(key) && value) {
      disallow.push(value);
    } else if (appliesToUs && /^crawl-delay$/i.test(key)) {
      crawlDelaySeconds = Math.max(crawlDelaySeconds, Number(value) || 0);
    }
  }

  return { disallow, crawlDelayMs: crawlDelaySeconds * 1000 };
}

function isNewsArticle(path: string) {
  return /^\/(ru|kk)\/novosti\/.+/.test(path);
}

async function main() {
  const robots = await readRobots();
  console.log(
    `robots.txt: ${robots.disallow.length} disallow rules, crawl delay ${robots.crawlDelayMs} ms`
  );

  const isAllowed = (path: string) =>
    !robots.disallow.some((rule) => path.startsWith(rule)) &&
    !ALWAYS_SKIP.some((rule) => path.includes(rule));

  const queue = [...START_PATHS];
  const seen = new Set(queue);
  const pages: SitePage[] = [];
  const newsCount: Record<string, number> = { ru: 0, kk: 0 };
  // Pages we must not crawl but residents still need links to.
  const linkedButNotCrawled = new Set<string>();

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const path = queue.shift()!;
    const url = `${SITE_ORIGIN}${path}`;

    await sleep(robots.crawlDelayMs);

    let response: Awaited<ReturnType<typeof fetchText>>;

    try {
      response = await fetchText(url);
    } catch (error) {
      console.warn(`skip ${path}: ${(error as Error).message}`);
      continue;
    }

    if (response.status !== 200 || !response.contentType.includes("text/html")) {
      console.warn(`skip ${path}: HTTP ${response.status} ${response.contentType}`);
      continue;
    }

    const page = extractSitePage(response.text, url);

    for (const link of page.links) {
      const normalized = normalizeSiteUrl(link, url);

      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);

      if (!isAllowed(normalized)) {
        linkedButNotCrawled.add(normalized);
        continue;
      }

      if (isNewsArticle(normalized)) {
        const lang = normalized.slice(1, 3);

        if (newsCount[lang] >= MAX_NEWS_PER_LANGUAGE) {
          continue;
        }

        newsCount[lang]++;
      }

      queue.push(normalized);
    }

    if (page.text.length < 40 && page.faq.length === 0) {
      console.log(`empty ${path}`);
      continue;
    }

    pages.push({ ...page, links: [] });
    console.log(`ok ${path} — ${page.title} (${page.text.length} chars, ${page.faq.length} FAQ)`);
  }

  const output = {
    origin: SITE_ORIGIN,
    crawledAt: new Date().toISOString(),
    pages,
    linkedButNotCrawled: Array.from(linkedButNotCrawled).sort(),
  };
  const outPath = resolve(process.cwd(), "data/site-pages.json");

  writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`\nSaved ${pages.length} pages to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
