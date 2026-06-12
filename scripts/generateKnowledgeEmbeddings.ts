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

async function createEmbedding(text: string) {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return res.data[0].embedding;
}

async function run() {
  const { data, error } = await supabase
    .from("knowledge")
    .select("*")
    .is("embedding", null);

  if (error) {
    console.log(error);
    return;
  }

  console.log("TOTAL:", data.length);

  let count = 0;

  for (const item of data) {
    try {
      const text = `
${item.title}

${item.content}

${item.category}

${item.verified ? "Проверенная информация" : ""}
      `;

      const embedding = await createEmbedding(text);

      const { error: updateError } = await supabase
        .from("knowledge")
        .update({
          embedding,
        })
        .eq("id", item.id);

      if (updateError) {
        console.log("UPDATE ERROR:", updateError.message);
        continue;
      }

      count++;

      console.log("UPDATED:", count);

    } catch {
      console.log("FAILED:", item.id);
    }
  }

  console.log("DONE EMBEDDINGS:", count);
}

run();
