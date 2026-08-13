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
import { NativePdfExtractor } from "@/lib/documents/extraction";
import {
  createResidentDocument,
  isMissingDocumentsTable,
  updateResidentDocument,
  uploadResidentDocumentFile,
} from "@/lib/documents/repository";
import { validatePdfFile } from "@/lib/documents/validation";
import type { ChatLanguage } from "@/lib/types";

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
        "Қандай сома төлеу керек?",
      ]
    : [
        "Какой период указан?",
        "Где здесь долг?",
        "Почему такая сумма?",
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
  const validation = await validatePdfFile(file);

  if (!validation.ok) {
    return jsonResponse({ message: validation.message }, { status: 400 });
  }

  const typedFile = file as File;
  const conversationId = await getOwnedConversationId(
    getAdminClient(),
    formData.get("conversationId"),
    visitorOwnership.visitorId
  );

  let documentId: string | undefined;

  try {
    documentId = await createResidentDocument({
      supabase: getAdminClient(),
      visitorId: visitorOwnership.visitorId,
      conversationId,
      fileName: typedFile.name,
      fileType: typedFile.type,
      fileSize: typedFile.size,
      fileHash: validation.hash,
    });
  } catch (error) {
    if (isMissingDocumentsTable(error)) {
      return jsonResponse({
        message:
          "Документ принят, но Stage 5 таблица resident_documents ещё не применена в Supabase. Администратору нужно выполнить миграцию Document Intelligence.",
        source: "document-setup-required",
        setupRequired: true,
      });
    }

    throw error;
  }

  try {
    const storagePath = await uploadResidentDocumentFile({
      supabase: getAdminClient(),
      visitorId: visitorOwnership.visitorId,
      documentId,
      fileHash: validation.hash,
      bytes: validation.bytes,
    });
    await updateResidentDocument({
      supabase: getAdminClient(),
      documentId,
      patch: {
        storage_path: storagePath,
        status: "extracting",
      },
    });

    const extraction = await new NativePdfExtractor().extract(validation.bytes);

    if (extraction.status === "failed") {
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

      return jsonResponse(
        {
          documentId,
          message: extraction.errorMessage,
          source: "document-analysis",
          status: "failed",
          suggestedQuestions: [],
        },
        { status: 400 }
      );
    }

    if (extraction.status === "ocr_required") {
      const summary = buildReceiptSummary(
        {
          documentType: "unknown",
          suppliers: [],
          lineItems: [],
          missingFields: ["text"],
          warnings: extraction.warnings,
        },
        "ocr_required"
      );

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

      return jsonResponse({
        documentId,
        message: summary,
        source: "document-analysis",
        status: "ocr_required",
        suggestedQuestions: [],
      });
    }

    const structured = extractReceiptStructuredData(extraction.text);
    const documentType = classifyDocument(extraction.text);
    structured.documentType = documentType;
    const summary = buildReceiptSummary(structured, "ready");

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
      fileType: typedFile.type,
      fileSize: typedFile.size,
      summary,
    });

    return jsonResponse({
      documentId,
      activeDocumentId: documentId,
      message: summary,
      source: "document-analysis",
      status: "ready",
      documentType,
      structuredResult: structured,
      suggestedQuestions: suggestedQuestions(language),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Не удалось обработать PDF-квитанцию.";

    if (documentId) {
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
