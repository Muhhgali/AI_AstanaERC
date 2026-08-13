export type DocumentStatus =
  | "uploaded"
  | "extracting"
  | "ready"
  | "ocr_required"
  | "failed"
  | "deleted";

export type DocumentType =
  | "receipt"
  | "payment_receipt"
  | "application"
  | "unknown";

export type DocumentExtractionMethod = "native_pdf" | "ocr" | "none";

export type ReceiptLineItem = {
  supplier?: string;
  service?: string;
  amount?: number;
  debt?: number;
  payment?: number;
  raw: string;
};

export type ReceiptStructuredResult = {
  documentType: DocumentType;
  period?: string;
  accountNumber?: string;
  address?: string;
  payerName?: string;
  totalDue?: number;
  previousDebt?: number;
  paymentAmount?: number;
  paymentDate?: string;
  suppliers: string[];
  lineItems: ReceiptLineItem[];
  missingFields: string[];
  warnings: string[];
};

export type ResidentDocumentRecord = {
  id: string;
  conversation_id?: string | null;
  visitor_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_bucket?: string | null;
  storage_path?: string | null;
  file_hash: string;
  status: DocumentStatus;
  document_type: DocumentType;
  extraction_method: DocumentExtractionMethod;
  page_count?: number | null;
  extracted_text?: string | null;
  structured_result?: ReceiptStructuredResult | null;
  warnings?: string[] | null;
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type DocumentUploadResult = {
  documentId?: string;
  status: DocumentStatus;
  documentType: DocumentType;
  extractionMethod: DocumentExtractionMethod;
  summary: string;
  suggestedQuestions: string[];
  structuredResult?: ReceiptStructuredResult;
  warnings: string[];
  setupRequired?: boolean;
};
