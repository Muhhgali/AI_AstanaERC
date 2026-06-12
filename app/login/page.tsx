"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";

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
    <div className="flex min-h-screen items-center justify-center bg-[#f4f6f8] px-4 text-neutral-950">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <BrandMark size="lg" variant="full" />
          <h1 className="mt-4 text-2xl font-semibold">
            Панель управления ботом
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            Вход в админку базы знаний
          </p>
        </div>

        <input
          className="mb-3 h-11 w-full rounded-md border border-neutral-300 bg-white px-3 outline-none focus:border-blue-600"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="mb-4 h-11 w-full rounded-md border border-neutral-300 bg-white px-3 outline-none focus:border-blue-600"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={login}
          className="mb-2 h-11 w-full rounded-md bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Войти
        </button>

        <button
          onClick={register}
          className="h-11 w-full rounded-md border border-neutral-300 bg-white text-sm font-semibold transition hover:bg-neutral-50"
        >
          Зарегистрироваться
        </button>
      </div>
    </div>
  );
}
