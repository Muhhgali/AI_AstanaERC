import "dotenv/config";
import fs from "fs";

import OpenAI from "openai";

import { createClient } from "@supabase/supabase-js";

type KnowledgeImportItem = {
  title: string;
  category: string;
  content: string;
  priority?: number;
  verified?: boolean;
  source?: string;
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

async function run() {

  const raw = fs.readFileSync(
    "data/knowledge.json",
    "utf-8"
  );

  const items = JSON.parse(raw) as KnowledgeImportItem[];

  for (const item of items) {

    console.log("Processing:", item.title);

    const embeddingRes =
      await openai.embeddings.create({
        model: "text-embedding-3-small",

        input: `
${item.title}

${item.content}
        `,
      });

    const embedding =
      embeddingRes.data[0].embedding;

    const baseRecord = {
      title: item.title,
      category: item.category,
      content: item.content,
      embedding,
    };

    const recordWithMetadata = {
      ...baseRecord,
      priority: item.priority ?? 0,
      verified: item.verified ?? false,
      source: item.source ?? "knowledge.json",
    };

    const { error } =
      await supabase
        .from("knowledge")
        .insert(recordWithMetadata);

    if (error) {
      const canRetryWithoutMetadata =
        error.message.includes("priority") ||
        error.message.includes("verified") ||
        error.message.includes("source");

      if (!canRetryWithoutMetadata) {
        console.log(error);
        continue;
      }

      const { error: fallbackError } =
        await supabase
          .from("knowledge")
          .insert(baseRecord);

      if (fallbackError) {
        console.log(fallbackError);
        continue;
      }

      console.log(
        "Inserted without priority metadata:",
        item.title
      );
    } else {
      console.log("Inserted:", item.title);
    }
  }

  console.log("DONE 🚀");
}

run();
