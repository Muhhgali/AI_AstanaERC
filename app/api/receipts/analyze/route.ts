/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";
import { enforceRateLimit, consumeRateLimit, RATE_LIMIT_POLICIES } from "@/lib/rateLimit";
import {
  getOrCreateVisitorOwnership,
  getOwnedConversationId,
  jsonWithVisitorOwnership,
} from "@/lib/security/visitorOwnership";
import {
  buildReceiptSummary,
  classifyDocument,
  extractReceiptStructuredData,
} from "@/lib/documents/receiptExtraction";
import { extractResidentDocumentText } from "@/lib/documents/extraction";
import {
  createResidentDocument,
  isMissingDocumentsTable,
  updateResidentDocument,
  uploadResidentDocumentFile,
} from "@/lib/documents/repository";
import { validateResidentDocumentFile } from "@/lib/documents/validation";
import type { ChatLanguage } from "@/lib/types";
import type { DocumentExtractionResult } from "@/lib/documents/extraction";
import type { ReceiptStructuredResult } from "@/lib/documents/types";

// Vision OCR of a scan or photo can take 10-30 seconds.
export const maxDuration = 60;

let adminClient: ReturnType<typeof createClient<any>> | null = null;

function getAdminClient() {
  const supabaseUrl = getSupabaseProjectUrl();

  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  adminClient ??= createClient<any>(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  return adminClient;
}

function normalizeLanguage(value: FormDataEntryValue | null): ChatLanguage {
  return value === "kk" ? "kk" : "ru";
}

function suggestedQuestions(language: ChatLanguage) {
  return language === "kk"
    ? [
        "Қай кезең көрсетілген?",
        "Қарыз қай жерде?",
        "Төлем неге әлі қарыз болып тұр?",
      ]
    : [
        "Какой период указан?",
        "Где здесь долг?",
        "Почему долг, если оплатил?",
      ];
}

async function saveLegacyReceiptRequest(params: {
  conversationId: string | null;
  visitorId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  summary: string;
}) {
  const { error } = await getAdminClient()
    .from("receipt_analysis_requests")
    .insert({
      conversation_id: params.conversationId,
      visitor_id: params.visitorId,
      file_name: params.fileName,
      file_type: params.fileType,
      file_size: params.fileSize,
      status: "done",
      analysis_summary: params.summary,
    });

  if (error && !error.message?.includes("receipt_analysis_requests")) {
    console.warn("LEGACY RECEIPT REQUEST SAVE SKIPPED:", error);
  }
}

function buildAnalysisPayload(params: {
  extraction: Extract<DocumentExtractionResult, { status: "ready" }>;
  structured: ReceiptStructuredResult;
  documentType: ReturnType<typeof classifyDocument>;
  summary: string;
  language: ChatLanguage;
  documentId?: string;
  setupRequired?: boolean;
}) {
  return {
    documentId: params.documentId,
    activeDocumentId: params.documentId,
    activeDocumentIds: params.documentId ? [params.documentId] : [],
    message: params.summary,
    source: params.setupRequired
      ? "document-analysis-ephemeral"
      : "document-analysis",
    status: "ready" as const,
    documentType: params.documentType,
    structuredResult: params.structured,
    extractionMethod: params.extraction.method,
    suggestedQuestions: suggestedQuestions(params.language),
    setupRequired: params.setupRequired,
  };
}

export async function POST(req: Request) {
  const visitorOwnership = getOrCreateVisitorOwnership(req);
  const jsonResponse = (body: unknown, init?: ResponseInit) =>
    jsonWithVisitorOwnership(body, visitorOwnership, init);
  const rateLimited = enforceRateLimit(
    req,
    RATE_LIMIT_POLICIES.documentAnalysis
  );

  if (rateLimited) {
    if (visitorOwnership.cookieHeader) {
      rateLimited.headers.append("Set-Cookie", visitorOwnership.cookieHeader);
    }

    return rateLimited;
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const language = normalizeLanguage(formData.get("language"));
  const validation = await validateResidentDocumentFile(file);

  if (!validation.ok) {
    return jsonResponse({ message: validation.message }, { status: 400 });
  }

  const typedFile = file as File;
  let conversationId: string | null = null;
  let documentId: string | undefined;
  let persistenceAvailable = true;

  // Saving the document is best effort. A missing table, bucket, outdated
  // check constraint or Supabase outage must not cost the resident the
  // analysis: the client keeps an in-browser copy for follow-up questions.
  const persist = async (step: string, action: () => Promise<unknown>) => {
    if (!persistenceAvailable) {
      return;
    }

    try {
      await action();
    } catch (error) {
      persistenceAvailable = false;
      documentId = undefined;

      if (!isMissingDocumentsTable(error)) {
        console.warn(`RESIDENT DOCUMENT ${step} SKIPPED:`, error);
      }
    }
  };

  try {
    conversationId = await getOwnedConversationId(
      getAdminClient(),
      formData.get("conversationId"),
      visitorOwnership.visitorId
    );
  } catch (error) {
    console.warn("CONVERSATION LOOKUP SKIPPED:", error);
  }

  await persist("CREATE", async () => {
    documentId = await createResidentDocument({
      supabase: getAdminClient(),
      visitorId: visitorOwnership.visitorId,
      conversationId,
      fileName: typedFile.name,
      fileType: validation.contentType,
      fileSize: typedFile.size,
      fileHash: validation.hash,
    });
  });

  await persist("UPLOAD", async () => {
    if (!documentId) {
      return;
    }

    const storagePath = await uploadResidentDocumentFile({
      supabase: getAdminClient(),
      visitorId: visitorOwnership.visitorId,
      documentId,
      fileHash: validation.hash,
      bytes: validation.bytes,
      contentType: validation.contentType,
      extension: validation.extension,
    });

    await updateResidentDocument({
      supabase: getAdminClient(),
      documentId,
      patch: {
        storage_path: storagePath,
        status: "extracting",
      },
    });
  });

  try {
    const extraction = await extractResidentDocumentText(
      {
        bytes: validation.bytes,
        contentType: validation.contentType,
        fileName: typedFile.name,
      },
      {
        allowOcr: () => {
          const ocrLimit = consumeRateLimit(req, RATE_LIMIT_POLICIES.documentOcr);
          return "bypassed" in ocrLimit || ocrLimit.allowed;
        },
      }
    );

    if (extraction.status === "failed") {
      await persist("FAILED STATUS", async () => {
        if (!documentId) {
          return;
        }

        await updateResidentDocument({
          supabase: getAdminClient(),
          documentId,
          patch: {
            status: "failed",
            extraction_method: extraction.method,
            page_count: extraction.pageCount,
            warnings: extraction.warnings,
            error_message: extraction.errorMessage,
          },
        });
      });

      return jsonResponse(
        {
          documentId,
          message: extraction.errorMessage,
          source: "document-analysis",
          status: "failed",
          suggestedQuestions: [],
          setupRequired: !persistenceAvailable,
        },
        { status: 400 }
      );
    }

    if (extraction.status === "ocr_required") {
      const summary = buildReceiptSummary(
        {
          documentType: "unknown",
          missingFields: ["text"],
          warnings: extraction.warnings,
        },
        "ocr_required"
      );

      await persist("OCR STATUS", async () => {
        if (!documentId) {
          return;
        }

        await updateResidentDocument({
          supabase: getAdminClient(),
          documentId,
          patch: {
            status: "ocr_required",
            extraction_method: "none",
            page_count: extraction.pageCount,
            warnings: extraction.warnings,
            error_message: "OCR_REQUIRED",
          },
        });
      });

      return jsonResponse({
        documentId,
        activeDocumentId: documentId,
        activeDocumentIds: documentId ? [documentId] : [],
        message: summary,
        source: "document-analysis",
        status: "ocr_required",
        suggestedQuestions: [],
        setupRequired: !persistenceAvailable,
      });
    }

    const structured = extractReceiptStructuredData(extraction.text);
    const documentType = classifyDocument(extraction.text);
    const summary = buildReceiptSummary(structured, "ready");

    await persist("READY STATUS", async () => {
      if (!documentId) {
        return;
      }

      // Throws on an outdated document_type check constraint; see
      // supabase/migrations/20261020000000_resident_documents_types.sql.
      await updateResidentDocument({
        supabase: getAdminClient(),
        documentId,
        patch: {
          status: "ready",
          document_type: documentType,
          extraction_method: extraction.method,
          page_count: extraction.pageCount,
          extracted_text: extraction.text.slice(0, 30_000),
          structured_result: structured,
          warnings: [...extraction.warnings, ...structured.warnings],
        },
      });
    });

    if (persistenceAvailable) {
      await saveLegacyReceiptRequest({
        conversationId,
        visitorId: visitorOwnership.visitorId,
        fileName: typedFile.name,
        fileType: validation.contentType,
        fileSize: typedFile.size,
        summary,
      }).catch((error) => console.warn("LEGACY RECEIPT REQUEST SAVE SKIPPED:", error));
    }

    return jsonResponse(
      buildAnalysisPayload({
        extraction,
        structured,
        documentType,
        summary,
        language,
        documentId,
        setupRequired: !persistenceAvailable,
      })
    );
  } catch (error) {
    console.error("RESIDENT DOCUMENT ANALYSIS FAILED:", error);

    if (persistenceAvailable && documentId) {
      await updateResidentDocument({
        supabase: getAdminClient(),
        documentId,
        patch: {
          status: "failed",
          error_message:
            error instanceof Error ? error.message.slice(0, 500) : "analysis failed",
        },
      }).catch(() => undefined);
    }

    return jsonResponse(
      {
        message:
          language === "kk"
            ? "Құжатты өңдеу мүмкін болмады. Қайталап көріңіз немесе анығырақ фото не PDF жүктеңіз."
            : "Не удалось обработать документ. Попробуйте ещё раз или загрузите более чёткое фото или PDF.",
        status: "failed",
      },
      { status: 500 }
    );
  }
}
