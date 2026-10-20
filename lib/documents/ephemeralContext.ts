import type {
  DocumentExtractionMethod,
  DocumentType,
  ReceiptStructuredResult,
  ResidentDocumentRecord,
} from "@/lib/documents/types";

export const MAX_EPHEMERAL_DOCUMENT_CONTEXTS = 4;
export const MAX_EPHEMERAL_CONTEXT_CHARS = 12_000;

export type EphemeralDocumentContext = {
  clientId: string;
  fileName: string;
  documentType: DocumentType;
  extractionMethod: DocumentExtractionMethod;
  structuredResult: ReceiptStructuredResult;
  status?: "ready" | "ocr_required" | "failed";
  warnings?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDocumentType(value: unknown): value is DocumentType {
  return (
    value === "epd_receipt" ||
    value === "bank_payment_receipt" ||
    value === "application" ||
    value === "statement" ||
    value === "other" ||
    value === "unknown" ||
    value === "receipt" ||
    value === "payment_receipt"
  );
}

function isExtractionMethod(value: unknown): value is DocumentExtractionMethod {
  return (
    value === "native_pdf" ||
    value === "ocr" ||
    value === "vision" ||
    value === "none"
  );
}

function estimateContextSize(context: EphemeralDocumentContext) {
  return JSON.stringify(context).length;
}

export function parseEphemeralDocumentContexts(
  value: unknown
): EphemeralDocumentContext[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed: EphemeralDocumentContext[] = [];

  for (const item of value.slice(0, MAX_EPHEMERAL_DOCUMENT_CONTEXTS)) {
    if (!isRecord(item)) {
      continue;
    }

    const clientId =
      typeof item.clientId === "string" && item.clientId.trim()
        ? item.clientId.trim().slice(0, 80)
        : null;
    const fileName =
      typeof item.fileName === "string" && item.fileName.trim()
        ? item.fileName.trim().slice(0, 180)
        : null;
    const structuredResult = item.structuredResult;
    const documentType = item.documentType;
    const extractionMethod = item.extractionMethod ?? "none";

    if (
      !clientId ||
      !fileName ||
      !isDocumentType(documentType) ||
      !isExtractionMethod(extractionMethod) ||
      !isRecord(structuredResult)
    ) {
      continue;
    }

    const context: EphemeralDocumentContext = {
      clientId,
      fileName,
      documentType,
      extractionMethod,
      structuredResult: structuredResult as ReceiptStructuredResult,
      status:
        item.status === "ocr_required" || item.status === "failed"
          ? item.status
          : "ready",
      warnings: Array.isArray(item.warnings)
        ? item.warnings
            .filter((entry): entry is string => typeof entry === "string")
            .slice(0, 12)
        : undefined,
    };

    if (estimateContextSize(context) > MAX_EPHEMERAL_CONTEXT_CHARS) {
      continue;
    }

    parsed.push(context);
  }

  return parsed;
}

export function ephemeralContextsToDocuments(
  contexts: EphemeralDocumentContext[]
): ResidentDocumentRecord[] {
  return contexts
    .filter((context) => context.status !== "failed")
    .map((context, index) => ({
      id: `00000000-0000-4000-8000-${String(100000000000 + index).slice(-12)}`,
      visitor_id: "ephemeral",
      file_name: context.fileName,
      file_type: "application/octet-stream",
      file_size: 0,
      file_hash: context.clientId,
      status: context.status === "ocr_required" ? "ocr_required" : "ready",
      document_type: context.documentType,
      extraction_method: context.extractionMethod,
      structured_result: context.structuredResult,
      warnings: context.warnings ?? null,
    }));
}
