"use client";

import { formatAdminDate, knowledgeTimestamp } from "./format";
import { StatusBadge } from "./StatusBadge";
import type { KnowledgeListItem } from "./types";

export function KnowledgeTable({
  items,
  selectedId,
  loading,
  categoryLabel,
  onSelect,
}: {
  items: KnowledgeListItem[];
  selectedId: string | null;
  loading: boolean;
  categoryLabel: (category: string) => string;
  onSelect: (item: KnowledgeListItem) => void;
}) {
  if (loading) {
    return <div className="px-4 py-8 text-sm text-neutral-500">Загружаю базу…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-8 text-sm text-neutral-500">Ничего не найдено.</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-neutral-200 text-xs font-medium uppercase tracking-wide text-neutral-400">
          <tr>
            <th className="px-4 py-3 font-medium">Название</th>
            <th className="px-4 py-3 font-medium">Категория</th>
            <th className="px-4 py-3 font-medium">Статус</th>
            <th className="px-4 py-3 font-medium">Язык</th>
            <th className="px-4 py-3 font-medium">Обновлено</th>
            <th className="px-4 py-3 font-medium">Действия</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const selected = item.id === selectedId;

            return (
              <tr
                key={item.id}
                onClick={() => onSelect(item)}
                className={`h-16 cursor-pointer border-b border-neutral-100 transition ${
                  selected ? "bg-blue-50/70" : "hover:bg-neutral-50"
                }`}
              >
                <td className="max-w-[420px] px-4 py-3">
                  <div className="truncate font-medium text-neutral-900">
                    {item.title}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                  {categoryLabel(item.category)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge item={item} />
                </td>
                <td className="px-4 py-3 uppercase text-neutral-500">
                  {item.language ?? "ru"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-500">
                  {formatAdminDate(knowledgeTimestamp(item))}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(item);
                    }}
                    className="text-sm font-medium text-blue-700 hover:text-blue-800"
                  >
                    Открыть
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
