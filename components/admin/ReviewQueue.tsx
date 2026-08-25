"use client";

import { formatAdminDate, getKnowledgeStatus } from "./format";
import { StatusBadge } from "./StatusBadge";
import type { KnowledgeListItem } from "./types";

export function ReviewQueue({
  items,
  onOpenReview,
}: {
  items: KnowledgeListItem[];
  onOpenReview: () => void;
}) {
  const queue = items
    .filter((item) => {
      const status = getKnowledgeStatus(item);
      return status === "draft" || status === "review";
    })
    .slice(0, 5);

  return (
    <section className="rounded-2xl border border-neutral-200/80 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Очередь на проверку</h3>
        <button
          type="button"
          onClick={onOpenReview}
          className="text-sm font-medium text-blue-700 hover:text-blue-800"
        >
          Перейти к проверке →
        </button>
      </div>

      {queue.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Все материалы подтверждены.
        </p>
      ) : (
        <div className="divide-y divide-neutral-100">
          {queue.map((item) => (
            <article key={item.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="mt-1 text-xs text-neutral-400">
                  {formatAdminDate(item.updated_at || item.reviewed_at)}
                </p>
              </div>
              <StatusBadge item={item} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
