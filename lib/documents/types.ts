export type DocumentStatus =
  | "uploaded"
  | "extracting"
  | "ready"
  | "ocr_required"
  | "failed"
  | "deleted";

export type DocumentType =
  | "epd_receipt"
  | "bank_payment_receipt"
  | "application"
  | "statement"
  | "other"
  | "unknown"
  /**
   * Backward-compatible aliases from the Stage 5 MVP.
   * New code should write epd_receipt / bank_payment_receipt.
   */
  | "receipt"
  | "payment_receipt";

export type DocumentExtractionMethod = "native_pdf" | "ocr" | "vision" | "none";

export type DocumentFileKind = "pdf" | "png" | "jpeg";

export type PaymentStatus =
  | "successful"
  | "processing"
  | "failed"
  | "cancelled"
  | "unknown";

export type MoneyAmount = {
  amount?: number;
  currency?: string;
};

export type ReceiptLineItem = {
  supplier?: string;
  service?: string;
  amount?: number;
  previousBalance?: number;
  payment?: number;
  excessPayment?: number;
  currentCharge?: number;
  amountDue?: number;
  debt?: number;
  raw: string;
};

export type BankPaymentReceiptAnalysis = {
  documentType: "bank_payment_receipt" | "payment_receipt";
  bankName?: string;
  paymentStatus: PaymentStatus;
  paymentDate?: string;
  paymentTime?: string;
  amount?: number;
  currency?: string;
  feeAmount?: number;
  recipientName?: string;
  serviceName?: string;
  purpose?: string;
  accountNumber?: string;
  transactionId?: string;
  referenceNumber?: string;
  payerName?: string;
  lineItems?: ReceiptLineItem[];
  extractionConfidence: number;
  missingFields: string[];
  warnings: string[];
};

export type EpdReceiptAnalysis = {
  documentType: "epd_receipt" | "receipt";
  period?: string;
  documentDate?: string;
  formationDate?: string;
  accountNumber?: string;
  address?: string;
  payerName?: string;
  previousBalance?: number;
  balanceDate?: string;
  chargesAmount?: number;
  chargePeriod?: string;
  paymentsShown?: number;
  debtAmount?: number;
  overpaymentAmount?: number;
  totalDue?: number;
  amountDue?: number;
  carriedDebtAmount?: number;
  excessPaymentAmount?: number;
  deferredOverpaymentAmount?: number;
  calculatedAmountDue?: number;
  suppliers: string[];
  services: string[];
  lineItems: ReceiptLineItem[];
  calculationNotes?: string[];
  missingFields: string[];
  warnings: string[];
};

export type UnknownDocumentAnalysis = {
  documentType: Exclude<
    DocumentType,
    "epd_receipt" | "receipt" | "bank_payment_receipt" | "payment_receipt"
  >;
  missingFields: string[];
  warnings: string[];
};

export type ReceiptStructuredResult =
  | EpdReceiptAnalysis
  | BankPaymentReceiptAnalysis
  | UnknownDocumentAnalysis;

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

export type DocumentRelationship =
  | "strong_match"
  | "probable_match"
  | "ambiguous"
  | "no_match";

export type ReconciliationSignal = {
  type:
    | "account_match"
    | "account_mismatch"
    | "amount_match"
    | "amount_only"
    | "partial_payment"
    | "over_payment"
    | "carried_debt"
    | "epd_internal_payment"
    | "deferred_overpayment"
    | "settled_previous_period"
    | "recipient_match"
    | "recipient_missing"
    | "date_available"
    | "status_successful"
    | "status_not_successful";
  severity: "positive" | "warning" | "negative" | "info";
  message: string;
};

export type DocumentSetAnalysis = {
  relationship: DocumentRelationship;
  epd?: EpdReceiptAnalysis;
  payments: BankPaymentReceiptAnalysis[];
  paymentTotal?: number;
  matchedPaymentTotal?: number;
  signals: ReconciliationSignal[];
  timeline: string[];
  missingEvidence: string[];
};

export type DocumentUploadResult = {
  documentId?: string;
  activeDocumentId?: string;
  activeDocumentIds?: string[];
  status: DocumentStatus;
  documentType: DocumentType;
  extractionMethod: DocumentExtractionMethod;
  summary: string;
  suggestedQuestions: string[];
  structuredResult?: ReceiptStructuredResult;
  warnings: string[];
  setupRequired?: boolean;
};
