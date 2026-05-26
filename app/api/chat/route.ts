import OpenAI from "openai";
import { createEmbedding } from "@/lib/embedding";
import { searchFaq } from "@/lib/retrieval";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  const { message } = await req.json();

  // 1. embedding вопроса
  const queryEmbedding = await createEmbedding(message);

  // 2. поиск FAQ
  const results = await searchFaq(queryEmbedding);

  const top = results?.[0];

  // 3. ЕСЛИ СИЛЬНОЕ СОВПАДЕНИЕ → ОТВЕТ БЕЗ GPT
  if (top && top.score > 0.7) {
    return Response.json({
      answer: top.answer,
      source: "faq",
    });
  }

  // 4. ИНАЧЕ GPT С КОНТЕКСТОМ
  const context = results
    .map((r) => `Q: ${r.question}\nA: ${r.answer}`)
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `
Ты AI помощник компании.

Используй FAQ ниже, если он релевантен:

${context}

Правила:
- если есть подходящий ответ — используй его
- не выдумывай
- если не уверен — попроси уточнение
        `,
      },
      {
        role: "user",
        content: message,
      },
    ],
  });

  return Response.json({
  answer: completion.choices[0].message.content,
});
}