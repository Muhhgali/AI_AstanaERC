"use client";

import { formatAdminDate } from "./format";
import type { AdminHistoryConversation } from "./types";

function conversationStatus(conversation: AdminHistoryConversation) {
  const down = conversation.messages.some((message) => message.feedback === "down");
  const up = conversation.messages.some((message) => message.feedback === "up");

  if (down) {
    return { label: "Проблемный", className: "bg-red-50 text-red-700" };
  }

  if (up) {
    return { label: "Полезный", className: "bg-emerald-50 text-emerald-700" };
  }

  return { label: "Новый", className: "bg-blue-50 text-blue-700" };
}

export function RecentDialogs({
  conversations,
  onOpenAll,
}: {
  conversations: AdminHistoryConversation[];
  onOpenAll: () => void;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200/80 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Недавние диалоги</h3>
        <button
          type="button"
          onClick={onOpenAll}
          className="text-sm font-medium text-blue-700 hover:text-blue-800"
        >
          Все диалоги
        </button>
      </div>

      {conversations.length === 0 ? (
        <p className="text-sm text-neutral-500">Диалогов пока нет.</p>
      ) : (
        <div className="divide-y divide-neutral-100">
          {conversations.slice(0, 5).map((conversation) => {
            const question =
              conversation.messages.find((message) => message.role === "user")
                ?.content ?? conversation.title;
            const status = conversationStatus(conversation);

            return (
              <article key={conversation.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900">
                    {question}
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {formatAdminDate(conversation.updated_at)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium ${status.className}`}
                >
                  {status.label}
                </span>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
