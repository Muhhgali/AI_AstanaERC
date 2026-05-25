"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [keywords, setKeywords] = useState("");
  const [faqs, setFaqs] = useState<any[]>([]);

  const router = useRouter();

  // 🔐 CHECK AUTH
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
      }
    };

    checkUser();
    loadFaqs();
  }, []);

  // 📥 LOAD FAQS
  const loadFaqs = async () => {
    const { data, error } = await supabase.from("faq").select("*");

    if (!error) {
      setFaqs(data || []);
    }
  };

  // 🚀 ADD FAQ
  const addFaq = async () => {
    if (!question || !answer) {
      alert("Fill all fields");
      return;
    }

    const { error } = await supabase.from("faq").insert([
      {
        question,
        answer,
        keywords,
      },
    ]);

    if (error) {
      alert(error.message);
      return;
    }

    setQuestion("");
    setAnswer("");
    setKeywords("");

    await loadFaqs();

    alert("FAQ added");
  };

  // 🗑 DELETE FAQ
  const deleteFaq = async (id: string) => {
    const { error } = await supabase.from("faq").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setFaqs((prev) => prev.filter((item) => item.id !== id));
  };

  // 🚪 LOGOUT
  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black text-white p-8">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Admin Panel</h1>

        <button
          onClick={logout}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg"
        >
          Logout
        </button>
      </div>

      {/* FORM */}
      <div className="max-w-2xl bg-gray-900/70 border border-gray-800 p-6 rounded-2xl shadow-xl">

        <h2 className="text-xl mb-4 font-semibold">
          Add FAQ
        </h2>

        <input
          className="w-full mb-3 p-3 rounded-lg bg-gray-800 border border-gray-700"
          placeholder="Question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />

        <input
          className="w-full mb-3 p-3 rounded-lg bg-gray-800 border border-gray-700"
          placeholder="Answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />

        <input
          className="w-full mb-4 p-3 rounded-lg bg-gray-800 border border-gray-700"
          placeholder="Keywords (comma separated)"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
        />

        <button
          onClick={addFaq}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg"
        >
          Add FAQ
        </button>
      </div>

      {/* FAQ LIST */}
      <div className="mt-10 max-w-2xl">
        <h2 className="text-xl mb-4 font-semibold">FAQ List</h2>

        <div className="space-y-3">
          {faqs.map((item) => (
            <div
              key={item.id}
              className="p-4 bg-gray-900 border border-gray-800 rounded-lg flex justify-between"
            >
              <div>
                <p className="font-bold text-blue-400">
                  {item.question}
                </p>

                <p className="text-gray-300">
                  {item.answer}
                </p>

                <p className="text-xs text-gray-500 mt-1">
                  {item.keywords}
                </p>
              </div>

              <button
                onClick={() => deleteFaq(item.id)}
                className="bg-red-600 px-3 py-1 rounded"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}