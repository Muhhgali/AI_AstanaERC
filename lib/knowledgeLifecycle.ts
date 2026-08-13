import { createHash } from "node:crypto";

export type KnowledgeStatus = "draft" | "review" | "verified" | "archived";

export type KnowledgeLifecycleInput = {
  title?: string | null;
  content?: string | null;
  category?: string | null;
  status?: string | null;
  verified?: boolean | null;
};

export function normalizeKnowledgeStatus(
  value: unknown,
  verified?: boolean | null
): KnowledgeStatus {
  if (value === "draft" || value === "review" || value === "verified" || value === "archived") {
    return value;
  }

  return verified ? "verified" : "draft";
}

export function isPublishedKnowledge(item: KnowledgeLifecycleInput) {
  return (
    normalizeKnowledgeStatus(item.status, item.verified) === "verified" &&
    item.verified === true
  );
}

export function isArchivedKnowledge(item: KnowledgeLifecycleInput) {
  return normalizeKnowledgeStatus(item.status, item.verified) === "archived";
}

export function getKnowledgeContentHash(input: KnowledgeLifecycleInput) {
  const normalized = [
    input.title ?? "",
    input.category ?? "",
    input.content ?? "",
  ]
    .map((part) => part.replace(/\s+/g, " ").trim())
    .join("\n");

  return createHash("sha256").update(normalized).digest("hex");
}

export function shouldRefreshEmbedding(params: {
  previousHash?: string | null;
  nextHash: string;
  hasExistingEmbedding?: boolean;
}) {
  return !params.hasExistingEmbedding || params.previousHash !== params.nextHash;
}

export function nextStatusAfterEdit(params: {
  previousStatus?: string | null;
  previousVerified?: boolean | null;
  textChanged: boolean;
  requestedStatus?: string | null;
  requestedVerified?: boolean | null;
}): { status: KnowledgeStatus; verified: boolean } {
  const previousStatus = normalizeKnowledgeStatus(
    params.previousStatus,
    params.previousVerified
  );
  const requestedStatus = normalizeKnowledgeStatus(
    params.requestedStatus,
    params.requestedVerified
  );

  if (previousStatus === "verified" && params.textChanged) {
    return { status: "review", verified: false };
  }

  if (requestedStatus === "archived") {
    return { status: "archived", verified: false };
  }

  if (requestedStatus === "verified" || params.requestedVerified === true) {
    return { status: "verified", verified: true };
  }

  if (requestedStatus === "review") {
    return { status: "review", verified: false };
  }

  return { status: "draft", verified: false };
}
