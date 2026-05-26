import { supabase } from "@/lib/supabaseClient";
import { createEmbedding } from "@/lib/embedding";

async function run() {
  const { data: faqs } = await supabase.from("faq").select("*");

  for (const faq of faqs || []) {
    const embedding = await createEmbedding(
      faq.question + " " + faq.answer
    );

    await supabase
      .from("faq")
      .update({ embedding })
      .eq("id", faq.id);

    console.log("updated:", faq.question);
  }
}

run();