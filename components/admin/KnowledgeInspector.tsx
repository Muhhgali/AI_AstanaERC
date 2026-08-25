"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { formatAdminDate, getKnowledgeStatus, knowledgeTimestamp } from "./format";
import { StatusBadge } from "./StatusBadge";
import type { KnowledgeFormState, KnowledgeListItem, KnowledgeStatus } from "./types";

type CategoryOption = { id: string; label: string };

const fieldClass =
  "h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-blue-500";

export function KnowledgeInspector({
  mode,
  item,
  form,
  categories,
  templates,
  saving,
  categoryLabel,
  onClose,
  onEdit,
  onFormChange,
  onSave,
  onSendToReview,
  onConfirm,
  onArchive,
  onDelete,
  onApplyTemplate,
}: {
  mode: "view" | "edit" | "create";
  item: KnowledgeListItem | null;
  form: KnowledgeFormState;
  categories: CategoryOption[];
  templates: { label: string }[];
  saving: boolean;
  categoryLabel: (category: string) => string;
  onClose: () => void;
  onEdit: () => void;
  onFormChange: (patch: Partial<KnowledgeFormState>) => void;
  onSave: () => void;
  onSendToReview: () => void;
  onConfirm: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onApplyTemplate: (label: string) => void;
}) {
  const status = item ? getKnowledgeStatus(item) : form.status;

  return (
    <aside className="flex h-full min-h-[640px] flex-col border-l border-neutral-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            {mode === "create"
              ? "Новый материал"
              : mode === "edit"
                ? "Редактирование"
                : "Материал"}
          </div>
          <h2 className="mt-1 text-base font-semibold leading-6">
            {mode === "view" ? item?.title ?? "Материал" : form.title || "Без названия"}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {mode === "view" && item ? (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <StatusBadge item={item} />
              <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-600">
                {categoryLabel(item.category)}
              </span>
              <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs uppercase text-neutral-600">
                {item.language ?? "ru"}
              </span>
            </div>
            <Meta label="Обновлено" value={formatAdminDate(knowledgeTimestamp(item))} />
            <Meta label="Источник" value={item.source ?? "не указан"} />
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                Содержимое
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                {item.content}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {mode === "create" ? (
              <div className="flex flex-wrap gap-2">
                {templates.map((template) => (
                  <button
                    key={template.label}
                    type="button"
                    onClick={() => onApplyTemplate(template.label)}
                    className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:border-blue-200 hover:bg-blue-50"
                  >
                    {template.label}
                  </button>
                ))}
              </div>
            ) : null}

            <Field label="Название">
              <input
                value={form.title}
                onChange={(event) => onFormChange({ title: event.target.value })}
                className={fieldClass}
              />
            </Field>
            <Field label="Категория">
              <select
                value={form.category}
                onChange={(event) => onFormChange({ category: event.target.value })}
                className={fieldClass}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Содержимое">
              <textarea
                value={form.content}
                onChange={(event) => onFormChange({ content: event.target.value })}
                className="min-h-48 w-full resize-y rounded-lg border border-neutral-200 px-3 py-2 text-sm leading-6 outline-none focus:border-blue-500"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Язык">
                <select
                  value={form.language}
                  onChange={(event) =>
                    onFormChange({
                      language: event.target.value === "kk" ? "kk" : "ru",
                    })
                  }
                  className={fieldClass}
                >
                  <option value="ru">Русский</option>
                  <option value="kk">Қазақша</option>
                </select>
              </Field>
              <Field label="Статус">
                <select
                  value={form.status}
                  onChange={(event) => {
                    const next = event.target.value as KnowledgeStatus;
                    onFormChange({
                      status: next,
                      verified: next === "verified",
                    });
                  }}
                  className={fieldClass}
                >
                  <option value="draft">Черновик</option>
                  <option value="review">На проверке</option>
                  <option value="verified">Проверено</option>
                  <option value="archived">Архив</option>
                </select>
              </Field>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-2 border-t border-neutral-100 p-4">
        {mode === "view" ? (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="h-10 rounded-lg bg-blue-600 text-sm font-semibold text-on-accent hover:bg-blue-700"
            >
              Редактировать
            </button>
            {status === "draft" ? (
              <button
                type="button"
                onClick={onSendToReview}
                disabled={saving}
                className="h-10 rounded-lg border border-neutral-200 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-60"
              >
                Отправить на проверку
              </button>
            ) : null}
            {status === "review" ? (
              <button
                type="button"
                onClick={onConfirm}
                disabled={saving}
                className="h-10 rounded-lg border border-emerald-200 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
              >
                {saving ? "Сохраняю..." : "Подтвердить"}
              </button>
            ) : null}
            {status === "verified" ? (
              <button
                type="button"
                onClick={onArchive}
                disabled={saving}
                className="h-10 rounded-lg border border-neutral-200 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-60"
              >
                В архив
              </button>
            ) : null}
            <button
              type="button"
              onClick={onDelete}
              disabled={saving}
              className="h-10 rounded-lg border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              Удалить
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="h-11 rounded-lg bg-blue-600 text-sm font-semibold text-on-accent hover:bg-blue-700 disabled:bg-neutral-300"
          >
            {saving ? "Сохраняю..." : form.id ? "Сохранить" : "Добавить материал"}
          </button>
        )}
      </div>
    </aside>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">
        {label}
      </div>
      <div className="mt-1 text-sm text-neutral-700">{value}</div>
    </div>
  );
}
