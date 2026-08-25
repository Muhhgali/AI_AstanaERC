"use client";

import { useState } from "react";

export function AIAnswerPreview({
  onOpenTests,
}: {
  onOpenTests: (question: string) => void;
}) {
  const [question, setQuestion] = useState("Как оплатить ЕПД через Kaspi?");

  return (
    <section className="rounded-2xl border border-neutral-200/80 bg-white p-4">
      <h3 className="text-sm font-semibold text-neutral-800">
        Предпросмотр ответа AI
      </h3>
      <p className="mt-1 text-xs leading-5 text-neutral-500">
        Откроет существующий AI Test Center. Отдельный тестовый движок не
        запускается.
      </p>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-medium text-neutral-500">
          Вопрос пользователя
        </span>
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          className="min-h-20 w-full resize-y rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:bg-white"
        />
      </label>

      <button
        type="button"
        onClick={() => onOpenTests(question.trim())}
        disabled={!question.trim()}
        className="mt-3 h-10 w-full rounded-lg bg-blue-600 text-sm font-semibold text-on-accent hover:bg-blue-700 disabled:bg-neutral-300"
      >
        Проверить ответ →
      </button>
    </section>
  );
}
