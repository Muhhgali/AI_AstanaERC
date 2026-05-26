import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

async function getEmbedding(text: string) {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return res.data[0].embedding;
}

async function run() {
  const { data: faqs, error } = await supabase
    .from("faq")
    .select("*");

  if (error) {
    console.log("Supabase error:", error);
    return;
  }

  if (!faqs || faqs.length === 0) {
    console.log("No FAQs found");
    return;
  }

  for (const faq of faqs) {
    console.log("Processing:", faq.question);

    const embedding = await getEmbedding(
      faq.question + " " + faq.answer
    );

    await supabase
      .from("faq")
      .update({ embedding })
      .eq("id", faq.id);

    console.log("Updated:", faq.id);
  }

  console.log("DONE 🚀");
}

run();