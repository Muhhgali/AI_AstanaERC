// Word-aware matching helpers for intent rules.
// Plain `includes()` on raw text matches inside other words ("аз" in "показания",
// "бин" in "кабинет", "бот" in "работает"), which routed residents to wrong answers.

export function normalizeMatchText(text: string) {
  return text.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

export function getWords(text: string) {
  return normalizeMatchText(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** True when any word of the text equals one of the given words. */
export function hasWord(text: string, words: string[]) {
  const source = new Set(getWords(text));

  return words.some((word) => source.has(word));
}

/** True when any word of the text starts with one of the given prefixes. */
export function hasWordPrefix(text: string, prefixes: string[]) {
  const words = getWords(text);

  return words.some((word) => prefixes.some((prefix) => word.startsWith(prefix)));
}

/**
 * True when the text contains one of the phrases starting at a word boundary.
 * Use for multi-word phrases such as "не отраз" or "как передать".
 */
export function hasPhrase(text: string, phrases: string[]) {
  const normalized = ` ${getWords(text).join(" ")}`;

  return phrases.some((phrase) => {
    const needle = ` ${getWords(phrase).join(" ")}`;

    return needle.trim().length > 0 && normalized.includes(needle);
  });
}
