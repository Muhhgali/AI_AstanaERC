// The model often repeats a link it already gave in the answer as a closing
// "Подробнее: <url>" line; drop that line when the URL is already above it.
const MORE_LINK_LINE = /^(Подробнее|Толығырақ)\s*:\s*(\S+?)[.,;]?$/i;

function normalizeUrl(url: string) {
  return url.replace(/[.,;:)]+$/, "").replace(/\/$/, "").toLowerCase();
}

export function removeRepeatedMoreLinks(message: string) {
  const lines = message.split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    const match = line.trim().match(MORE_LINK_LINE);

    if (match) {
      const url = normalizeUrl(match[2]);
      const earlierUrls = (kept.join("\n").match(/https?:\/\/[^\s)]+/g) ?? []).map(normalizeUrl);

      if (earlierUrls.includes(url)) {
        continue;
      }
    }

    kept.push(line);
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
