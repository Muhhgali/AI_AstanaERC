import { describe, expect, it } from "vitest";
import {
  getKnowledgeContentHash,
  isArchivedKnowledge,
  isPublishedKnowledge,
  nextStatusAfterEdit,
  shouldRefreshEmbedding,
} from "../lib/knowledgeLifecycle";

describe("knowledge lifecycle", () => {
  it("keeps content_hash stable for whitespace-only changes", () => {
    const first = getKnowledgeContentHash({
      title: "Support",
      category: "support",
      content: "Write to WhatsApp\nfor technical errors.",
    });
    const second = getKnowledgeContentHash({
      title: " Support ",
      category: "support",
      content: "Write   to WhatsApp for technical errors.",
    });

    expect(second).toBe(first);
  });

  it("refreshes embeddings only when text changed or embedding is missing", () => {
    expect(
      shouldRefreshEmbedding({
        previousHash: "same",
        nextHash: "same",
        hasExistingEmbedding: true,
      })
    ).toBe(false);
    expect(
      shouldRefreshEmbedding({
        previousHash: "same",
        nextHash: "next",
        hasExistingEmbedding: true,
      })
    ).toBe(true);
    expect(
      shouldRefreshEmbedding({
        previousHash: "same",
        nextHash: "same",
        hasExistingEmbedding: false,
      })
    ).toBe(true);
  });

  it("moves edited verified knowledge back to human review", () => {
    expect(
      nextStatusAfterEdit({
        previousStatus: "verified",
        previousVerified: true,
        textChanged: true,
        requestedStatus: "verified",
        requestedVerified: true,
      })
    ).toEqual({ status: "review", verified: false });
  });

  it("excludes archived knowledge from published retrieval state", () => {
    const archived = { status: "archived", verified: false };

    expect(isArchivedKnowledge(archived)).toBe(true);
    expect(isPublishedKnowledge(archived)).toBe(false);
    expect(isPublishedKnowledge({ status: "verified", verified: true })).toBe(
      true
    );
  });
});
