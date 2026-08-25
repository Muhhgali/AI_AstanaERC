import {
  getKnowledgeStatus,
  KNOWLEDGE_STATUS_LABELS,
} from "./format";
import type { KnowledgeListItem, KnowledgeStatus } from "./types";

const STATUS_CLASS: Record<KnowledgeStatus, string> = {
  draft: "bg-neutral-100 text-neutral-600",
  review: "bg-amber-50 text-amber-700",
  verified: "bg-emerald-50 text-emerald-700",
  archived: "bg-neutral-100 text-neutral-500",
};

export function StatusBadge({
  item,
  status,
}: {
  item?: Pick<KnowledgeListItem, "status" | "verified">;
  status?: KnowledgeStatus;
}) {
  const value = status ?? (item ? getKnowledgeStatus(item) : "draft");

  return (
    <span
      className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${STATUS_CLASS[value]}`}
    >
      {KNOWLEDGE_STATUS_LABELS[value]}
    </span>
  );
}
