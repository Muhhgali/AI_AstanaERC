"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const router = useRouter();

  const login = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return alert(error.message);

    router.push("/admin");
  };

  const register = async () => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) return alert(error.message);

    alert("Check your email!");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-black via-gray-900 to-black text-white">
      <div className="w-full max-w-md p-8 rounded-2xl bg-gray-900/70 border border-gray-800 shadow-xl">
        
        <h1 className="text-3xl font-bold text-center mb-6">
          AI Support Bot
        </h1>

        <p className="text-gray-400 text-center mb-6">
          Login to admin panel
        </p>

        <input
          className="w-full mb-3 p-3 rounded-lg bg-gray-800 border border-gray-700 outline-none focus:border-blue-500"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="w-full mb-4 p-3 rounded-lg bg-gray-800 border border-gray-700 outline-none focus:border-blue-500"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={login}
          className="w-full mb-2 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 transition"
        >
          Login
        </button>

        <button
          onClick={register}
          className="w-full py-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition"
        >
          Register
        </button>
      </div>
    </div>
  );
}