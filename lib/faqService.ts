import { supabase } from "@/lib/supabase";

export async function getFaq() {
  const { data, error } = await supabase.from("faq").select("*");

  if (error) {
    console.log(error);
    return [];
  }

  return data;
}