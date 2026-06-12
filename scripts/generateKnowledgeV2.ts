import "dotenv/config";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

const topics = [
  "оплата ЕПД",
  "передача показаний воды",
  "передача показаний газа",
  "лицевой счет",
  "перерасчет",
  "ошибка оплаты",
  "дубликат квитанции",
  "личный кабинет",
  "задолженность",
  "начисления",
  "контакт-центр",
];

const styles = [
  "как",
  "что делать если",
  "почему не получается",
  "куда обращаться если",
  "как решить проблему если",
];

type GeneratedKnowledge = {
  title: string;
  content: string;
  category: string;
  keywords?: string[];
};

// 🔥 чистка JSON
function cleanJSON(text: string) {
  return text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}

// 🔥 безопасный парсинг
function safeParse(text: string) {
  try {
    return JSON.parse(cleanJSON(text)) as GeneratedKnowledge;
  } catch {
    console.log("❌ BAD JSON SKIPPED");
    return null;
  }
}

async function generate(
  topic: string,
  style: string,
  retry = 2
): Promise<GeneratedKnowledge | null> {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content: `
Ты генерируешь базу знаний для коммунальной компании.

ВАЖНО:
- верни ТОЛЬКО JSON
- без markdown
- без \`\`\`
- без текста

ФОРМАТ:
{
  "title": "вопрос",
  "content": "ответ",
  "category": "категория",
  "keywords": ["ключ1","ключ2","ключ3"]
}
          `,
        },
        {
          role: "user",
          content: `Тема: ${topic}\nСтиль: ${style}`,
        },
      ],
    });

    const text = res.choices[0].message.content!;
    const parsed = safeParse(text);

    if (!parsed && retry > 0) {
      return generate(topic, style, retry - 1);
    }

    return parsed;
  } catch {
    if (retry > 0) return generate(topic, style, retry - 1);
    return null;
  }
}

async function run() {
  let count = 0;

  for (let round = 0; round < 8; round++) {
    for (const topic of topics) {
      for (const style of styles) {
        const item = await generate(topic, style);

        if (!item) continue;

        const { error } = await supabase.from("knowledge").insert({
          title: item.title,
          content: item.content,
          category: item.category,
          keywords: item.keywords,
        });

        if (error) {
          console.log("DB error:", error.message);
          continue;
        }

        count++;
        console.log("Inserted:", count);
      }
    }
  }

  console.log("DONE TOTAL:", count);
}

run();
