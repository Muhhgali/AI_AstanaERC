export type ManagerWorkspaceStatus =
  | "unassigned"
  | "assigned"
  | "in_progress"
  | "review"
  | "completed";

export type ManagerWorkspaceRole =
  | "admin"
  | "manager"
  | "knowledge_editor"
  | "reviewer";

export type ManagerWorkspaceGap = {
  id: string;
  topic?: string | null;
  user_question?: string | null;
  sanitized_user_question?: string | null;
  assistant_answer?: string | null;
  reason?: string | null;
  status?: string | null;
  assignment_status?: ManagerWorkspaceStatus | null;
  top_similarity?: number | null;
  assigned_to?: string | null;
  assigned_at?: string | null;
  started_at?: string | null;
  submitted_at?: string | null;
  completed_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_comment?: string | null;
  prepared_answer?: string | null;
  prepared_source?: string | null;
  draft_knowledge_id?: string | null;
  manager_version?: number | null;
  frequency?: number | null;
  priority?: number | null;
  category?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_seen_at?: string | null;
};

export const MANAGER_ACTIVE_TASK_LIMIT = Math.min(
  Math.max(Number(process.env.MANAGER_ACTIVE_TASK_LIMIT ?? 5), 1),
  10
);

const ACTIVE_STATUSES: ManagerWorkspaceStatus[] = [
  "assigned",
  "in_progress",
  "review",
];

export function isActiveManagerStatus(status?: string | null) {
  return ACTIVE_STATUSES.includes(status as ManagerWorkspaceStatus);
}

export function canPublishKnowledge(roles: ManagerWorkspaceRole[]) {
  return roles.includes("admin") || roles.includes("reviewer");
}

export function canManageQueue(roles: ManagerWorkspaceRole[]) {
  return roles.includes("admin");
}

export function canWorkOnAssignedGap(params: {
  userId?: string | null;
  gap?: Pick<ManagerWorkspaceGap, "assigned_to" | "assignment_status"> | null;
}) {
  return Boolean(
    params.userId &&
      params.gap?.assigned_to === params.userId &&
      params.gap.assignment_status !== "completed"
  );
}

export function hasReachedActiveTaskLimit(params: {
  assigned: Pick<ManagerWorkspaceGap, "assignment_status">[];
  limit?: number;
}) {
  const limit = params.limit ?? MANAGER_ACTIVE_TASK_LIMIT;
  const activeCount = params.assigned.filter((item) =>
    isActiveManagerStatus(item.assignment_status)
  ).length;

  return activeCount >= limit;
}

export function sanitizeResidentQuestion(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\b\d{10,16}\b/g, "[NUMBER]")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, "[PHONE]")
    .replace(
      /(?:^|[\s,.;])(?:ул\.?|улица|проспект|пр\.?|дом|кв\.?|квартира)\s+[^\n,.;]{2,60}/giu,
      "[ADDRESS]"
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[EMAIL]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function inferQuestionCategory(input: string) {
  const normalized = input.toLowerCase();

  if (/оплат|kaspi|плат[её]ж|сумм|төлем|ақша/.test(normalized)) {
    return "payments";
  }

  if (/показан|счетчик|счётчик|су|есептегіш|көрсеткіш/.test(normalized)) {
    return "meters";
  }

  if (/квитанц|епд|түбіртек|дубликат/.test(normalized)) {
    return "receipts";
  }

  if (/лицев|дербес|владел|сч[её]т|шот/.test(normalized)) {
    return "accounts";
  }

  if (/начисл|перерасч[её]т|долг|қарыз|есептеу/.test(normalized)) {
    return "billing";
  }

  if (/сайт|кабинет|виджет|форма|ошибк|whatsapp|телефон|тех/.test(normalized)) {
    return "services";
  }

  return "support";
}

export function calculateQuestionPriority(params: {
  frequency?: number | null;
  topSimilarity?: number | null;
  reason?: string | null;
  createdAt?: string | null;
}) {
  const frequencyBoost = Math.min(Math.max(params.frequency ?? 1, 1), 10) * 4;
  const similarityPenalty =
    typeof params.topSimilarity === "number"
      ? Math.round(Math.max(0, Math.min(params.topSimilarity, 1)) * 20)
      : 0;
  const reasonBoost =
    params.reason === "no-match"
      ? 24
      : params.reason === "weak-match"
        ? 16
        : params.reason === "unverified-match"
          ? 12
          : 8;
  const ageBoost = params.createdAt
    ? Math.min(
        12,
        Math.floor(
          (Date.now() - new Date(params.createdAt).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  return Math.min(
    100,
    Math.max(1, 40 + frequencyBoost + reasonBoost + ageBoost - similarityPenalty)
  );
}

export function sortAssignableGaps<T extends ManagerWorkspaceGap>(items: T[]) {
  return [...items].sort((a, b) => {
    const priorityDiff = (b.priority ?? 50) - (a.priority ?? 50);
    if (priorityDiff !== 0) return priorityDiff;

    const frequencyDiff = (b.frequency ?? 1) - (a.frequency ?? 1);
    if (frequencyDiff !== 0) return frequencyDiff;

    return (
      new Date(a.created_at ?? 0).getTime() -
      new Date(b.created_at ?? 0).getTime()
    );
  });
}

export function buildManagerKnowledgeDraft(params: {
  gap: ManagerWorkspaceGap;
  answer: string;
  source: string;
  authorId: string;
}) {
  const answer = params.answer.trim();
  const source = params.source.trim();

  if (!answer) {
    throw new Error("answer is required");
  }

  if (!source) {
    throw new Error("source is required");
  }

  const question =
    params.gap.sanitized_user_question ||
    sanitizeResidentQuestion(params.gap.user_question);
  const title = (question || params.gap.topic || "Ответ из очереди вопросов")
    .trim()
    .slice(0, 180);
  const category =
    params.gap.category ||
    inferQuestionCategory(`${params.gap.topic ?? ""} ${question}`);

  return {
    title,
    category,
    content: [
      answer,
      "",
      "Контекст подготовки:",
      question ? `- Вопрос жителя: ${question}` : null,
      params.gap.topic ? `- Тема: ${params.gap.topic}` : null,
      `- Источник: ${source}`,
    ]
      .filter(Boolean)
      .join("\n"),
    language: "ru" as const,
    status: "review" as const,
    priority: Math.max(70, params.gap.priority ?? 80),
    verified: false,
    source: "manager-workspace",
    metadata: {
      managerWorkspace: true,
      source,
      preparedBy: params.authorId,
      gapId: params.gap.id,
    },
  };
}
