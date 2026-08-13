/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDocumentStoragePath,
  DOCUMENT_STORAGE_BUCKET,
} from "@/lib/documents/validation";
import type {
  DocumentExtractionMethod,
  DocumentStatus,
  DocumentType,
  ReceiptStructuredResult,
  ResidentDocumentRecord,
} from "@/lib/documents/types";

export function isMissingDocumentsTable(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };

  return (
    maybeError.code === "PGRST205" ||
    maybeError.code === "42P01" ||
    Boolean(maybeError.message?.includes("resident_documents"))
  );
}

export async function createResidentDocument(params: {
  supabase: SupabaseClient<any>;
  visitorId: string;
  conversationId?: string | null;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileHash: string;
}) {
  const { data, error } = await params.supabase
    .from("resident_documents")
    .insert({
      conversation_id: params.conversationId,
      visitor_id: params.visitorId,
      file_name: params.fileName,
      file_type: params.fileType,
      file_size: params.fileSize,
      file_hash: params.fileHash,
      status: "uploaded",
      document_type: "unknown",
      extraction_method: "none",
      storage_bucket: DOCUMENT_STORAGE_BUCKET,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id as string;
}

export async function uploadResidentDocumentFile(params: {
  supabase: SupabaseClient<any>;
  visitorId: string;
  documentId: string;
  fileHash: string;
  bytes: Uint8Array;
}) {
  const path = buildDocumentStoragePath({
    visitorId: params.visitorId,
    documentId: params.documentId,
    fileHash: params.fileHash,
  });
  const { error } = await params.supabase.storage
    .from(DOCUMENT_STORAGE_BUCKET)
    .upload(path, params.bytes, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return path;
}

export async function updateResidentDocument(params: {
  supabase: SupabaseClient<any>;
  documentId: string;
  patch: Partial<{
    storage_path: string | null;
    status: DocumentStatus;
    document_type: DocumentType;
    extraction_method: DocumentExtractionMethod;
    page_count: number | null;
    extracted_text: string | null;
    structured_result: ReceiptStructuredResult | null;
    warnings: string[];
    error_message: string | null;
    deleted_at: string | null;
  }>;
}) {
  const { error } = await params.supabase
    .from("resident_documents")
    .update({
      ...params.patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.documentId);

  if (error) {
    throw error;
  }
}

export async function loadOwnedResidentDocument(params: {
  supabase: SupabaseClient<any>;
  documentId: string;
  visitorId: string;
}) {
  const { data, error } = await params.supabase
    .from("resident_documents")
    .select(
      "id,conversation_id,visitor_id,file_name,file_type,file_size,storage_bucket,storage_path,file_hash,status,document_type,extraction_method,page_count,extracted_text,structured_result,warnings,error_message,created_at,updated_at,deleted_at"
    )
    .eq("id", params.documentId)
    .eq("visitor_id", params.visitorId)
    .single();

  if (error) {
    if (isMissingDocumentsTable(error)) {
      return null;
    }

    throw error;
  }

  return data as ResidentDocumentRecord;
}

export async function softDeleteOwnedResidentDocument(params: {
  supabase: SupabaseClient<any>;
  documentId: string;
  visitorId: string;
}) {
  const document = await loadOwnedResidentDocument(params);

  if (!document) {
    return false;
  }

  await updateResidentDocument({
    supabase: params.supabase,
    documentId: params.documentId,
    patch: {
      status: "deleted",
      extracted_text: null,
      structured_result: null,
      deleted_at: new Date().toISOString(),
    },
  });

  if (document.storage_path) {
    await params.supabase.storage
      .from(document.storage_bucket ?? DOCUMENT_STORAGE_BUCKET)
      .remove([document.storage_path])
      .catch(() => undefined);
  }

  return true;
}
