"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  ClipboardList,
  DatabaseZap,
  FileCheck2,
  ListChecks,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { supabase } from "@/lib/supabaseClient";

type KnowledgeItem = {
  id: string;
  title: string;
  category: string;
  content: string;
  priority: number;
  verified: boolean;
  source: string | null;
};

type KnowledgeForm = {
  id?: string;
  title: string;
  category: string;
  content: string;
  priority: number;
  verified: boolean;
  source: string;
};

type HistoryMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  source: string | null;
  feedback: "up" | "down" | null;
  created_at: string;
};

type HistoryConversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: HistoryMessage[];
};

type KnowledgeGap = {
  id: string;
  conversation_id: string | null;
  assistant_message_id: string | null;
  topic: string;
  user_question: string;
  assistant_answer: string | null;
  reason: string;
  status: "open" | "resolved";
  top_similarity: number | null;
  created_at: string;
  resolved_at: string | null;
};

type MeterCorrectionRequest = {
  id: string;
  request_number: string;
  account_number: string;
  meter_number: string;
  correct_reading: string;
  contact: string;
  service_type: string | null;
  comment: string | null;
  reason: string | null;
  status: "new" | "in_progress" | "done" | "rejected";
  created_at: string;
  updated_at: string;
};

type AppealRequest = {
  id: string;
  name: string;
  topic: string;
  message: string;
  contact: string | null;
  attachments:
    | {
        name: string;
        path?: string;
        url?: string;
        size: number;
        type: string;
      }[]
    | null;
  status: "new" | "in_progress" | "done" | "rejected";
  created_at: string;
  updated_at: string;
};

type LeadershipAppointment = {
  id: string;
  first_name: string;
  last_name: string;
  leader_key: "general_director" | "deputy_director";
  leader_title: string;
  leader_name: string;
  appointment_date: string;
  appointment_time: string;
  phone: string | null;
  email: string | null;
  status: "new" | "confirmed" | "done" | "cancelled";
  created_at: string;
  updated_at: string;
};

type RequestCategory = "meter" | "appeal" | "appointment";
type RequestStatusFilter = "open" | "new" | "active" | "closed" | "all";

type SupplierItem = {
  supplierCode: number;
  supplierName: string;
  bin: string;
  contract: string;
  address: string;
  district: string;
  chairPhone: string;
  chairName: string;
  supplierCategory: string;
  managerName: string;
  managerPhotoUrl?: string;
  managerPhone?: string;
  managerEmail?: string;
  supplierEmail: string;
  settlementType: string;
};

type SupplierManagerGroup = {
  managerName: string;
  managerPhotoUrl?: string;
  managerPhone?: string;
  managerEmail?: string;
  supplierCount: number;
  categories: { category: string; count: number }[];
  suppliers: SupplierItem[];
};

type OperatorHandoff = {
  id: string;
  conversation_id: string | null;
  visitor_id: string | null;
  user_message: string;
  reason: string;
  status: "new" | "in_progress" | "done" | "cancelled";
  priority: number;
  created_at: string;
  updated_at: string;
};

type DashboardFeedbackItem = {
  id: string;
  conversation_id: string;
  conversationTitle: string;
  content: string;
  source: string | null;
  feedback: "down";
  created_at: string;
};

type DashboardData = {
  overview: {
    knowledgeTotal: number;
    knowledgeVerified: number;
    conversations: number;
    messages: number;
    feedbackUp: number;
    feedbackDown: number;
    gapsOpen: number;
    requestsNew: number;
    requestsActive: number;
    receiptsNew: number;
    handoffsOpen: number;
  };
  queues: {
    handoffs: OperatorHandoff[];
    gaps: KnowledgeGap[];
    downFeedback: DashboardFeedbackItem[];
  };
  insights: string[];
  setupRequired?: boolean;
  setupMessage?: string;
};

type Category = {
  id: string;
  label: string;
  hint: string;
  aliases: string[];
};

const CATEGORIES: Category[] = [
  {
    id: "payments",
    label: "Оплата",
    hint: "Kaspi, банки, сроки, ошибочные платежи",
    aliases: ["payments", "payment"],
  },
  {
    id: "meters",
    label: "Показания",
    hint: "Счетчики воды, света, газа",
    aliases: ["meters", "meter"],
  },
  {
    id: "receipts",
    label: "Квитанции",
    hint: "ЕПД, доставка, дубликаты, email",
    aliases: ["receipts", "receipt", "epd"],
  },
  {
    id: "accounts",
    label: "Лицевой счет",
    hint: "Владелец, данные, количество проживающих",
    aliases: ["accounts", "account"],
  },
  {
    id: "billing",
    label: "Начисления",
    hint: "Перерасчет, долг, ошибки начислений",
    aliases: ["billing", "charges"],
  },
  {
    id: "support",
    label: "Поддержка",
    hint: "Контакты, адрес, график, обращения",
    aliases: ["support", "company"],
  },
  {
    id: "services",
    label: "Онлайн-сервисы",
    hint: "Сайт, личный кабинет, Telegram",
    aliases: ["services", "service"],
  },
];

const EMPTY_FORM: KnowledgeForm = {
  title: "",
  category: "support",
  content: "",
  priority: 100,
  verified: true,
  source: "admin",
};

const TEMPLATES = [
  {
    label: "Способ оплаты",
    category: "payments",
    title: "Оплата",
    content: "Пользователь может оплатить ",
  },
  {
    label: "Передача показаний",
    category: "meters",
    title: "Передача показаний",
    content: "Показания можно передать ",
  },
  {
    label: "Контакты",
    category: "support",
    title: "Контакты поддержки",
    content: "По этому вопросу пользователь может обратиться ",
  },
  {
    label: "Квитанция",
    category: "receipts",
    title: "ЕПД и квитанция",
    content: "ЕПД ",
  },
  {
    label: "Перерасчет",
    category: "billing",
    title: "Перерасчет начислений",
    content: "Для перерасчета ",
  },
  {
    label: "Личный кабинет",
    category: "services",
    title: "Личный кабинет",
    content: "В личном кабинете пользователь может ",
  },
];

function getCategory(category: string) {
  const normalized = category.toLowerCase();

  return (
    CATEGORIES.find((item) => item.aliases.includes(normalized)) ??
    CATEGORIES.find((item) => item.id === normalized) ??
    CATEGORIES[CATEGORIES.length - 1]
  );
}

function getCategoryLabel(category: string) {
  return getCategory(category).label;
}

function getCategoryId(category: string) {
  return getCategory(category).id;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function statusLabel(status: string) {
  if (status === "new") return "Новая";
  if (status === "in_progress") return "Принято";
  if (status === "confirmed") return "Подтверждена";
  if (status === "done") return "Закрыта";
  if (status === "rejected") return "Отклонена";
  if (status === "cancelled") return "Отменена";
  return status;
}

function statusClassName(status: string) {
  if (status === "new") return "bg-blue-50 text-blue-700";
  if (status === "in_progress" || status === "confirmed") {
    return "bg-amber-50 text-amber-700";
  }
  if (status === "done") return "bg-emerald-50 text-emerald-700";
  if (status === "rejected" || status === "cancelled") {
    return "bg-red-50 text-red-700";
  }
  return "bg-neutral-100 text-neutral-600";
}

function feedbackLabel(feedback: HistoryMessage["feedback"]) {
  if (feedback === "up") return "Полезно";
  if (feedback === "down") return "Не помогло";
  return "Без оценки";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function requestMatchesStatus(
  status: string,
  filter: RequestStatusFilter,
  category: RequestCategory
) {
  if (filter === "all") {
    return true;
  }

  if (filter === "new") {
    return status === "new";
  }

  if (filter === "active") {
    return category === "appointment"
      ? status === "confirmed"
      : status === "in_progress";
  }

  if (filter === "closed") {
    return status === "done" || status === "rejected" || status === "cancelled";
  }

  return category === "appointment"
    ? status === "new" || status === "confirmed"
    : status === "new" || status === "in_progress";
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<
    | "dashboard"
    | "knowledge"
    | "review"
    | "history"
    | "requests"
    | "suppliers"
  >("dashboard");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [history, setHistory] = useState<HistoryConversation[]>([]);
  const [knowledgeGaps, setKnowledgeGaps] = useState<KnowledgeGap[]>([]);
  const [meterCorrections, setMeterCorrections] = useState<
    MeterCorrectionRequest[]
  >([]);
  const [appealRequests, setAppealRequests] = useState<AppealRequest[]>([]);
  const [leadershipAppointments, setLeadershipAppointments] = useState<
    LeadershipAppointment[]
  >([]);
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [supplierManagers, setSupplierManagers] = useState<
    SupplierManagerGroup[]
  >([]);
  const [gapSetupRequired, setGapSetupRequired] = useState(false);
  const [activeGapId, setActiveGapId] = useState<string | null>(null);
  const [form, setForm] = useState<KnowledgeForm>(EMPTY_FORM);
  const [reviewForm, setReviewForm] = useState<KnowledgeForm | null>(null);
  const [query, setQuery] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierCodeQuery, setSupplierCodeQuery] = useState("");
  const [activeSupplierManager, setActiveSupplierManager] = useState("all");
  const [supplierForm, setSupplierForm] = useState<SupplierItem | null>(null);
  const [supplierOriginalCode, setSupplierOriginalCode] = useState<
    number | null
  >(null);
  const [managerForm, setManagerForm] = useState<{
    originalManagerName: string;
    managerName: string;
    managerPhotoUrl: string;
    managerPhone: string;
    managerEmail: string;
  } | null>(null);
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeRequestCategory, setActiveRequestCategory] =
    useState<RequestCategory>("meter");
  const [activeRequestStatus, setActiveRequestStatus] =
    useState<RequestStatusFilter>("open");
  const [reviewIndex, setReviewIndex] = useState(0);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [managerSaving, setManagerSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token ?? null;
  }, []);

  const apiRequest = useCallback(
    async <T,>(url: string, init?: RequestInit) => {
      const token = await getAccessToken();

      if (!token) {
        router.push("/login");
        throw new Error("Нужно войти в админку");
      }

      const res = await fetch(url, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...init?.headers,
        },
      });

      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
      } & T;

      if (!res.ok) {
        if (res.status === 401) {
          await supabase.auth.signOut();
          router.push("/login?reason=session");
          throw new Error(
            "Сессия не прошла проверку. Войди заново или проверь Supabase env-переменные на Vercel."
          );
        }

        throw new Error(data.message ?? "Не удалось выполнить запрос");
      }

      return data;
    },
    [getAccessToken, router]
  );

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setError("");

    try {
      const data = await apiRequest<DashboardData>("/api/admin/dashboard");
      setDashboard(data);

      if (data.setupMessage) {
        setError(data.setupMessage);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Не удалось загрузить обзор";
      setError(message);
    } finally {
      setDashboardLoading(false);
    }
  }, [apiRequest]);

  const loadKnowledge = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest<{ items: KnowledgeItem[] }>(
        "/api/admin/knowledge"
      );
      setItems(data.items);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Не удалось загрузить базу";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setError("");

    try {
      const data = await apiRequest<{
        conversations: HistoryConversation[];
        knowledgeGaps?: KnowledgeGap[];
        gapSetupRequired?: boolean;
      }>("/api/admin/history?limit=80");
      setHistory(data.conversations);
      setKnowledgeGaps(data.knowledgeGaps ?? []);
      setGapSetupRequired(Boolean(data.gapSetupRequired));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Не удалось загрузить историю";
      setError(message);
    } finally {
      setHistoryLoading(false);
    }
  }, [apiRequest]);

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    setError("");

    try {
      const data = await apiRequest<{
        meterCorrections: MeterCorrectionRequest[];
        appeals: AppealRequest[];
        appointments: LeadershipAppointment[];
        setupRequired?: boolean;
        setupMessage?: string;
      }>("/api/admin/requests");
      setMeterCorrections(data.meterCorrections);
      setAppealRequests(data.appeals);
      setLeadershipAppointments(data.appointments);

      if (data.setupMessage) {
        setError(data.setupMessage);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Не удалось загрузить заявки";
      setError(message);
    } finally {
      setRequestsLoading(false);
    }
  }, [apiRequest]);

  const loadSuppliers = useCallback(async () => {
    setSuppliersLoading(true);
    setError("");

    try {
      const data = await apiRequest<{
        suppliers: SupplierItem[];
        managers: SupplierManagerGroup[];
      }>("/api/admin/suppliers");
      setSuppliers(data.suppliers);
      setSupplierManagers(data.managers);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Не удалось загрузить поставщиков";
      setError(message);
    } finally {
      setSuppliersLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      await loadDashboard();
      await loadKnowledge();
      await loadHistory();
      await loadRequests();
      await loadSuppliers();
    };

    void checkUser();
  }, [
    loadDashboard,
    loadHistory,
    loadKnowledge,
    loadRequests,
    loadSuppliers,
    router,
  ]);

  const categoryStats = useMemo(() => {
    return CATEGORIES.map((category) => {
      const count = items.filter(
        (item) => getCategoryId(item.category) === category.id
      ).length;

      return {
        ...category,
        count,
      };
    });
  }, [items]);

  const verifiedCount = useMemo(
    () => items.filter((item) => item.verified).length,
    [items]
  );

  const reviewItems = useMemo(
    () => items.filter((item) => !item.verified),
    [items]
  );

  const reviewItemIndex =
    reviewItems.length === 0
      ? 0
      : Math.min(reviewIndex, reviewItems.length - 1);
  const currentReviewItem = reviewItems[reviewItemIndex];
  const activeReviewForm =
    reviewForm?.id === currentReviewItem?.id
      ? reviewForm
      : currentReviewItem
        ? {
            id: currentReviewItem.id,
            title: currentReviewItem.title,
            category: getCategoryId(currentReviewItem.category),
            content: currentReviewItem.content,
            priority: currentReviewItem.priority ?? 0,
            verified: true,
            source: currentReviewItem.source ?? "review",
          }
        : null;

  const feedbackStats = useMemo(() => {
    const messages = history.flatMap((conversation) => conversation.messages);

    return {
      up: messages.filter((message) => message.feedback === "up").length,
      down: messages.filter((message) => message.feedback === "down").length,
      total: messages.filter((message) => message.role === "assistant")
        .length,
    };
  }, [history]);

  const requestCategories = useMemo(
    () => [
      {
        id: "meter" as const,
        title: "Корректировка показаний",
        hint: "Счетчики, верные показания и контакт абонента",
        total: meterCorrections.length,
        pending: meterCorrections.filter((item) => item.status === "new")
          .length,
        active: meterCorrections.filter(
          (item) => item.status === "in_progress"
        ).length,
        closed: meterCorrections.filter((item) => item.status === "done")
          .length,
      },
      {
        id: "appeal" as const,
        title: "Обычные обращения",
        hint: "Имя, тема, сообщение и приложенные файлы",
        total: appealRequests.length,
        pending: appealRequests.filter((item) => item.status === "new").length,
        active: appealRequests.filter((item) => item.status === "in_progress")
          .length,
        closed: appealRequests.filter((item) => item.status === "done").length,
      },
      {
        id: "appointment" as const,
        title: "Запись к руководству",
        hint: "Дата, время приема и контакт для подтверждения",
        total: leadershipAppointments.length,
        pending: leadershipAppointments.filter((item) => item.status === "new")
          .length,
        active: leadershipAppointments.filter(
          (item) => item.status === "confirmed"
        ).length,
        closed: leadershipAppointments.filter((item) => item.status === "done")
          .length,
      },
    ],
    [appealRequests, leadershipAppointments, meterCorrections]
  );

  const activeRequestStats =
    requestCategories.find((item) => item.id === activeRequestCategory) ??
    requestCategories[0];

  const assignedSuppliersCount = useMemo(
    () => suppliers.filter((supplier) => supplier.managerName).length,
    [suppliers]
  );

  const totalRequests =
    meterCorrections.length + appealRequests.length + leadershipAppointments.length;
  const openRequestTotal = requestCategories.reduce(
    (sum, category) => sum + category.pending + category.active,
    0
  );
  const supplierCoverage = formatPercent(
    suppliers.length ? (assignedSuppliersCount / suppliers.length) * 100 : 0
  );
  const knowledgeCoverage = formatPercent(
    items.length ? (verifiedCount / items.length) * 100 : 0
  );
  const positiveFeedbackRate = formatPercent(
    feedbackStats.up + feedbackStats.down
      ? (feedbackStats.up / (feedbackStats.up + feedbackStats.down)) * 100
      : 100
  );
  const mvpReadiness = formatPercent(
    knowledgeCoverage * 0.3 +
      supplierCoverage * 0.25 +
      (knowledgeGaps.length === 0
        ? 20
        : Math.max(0, 20 - knowledgeGaps.length * 2)) +
      (openRequestTotal === 0
        ? 15
        : Math.max(0, 15 - openRequestTotal * 1.5)) +
      Math.min(10, positiveFeedbackRate / 10)
  );
  const priorityActions = [
    {
      label: "Новые заявки",
      value: requestCategories.reduce((sum, category) => sum + category.pending, 0),
      hint: "принять в работу",
      action: () => {
        setActiveTab("requests");
        setActiveRequestStatus("new");
        void loadRequests();
      },
      tone: "blue",
    },
    {
      label: "Пробелы базы",
      value: knowledgeGaps.filter((gap) => gap.status === "open").length,
      hint: "закрыть проверенными ответами",
      action: () => {
        setActiveTab("history");
        void loadHistory();
      },
      tone: "amber",
    },
    {
      label: "Без менеджера",
      value: Math.max(0, suppliers.length - assignedSuppliersCount),
      hint: "доназначить поставщиков",
      action: () => {
        setActiveTab("suppliers");
        setActiveSupplierManager("all");
        void loadSuppliers();
      },
      tone: "neutral",
    },
  ];
  const readinessPill =
    mvpReadiness >= 85
      ? "Готово к показу"
      : mvpReadiness >= 70
        ? "Нужно добить мелочи"
        : "Есть риски перед показом";

  const filteredMeterCorrections = useMemo(
    () =>
      meterCorrections.filter((request) =>
        requestMatchesStatus(request.status, activeRequestStatus, "meter")
      ),
    [activeRequestStatus, meterCorrections]
  );
  const filteredAppealRequests = useMemo(
    () =>
      appealRequests.filter((request) =>
        requestMatchesStatus(request.status, activeRequestStatus, "appeal")
      ),
    [activeRequestStatus, appealRequests]
  );
  const filteredLeadershipAppointments = useMemo(
    () =>
      leadershipAppointments.filter((request) =>
        requestMatchesStatus(
          request.status,
          activeRequestStatus,
          "appointment"
        )
      ),
    [activeRequestStatus, leadershipAppointments]
  );
  const visibleRequestCount =
    activeRequestCategory === "meter"
      ? filteredMeterCorrections.length
      : activeRequestCategory === "appeal"
        ? filteredAppealRequests.length
        : filteredLeadershipAppointments.length;
  const requestStatusFilters: {
    id: RequestStatusFilter;
    label: string;
    hint: string;
  }[] = [
    { id: "open", label: "Открытые", hint: "новые и в работе" },
    { id: "new", label: "Новые", hint: "еще не приняты" },
    { id: "active", label: "В работе", hint: "приняты или подтверждены" },
    { id: "closed", label: "Закрытые", hint: "завершенные и отмененные" },
    { id: "all", label: "Все", hint: "полный список" },
  ];
  const topSupplierManagers = supplierManagers
    .slice()
    .sort((a, b) => b.supplierCount - a.supplierCount)
    .slice(0, 5);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return items.filter((item) => {
      const category = getCategory(item.category);
      const matchesCategory =
        activeCategory === "all" || category.id === activeCategory;
      const matchesQuery =
        !normalizedQuery ||
        [
          item.title,
          item.category,
          category.label,
          item.content,
          item.source ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, items, query]);

  const filteredHistory = useMemo(() => {
    const normalizedQuery = historyQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return history;
    }

    return history.filter((conversation) =>
      [conversation.title, ...conversation.messages.map((m) => m.content)]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [history, historyQuery]);

  const filteredKnowledgeGaps = useMemo(() => {
    const normalizedQuery = historyQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return knowledgeGaps;
    }

    return knowledgeGaps.filter((gap) =>
      [gap.topic, gap.user_question, gap.assistant_answer ?? "", gap.reason]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [historyQuery, knowledgeGaps]);

  const filteredSuppliers = useMemo(() => {
    const normalizedQuery = supplierQuery.trim().toLowerCase();
    const normalizedCodeQuery = supplierCodeQuery.trim();

    return suppliers.filter((supplier) => {
      const managerName = supplier.managerName || "Не назначен";
      const matchesManager =
        activeSupplierManager === "all" ||
        managerName === activeSupplierManager;
      const matchesCode =
        !normalizedCodeQuery ||
        String(supplier.supplierCode).includes(normalizedCodeQuery);
      const matchesQuery =
        !normalizedQuery ||
        [
          supplier.supplierCode,
          supplier.supplierName,
          supplier.bin,
          supplier.supplierCategory,
          supplier.district,
          supplier.managerName,
          supplier.chairName,
          supplier.chairPhone,
          supplier.supplierEmail,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesManager && matchesCode && matchesQuery;
    });
  }, [activeSupplierManager, supplierCodeQuery, supplierQuery, suppliers]);

  const selectedManagerGroup = useMemo(() => {
    if (activeSupplierManager === "all") {
      return null;
    }

    return (
      supplierManagers.find(
        (manager) => manager.managerName === activeSupplierManager
      ) ?? null
    );
  }, [activeSupplierManager, supplierManagers]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setActiveGapId(null);
    setError("");
  };

  const applyTemplate = (template: (typeof TEMPLATES)[number]) => {
    setForm({
      ...EMPTY_FORM,
      title: template.title,
      category: template.category,
      content: template.content,
    });
    setError("");
  };

  const editItem = (item: KnowledgeItem) => {
    setForm({
      id: item.id,
      title: item.title,
      category: getCategoryId(item.category),
      content: item.content,
      priority: item.priority ?? 0,
      verified: Boolean(item.verified),
      source: item.source ?? "admin",
    });
    setActiveTab("knowledge");
    setActiveGapId(null);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveItem = async () => {
    if (!form.title.trim() || !form.category.trim() || !form.content.trim()) {
      setError("Заполни заголовок, категорию и ответ.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const method = form.id ? "PATCH" : "POST";
      const gapToResolve = activeGapId;

      await apiRequest("/api/admin/knowledge", {
        method,
        body: JSON.stringify(form),
      });

      resetForm();
      await loadKnowledge();

      if (gapToResolve) {
        await apiRequest("/api/admin/history", {
          method: "PATCH",
          body: JSON.stringify({
            gapId: gapToResolve,
            status: "resolved",
          }),
        });
        setKnowledgeGaps((prev) =>
          prev.filter((gap) => gap.id !== gapToResolve)
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Не удалось сохранить";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (item: KnowledgeItem) => {
    const ok = window.confirm(`Удалить "${item.title}"?`);

    if (!ok) {
      return;
    }

    setError("");

    try {
      await apiRequest(
        `/api/admin/knowledge?id=${encodeURIComponent(item.id)}`,
        {
          method: "DELETE",
        }
      );
      setItems((prev) => prev.filter((x) => x.id !== item.id));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Не удалось удалить";
      setError(message);
    }
  };

  const confirmReviewItem = async () => {
    if (!activeReviewForm?.id) {
      return;
    }

    if (
      !activeReviewForm.title.trim() ||
      !activeReviewForm.category.trim() ||
      !activeReviewForm.content.trim()
    ) {
      setError("Заполни заголовок, категорию и ответ перед подтверждением.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload = {
        ...activeReviewForm,
        verified: true,
      };

      await apiRequest("/api/admin/knowledge", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setItems((prev) =>
        prev.map((item) =>
          item.id === activeReviewForm.id
            ? {
                ...item,
                title: payload.title,
                category: payload.category,
                content: payload.content,
                priority: payload.priority,
                verified: true,
                source: payload.source,
              }
            : item
        )
      );
      setReviewForm(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Не удалось подтвердить запись";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const skipReviewItem = () => {
    if (reviewItems.length === 0) {
      return;
    }

    setReviewIndex((prev) => (prev + 1) % reviewItems.length);
    setError("");
  };

  const createKnowledgeFromQuestion = (conversation: HistoryConversation) => {
    const userMessage =
      conversation.messages.find((message) => message.role === "user")
        ?.content ?? conversation.title;

    setForm({
      ...EMPTY_FORM,
      title: userMessage.slice(0, 90),
      content: "",
      source: "history",
    });
    setActiveGapId(null);
    setActiveTab("knowledge");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const createKnowledgeFromGap = async (gap: KnowledgeGap) => {
    setError("");

    try {
      const data = await apiRequest<{ draft: KnowledgeForm }>(
        "/api/admin/knowledge/draft",
        {
          method: "POST",
          body: JSON.stringify({ gapId: gap.id }),
        }
      );

      setForm({
        ...EMPTY_FORM,
        ...data.draft,
        source: data.draft.source || "knowledge-gap-draft",
      });
    } catch (err) {
      setForm({
        ...EMPTY_FORM,
        title: gap.topic.slice(0, 90),
        content: "",
        source: "knowledge-gap",
        verified: true,
      });
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось подготовить черновик ответа"
      );
    }

    setActiveGapId(gap.id);
    setActiveTab("knowledge");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeKnowledgeGap = async (gap: KnowledgeGap) => {
    setError("");

    try {
      await apiRequest("/api/admin/history", {
        method: "PATCH",
        body: JSON.stringify({
          gapId: gap.id,
          status: "resolved",
        }),
      });
      setKnowledgeGaps((prev) => prev.filter((item) => item.id !== gap.id));
      if (activeGapId === gap.id) {
        setActiveGapId(null);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Не удалось закрыть тему";
      setError(message);
    }
  };

  const updateMeterCorrectionStatus = async (
    request: MeterCorrectionRequest,
    status: MeterCorrectionRequest["status"]
  ) => {
    setError("");

    try {
      await apiRequest("/api/admin/requests", {
        method: "PATCH",
        body: JSON.stringify({
          type: "meter",
          id: request.id,
          status,
        }),
      });
      setMeterCorrections((prev) =>
        prev.map((item) =>
          item.id === request.id ? { ...item, status } : item
        )
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Не удалось обновить статус заявки";
      setError(message);
    }
  };

  const updateAppealStatus = async (
    request: AppealRequest,
    status: AppealRequest["status"]
  ) => {
    setError("");

    try {
      await apiRequest("/api/admin/requests", {
        method: "PATCH",
        body: JSON.stringify({
          type: "appeal",
          id: request.id,
          status,
        }),
      });
      setAppealRequests((prev) =>
        prev.map((item) =>
          item.id === request.id ? { ...item, status } : item
        )
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Не удалось обновить статус обращения";
      setError(message);
    }
  };

  const updateAppointmentStatus = async (
    request: LeadershipAppointment,
    status: LeadershipAppointment["status"]
  ) => {
    setError("");

    try {
      await apiRequest("/api/admin/requests", {
        method: "PATCH",
        body: JSON.stringify({
          type: "appointment",
          id: request.id,
          status,
        }),
      });
      setLeadershipAppointments((prev) =>
        prev.map((item) =>
          item.id === request.id ? { ...item, status } : item
        )
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Не удалось обновить статус записи";
      setError(message);
    }
  };

  const updateOperatorHandoffStatus = async (
    handoff: OperatorHandoff,
    status: OperatorHandoff["status"]
  ) => {
    setError("");

    try {
      await apiRequest("/api/admin/operator", {
        method: "PATCH",
        body: JSON.stringify({
          id: handoff.id,
          status,
        }),
      });
      setDashboard((prev) =>
        prev
          ? {
              ...prev,
              overview: {
                ...prev.overview,
                handoffsOpen:
                  status === "done" || status === "cancelled"
                    ? Math.max(0, prev.overview.handoffsOpen - 1)
                    : prev.overview.handoffsOpen,
              },
              queues: {
                ...prev.queues,
                handoffs:
                  status === "done" || status === "cancelled"
                    ? prev.queues.handoffs.filter((item) => item.id !== handoff.id)
                    : prev.queues.handoffs.map((item) =>
                        item.id === handoff.id ? { ...item, status } : item
                      ),
              },
            }
          : prev
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Не удалось обновить операторское обращение";
      setError(message);
    }
  };

  const editSupplier = (supplier: SupplierItem) => {
    setSupplierForm({ ...supplier });
    setSupplierOriginalCode(supplier.supplierCode);
    setManagerForm(null);
    setError("");
  };

  const resetSupplierForm = () => {
    setSupplierForm(null);
    setSupplierOriginalCode(null);
  };

  const saveSupplier = async () => {
    if (!supplierForm || !supplierOriginalCode) {
      return;
    }

    if (!supplierForm.supplierName.trim()) {
      setError("Название организации обязательно.");
      return;
    }

    if (!Number.isInteger(Number(supplierForm.supplierCode))) {
      setError("Код поставщика должен быть числом.");
      return;
    }

    setSupplierSaving(true);
    setError("");

    try {
      await apiRequest("/api/admin/suppliers", {
        method: "PATCH",
        body: JSON.stringify({
          ...supplierForm,
          supplierCode: Number(supplierForm.supplierCode),
          originalSupplierCode: supplierOriginalCode,
        }),
      });

      resetSupplierForm();
      await loadSuppliers();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Не удалось сохранить поставщика";
      setError(message);
    } finally {
      setSupplierSaving(false);
    }
  };

  const editManager = (manager: SupplierManagerGroup) => {
    setManagerForm({
      originalManagerName: manager.managerName,
      managerName: manager.managerName === "Не назначен" ? "" : manager.managerName,
      managerPhotoUrl: manager.managerPhotoUrl ?? "",
      managerPhone: manager.managerPhone ?? "",
      managerEmail: manager.managerEmail ?? "",
    });
    setSupplierForm(null);
    setError("");
  };

  const resetManagerForm = () => {
    setManagerForm(null);
  };

  const saveManager = async () => {
    if (!managerForm) {
      return;
    }

    if (!managerForm.managerName.trim()) {
      setError("Имя менеджера обязательно.");
      return;
    }

    setManagerSaving(true);
    setError("");

    try {
      await apiRequest("/api/admin/suppliers", {
        method: "PATCH",
        body: JSON.stringify({
          mode: "manager",
          originalManagerName: managerForm.originalManagerName,
          managerName: managerForm.managerName,
          managerPhotoUrl: managerForm.managerPhotoUrl,
          managerPhone: managerForm.managerPhone,
          managerEmail: managerForm.managerEmail,
        }),
      });

      resetManagerForm();
      setActiveSupplierManager(managerForm.managerName);
      await loadSuppliers();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Не удалось сохранить менеджера";
      setError(message);
    } finally {
      setManagerSaving(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <main className="min-h-screen bg-[#eef4fb] text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/92 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark size="md" variant="full" />
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold">
                Панель управления ботом
              </h1>
              <p className="mt-1 text-sm text-neutral-500">
                База знаний, история вопросов и качество ответов
              </p>
            </div>
          </div>

          <button
            onClick={logout}
            className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium hover:bg-neutral-50"
          >
            Выйти
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[260px_1fr]">
        <aside className="surface-panel h-fit rounded-lg border border-white/70 p-3 lg:sticky lg:top-24">
          <div className="px-2 pb-3 pt-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Разделы
            </div>
          </div>
          <div className="flex flex-col gap-1">
          <button
            onClick={() => {
              setActiveTab("dashboard");
              void loadDashboard();
            }}
            className={`h-10 rounded-md px-3 text-left text-sm font-semibold transition ${
              activeTab === "dashboard"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            Обзор
          </button>
          <button
            onClick={() => setActiveTab("knowledge")}
            className={`h-10 rounded-md px-3 text-left text-sm font-semibold transition ${
              activeTab === "knowledge"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            База знаний
          </button>
          <button
            onClick={() => {
              setActiveTab("history");
              void loadHistory();
            }}
            className={`h-10 rounded-md px-3 text-left text-sm font-semibold transition ${
              activeTab === "history"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            История вопросов
          </button>
          <button
            onClick={() => {
              setActiveTab("requests");
              void loadRequests();
            }}
            className={`h-10 rounded-md px-3 text-left text-sm font-semibold transition ${
              activeTab === "requests"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            Заявки (
            {meterCorrections.length +
              appealRequests.length +
              leadershipAppointments.length}
            )
          </button>
          <button
            onClick={() => {
              setActiveTab("suppliers");
              void loadSuppliers();
            }}
            className={`h-10 rounded-md px-3 text-left text-sm font-semibold transition ${
              activeTab === "suppliers"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            Поставщики ({suppliers.length})
          </button>
          <button
            onClick={() => setActiveTab("review")}
            className={`h-10 rounded-md px-3 text-left text-sm font-semibold transition ${
              activeTab === "review"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            Проверка ({reviewItems.length})
          </button>
          </div>

          <div className="mt-4 grid gap-2 border-t border-neutral-200 pt-4">
            <div className="rounded-md bg-neutral-50 p-3">
              <div className="text-xs text-neutral-500">Knowledge</div>
              <div className="mt-1 text-lg font-semibold">
                {verifiedCount}/{items.length}
              </div>
            </div>
            <div className="rounded-md bg-neutral-50 p-3">
              <div className="text-xs text-neutral-500">Поставщики</div>
              <div className="mt-1 text-lg font-semibold">
                {assignedSuppliersCount}/{suppliers.length}
              </div>
            </div>
            <div className="rounded-md bg-neutral-50 p-3">
              <div className="text-xs text-neutral-500">Очередь</div>
              <div className="mt-1 text-lg font-semibold">
                {knowledgeGaps.length + meterCorrections.length}
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0">

        {error && (
          <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {activeTab === "dashboard" ? (
          <>
            <section className="mb-5 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
              <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="p-5 md:p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-md bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                      <Sparkles className="h-3.5 w-3.5" />
                      MVP control room
                    </span>
                    <span className="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
                      {readinessPill}
                    </span>
                  </div>
                  <div className="mt-5 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold tracking-tight text-neutral-950 md:text-3xl">
                        Админка для запуска и ежедневного контроля
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
                        Здесь видно качество базы, очередь заявок, проблемные
                        вопросы и покрытие поставщиков менеджерами. Это главный
                        экран для показа руководству и контроля MVP после запуска.
                      </p>
                    </div>
                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-5 py-4">
                      <div className="text-sm font-medium text-blue-700">
                        Готовность MVP
                      </div>
                      <div className="mt-1 text-4xl font-semibold text-blue-950">
                        {mvpReadiness}%
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-white">
                        <div
                          className="h-2 rounded-full bg-blue-600"
                          style={{ width: `${mvpReadiness}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-4">
                    {[
                      {
                        label: "База знаний",
                        value: `${knowledgeCoverage}%`,
                        hint: `${verifiedCount}/${items.length} проверено`,
                        icon: DatabaseZap,
                      },
                      {
                        label: "Поставщики",
                        value: `${supplierCoverage}%`,
                        hint: `${assignedSuppliersCount}/${suppliers.length} с менеджером`,
                        icon: Building2,
                      },
                      {
                        label: "Открытые заявки",
                        value: openRequestTotal,
                        hint: `${totalRequests} всего в админке`,
                        icon: ClipboardList,
                      },
                      {
                        label: "Качество",
                        value: `${positiveFeedbackRate}%`,
                        hint: "доля полезных оценок",
                        icon: ShieldCheck,
                      },
                    ].map((metric) => (
                      <div
                        key={metric.label}
                        className="rounded-lg border border-neutral-200 bg-neutral-50 p-4"
                      >
                        <metric.icon className="h-4 w-4 text-blue-700" />
                        <div className="mt-3 text-sm text-neutral-500">
                          {metric.label}
                        </div>
                        <div className="mt-1 text-2xl font-semibold">
                          {metric.value}
                        </div>
                        <div className="mt-1 text-xs text-neutral-400">
                          {metric.hint}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-neutral-200 bg-neutral-50 p-5 md:p-6 lg:border-l lg:border-t-0">
                  <div className="mb-4 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                    <ListChecks className="h-5 w-5 text-blue-700" />
                    <h3 className="font-semibold">Что добить первым</h3>
                  </div>
                  <div className="space-y-3">
                    {priorityActions.map((action) => (
                      <button
                        key={action.label}
                        onClick={action.action}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-left transition hover:border-blue-200 hover:bg-blue-50"
                      >
                        <div>
                          <div className="text-sm font-semibold">
                            {action.label}
                          </div>
                          <div className="mt-1 text-xs text-neutral-500">
                            {action.hint}
                          </div>
                        </div>
                        <div className="text-2xl font-semibold">
                          {action.value}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="mb-5 rounded-lg border border-blue-100 bg-gradient-to-br from-white to-blue-50 p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-blue-700">
                    MVP контроль
                  </div>
                  <h2 className="mt-1 text-2xl font-semibold">
                    Обзор ассистента Астана-ЕРЦ
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
                    Здесь собраны очереди, качество ответов и ручные действия:
                    оператор, заявки, база знаний и оценки жителей.
                  </p>
                </div>
                <button
                  onClick={() => void loadDashboard()}
                  className="h-10 rounded-md border border-blue-200 bg-white px-4 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                >
                  Обновить обзор
                </button>
              </div>

              {dashboardLoading ? (
                <div className="mt-5 text-sm text-neutral-500">
                  Загружаю сводку...
                </div>
              ) : dashboard ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["База знаний", `${dashboard.overview.knowledgeVerified}/${dashboard.overview.knowledgeTotal}`, "проверено"],
                    ["Диалоги", dashboard.overview.conversations, "последние"],
                    ["Новые заявки", dashboard.overview.requestsNew, "ждут приема"],
                    ["Квитанции", dashboard.overview.receiptsNew, "на проверке"],
                    ["Оператор", dashboard.overview.handoffsOpen, "ручная очередь"],
                    ["Пробелы базы", dashboard.overview.gapsOpen, "открыто"],
                    ["Не помогло", dashboard.overview.feedbackDown, "оценок"],
                    ["Полезно", dashboard.overview.feedbackUp, "оценок"],
                    ["В работе", dashboard.overview.requestsActive, "заявок"],
                  ].map(([label, value, hint]) => (
                    <div
                      key={label}
                      className="rounded-lg border border-white/80 bg-white p-4 shadow-sm"
                    >
                      <div className="text-sm text-neutral-500">{label}</div>
                      <div className="mt-2 text-3xl font-semibold">{value}</div>
                      <div className="mt-1 text-xs text-neutral-400">{hint}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 text-sm text-neutral-500">
                  Сводка пока не загружена.
                </div>
              )}
            </section>

            <section className="mb-5 rounded-lg border border-neutral-200 bg-white p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <h2 className="font-semibold">Сценарии для показа MVP</h2>
                  </div>
                  <p className="mt-1 text-sm text-neutral-500">
                    Короткий список функций, которые стоит показать на презентации
                    живыми вопросами в чате.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setActiveTab("history");
                    void loadHistory();
                  }}
                  className="h-10 rounded-md border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-50"
                >
                  Смотреть диалоги
                </button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[
                  "Найти менеджера по ОСИ Soho-2, БИН или коду поставщика",
                  "Открыть форму корректировки показаний счетчика",
                  "Оставить обычное обращение с файлами",
                  "Записаться на прием к руководству",
                  "Получить контакт техподдержки WhatsApp",
                  "Передать диалог оператору",
                  "Получить ответ на русском или казахском",
                  "Увидеть пробелы базы и подготовить черновик ответа",
                ].map((scenario) => (
                  <div
                    key={scenario}
                    className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm leading-5 text-neutral-700"
                  >
                    {scenario}
                  </div>
                ))}
              </div>
            </section>

            {dashboard && (
              <>
                <section className="mb-5 grid gap-3 lg:grid-cols-3">
                  {dashboard.insights.map((insight) => (
                    <div
                      key={insight}
                      className="rounded-lg border border-neutral-200 bg-white p-4 text-sm leading-6 text-neutral-700"
                    >
                      {insight}
                    </div>
                  ))}
                </section>

                <section className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
                  <div className="rounded-lg border border-neutral-200 bg-white">
                    <div className="border-b border-neutral-200 p-4">
                      <h2 className="font-semibold">Операторская очередь</h2>
                      <p className="mt-1 text-sm text-neutral-500">
                        Диалоги, где житель явно попросил оператора или ручную
                        обработку.
                      </p>
                    </div>

                    {dashboard.queues.handoffs.length === 0 ? (
                      <div className="p-4 text-sm text-neutral-500">
                        Открытых операторских обращений нет.
                      </div>
                    ) : (
                      <div className="divide-y divide-neutral-200">
                        {dashboard.queues.handoffs.map((handoff) => (
                          <article key={handoff.id} className="p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className="min-w-0">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                  <span
                                    className={`rounded-md px-2 py-1 text-xs font-medium ${statusClassName(
                                      handoff.status
                                    )}`}
                                  >
                                    {statusLabel(handoff.status)}
                                  </span>
                                  <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600">
                                    {formatDate(handoff.created_at)}
                                  </span>
                                  <span className="rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700">
                                    priority {handoff.priority}
                                  </span>
                                </div>
                                <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                                  {handoff.user_message}
                                </p>
                                {handoff.visitor_id && (
                                  <p className="mt-2 text-xs text-neutral-400">
                                    visitor: {handoff.visitor_id}
                                  </p>
                                )}
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-2">
                                <button
                                  onClick={() =>
                                    void updateOperatorHandoffStatus(
                                      handoff,
                                      "in_progress"
                                    )
                                  }
                                  className="h-9 rounded-md border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-50"
                                >
                                  Принять
                                </button>
                                <button
                                  onClick={() =>
                                    void updateOperatorHandoffStatus(
                                      handoff,
                                      "done"
                                    )
                                  }
                                  className="h-9 rounded-md border border-emerald-200 px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                                >
                                  Закрыть
                                </button>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-5">
                    <section className="rounded-lg border border-neutral-200 bg-white">
                      <div className="border-b border-neutral-200 p-4">
                        <h2 className="font-semibold">Качество ответов</h2>
                        <p className="mt-1 text-sm text-neutral-500">
                          Последние ответы, которые отметили как “не помогло”.
                        </p>
                      </div>

                      {dashboard.queues.downFeedback.length === 0 ? (
                        <div className="p-4 text-sm text-neutral-500">
                          Негативных оценок в последних сообщениях нет.
                        </div>
                      ) : (
                        <div className="divide-y divide-neutral-200">
                          {dashboard.queues.downFeedback.map((message) => (
                            <article key={message.id} className="p-4">
                              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                                <span>{formatDate(message.created_at)}</span>
                                {message.source && <span>{message.source}</span>}
                              </div>
                              <h3 className="text-sm font-semibold">
                                {message.conversationTitle}
                              </h3>
                              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-neutral-600">
                                {message.content}
                              </p>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className="rounded-lg border border-neutral-200 bg-white">
                      <div className="border-b border-neutral-200 p-4">
                        <h2 className="font-semibold">Черновики для базы</h2>
                        <p className="mt-1 text-sm text-neutral-500">
                          Самые свежие вопросы, которые стоит закрыть
                          проверенной записью.
                        </p>
                      </div>

                      {dashboard.queues.gaps.length === 0 ? (
                        <div className="p-4 text-sm text-neutral-500">
                          Открытых пробелов базы нет.
                        </div>
                      ) : (
                        <div className="divide-y divide-neutral-200">
                          {dashboard.queues.gaps.slice(0, 5).map((gap) => (
                            <article key={gap.id} className="p-4">
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                                  {gap.topic}
                                </span>
                                <span className="text-xs text-neutral-400">
                                  {formatDate(gap.created_at)}
                                </span>
                              </div>
                              <p className="text-sm font-semibold">
                                {gap.user_question}
                              </p>
                              <button
                                onClick={() => void createKnowledgeFromGap(gap)}
                                className="mt-3 h-9 rounded-md border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-50"
                              >
                                Подготовить черновик
                              </button>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                </section>
              </>
            )}
          </>
        ) : activeTab === "knowledge" ? (
          <>
            <section className="mb-5 grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">Всего записей</div>
                <div className="mt-2 text-3xl font-semibold">
                  {items.length}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">Проверено</div>
                <div className="mt-2 text-3xl font-semibold">
                  {verifiedCount}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">Разделов</div>
                <div className="mt-2 text-3xl font-semibold">
                  {CATEGORIES.length}
                </div>
              </div>
            </section>

            <section className="mb-5 overflow-hidden rounded-lg border border-neutral-200 bg-white">
              <div className="border-b border-neutral-200 px-4 py-3">
                <h2 className="font-semibold">Разделы</h2>
              </div>
              <div className="grid gap-px bg-neutral-200 md:grid-cols-4">
                <button
                  onClick={() => setActiveCategory("all")}
                  className={`bg-white p-4 text-left hover:bg-neutral-50 ${
                    activeCategory === "all"
                      ? "ring-2 ring-inset ring-blue-600"
                      : ""
                  }`}
                >
                  <div className="font-medium">Все</div>
                  <div className="mt-1 text-sm text-neutral-500">
                    {items.length} записей
                  </div>
                </button>
                {categoryStats.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className={`bg-white p-4 text-left hover:bg-neutral-50 ${
                      activeCategory === category.id
                        ? "ring-2 ring-inset ring-blue-600"
                        : ""
                    }`}
                  >
                    <div className="font-medium">{category.label}</div>
                    <div className="mt-1 text-sm text-neutral-500">
                      {category.count} записей
                    </div>
                    <div className="mt-2 text-xs leading-5 text-neutral-400">
                      {category.hint}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
              <section className="h-fit rounded-lg border border-neutral-200 bg-white p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">
                      {form.id ? "Редактирование" : "Новая запись"}
                    </h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      Сохранение обновит embedding автоматически.
                    </p>
                  </div>

                  {form.id && (
                    <button
                      onClick={resetForm}
                      className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50"
                    >
                      Сброс
                    </button>
                  )}
                </div>

                {!form.id && (
                  <div className="mb-5">
                    <div className="mb-2 text-sm font-medium text-neutral-700">
                      Быстрый бланк
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {TEMPLATES.map((template) => (
                        <button
                          key={template.label}
                          onClick={() => applyTemplate(template)}
                          className="rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-left text-sm hover:border-blue-500 hover:bg-white"
                        >
                          {template.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <label className="mb-4 block">
                  <span className="mb-1 block text-sm font-medium text-neutral-700">
                    Заголовок
                  </span>
                  <input
                    value={form.title}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        title: e.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-md border border-neutral-300 bg-white px-3 outline-none focus:border-blue-600"
                    placeholder="Оплата через Kaspi"
                  />
                </label>

                <label className="mb-4 block">
                  <span className="mb-1 block text-sm font-medium text-neutral-700">
                    Раздел
                  </span>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        category: e.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-md border border-neutral-300 bg-white px-3 outline-none focus:border-blue-600"
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mb-4 block">
                  <span className="mb-1 block text-sm font-medium text-neutral-700">
                    Ответ для бота
                  </span>
                  <textarea
                    value={form.content}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        content: e.target.value,
                      }))
                    }
                    className="min-h-40 w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 leading-6 outline-none focus:border-blue-600"
                    placeholder="Короткий проверенный ответ, который бот может дать пользователю."
                  />
                </label>

                <div className="mb-4 grid grid-cols-[1fr_120px] gap-3">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-neutral-700">
                      Источник
                    </span>
                    <input
                      value={form.source}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          source: e.target.value,
                        }))
                      }
                      className="h-11 w-full rounded-md border border-neutral-300 bg-white px-3 outline-none focus:border-blue-600"
                      placeholder="manual"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-neutral-700">
                      Приоритет
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form.priority}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          priority: Number(e.target.value),
                        }))
                      }
                      className="h-11 w-full rounded-md border border-neutral-300 bg-white px-3 outline-none focus:border-blue-600"
                    />
                  </label>
                </div>

                <label className="mb-4 flex items-center gap-2 text-sm font-medium text-neutral-700">
                  <input
                    type="checkbox"
                    checked={form.verified}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        verified: e.target.checked,
                      }))
                    }
                    className="h-4 w-4"
                  />
                  Проверенная информация
                </label>

                <button
                  onClick={saveItem}
                  disabled={saving}
                  className="h-11 w-full rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
                >
                  {saving
                    ? "Сохраняю..."
                    : form.id
                      ? "Обновить"
                      : "Добавить"}
                </button>
              </section>

              <section className="rounded-lg border border-neutral-200 bg-white">
                <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="font-semibold">Лента записей</h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      {filteredItems.length} из {items.length} записей
                    </p>
                  </div>

                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600 md:max-w-sm"
                    placeholder="Поиск по заголовку, тексту или разделу"
                  />
                </div>

                {loading ? (
                  <div className="p-4 text-sm text-neutral-500">
                    Загружаю...
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-200">
                    {filteredItems.map((item) => (
                      <article
                        key={item.id}
                        className="p-4 hover:bg-neutral-50"
                      >
                        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                                {getCategoryLabel(item.category)}
                              </span>
                              <span
                                className={`rounded-md px-2 py-1 text-xs font-medium ${
                                  item.verified
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-neutral-100 text-neutral-600"
                                }`}
                              >
                                {item.verified ? "Проверено" : "Черновик"}
                              </span>
                              <span className="text-xs text-neutral-500">
                                Приоритет {item.priority ?? 0}
                              </span>
                            </div>
                            <h3 className="text-base font-semibold">
                              {item.title}
                            </h3>
                            <div className="mt-1 text-xs text-neutral-500">
                              Источник: {item.source ?? "не указан"}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => editItem(item)}
                              className="h-9 rounded-md border border-neutral-300 px-3 text-sm font-medium hover:bg-white"
                            >
                              Изменить
                            </button>
                            <button
                              onClick={() => deleteItem(item)}
                              className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 hover:bg-red-50"
                            >
                              Удалить
                            </button>
                          </div>
                        </div>

                        <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                          {item.content}
                        </p>
                      </article>
                    ))}

                    {filteredItems.length === 0 && (
                      <div className="p-4 text-sm text-neutral-500">
                        Ничего не найдено.
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          </>
        ) : activeTab === "suppliers" ? (
          <>
            <section className="mb-5 grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">Всего поставщиков</div>
                <div className="mt-2 text-3xl font-semibold">
                  {suppliers.length}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">С менеджером</div>
                <div className="mt-2 text-3xl font-semibold">
                  {assignedSuppliersCount}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">Без менеджера</div>
                <div className="mt-2 text-3xl font-semibold">
                  {suppliers.length - assignedSuppliersCount}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">Групп менеджеров</div>
                <div className="mt-2 text-3xl font-semibold">
                  {supplierManagers.length}
                </div>
              </div>
            </section>

            <section className="mb-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-lg border border-neutral-200 bg-white p-5">
                <div className="flex items-center gap-2">
                  <UsersRound className="h-5 w-5 text-blue-700" />
                  <h2 className="font-semibold">Покрытие менеджерами</h2>
                </div>
                <div className="mt-5 flex items-end gap-3">
                  <div className="text-5xl font-semibold text-neutral-950">
                    {supplierCoverage}%
                  </div>
                  <div className="pb-1 text-sm leading-5 text-neutral-500">
                    организаций уже закреплены за менеджерами Астана-ЕРЦ
                  </div>
                </div>
                <div className="mt-5 h-2 rounded-full bg-neutral-100">
                  <div
                    className="h-2 rounded-full bg-blue-600"
                    style={{ width: `${supplierCoverage}%` }}
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md bg-emerald-50 p-3 text-emerald-800">
                    <div className="text-xs font-medium">С менеджером</div>
                    <div className="mt-1 text-xl font-semibold">
                      {assignedSuppliersCount}
                    </div>
                  </div>
                  <div className="rounded-md bg-amber-50 p-3 text-amber-800">
                    <div className="text-xs font-medium">Нужно заполнить</div>
                    <div className="mt-1 text-xl font-semibold">
                      {Math.max(0, suppliers.length - assignedSuppliersCount)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-neutral-200 bg-white p-5">
                <h2 className="font-semibold">Топ менеджеров по организациям</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Быстро видно нагрузку и распределение поставщиков.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {topSupplierManagers.map((manager) => (
                    <button
                      key={manager.managerName}
                      onClick={() => setActiveSupplierManager(manager.managerName)}
                      className="rounded-lg border border-neutral-200 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50"
                    >
                      <div className="flex items-center gap-3">
                        {manager.managerPhotoUrl ? (
                          <div
                            className="h-10 w-10 shrink-0 rounded-md bg-cover bg-center"
                            style={{
                              backgroundImage: `url(${manager.managerPhotoUrl})`,
                            }}
                            aria-label={manager.managerName}
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-600 text-xs font-semibold text-white">
                            {getInitials(manager.managerName)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">
                            {manager.managerName}
                          </div>
                          <div className="text-xs text-neutral-500">
                            {manager.supplierCount} организаций
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
              <section className="h-fit rounded-lg border border-neutral-200 bg-white">
                <div className="border-b border-neutral-200 p-4">
                  <h2 className="font-semibold">Менеджеры</h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    Организации сгруппированы по полю Пользователь Астана-ЕРЦ из исходного Excel.
                  </p>
                </div>

                <div className="max-h-[720px] overflow-auto">
                  <button
                    onClick={() => setActiveSupplierManager("all")}
                    className={`w-full border-b border-neutral-200 p-4 text-left hover:bg-neutral-50 ${
                      activeSupplierManager === "all"
                        ? "bg-blue-50 ring-2 ring-inset ring-blue-600"
                        : "bg-white"
                    }`}
                  >
                    <div className="font-medium">Все менеджеры</div>
                    <div className="mt-1 text-sm text-neutral-500">
                      {suppliers.length} организаций
                    </div>
                  </button>

                  {supplierManagers.map((manager) => (
                    <div
                      key={manager.managerName}
                      className={`border-b border-neutral-200 p-4 ${
                        activeSupplierManager === manager.managerName
                          ? "bg-blue-50 ring-2 ring-inset ring-blue-600"
                          : "bg-white"
                      }`}
                    >
                      <button
                        onClick={() =>
                          setActiveSupplierManager(manager.managerName)
                        }
                        className="flex w-full gap-3 text-left"
                      >
                        {manager.managerPhotoUrl ? (
                          <div
                            className="h-11 w-11 shrink-0 rounded-md bg-cover bg-center"
                            style={{
                              backgroundImage: `url(${manager.managerPhotoUrl})`,
                            }}
                            aria-label={manager.managerName}
                          />
                        ) : (
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-blue-600 text-xs font-semibold text-white">
                            {getInitials(manager.managerName)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium">
                            {manager.managerName}
                          </div>
                          <div className="mt-1 text-sm text-neutral-500">
                            {manager.supplierCount} организаций
                          </div>
                        </div>
                      </button>
                      <div className="mt-3 space-y-1 text-xs text-neutral-500">
                        {manager.categories.slice(0, 3).map((category) => (
                          <div key={category.category}>
                            {category.category}: {category.count}
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => editManager(manager)}
                        className="mt-3 h-8 rounded-md border border-neutral-300 bg-white px-3 text-xs font-medium hover:bg-neutral-50"
                      >
                        Редактировать менеджера
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-neutral-200 bg-white">
                <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="font-semibold">
                      {selectedManagerGroup
                        ? selectedManagerGroup.managerName
                        : "Все поставщики"}
                    </h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      {filteredSuppliers.length} из {suppliers.length} организаций
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 md:flex-row">
                    <input
                      value={supplierCodeQuery}
                      onChange={(e) => setSupplierCodeQuery(e.target.value)}
                      className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600 md:w-40"
                      placeholder="Код поставщика"
                    />
                    <input
                      value={supplierQuery}
                      onChange={(e) => setSupplierQuery(e.target.value)}
                      className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600 md:w-96"
                      placeholder="Поиск по организации, БИН, менеджеру, району"
                    />
                    <button
                      onClick={() => void loadSuppliers()}
                      className="h-10 rounded-md border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-50"
                    >
                      Обновить
                    </button>
                  </div>
                </div>

                {managerForm && (
                  <div className="border-b border-neutral-200 bg-blue-50/50 p-4">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-3">
                        {managerForm.managerPhotoUrl ? (
                          <div
                            className="h-14 w-14 shrink-0 rounded-md bg-cover bg-center"
                            style={{
                              backgroundImage: `url(${managerForm.managerPhotoUrl})`,
                            }}
                            aria-label={managerForm.managerName}
                          />
                        ) : (
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-blue-600 text-sm font-semibold text-white">
                            {getInitials(managerForm.managerName || "М")}
                          </div>
                        )}
                        <div>
                          <h3 className="font-semibold">
                            Редактирование менеджера
                          </h3>
                          <p className="mt-1 text-sm text-neutral-500">
                            Изменения применятся ко всем организациям этого менеджера.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={resetManagerForm}
                          className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium hover:bg-neutral-50"
                        >
                          Отмена
                        </button>
                        <button
                          onClick={() => void saveManager()}
                          disabled={managerSaving}
                          className="h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
                        >
                          {managerSaving ? "Сохраняю..." : "Сохранить"}
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-neutral-700">
                          ФИО менеджера
                        </span>
                        <input
                          value={managerForm.managerName}
                          onChange={(e) =>
                            setManagerForm((prev) =>
                              prev
                                ? { ...prev, managerName: e.target.value }
                                : prev
                            )
                          }
                          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-neutral-700">
                          Фото менеджера URL
                        </span>
                        <input
                          value={managerForm.managerPhotoUrl}
                          onChange={(e) =>
                            setManagerForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    managerPhotoUrl: e.target.value,
                                  }
                                : prev
                            )
                          }
                          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
                          placeholder="https://..."
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-neutral-700">
                          Телефон менеджера
                        </span>
                        <input
                          value={managerForm.managerPhone}
                          onChange={(e) =>
                            setManagerForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    managerPhone: e.target.value,
                                  }
                                : prev
                            )
                          }
                          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
                          placeholder="+7..."
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-neutral-700">
                          Почта менеджера
                        </span>
                        <input
                          value={managerForm.managerEmail}
                          onChange={(e) =>
                            setManagerForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    managerEmail: e.target.value,
                                  }
                                : prev
                            )
                          }
                          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
                          placeholder="manager@aerc.kz"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {supplierForm && (
                  <div className="border-b border-neutral-200 bg-neutral-50 p-4">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="font-semibold">Редактирование поставщика</h3>
                        <p className="mt-1 text-sm text-neutral-500">
                          Менеджер и данные организации обновятся после сохранения.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={resetSupplierForm}
                          className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium hover:bg-neutral-50"
                        >
                          Отмена
                        </button>
                        <button
                          onClick={() => void saveSupplier()}
                          disabled={supplierSaving}
                          className="h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
                        >
                          {supplierSaving ? "Сохраняю..." : "Сохранить"}
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-neutral-700">
                          Код поставщика
                        </span>
                        <input
                          type="number"
                          value={supplierForm.supplierCode}
                          onChange={(e) =>
                            setSupplierForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    supplierCode: Number(e.target.value),
                                  }
                                : prev
                            )
                          }
                          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
                        />
                      </label>

                      <label className="block md:col-span-2">
                        <span className="mb-1 block text-sm font-medium text-neutral-700">
                          Организация
                        </span>
                        <input
                          value={supplierForm.supplierName}
                          onChange={(e) =>
                            setSupplierForm((prev) =>
                              prev
                                ? { ...prev, supplierName: e.target.value }
                                : prev
                            )
                          }
                          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-neutral-700">
                          БИН
                        </span>
                        <input
                          value={supplierForm.bin}
                          onChange={(e) =>
                            setSupplierForm((prev) =>
                              prev ? { ...prev, bin: e.target.value } : prev
                            )
                          }
                          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-neutral-700">
                          Менеджер Астана-ЕРЦ
                        </span>
                        <input
                          value={supplierForm.managerName}
                          onChange={(e) =>
                            setSupplierForm((prev) =>
                              prev
                                ? { ...prev, managerName: e.target.value }
                                : prev
                            )
                          }
                          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-neutral-700">
                          Фото менеджера URL
                        </span>
                        <input
                          value={supplierForm.managerPhotoUrl ?? ""}
                          onChange={(e) =>
                            setSupplierForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    managerPhotoUrl: e.target.value,
                                  }
                                : prev
                            )
                          }
                          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
                          placeholder="https://..."
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-neutral-700">
                          Категория
                        </span>
                        <input
                          value={supplierForm.supplierCategory}
                          onChange={(e) =>
                            setSupplierForm((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    supplierCategory: e.target.value,
                                  }
                                : prev
                            )
                          }
                          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-neutral-700">
                          Район
                        </span>
                        <input
                          value={supplierForm.district}
                          onChange={(e) =>
                            setSupplierForm((prev) =>
                              prev
                                ? { ...prev, district: e.target.value }
                                : prev
                            )
                          }
                          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-neutral-700">
                          Контакт
                        </span>
                        <input
                          value={supplierForm.chairName}
                          onChange={(e) =>
                            setSupplierForm((prev) =>
                              prev
                                ? { ...prev, chairName: e.target.value }
                                : prev
                            )
                          }
                          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-neutral-700">
                          Телефон
                        </span>
                        <input
                          value={supplierForm.chairPhone}
                          onChange={(e) =>
                            setSupplierForm((prev) =>
                              prev
                                ? { ...prev, chairPhone: e.target.value }
                                : prev
                            )
                          }
                          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-neutral-700">
                          Email
                        </span>
                        <input
                          value={supplierForm.supplierEmail}
                          onChange={(e) =>
                            setSupplierForm((prev) =>
                              prev
                                ? { ...prev, supplierEmail: e.target.value }
                                : prev
                            )
                          }
                          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-neutral-700">
                          Договор
                        </span>
                        <input
                          value={supplierForm.contract}
                          onChange={(e) =>
                            setSupplierForm((prev) =>
                              prev
                                ? { ...prev, contract: e.target.value }
                                : prev
                            )
                          }
                          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-neutral-700">
                          Расчет
                        </span>
                        <input
                          value={supplierForm.settlementType}
                          onChange={(e) =>
                            setSupplierForm((prev) =>
                              prev
                                ? { ...prev, settlementType: e.target.value }
                                : prev
                            )
                          }
                          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
                        />
                      </label>

                      <label className="block md:col-span-3">
                        <span className="mb-1 block text-sm font-medium text-neutral-700">
                          Адрес
                        </span>
                        <input
                          value={supplierForm.address}
                          onChange={(e) =>
                            setSupplierForm((prev) =>
                              prev
                                ? { ...prev, address: e.target.value }
                                : prev
                            )
                          }
                          className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {suppliersLoading ? (
                  <div className="p-4 text-sm text-neutral-500">
                    Загружаю поставщиков...
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-200">
                    {filteredSuppliers.slice(0, 160).map((supplier) => (
                      <article
                        key={`${supplier.supplierCode}-${supplier.bin}`}
                        className="p-4 hover:bg-neutral-50"
                      >
                        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="flex min-w-0 gap-3">
                            {supplier.managerPhotoUrl ? (
                              <div
                                className="h-12 w-12 shrink-0 rounded-md bg-cover bg-center"
                                style={{
                                  backgroundImage: `url(${supplier.managerPhotoUrl})`,
                                }}
                                aria-label={supplier.managerName}
                              />
                            ) : (
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-blue-600 text-xs font-semibold text-white">
                                {getInitials(supplier.managerName || "М")}
                              </div>
                            )}
                            <div className="min-w-0">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                                {supplier.managerName || "Не назначен"}
                              </span>
                              {supplier.supplierCategory && (
                                <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600">
                                  {supplier.supplierCategory}
                                </span>
                              )}
                              {supplier.district && (
                                <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600">
                                  {supplier.district}
                                </span>
                              )}
                            </div>
                            <h3 className="text-base font-semibold">
                              {supplier.supplierName}
                            </h3>
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                              <span>Код: {supplier.supplierCode}</span>
                              <span>БИН: {supplier.bin || "не указан"}</span>
                              {supplier.contract && (
                                <span>Договор: {supplier.contract}</span>
                              )}
                            </div>
                            </div>
                          </div>
                          <button
                            onClick={() => editSupplier(supplier)}
                            className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium hover:bg-neutral-50"
                          >
                            Изменить
                          </button>
                        </div>

                        <div className="grid gap-3 text-sm text-neutral-700 md:grid-cols-2">
                          <div>
                            <div className="font-medium text-neutral-900">
                              Контакты
                            </div>
                            <div className="mt-1 leading-6">
                              <div>
                                Председатель/контакт:{" "}
                                {supplier.chairName || "не указан"}
                              </div>
                              <div>
                                Телефон: {supplier.chairPhone || "не указан"}
                              </div>
                              <div>
                                Email: {supplier.supplierEmail || "не указан"}
                              </div>
                            </div>
                          </div>
                          <div>
                            <div className="font-medium text-neutral-900">
                              Данные организации
                            </div>
                            <div className="mt-1 leading-6">
                              <div>
                                Адрес: {supplier.address || "не указан"}
                              </div>
                              <div>
                                Расчет: {supplier.settlementType || "не указан"}
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}

                    {filteredSuppliers.length > 160 && (
                      <div className="p-4 text-sm text-neutral-500">
                        Показаны первые 160 записей. Уточни поиск или выбери менеджера.
                      </div>
                    )}

                    {filteredSuppliers.length === 0 && (
                      <div className="p-4 text-sm text-neutral-500">
                        Ничего не найдено.
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          </>
        ) : activeTab === "review" ? (
          <>
            <section className="mb-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">Осталось проверить</div>
                <div className="mt-2 text-3xl font-semibold">
                  {reviewItems.length}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">Проверено</div>
                <div className="mt-2 text-3xl font-semibold">
                  {verifiedCount}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">Текущая запись</div>
                <div className="mt-2 text-3xl font-semibold">
                  {reviewItems.length > 0 ? reviewItemIndex + 1 : 0}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-neutral-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="font-semibold">Поочередная проверка базы</h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    Исправь запись при необходимости и подтверди ее для ответов бота.
                  </p>
                </div>

                <button
                  onClick={() => void loadKnowledge()}
                  className="h-10 rounded-md border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-50"
                >
                  Обновить
                </button>
              </div>

              {loading ? (
                <div className="p-5 text-sm text-neutral-500">
                  Загружаю записи...
                </div>
              ) : !currentReviewItem || !activeReviewForm ? (
                <div className="p-5">
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    Все записи подтверждены. Новые черновики появятся здесь автоматически.
                  </div>
                </div>
              ) : (
                <div className="grid gap-6 p-5 lg:grid-cols-[1fr_320px]">
                  <div>
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                        {getCategoryLabel(currentReviewItem.category)}
                      </span>
                      <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600">
                        Черновик
                      </span>
                      <span className="text-xs text-neutral-500">
                        Источник: {currentReviewItem.source ?? "не указан"}
                      </span>
                    </div>

                    <label className="mb-4 block">
                      <span className="mb-1 block text-sm font-medium text-neutral-700">
                        Заголовок
                      </span>
                      <input
                        value={activeReviewForm.title}
                        onChange={(e) =>
                          setReviewForm({
                            ...activeReviewForm,
                            title: e.target.value,
                          })
                        }
                        className="h-11 w-full rounded-md border border-neutral-300 bg-white px-3 outline-none focus:border-blue-600"
                      />
                    </label>

                    <label className="mb-4 block">
                      <span className="mb-1 block text-sm font-medium text-neutral-700">
                        Раздел
                      </span>
                      <select
                        value={activeReviewForm.category}
                        onChange={(e) =>
                          setReviewForm({
                            ...activeReviewForm,
                            category: e.target.value,
                          })
                        }
                        className="h-11 w-full rounded-md border border-neutral-300 bg-white px-3 outline-none focus:border-blue-600"
                      >
                        {CATEGORIES.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="mb-4 block">
                      <span className="mb-1 block text-sm font-medium text-neutral-700">
                        Ответ для бота
                      </span>
                      <textarea
                        value={activeReviewForm.content}
                        onChange={(e) =>
                          setReviewForm({
                            ...activeReviewForm,
                            content: e.target.value,
                          })
                        }
                        className="min-h-72 w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 leading-6 outline-none focus:border-blue-600"
                      />
                    </label>

                    <div className="grid gap-3 md:grid-cols-[1fr_140px]">
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-neutral-700">
                          Источник
                        </span>
                        <input
                          value={activeReviewForm.source}
                          onChange={(e) =>
                            setReviewForm({
                              ...activeReviewForm,
                              source: e.target.value,
                            })
                          }
                          className="h-11 w-full rounded-md border border-neutral-300 bg-white px-3 outline-none focus:border-blue-600"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-neutral-700">
                          Приоритет
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={activeReviewForm.priority}
                          onChange={(e) =>
                            setReviewForm({
                              ...activeReviewForm,
                              priority: Number(e.target.value),
                            })
                          }
                          className="h-11 w-full rounded-md border border-neutral-300 bg-white px-3 outline-none focus:border-blue-600"
                        />
                      </label>
                    </div>
                  </div>

                  <aside className="h-fit rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                    <h3 className="font-semibold">Действия</h3>
                    <p className="mt-2 text-sm leading-5 text-neutral-500">
                      Подтверждение сохранит правки, поставит статус “проверено” и пересчитает embedding.
                    </p>

                    <div className="mt-4 grid gap-2">
                      <button
                        onClick={() => void confirmReviewItem()}
                        disabled={saving}
                        className="h-11 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
                      >
                        {saving ? "Сохраняю..." : "Подтвердить и дальше"}
                      </button>
                      <button
                        onClick={skipReviewItem}
                        disabled={saving || reviewItems.length < 2}
                        className="h-11 rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
                      >
                        Пропустить
                      </button>
                      <button
                        onClick={() => void deleteItem(currentReviewItem)}
                        disabled={saving}
                        className="h-11 rounded-md border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-neutral-400"
                      >
                        Удалить запись
                      </button>
                    </div>
                  </aside>
                </div>
              )}
            </section>
          </>
        ) : activeTab === "requests" ? (
          <>
            <section className="mb-5 grid gap-3 md:grid-cols-3">
              {requestCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setActiveRequestCategory(category.id)}
                  className={`rounded-lg border p-4 text-left transition ${
                    activeRequestCategory === category.id
                      ? "border-blue-300 bg-blue-50"
                      : "border-neutral-200 bg-white hover:border-blue-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{category.title}</div>
                      <p className="mt-1 text-sm leading-5 text-neutral-500">
                        {category.hint}
                      </p>
                    </div>
                    <span className="rounded-md bg-white px-2 py-1 text-sm font-semibold text-neutral-700">
                      {category.total}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-md bg-white/80 p-2">
                      <div className="text-neutral-400">Новые</div>
                      <div className="mt-1 font-semibold text-neutral-900">
                        {category.pending}
                      </div>
                    </div>
                    <div className="rounded-md bg-white/80 p-2">
                      <div className="text-neutral-400">
                        {category.id === "appointment"
                          ? "Подтвержд."
                          : "В работе"}
                      </div>
                      <div className="mt-1 font-semibold text-neutral-900">
                        {category.active}
                      </div>
                    </div>
                    <div className="rounded-md bg-white/80 p-2">
                      <div className="text-neutral-400">Закрыто</div>
                      <div className="mt-1 font-semibold text-neutral-900">
                        {category.closed}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </section>

            <section className="mb-5 grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">Новые</div>
                <div className="mt-2 text-3xl font-semibold">
                  {activeRequestStats.pending}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">
                  {activeRequestCategory === "appointment"
                    ? "Подтверждено"
                    : "В работе"}
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {activeRequestStats.active}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">Закрыто</div>
                <div className="mt-2 text-3xl font-semibold">
                  {activeRequestStats.closed}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">Всего</div>
                <div className="mt-2 text-3xl font-semibold">
                  {activeRequestStats.total}
                </div>
              </div>
            </section>

            <section className="mb-5 grid gap-3 lg:grid-cols-3">
              {[
                {
                  icon: Clock3,
                  title:
                    activeRequestCategory === "appointment"
                      ? "1. Связаться и подтвердить"
                      : "1. Принять в работу",
                  text:
                    activeRequestCategory === "appointment"
                      ? "Проверить дату, время 15:00-16:00 и контакт заявителя."
                      : "Открыть новые заявки, проверить контакт и исходные данные.",
                },
                {
                  icon: FileCheck2,
                  title: "2. Передать ответственному",
                  text:
                    activeRequestCategory === "meter"
                      ? "Передать данные по счетчику профильному специалисту."
                      : activeRequestCategory === "appeal"
                        ? "Передать обращение по теме ответственному сотруднику."
                        : "Передать запись офис-менеджеру для ручного подтверждения.",
                },
                {
                  icon: CheckCircle2,
                  title: "3. Закрыть статус",
                  text:
                    "После ручной обработки поставить итоговый статус, чтобы очередь оставалась чистой.",
                },
              ].map((step) => (
                <div
                  key={step.title}
                  className="rounded-lg border border-neutral-200 bg-white p-4"
                >
                  <step.icon className="h-5 w-5 text-blue-700" />
                  <div className="mt-3 font-semibold">{step.title}</div>
                  <p className="mt-1 text-sm leading-6 text-neutral-500">
                    {step.text}
                  </p>
                </div>
              ))}
            </section>

            <section className="rounded-lg border border-neutral-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="font-semibold">{activeRequestStats.title}</h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    {activeRequestStats.hint}. Здесь можно принять заявку,
                    подтвердить запись или закрыть после ручной передачи.
                  </p>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
                    <Search className="h-3.5 w-3.5" />
                    Показано: {visibleRequestCount} из {activeRequestStats.total}
                  </div>
                </div>
                <button
                  onClick={() => void loadRequests()}
                  className="h-10 rounded-md border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-50"
                >
                  Обновить
                </button>
              </div>

              <div className="flex flex-wrap gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
                {requestStatusFilters.map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => setActiveRequestStatus(filter.id)}
                    className={`rounded-md border px-3 py-2 text-left text-xs font-semibold transition ${
                      activeRequestStatus === filter.id
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-neutral-200 bg-white text-neutral-600 hover:border-blue-200 hover:text-blue-700"
                    }`}
                    title={filter.hint}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              {requestsLoading ? (
                <div className="p-4 text-sm text-neutral-500">
                  Загружаю заявки...
                </div>
              ) : activeRequestCategory === "meter" &&
                filteredMeterCorrections.length === 0 ? (
                <div className="p-4 text-sm text-neutral-500">
                  Заявок пока нет. После диалога о корректировке они появятся
                  здесь.
                </div>
              ) : activeRequestCategory === "appeal" &&
                filteredAppealRequests.length === 0 ? (
                <div className="p-4 text-sm text-neutral-500">
                  Обращений пока нет. После заполнения формы они появятся
                  здесь.
                </div>
              ) : activeRequestCategory === "appointment" &&
                filteredLeadershipAppointments.length === 0 ? (
                <div className="p-4 text-sm text-neutral-500">
                  Записей к руководству пока нет. После заполнения формы они
                  появятся здесь.
                </div>
              ) : activeRequestCategory === "meter" ? (
                <div className="divide-y divide-neutral-200">
                  {filteredMeterCorrections.map((request) => (
                    <article key={request.id} className="p-4">
                      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                              {request.request_number}
                            </span>
                            <span
                              className={`rounded-md px-2 py-1 text-xs font-medium ${statusClassName(
                                request.status
                              )}`}
                            >
                              {statusLabel(request.status)}
                            </span>
                            <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600">
                              {formatDate(request.created_at)}
                            </span>
                          </div>
                          <h3 className="font-semibold">
                            ЛС {request.account_number} · счетчик{" "}
                            {request.meter_number}
                          </h3>
                          <p className="mt-1 text-sm text-neutral-600">
                            Правильные показания: {request.correct_reading}
                          </p>
                          <p className="mt-1 text-sm text-neutral-600">
                            Контакт: {request.contact}
                          </p>
                          {request.service_type && (
                            <p className="mt-1 text-sm text-neutral-600">
                              Услуга: {request.service_type}
                            </p>
                          )}
                          {request.comment && (
                            <p className="mt-1 text-sm text-neutral-600">
                              Комментарий: {request.comment}
                            </p>
                          )}
                          {request.reason && (
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-500">
                              {request.reason}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() =>
                              void updateMeterCorrectionStatus(
                                request,
                                "in_progress"
                              )
                            }
                            className="h-9 rounded-md border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-50"
                          >
                            В работу
                          </button>
                          <button
                            onClick={() =>
                              void updateMeterCorrectionStatus(request, "done")
                            }
                            className="h-9 rounded-md border border-emerald-200 px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                          >
                            Закрыть
                          </button>
                          <button
                            onClick={() =>
                              void updateMeterCorrectionStatus(
                                request,
                                "rejected"
                              )
                            }
                            className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 hover:bg-red-50"
                          >
                            Отклонить
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : activeRequestCategory === "appeal" ? (
                <div className="divide-y divide-neutral-200">
                  {filteredAppealRequests.map((request) => (
                    <article key={request.id} className="p-4">
                      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-md px-2 py-1 text-xs font-medium ${statusClassName(
                                request.status
                              )}`}
                            >
                              {statusLabel(request.status)}
                            </span>
                            <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600">
                              {formatDate(request.created_at)}
                            </span>
                          </div>
                          <h3 className="font-semibold">{request.topic}</h3>
                          <p className="mt-1 text-sm text-neutral-600">
                            Заявитель: {request.name}
                          </p>
                          {request.contact && (
                            <p className="mt-1 text-sm text-neutral-600">
                              Контакт: {request.contact}
                            </p>
                          )}
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-600">
                            {request.message}
                          </p>
                          {request.attachments?.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {request.attachments.map((file) => (
                                <a
                                  key={`${request.id}-${file.name}-${file.path}`}
                                  href={file.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600"
                                >
                                  {file.name}
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() =>
                              void updateAppealStatus(request, "in_progress")
                            }
                            className="h-9 rounded-md border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-50"
                          >
                            Принято
                          </button>
                          <button
                            onClick={() =>
                              void updateAppealStatus(request, "done")
                            }
                            className="h-9 rounded-md border border-emerald-200 px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                          >
                            Закрыть
                          </button>
                          <button
                            onClick={() =>
                              void updateAppealStatus(request, "rejected")
                            }
                            className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 hover:bg-red-50"
                          >
                            Отклонить
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-neutral-200">
                  {filteredLeadershipAppointments.map((request) => (
                    <article key={request.id} className="p-4">
                      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-md px-2 py-1 text-xs font-medium ${statusClassName(
                                request.status
                              )}`}
                            >
                              {statusLabel(request.status)}
                            </span>
                            <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600">
                              Создано: {formatDate(request.created_at)}
                            </span>
                          </div>
                          <h3 className="font-semibold">
                            {request.first_name} {request.last_name}
                          </h3>
                          <p className="mt-1 text-sm text-neutral-600">
                            Руководитель: {request.leader_title} —{" "}
                            {request.leader_name}
                          </p>
                          <p className="mt-1 text-sm font-medium text-neutral-800">
                            Дата: {formatDay(request.appointment_date)} · Время:{" "}
                            {request.appointment_time}
                          </p>
                          <p className="mt-1 text-sm text-neutral-600">
                            Контакты:{" "}
                            {[request.phone, request.email]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() =>
                              void updateAppointmentStatus(
                                request,
                                "confirmed"
                              )
                            }
                            className="h-9 rounded-md border border-amber-200 px-3 text-sm font-medium text-amber-700 hover:bg-amber-50"
                          >
                            Подтвердить
                          </button>
                          <button
                            onClick={() =>
                              void updateAppointmentStatus(request, "done")
                            }
                            className="h-9 rounded-md border border-emerald-200 px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                          >
                            Завершить
                          </button>
                          <button
                            onClick={() =>
                              void updateAppointmentStatus(
                                request,
                                "cancelled"
                              )
                            }
                            className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 hover:bg-red-50"
                          >
                            Отменить
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : activeTab === "history" ? (
          <>
            <section className="mb-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">Диалогов</div>
                <div className="mt-2 text-3xl font-semibold">
                  {history.length}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">Полезно</div>
                <div className="mt-2 text-3xl font-semibold">
                  {feedbackStats.up}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">Не помогло</div>
                <div className="mt-2 text-3xl font-semibold">
                  {feedbackStats.down}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">
                  Тем к дополнению
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {knowledgeGaps.length}
                </div>
              </div>
            </section>

            <section className="mb-5 rounded-lg border border-neutral-200 bg-white">
              <div className="border-b border-neutral-200 p-4">
                <h2 className="font-semibold">Нужно дополнить базу</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Сюда попадают вопросы, где бот не нашёл точный проверенный
                  ответ или ответил неуверенно через GPT.
                </p>
              </div>

              {gapSetupRequired ? (
                <div className="p-4 text-sm leading-6 text-amber-700">
                  Таблица тем еще не создана. Выполни scripts/chatHistory.sql в Supabase SQL Editor.
                </div>
              ) : filteredKnowledgeGaps.length === 0 ? (
                <div className="p-4 text-sm text-neutral-500">
                  Пока нет новых тем для дополнения.
                </div>
              ) : (
                <div className="divide-y divide-neutral-200">
                  {filteredKnowledgeGaps.map((gap) => (
                    <article key={gap.id} className="p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                              {gap.topic}
                            </span>
                            <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600">
                              {formatDate(gap.created_at)}
                            </span>
                            <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600">
                              {gap.reason}
                            </span>
                          </div>
                          <h3 className="text-base font-semibold">
                            {gap.user_question}
                          </h3>
                          {gap.assistant_answer && (
                            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-neutral-600">
                              {gap.assistant_answer}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            onClick={() => void createKnowledgeFromGap(gap)}
                            className="h-9 rounded-md border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-50"
                          >
                            Добавить в базу
                          </button>
                          <button
                            onClick={() => void closeKnowledgeGap(gap)}
                            className="h-9 rounded-md border border-neutral-300 px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
                          >
                            Закрыть
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-neutral-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="font-semibold">История вопросов</h2>
                  <p className="mt-1 text-sm text-neutral-500">Диалоги, оценки и источники ответов.</p>
                </div>
                <div className="flex gap-2">
                  <input
                    value={historyQuery}
                    onChange={(e) => setHistoryQuery(e.target.value)}
                    className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600 md:w-80"
                    placeholder="Поиск по истории"
                  />
                  <button
                    onClick={() => void loadHistory()}
                    className="h-10 rounded-md border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-50"
                  >
                    Обновить
                  </button>
                </div>
              </div>

              {historyLoading ? (
                <div className="p-4 text-sm text-neutral-500">Загружаю историю...</div>
              ) : filteredHistory.length === 0 ? (
                <div className="p-4 text-sm text-neutral-500">История пока пустая.</div>
              ) : (
                <div className="divide-y divide-neutral-200">
                  {filteredHistory.map((conversation) => {
                    const firstQuestion = conversation.messages.find(
                      (message) => message.role === "user"
                    );
                    const downCount = conversation.messages.filter(
                      (message) => message.feedback === "down"
                    ).length;

                    return (
                      <article key={conversation.id} className="p-4">
                        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600">
                                {formatDate(conversation.updated_at)}
                              </span>
                              {downCount > 0 && (
                                <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700">Есть негативная оценка</span>
                              )}
                            </div>
                            <h3 className="text-base font-semibold">
                              {firstQuestion?.content ?? conversation.title}
                            </h3>
                            <p className="mt-1 text-xs text-neutral-500">
                              {conversation.messages.length} сообщений
                            </p>
                          </div>
                          <button
                            onClick={() => createKnowledgeFromQuestion(conversation)}
                            className="h-9 rounded-md border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-50"
                          >
                            Создать ответ
                          </button>
                        </div>
                        <div className="space-y-3">
                          {conversation.messages.map((message) => (
                            <div
                              key={message.id}
                              className={`rounded-lg border p-3 ${
                                message.role === "user"
                                  ? "border-neutral-200 bg-neutral-50"
                                  : "border-blue-100 bg-blue-50/40"
                              }`}
                            >
                              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-neutral-500">
                                <span>{message.role === "user" ? "Пользователь" : "Бот"}</span>
                                <span>{formatDate(message.created_at)}</span>
                                {message.role === "assistant" && (
                                  <span>{feedbackLabel(message.feedback)}</span>
                                )}
                                {message.source && <span>Источник: {message.source}</span>}
                              </div>
                              <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-700">
                                {message.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        ) : null}
        </section>
      </div>
    </main>
  );
}
