/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";
import { enforceRateLimit, RATE_LIMIT_POLICIES } from "@/lib/rateLimit";
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
  setupNote?: string;
}) {
  const message = params.setupNote
    ? `${params.summary}\n\n${params.setupNote}`
    : params.summary;

  return {
    documentId: params.documentId,
    activeDocumentId: params.documentId,
    activeDocumentIds: params.documentId ? [params.documentId] : [],
    message,
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

  try {
    conversationId = await getOwnedConversationId(
      getAdminClient(),
      formData.get("conversationId"),
      visitorOwnership.visitorId
    );
  } catch (error) {
    if (!isMissingDocumentsTable(error)) {
      // conversation lookup may fail for unrelated reasons; keep going for analysis
      console.warn("CONVERSATION LOOKUP SKIPPED:", error);
    }
  }

  try {
    documentId = await createResidentDocument({
      supabase: getAdminClient(),
      visitorId: visitorOwnership.visitorId,
      conversationId,
      fileName: typedFile.name,
      fileType: validation.contentType,
      fileSize: typedFile.size,
      fileHash: validation.hash,
    });
  } catch (error) {
    if (isMissingDocumentsTable(error)) {
      persistenceAvailable = false;
    } else {
      throw error;
    }
  }

  try {
    if (persistenceAvailable && documentId) {
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
    }

    const extraction = await extractResidentDocumentText({
      bytes: validation.bytes,
      contentType: validation.contentType,
      fileName: typedFile.name,
    });

    if (extraction.status === "failed") {
      if (persistenceAvailable && documentId) {
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
      }

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

      if (persistenceAvailable && documentId) {
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
      }

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

    if (persistenceAvailable && documentId) {
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

      await saveLegacyReceiptRequest({
        conversationId,
        visitorId: visitorOwnership.visitorId,
        fileName: typedFile.name,
        fileType: validation.contentType,
        fileSize: typedFile.size,
        summary,
      });
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
        setupNote: !persistenceAvailable
          ? "Документ разобран без сохранения: в Supabase ещё не применена миграция resident_documents. Follow-up по документу в чате будет доступен после миграции."
          : undefined,
      })
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось обработать документ.";

    if (persistenceAvailable && documentId) {
      await updateResidentDocument({
        supabase: getAdminClient(),
        documentId,
        patch: {
          status: "failed",
          error_message: message,
        },
      }).catch(() => undefined);
    }

    return jsonResponse({ message }, { status: 500 });
  }
}
