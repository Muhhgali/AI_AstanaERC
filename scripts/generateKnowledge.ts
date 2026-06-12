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

// 🔥 базовые темы (из них будет 300+ вариаций)
const topics = [
  "оплата ЕПД",
  "передача показаний воды",
  "передача показаний газа",
  "задолженность",
  "перерасчет",
  "ошибка оплаты",
  "дубликат квитанции",
  "лицевой счет",
  "личный кабинет",
  "контакт-центр",
  "начисления",
  "изменение данных плательщика",
  "количество проживающих",
  "отключение услуги",
  "сроки формирования квитанции",
];

async function generate(topic: string) {
  const res = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "Ты создаешь базу знаний для коммунальной компании. Верни только JSON без текста.",
      },
      {
        role: "user",
        content: `
Создай knowledge блок для темы: ${topic}

Формат:
{
  "title": "...",
  "content": "...",
  "category": "...",
  "keywords": ["...","...","..."]
}
        `,
      },
    ],
  });

  return JSON.parse(res.choices[0].message.content!);
}

async function run() {
  let count = 0;

  for (let i = 0; i < 20; i++) {
    for (const topic of topics) {
      try {
        const item = await generate(topic);

        await supabase.from("knowledge").insert({
          title: item.title,
          content: item.content,
          category: item.category,
          keywords: item.keywords,
        });

        count++;
        console.log("Inserted:", count);
      } catch (e) {
        console.log("Error:", e);
      }
    }
  }

  console.log("DONE:", count);
}

run();