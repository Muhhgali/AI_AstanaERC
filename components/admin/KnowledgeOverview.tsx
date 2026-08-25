"use client";

import { BookOpen } from "lucide-react";

export function KnowledgeOverview({
  total,
  drafts,
  review,
  archived,
  onOpen,
  onOpenDrafts,
  onOpenReview,
  onOpenArchived,
}: {
  total: number;
  drafts: number;
  review: number;
  archived: number;
  onOpen: () => void;
  onOpenDrafts: () => void;
  onOpenReview: () => void;
  onOpenArchived: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <div className="text-sm font-medium text-neutral-500">База знаний</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight">
              {total}
              <span className="ml-2 text-base font-medium text-neutral-400">
                материалов
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onOpenDrafts}
                className="rounded-lg bg-neutral-50 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                Новые · {drafts}
              </button>
              <button
                type="button"
                onClick={onOpenReview}
                className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-100"
              >
                На проверке · {review}
              </button>
              <button
                type="button"
                onClick={onOpenArchived}
                className="rounded-lg bg-neutral-50 px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100"
              >
                Архив · {archived}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-start gap-2 lg:items-end">
          <button
            type="button"
            onClick={onOpen}
            className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-on-accent hover:bg-blue-700"
          >
            Открыть базу знаний →
          </button>
          <button
            type="button"
            onClick={onOpenReview}
            className="text-sm font-medium text-blue-700 hover:text-blue-800"
          >
            Материалы на проверке
          </button>
        </div>
      </div>
    </section>
  );
}
