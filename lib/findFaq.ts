import { faq } from "@/data/faq";

export function findFaq(message: string) {
  const cleanMessage = message
    .toLowerCase()
    .replace(/[^\w\sа-яё]/gi, "");

  let bestMatch = null;
  let bestScore = 0;

  for (const item of faq) {
    let score = 0;

    for (const keyword of item.keywords) {
      if (cleanMessage.includes(keyword.toLowerCase())) {
        score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = item;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}