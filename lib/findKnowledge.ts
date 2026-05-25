import { knowledgeBase } from "@/data/knowledge";

export function findKnowledge(message: string) {
  const text = message.toLowerCase();

  let bestMatch = null;
  let bestScore = 0;

  for (const item of knowledgeBase) {
    let score = 0;

    for (const keyword of item.keywords) {
      if (text.includes(keyword.toLowerCase())) {
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