import type { KnowledgeListItem, KnowledgeStatus } from "./types";

export const KNOWLEDGE_STATUS_LABELS: Record<KnowledgeStatus, string> = {
  draft: "Черновик",
  review: "На проверке",
  verified: "Проверено",
  archived: "Архив",
};

export function getKnowledgeStatus(
  item: Pick<KnowledgeListItem, "status" | "verified">
): KnowledgeStatus {
  if (
    item.status === "draft" ||
    item.status === "review" ||
    item.status === "verified" ||
    item.status === "archived"
  ) {
    return item.status;
  }

  return item.verified ? "verified" : "draft";
}

export function formatAdminDate(value?: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function greetingForNow(now = new Date()) {
  const hour = now.getHours();

  if (hour < 12) {
    return "Доброе утро";
  }

  if (hour < 18) {
    return "Добрый день";
  }

  return "Добрый вечер";
}

export function knowledgeTimestamp(item: KnowledgeListItem) {
  return item.updated_at || item.reviewed_at || item.created_at || null;
}
