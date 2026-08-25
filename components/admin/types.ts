export type AdminPrimaryNav =
  | "command"
  | "knowledge"
  | "dialogs"
  | "review"
  | "analytics"
  | "settings";

export type AdminWorkspaceTab =
  | "dashboard"
  | "knowledge"
  | "review"
  | "history"
  | "requests"
  | "suppliers"
  | "ai-tests"
  | "learning"
  | "manager-workspace"
  | "analytics";

export type KnowledgeStatus = "draft" | "review" | "verified" | "archived";

export type KnowledgeListItem = {
  id: string;
  title: string;
  category: string;
  content: string;
  language?: "ru" | "kk";
  status?: KnowledgeStatus;
  priority: number;
  verified: boolean;
  source: string | null;
  reviewed_at?: string | null;
  archived_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  content_hash?: string | null;
};

export type KnowledgeFormState = {
  id?: string;
  title: string;
  category: string;
  content: string;
  language: "ru" | "kk";
  status: KnowledgeStatus;
  priority: number;
  verified: boolean;
  source: string;
};

export type AdminHistoryMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  source: string | null;
  feedback: "up" | "down" | null;
  created_at: string;
};

export type AdminHistoryConversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: AdminHistoryMessage[];
};

export type AdminKnowledgeGap = {
  id: string;
  topic: string;
  user_question: string;
  assistant_answer: string | null;
  reason: string;
  status: "open" | "resolved";
  created_at: string;
};

export type AdminNotification = {
  id: string;
  title: string;
  hint: string;
  tone: "review" | "gap" | "alert" | "request";
  onOpen: () => void;
};
