/**
 * Centralized type definitions for the entire application
 * This file consolidates all shared types to avoid duplication
 */

// ============================================================================
// Chat & Messaging Types
// ============================================================================

export type ChatLanguage = "ru" | "kk";

export type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  source?: string;
  feedback?: "up" | "down";
  supplierCard?: SupplierManagerCard;
  meterCorrectionForm?: MeterCorrectionForm;
  suggestedQuestions?: string[];
  supportCard?: SupportCard;
  appealForm?: boolean;
  appointmentForm?: boolean;
  operatorHandoff?: OperatorHandoff;
};

export type ChatResponse = {
  message?: string;
  source?: string;
  conversationId?: string;
  messageId?: string;
  supplierCard?: SupplierManagerCard;
  meterCorrectionForm?: MeterCorrectionForm;
  suggestedQuestions?: string[];
  supportCard?: SupportCard;
  appealForm?: boolean;
  appointmentForm?: boolean;
  operatorHandoff?: OperatorHandoff;
};

export type ChatBodyMessage = {
  role?: "user" | "assistant";
  content?: string;
};

export type HistoryMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  source?: string;
  feedback?: "up" | "down";
  created_at?: string;
};

export type HistoryConversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: HistoryMessage[];
};

export type StoredConversationSummary = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
};

export type CachedChatAnswer = {
  message: string;
  source: string;
  category?: string | null;
  supportCard?: SupportCard;
  createdAt: number;
};

export type SmallTalkIntent = "greeting" | "thanks" | "goodbye" | "capabilities";

export type KnowledgeGapReason = "no-match" | "weak-match" | "unverified-match" | "gpt-answer";

// ============================================================================
// Support & Support Card Types
// ============================================================================

export type SupportCard = {
  title: string;
  description: string;
  contactLabel: string;
  contactValue: string;
  note?: string;
  href?: string;
};

export type OperatorHandoff = {
  id: string;
  status: string;
  created_at: string;
};

// ============================================================================
// Supplier & Manager Types
// ============================================================================

export type SupplierManagerCard = {
  supplierName: string;
  bin: string;
  managerName: string;
  managerRole: string;
  phone: string;
  email: string;
  managerPhone?: string;
  managerEmail?: string;
  supplierPhone?: string;
  supplierEmail?: string;
  photoUrl?: string;
};

export type SupplierItem = {
  id: string;
  bin: string;
  name: string;
  manager_name: string;
  manager_role: string;
  manager_phone: string;
  manager_email: string;
  manager_photo_url?: string;
  supplier_phone?: string;
  supplier_email?: string;
  service_types: string[];
  created_at: string;
  updated_at: string;
};

export type SupplierPayload = Partial<SupplierItem> & {
  bin: string;
};

export type SupplierManagerGroup = {
  id: string;
  name: string;
  bin: string;
};

// ============================================================================
// Meter Correction Types
// ============================================================================

export type MeterCorrectionValues = {
  accountNumber?: string;
  serviceType?: string;
  meterNumber?: string;
  correctReading?: string;
  contact?: string;
  comment?: string;
};

export type MeterCorrectionServiceOption = {
  value: string;
  label: string;
  provider: string;
};

export type MeterCorrectionForm = {
  values?: MeterCorrectionValues;
  serviceOptions: MeterCorrectionServiceOption[];
};

export type MeterCorrectionRequest = {
  id: string;
  created_at: string;
  updated_at: string;
  account_number: string;
  service_type: string;
  meter_number: string;
  correct_reading: string;
  contact: string;
  comment?: string;
  status: string;
  conversation_id?: string;
};

export type MeterCorrectionFormPayload = {
  account_number?: string;
  service_type?: string;
  meter_number?: string;
  correct_reading?: string;
  contact?: string;
  comment?: string;
};

// ============================================================================
// Request Types
// ============================================================================

export type RequestStatusItem = {
  id: string;
  type: "meter" | "appeal" | "appointment";
  title: string;
  detail?: string;
  status: string;
  conversationId?: string;
  createdAt: string;
  updatedAt?: string;
  time?: string;
};

export type RequestType = "meter" | "appeal" | "appointment";

export type RequestCategory = "meter" | "appeal" | "appointment";

export type RequestStatusFilter = "open" | "new" | "active" | "closed" | "all";

// ============================================================================
// Appeal Types
// ============================================================================

export type AppealRequestValues = {
  name: string;
  topic: string;
  message: string;
  contact: string;
  files: File[];
};

export type AppealRequest = {
  id: string;
  created_at: string;
  updated_at: string;
  topic: string;
  message: string;
  contact: string;
  status: string;
  conversation_id?: string;
  author_name?: string;
};

export type AppealAttachment = {
  name: string;
  path: string;
  size: number;
  content_type: string;
  created_at: string;
};

export type AppealRequestRow = {
  id: string;
  topic: string;
  message: string;
  contact: string;
  created_at: string;
  updated_at: string;
  status: string;
  conversation_id?: string;
  author_name?: string;
};

// ============================================================================
// Appointment Types
// ============================================================================

export type AppointmentRequestValues = {
  firstName: string;
  lastName: string;
  leader: "general_director" | "deputy_director";
  date: string;
  phone: string;
  email: string;
};

export type LeadershipAppointment = {
  id: string;
  created_at: string;
  updated_at: string;
  leader: "general_director" | "deputy_director";
  date: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  status: string;
  conversation_id?: string;
};

// ============================================================================
// Knowledge & FAQ Types
// ============================================================================

export type KnowledgeItem = {
  id: string;
  question: string;
  answer: string;
  category?: string;
  language: ChatLanguage;
  verified: boolean;
  created_at: string;
  updated_at: string;
};

export type KnowledgePayload = {
  question: string;
  answer: string;
  category?: string;
  language?: ChatLanguage;
  verified?: boolean;
};

export type KnowledgeGap = {
  id: string;
  question: string;
  source?: KnowledgeGapReason;
  category?: string;
  verified: boolean;
  created_at: string;
};

export type KnowledgeForm = {
  question: string;
  answer: string;
  category?: string;
  verified: boolean;
};

// ============================================================================
// History & Admin Types
// ============================================================================

export type HistoryFilter = "needs_review" | "helpful" | "unrated" | "all";

export type ChatConversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: HistoryMessage[];
};

export type DashboardFeedbackItem = {
  id: string;
  feedback: "up" | "down";
  message_id: string;
  conversation_id: string;
  created_at: string;
};

export type DashboardData = {
  totalConversations: number;
  totalMessages: number;
  helpfulCount: number;
  unhelpfulCount: number;
  knowledgeGaps: KnowledgeGap[];
  recentFeedback: DashboardFeedbackItem[];
};

// ============================================================================
// Speech Recognition Types (Browser API)
// ============================================================================

export type SpeechRecognitionResult = {
  readonly isFinal: boolean;
  readonly [index: number]: {
    readonly transcript: string;
  };
};

export type SpeechRecognitionEvent = Event & {
  readonly results: {
    readonly length: number;
    readonly [index: number]: SpeechRecognitionResult;
  };
};

export type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

export type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

// ============================================================================
// API Error Response Type
// ============================================================================

export type ApiErrorResponse = {
  error: string;
  message?: string;
  details?: unknown;
};

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
