"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, LockKeyhole, ShieldAlert } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("reason");

    if (reason === "session") {
      window.setTimeout(() => {
        setMessage(
          "Сессия не прошла проверку на сервере. Проверь, что в Vercel пары SUPABASE_URL / SUPABASE_ANON_KEY и NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY указывают на один Supabase проект."
        );
      }, 0);
    }
  }, []);

  const login = async () => {
    setMessage("");

    if (!isSupabaseConfigured) {
      setMessage(
        "Supabase не настроен на сайте. Добавь NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY в Vercel Environment Variables."
      );
      return;
    }

    if (!email.trim() || !password) {
      setMessage("Введи email и пароль администратора.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    router.push("/admin");
  };

  const register = async () => {
    setMessage("");

    if (!isSupabaseConfigured) {
      setMessage(
        "Supabase не настроен на сайте. Сначала добавь public env-переменные в Vercel."
      );
      return;
    }

    if (!email.trim() || password.length < 6) {
      setMessage("Для регистрации нужен email и пароль минимум 6 символов.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(
      "Аккаунт создан. Если в Supabase включено подтверждение почты, открой письмо и подтверди email, потом войди."
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f6f8] px-4 text-neutral-950">
      <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <BrandMark size="lg" variant="full" />
          <h1 className="mt-4 text-2xl font-semibold">
            Панель управления ботом
          </h1>
          <p className="mt-2 text-sm leading-5 text-neutral-500">
            Вход для работы с базой знаний, историей вопросов и качеством
            ответов
          </p>
        </div>

        {message && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-5 text-amber-900">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <ShieldAlert size={16} />
              Требуется проверка
            </div>
            {message}
          </div>
        )}

        <input
          className="mb-3 h-11 w-full rounded-md border border-neutral-300 bg-white px-3 outline-none focus:border-blue-600"
          placeholder="Email администратора"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="mb-4 h-11 w-full rounded-md border border-neutral-300 bg-white px-3 outline-none focus:border-blue-600"
          placeholder="Пароль"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void login();
            }
          }}
        />

        <button
          onClick={login}
          disabled={loading}
          className="mb-2 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          <LockKeyhole size={16} />
          {loading ? "Проверяю..." : "Войти в админку"}
        </button>

        <button
          onClick={register}
          disabled={loading}
          className="h-11 w-full rounded-md border border-neutral-300 bg-white text-sm font-semibold transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:bg-neutral-100"
        >
          Создать администратора
        </button>

        <Link
          href="/"
          className="mt-5 flex items-center justify-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-900"
        >
          <ArrowLeft size={15} />
          Вернуться к боту
        </Link>
      </div>
    </div>
  );
}
