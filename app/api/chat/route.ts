import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 🧠 cosine similarity
function cosine(a: number[], b: number[]) {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const lastMessage =
      body.messages[body.messages.length - 1].content;

    // 🔥 1. embedding запроса
    const queryEmbedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: lastMessage,
    });

    // 📦 2. получаем FAQ
    const { data: faqs, error } = await supabase
      .from("faq")
      .select("*");

    if (error) {
      console.log(error);
    }

    let bestMatch = null;
    let bestScore = 0;

    // 🔍 3. поиск похожего FAQ
    for (const faq of faqs || []) {
      if (!faq.embedding) continue;

      const score = cosine(
        queryEmbedding.data[0].embedding,
        faq.embedding
      );

      if (score > bestScore) {
        bestScore = score;
        bestMatch = faq;
      }
    }

    // 🎯 4. если нашли хороший FAQ
    if (bestMatch && bestScore > 0.75) {
      return Response.json({
        message: bestMatch.answer,
      });
    }

    // 🤖 5. fallback на AI
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `
Ты AI ассистент компании.
Отвечай кратко и только по теме компании.
Если не знаешь — скажи "Уточните вопрос".
          `,
        },
        ...body.messages,
      ],
    });

    return Response.json({
      message: response.choices[0].message.content,
    });
  } catch (error: any) {
    console.log(error);

    return Response.json(
      { message: "Ошибка сервера" },
      { status: 500 }
    );
  }
}