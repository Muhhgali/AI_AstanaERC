"use client";

import type { KnowledgeStatus } from "./types";

type CategoryOption = { id: string; label: string };

export function KnowledgeFilters({
  query,
  category,
  language,
  status,
  sort,
  categories,
  onQuery,
  onCategory,
  onLanguage,
  onStatus,
  onSort,
  onReset,
}: {
  query: string;
  category: string;
  language: "all" | "ru" | "kk";
  status: KnowledgeStatus | "all";
  sort: "updated" | "title" | "status" | "category";
  categories: CategoryOption[];
  onQuery: (value: string) => void;
  onCategory: (value: string) => void;
  onLanguage: (value: "all" | "ru" | "kk") => void;
  onStatus: (value: KnowledgeStatus | "all") => void;
  onSort: (value: "updated" | "title" | "status" | "category") => void;
  onReset: () => void;
}) {
  const fieldClass =
    "h-10 rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-blue-500";

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <input
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        className={`${fieldClass} w-full lg:flex-1`}
        placeholder="Поиск по названию, тексту или категории"
      />
      <select
        value={category}
        onChange={(event) => onCategory(event.target.value)}
        className={fieldClass}
      >
        <option value="all">Все категории</option>
        {categories.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <select
        value={language}
        onChange={(event) => onLanguage(event.target.value as "all" | "ru" | "kk")}
        className={fieldClass}
      >
        <option value="all">Все языки</option>
        <option value="ru">RU</option>
        <option value="kk">KK</option>
      </select>
      <select
        value={status}
        onChange={(event) =>
          onStatus(event.target.value as KnowledgeStatus | "all")
        }
        className={fieldClass}
      >
        <option value="all">Все статусы</option>
        <option value="draft">Черновик</option>
        <option value="review">На проверке</option>
        <option value="verified">Проверено</option>
        <option value="archived">Архив</option>
      </select>
      <select
        value={sort}
        onChange={(event) =>
          onSort(event.target.value as "updated" | "title" | "status" | "category")
        }
        className={fieldClass}
      >
        <option value="updated">Сначала новые</option>
        <option value="title">По названию</option>
        <option value="status">По статусу</option>
        <option value="category">По категории</option>
      </select>
      <button
        type="button"
        onClick={onReset}
        className="h-10 rounded-lg border border-neutral-200 px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
      >
        Сбросить
      </button>
    </div>
  );
}
