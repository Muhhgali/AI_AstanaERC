"use client";

import { greetingForNow } from "./format";
import { AIAnswerPreview } from "./AIAnswerPreview";
import { KnowledgeOverview } from "./KnowledgeOverview";
import { QuickActions } from "./QuickActions";
import { RecentDialogs } from "./RecentDialogs";
import { ReviewQueue } from "./ReviewQueue";
import type {
  AdminHistoryConversation,
  AdminKnowledgeGap,
  KnowledgeListItem,
  KnowledgeStatus,
} from "./types";

type Metric = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "up" | "down" | "neutral";
};

export function WorkspaceSidebar({
  systemOk,
  metrics,
  reviewCount,
  gapCount,
  downCount,
  draftCount,
  onFilter,
}: {
  systemOk: boolean;
  metrics: Metric[];
  reviewCount: number;
  gapCount: number;
  downCount: number;
  draftCount: number;
  onFilter: (id: "review" | "gaps" | "down" | "drafts") => void;
}) {
  const filters = [
    { id: "review" as const, label: "Требует проверки", count: reviewCount },
    { id: "gaps" as const, label: "Новые вопросы", count: gapCount },
    { id: "down" as const, label: "Ошибочные ответы", count: downCount },
    { id: "drafts" as const, label: "Новые материалы", count: draftCount },
  ];

  return (
    <aside className="hidden w-[260px] shrink-0 xl:block">
      <div className="sticky top-24 space-y-6">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Рабочая область
          </div>
          <div className="mt-2 text-sm font-semibold leading-5 text-neutral-900">
            AI-ассистент Астана-ЕРЦ
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-neutral-600">
            <span
              className={`h-2 w-2 rounded-full ${
                systemOk ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            {systemOk ? "Система работает" : "Есть ограничения"}
          </div>
        </div>

        <div>
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">
            Показатели
          </div>
          <div className="space-y-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-xs text-neutral-500">{metric.label}</div>
                  <div className="mt-0.5 text-lg font-semibold leading-none">
                    {metric.value}
                  </div>
                </div>
                {metric.hint ? (
                  <div
                    className={`text-xs font-medium ${
                      metric.tone === "down"
                        ? "text-red-600"
                        : metric.tone === "up"
                          ? "text-emerald-600"
                          : "text-neutral-400"
                    }`}
                  >
                    {metric.hint}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">
            Быстрые фильтры
          </div>
          <div className="space-y-1">
            {filters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => onFilter(filter.id)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm text-neutral-600 hover:bg-white hover:text-neutral-900"
              >
                {filter.label}
                <span className="text-xs font-semibold text-neutral-400">
                  {filter.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

function KnowledgeStateChart({
  counts,
}: {
  counts: Record<KnowledgeStatus, number>;
}) {
  const total =
    counts.verified + counts.review + counts.draft + counts.archived || 1;
  const verified = (counts.verified / total) * 100;
  const review = (counts.review / total) * 100;
  const draft = (counts.draft / total) * 100;

  return (
    <section className="rounded-2xl border border-neutral-200/80 bg-white p-5">
      <h3 className="text-base font-semibold">Состояние базы знаний</h3>
      <div className="mt-5 flex items-center gap-5">
        <div
          className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(
              #059669 0 ${verified}%,
              #d97706 ${verified}% ${verified + review}%,
              #a3a3a3 ${verified + review}% ${verified + review + draft}%,
              #cbd5e1 ${verified + review + draft}% 100%
            )`,
          }}
          aria-hidden
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-sm font-semibold">
            {Math.round((counts.verified / total) * 100)}%
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <Legend color="#059669" label="Проверено" value={counts.verified} />
          <Legend color="#d97706" label="На проверке" value={counts.review} />
          <Legend color="#a3a3a3" label="Черновик" value={counts.draft} />
          <Legend color="#cbd5e1" label="Архив" value={counts.archived} />
        </div>
      </div>
    </section>
  );
}

function Legend({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 text-neutral-600">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="font-medium text-neutral-900">{value}</span>
    </div>
  );
}

function RecentKnowledgeChanges({ items }: { items: KnowledgeListItem[] }) {
  const recent = [...items]
    .sort((a, b) => {
      const left = a.updated_at || a.reviewed_at || a.created_at || "";
      const right = b.updated_at || b.reviewed_at || b.created_at || "";
      return right.localeCompare(left);
    })
    .slice(0, 4);

  return (
    <section className="rounded-2xl border border-neutral-200/80 bg-white p-5">
      <h3 className="text-base font-semibold">Последние изменения</h3>
      {recent.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">Изменений пока нет.</p>
      ) : (
        <div className="mt-3 divide-y divide-neutral-100">
          {recent.map((item) => (
            <div key={item.id} className="py-3">
              <div className="truncate text-sm font-medium">{item.title}</div>
              <div className="mt-1 text-xs text-neutral-400">
                {item.source ?? "admin"}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function CommandCenter({
  userLabel,
  systemOk,
  metrics,
  items,
  statusCounts,
  conversations,
  gaps,
  downCount,
  onOpenKnowledge,
  onOpenKnowledgeStatus,
  onOpenReview,
  onOpenDialogs,
  onAddMaterial,
  onOpenTests,
  onOpenLearning,
}: {
  userLabel: string;
  systemOk: boolean;
  metrics: Metric[];
  items: KnowledgeListItem[];
  statusCounts: Record<KnowledgeStatus, number>;
  conversations: AdminHistoryConversation[];
  gaps: AdminKnowledgeGap[];
  downCount: number;
  onOpenKnowledge: () => void;
  onOpenKnowledgeStatus: (status: KnowledgeStatus) => void;
  onOpenReview: () => void;
  onOpenDialogs: () => void;
  onAddMaterial: () => void;
  onOpenTests: (question?: string) => void;
  onOpenLearning: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-[1600px] gap-8 px-6 py-8">
      <WorkspaceSidebar
        systemOk={systemOk}
        metrics={metrics}
        reviewCount={statusCounts.review}
        gapCount={gaps.length}
        downCount={downCount}
        draftCount={statusCounts.draft}
        onFilter={(id) => {
          if (id === "review") onOpenReview();
          if (id === "gaps") onOpenLearning();
          if (id === "down") onOpenDialogs();
          if (id === "drafts") onOpenKnowledgeStatus("draft");
        }}
      />

      <div className="min-w-0 flex-1 space-y-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight">
              {greetingForNow()}, {userLabel.split("@")[0] || "администратор"}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Состояние AI, очередь проверки и следующие действия.
            </p>
          </div>
        </div>

        <KnowledgeOverview
          total={items.length}
          drafts={statusCounts.draft}
          review={statusCounts.review}
          archived={statusCounts.archived}
          onOpen={onOpenKnowledge}
          onOpenDrafts={() => onOpenKnowledgeStatus("draft")}
          onOpenReview={() => onOpenKnowledgeStatus("review")}
          onOpenArchived={() => onOpenKnowledgeStatus("archived")}
        />

        <div className="grid gap-6 xl:grid-cols-2">
          <RecentDialogs conversations={conversations} onOpenAll={onOpenDialogs} />
          <KnowledgeStateChart counts={statusCounts} />
          <ReviewQueue items={items} onOpenReview={onOpenReview} />
          <RecentKnowledgeChanges items={items} />
        </div>

        <div className="grid gap-6 2xl:hidden lg:grid-cols-2">
          <QuickActions
            onAdd={onAddMaterial}
            onTests={() => onOpenTests()}
            onLearn={onOpenLearning}
          />
          <AIAnswerPreview onOpenTests={(question) => onOpenTests(question)} />
        </div>
      </div>

      <aside className="hidden w-[300px] shrink-0 2xl:block">
        <div className="sticky top-24 space-y-6">
          <QuickActions
            onAdd={onAddMaterial}
            onTests={() => onOpenTests()}
            onLearn={onOpenLearning}
          />
          <AIAnswerPreview onOpenTests={(question) => onOpenTests(question)} />
        </div>
      </aside>
    </div>
  );
}
