"use client";

import { getKnowledgeStatus } from "./format";
import { KnowledgeFilters } from "./KnowledgeFilters";
import { KnowledgeInspector } from "./KnowledgeInspector";
import { KnowledgeTable } from "./KnowledgeTable";
import { ModuleFrame, ModuleTabs } from "./ModuleFrame";
import type { KnowledgeFormState, KnowledgeListItem, KnowledgeStatus } from "./types";

type CategoryOption = { id: string; label: string; count?: number };

export function KnowledgeWorkspace({
  items,
  filteredItems,
  selectedId,
  inspectorOpen,
  inspectorMode,
  form,
  loading,
  saving,
  query,
  category,
  language,
  status,
  sort,
  categories,
  templates,
  categoryLabel,
  onQuery,
  onCategory,
  onLanguage,
  onStatus,
  onSort,
  onReset,
  onSelect,
  onAdd,
  onCloseInspector,
  onEdit,
  onFormChange,
  onSave,
  onSendToReview,
  onConfirm,
  onArchive,
  onDelete,
  onApplyTemplate,
}: {
  items: KnowledgeListItem[];
  filteredItems: KnowledgeListItem[];
  selectedId: string | null;
  inspectorOpen: boolean;
  inspectorMode: "view" | "edit" | "create";
  form: KnowledgeFormState;
  loading: boolean;
  saving: boolean;
  query: string;
  category: string;
  language: "all" | "ru" | "kk";
  status: KnowledgeStatus | "all";
  sort: "updated" | "title" | "status" | "category";
  categories: CategoryOption[];
  templates: { label: string }[];
  categoryLabel: (category: string) => string;
  onQuery: (value: string) => void;
  onCategory: (value: string) => void;
  onLanguage: (value: "all" | "ru" | "kk") => void;
  onStatus: (value: KnowledgeStatus | "all") => void;
  onSort: (value: "updated" | "title" | "status" | "category") => void;
  onReset: () => void;
  onSelect: (item: KnowledgeListItem) => void;
  onAdd: () => void;
  onCloseInspector: () => void;
  onEdit: () => void;
  onFormChange: (patch: Partial<KnowledgeFormState>) => void;
  onSave: () => void;
  onSendToReview: () => void;
  onConfirm: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onApplyTemplate: (label: string) => void;
}) {
  const tabStatus = status === "all" && category !== "all" ? "categories" : status;

  const counts = {
    all: items.length,
    review: items.filter((item) => getKnowledgeStatus(item) === "review").length,
    verified: items.filter((item) => getKnowledgeStatus(item) === "verified").length,
    draft: items.filter((item) => getKnowledgeStatus(item) === "draft").length,
    archived: items.filter((item) => getKnowledgeStatus(item) === "archived").length,
  };

  return (
    <ModuleFrame
      title="База знаний"
      subtitle="Управление знаниями, которые использует AI-ассистент."
      actions={
        <button
          type="button"
          onClick={onAdd}
          className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-on-accent hover:bg-blue-700"
        >
          + Добавить материал
        </button>
      }
      tabs={
        <ModuleTabs
          active={tabStatus}
          onChange={(id) => {
            if (id === "categories") {
              onStatus("all");
              return;
            }
            onStatus(id as KnowledgeStatus | "all");
          }}
          items={[
            { id: "all", label: "Все материалы", count: counts.all },
            { id: "review", label: "На проверке", count: counts.review },
            { id: "verified", label: "Проверенные", count: counts.verified },
            { id: "draft", label: "Черновики", count: counts.draft },
            { id: "archived", label: "Архив", count: counts.archived },
            { id: "categories", label: "Категории" },
          ]}
        />
      }
    >
      <div
        className={`grid gap-0 overflow-hidden rounded-2xl border border-neutral-200/80 bg-white ${
          inspectorOpen ? "xl:grid-cols-[minmax(0,1fr)_380px]" : ""
        }`}
      >
        <div className="min-w-0">
          <div className="border-b border-neutral-100 p-4">
            <KnowledgeFilters
              query={query}
              category={category}
              language={language}
              status={status}
              sort={sort}
              categories={categories}
              onQuery={onQuery}
              onCategory={onCategory}
              onLanguage={onLanguage}
              onStatus={onStatus}
              onSort={onSort}
              onReset={onReset}
            />
            {tabStatus === "categories" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onCategory("all")}
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    category === "all"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-neutral-50 text-neutral-600"
                  }`}
                >
                  Все
                </button>
                {categories.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onCategory(item.id)}
                    className={`rounded-lg px-3 py-1.5 text-sm ${
                      category === item.id
                        ? "bg-blue-50 text-blue-700"
                        : "bg-neutral-50 text-neutral-600"
                    }`}
                  >
                    {item.label}
                    {typeof item.count === "number" ? ` · ${item.count}` : ""}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <KnowledgeTable
            items={filteredItems}
            selectedId={selectedId}
            loading={loading}
            categoryLabel={categoryLabel}
            onSelect={onSelect}
          />
        </div>

        {inspectorOpen ? (
          <KnowledgeInspector
            mode={inspectorMode}
            item={items.find((item) => item.id === selectedId) ?? null}
            form={form}
            categories={categories}
            templates={templates}
            saving={saving}
            categoryLabel={categoryLabel}
            onClose={onCloseInspector}
            onEdit={onEdit}
            onFormChange={onFormChange}
            onSave={onSave}
            onSendToReview={onSendToReview}
            onConfirm={onConfirm}
            onArchive={onArchive}
            onDelete={onDelete}
            onApplyTemplate={onApplyTemplate}
          />
        ) : null}
      </div>
    </ModuleFrame>
  );
}
