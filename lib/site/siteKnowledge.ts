// Converts crawled aerc.kz pages into knowledge-base rows.
// Every row keeps its page URL in `source`, so the assistant can link to it.
import type { SitePage } from "./extractPage";

export type SiteKnowledgeChunk = {
  title: string;
  category: string;
  content: string;
  language: "ru" | "kk";
  source: string;
  priority: number;
};

export const SITE_SOURCE_PREFIX = "https://www.aerc.kz/";

const MAX_CHUNK_CHARS = 1400;

// News items go stale (outages, deadlines); they stay reachable through the
// navigator but are not loaded into the knowledge base as facts.
const SKIPPED_SECTIONS = new Set(["novosti", "home"]);

function inferCategory(text: string, section: string, title = ""): string {
  // The title decides first: answers often mention "оплата" in passing.
  if (title) {
    const byTitle = inferCategory(title, "");

    if (byTitle !== "support") {
      return byTitle;
    }
  }

  const normalized = text.toLowerCase().replace(/ё/g, "е");

  if (/показани|счетчик|прибор.? учета|көрсеткіш|есептегіш/.test(normalized)) return "meters";
  if (/оплат|платеж|kaspi|каспи|банк|төле/.test(normalized)) return "payments";
  if (/квитанц|епд|түбіртек|e-mail|email|рассылк/.test(normalized)) return "receipts";
  if (/лицев|владел|собственник|численност|дербес шот/.test(normalized)) return "accounts";
  if (/начислен|перерасч|задолж|сальдо|тариф/.test(normalized)) return "billing";
  if (section === "biznesu") return "suppliers";

  return "support";
}

function firstLine(text: string) {
  return text.split("\n")[0]?.slice(0, 120) ?? "";
}

function splitIntoChunks(text: string) {
  const paragraphs = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 1 > MAX_CHUNK_CHARS) {
      chunks.push(current);
      current = "";
    }

    current = current ? `${current}\n${paragraph}` : paragraph;

    while (current.length > MAX_CHUNK_CHARS) {
      chunks.push(current.slice(0, MAX_CHUNK_CHARS));
      current = current.slice(MAX_CHUNK_CHARS);
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function sentenceCase(text: string) {
  // FAQ headings on the site are often written in capitals.
  if (text.length > 6 && text === text.toUpperCase()) {
    const lower = text.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }

  return text;
}

function removeFaqText(text: string, page: SitePage) {
  let rest = text;

  for (const item of page.faq) {
    rest = rest.replace(item.question, "").replace(item.answer, "");
  }

  return rest.replace(/\n{2,}/g, "\n").trim();
}

export function buildSiteKnowledgeChunks(pages: SitePage[]): SiteKnowledgeChunk[] {
  const chunks: SiteKnowledgeChunk[] = [];
  const seen = new Set<string>();

  const push = (chunk: SiteKnowledgeChunk) => {
    const key = `${chunk.language}:${chunk.title}:${chunk.content}`;

    if (!seen.has(key) && chunk.content.length >= 40) {
      seen.add(key);
      chunks.push(chunk);
    }
  };

  for (const page of pages) {
    if (SKIPPED_SECTIONS.has(page.section)) {
      continue;
    }

    for (const item of page.faq) {
      const title = sentenceCase(item.question);

      push({
        title,
        category: inferCategory(item.answer, page.section, title),
        content: item.answer,
        language: page.lang,
        source: page.url,
        // Official site FAQ answers outrank generated drafts.
        priority: 80,
      });
    }

    const rest = page.faq.length > 0 ? removeFaqText(page.text, page) : page.text;
    const parts = splitIntoChunks(rest);

    parts.forEach((content, index) => {
      push({
        title: parts.length > 1 ? `${page.title} (${index + 1})` : page.title,
        category: inferCategory(content, page.section, firstLine(content)),
        content,
        language: page.lang,
        source: page.url,
        priority: 60,
      });
    });
  }

  return chunks;
}
