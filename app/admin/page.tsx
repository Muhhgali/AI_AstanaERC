"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

function feedbackLabel(feedback: HistoryMessage["feedback"]) {
  if (feedback === "up") return "Полезно";
  if (feedback === "down") return "Не помогло";
  return "Без оценки";
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<
    "knowledge" | "review" | "history" | "documents"
  >("knowledge");
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [history, setHistory] = useState<HistoryConversation[]>([]);
  const [knowledgeGaps, setKnowledgeGaps] = useState<KnowledgeGap[]>([]);
  const [gapSetupRequired, setGapSetupRequired] = useState(false);
  const [activeGapId, setActiveGapId] = useState<string | null>(null);
  const [form, setForm] = useState<KnowledgeForm>(EMPTY_FORM);
  const [reviewForm, setReviewForm] = useState<KnowledgeForm | null>(null);
  const [query, setQuery] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentNote, setDocumentNote] = useState("");
  const [documentAnalysis, setDocumentAnalysis] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [reviewIndex, setReviewIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(false);
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

  useEffect(() => {
    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      await loadKnowledge();
      await loadHistory();
    };

    void checkUser();
  }, [loadHistory, loadKnowledge, router]);

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

  const createKnowledgeFromGap = (gap: KnowledgeGap) => {
    setForm({
      ...EMPTY_FORM,
      title: gap.topic.slice(0, 90),
      content: "",
      source: "knowledge-gap",
      verified: true,
    });
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

  const analyzeDocument = async () => {
    if (!documentFile) {
      setError("Загрузи PDF-файл для анализа.");
      return;
    }

    const token = await getAccessToken();

    if (!token) {
      router.push("/login");
      return;
    }

    const formData = new FormData();
    formData.append("file", documentFile);
    formData.append("note", documentNote);

    setDocumentLoading(true);
    setDocumentAnalysis("");
    setDocumentName("");
    setError("");

    try {
      const res = await fetch("/api/admin/documents/analyze", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = (await res.json().catch(() => ({}))) as {
        analysis?: string;
        fileName?: string;
        message?: string;
      };

      if (!res.ok) {
        if (res.status === 401) {
          await supabase.auth.signOut();
          router.push("/login?reason=session");
          throw new Error("Сессия не прошла проверку. Войди заново.");
        }

        throw new Error(data.message ?? "Не удалось проанализировать PDF");
      }

      setDocumentAnalysis(data.analysis ?? "");
      setDocumentName(data.fileName ?? documentFile.name);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Не удалось проанализировать PDF";
      setError(message);
    } finally {
      setDocumentLoading(false);
    }
  };

  const createKnowledgeFromDocument = () => {
    setForm({
      ...EMPTY_FORM,
      title: documentName
        ? `Черновик из PDF: ${documentName}`.slice(0, 90)
        : "Черновик из PDF",
      content: documentAnalysis,
      source: "pdf-analysis",
      verified: false,
      priority: 70,
    });
    setActiveTab("knowledge");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-neutral-950">
      <header className="border-b border-neutral-200 bg-white">
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

      <div className="mx-auto max-w-7xl px-5 py-6">
        <div className="mb-5 flex gap-2 rounded-lg border border-neutral-200 bg-white p-1">
          <button
            onClick={() => setActiveTab("knowledge")}
            className={`h-10 rounded-md px-4 text-sm font-semibold ${
              activeTab === "knowledge"
                ? "bg-blue-600 text-white"
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
            className={`h-10 rounded-md px-4 text-sm font-semibold ${
              activeTab === "history"
                ? "bg-blue-600 text-white"
                : "text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            История вопросов
          </button>
          <button
            onClick={() => setActiveTab("review")}
            className={`h-10 rounded-md px-4 text-sm font-semibold ${
              activeTab === "review"
                ? "bg-blue-600 text-white"
                : "text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            Проверка ({reviewItems.length})
          </button>
          <button
            onClick={() => setActiveTab("documents")}
            className={`h-10 rounded-md px-4 text-sm font-semibold ${
              activeTab === "documents"
                ? "bg-blue-600 text-white"
                : "text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            PDF-анализ
          </button>
        </div>

        {error && (
          <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {activeTab === "knowledge" ? (
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
                  Таблица тем ещё не создана. Выполни scripts/chatHistory.sql в
                  Supabase SQL Editor, после этого новые непонятные вопросы
                  начнут появляться здесь.
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
                            {typeof gap.top_similarity === "number" && (
                              <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600">
                                {Math.round(gap.top_similarity * 100)}%
                              </span>
                            )}
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
                            onClick={() => createKnowledgeFromGap(gap)}
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
                  <p className="mt-1 text-sm text-neutral-500">
                    Реальные диалоги пользователей и оценки ответов
                  </p>
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
                <div className="p-4 text-sm text-neutral-500">
                  Загружаю историю...
                </div>
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
                                <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                                  Есть негативная оценка
                                </span>
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
                            onClick={() =>
                              createKnowledgeFromQuestion(conversation)
                            }
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
                                <span>
                                  {message.role === "user"
                                    ? "Пользователь"
                                    : "Бот"}
                                </span>
                                <span>{formatDate(message.created_at)}</span>
                                {message.role === "assistant" && (
                                  <span>{feedbackLabel(message.feedback)}</span>
                                )}
                                {message.source && (
                                  <span>Источник: {message.source}</span>
                                )}
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

                  {filteredHistory.length === 0 && (
                    <div className="p-4 text-sm text-neutral-500">
                      История пока пустая. После выполнения SQL и первых
                      диалогов записи появятся здесь.
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            <section className="mb-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">Файл</div>
                <div className="mt-2 text-2xl font-semibold">
                  {documentFile ? "PDF выбран" : "Нет файла"}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">Статус</div>
                <div className="mt-2 text-2xl font-semibold">
                  {documentLoading ? "Анализирую" : "Готов"}
                </div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="text-sm text-neutral-500">Результат</div>
                <div className="mt-2 text-2xl font-semibold">
                  {documentAnalysis ? "Есть отчет" : "Пока пусто"}
                </div>
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
              <section className="h-fit rounded-lg border border-neutral-200 bg-white p-5">
                <h2 className="font-semibold">Загрузка PDF</h2>
                <p className="mt-1 text-sm leading-5 text-neutral-500">
                  Загрузи документ, инструкцию или регламент. ИИ выделит факты,
                  спорные места и черновики записей для базы знаний.
                </p>

                <label className="mt-5 block">
                  <span className="mb-1 block text-sm font-medium text-neutral-700">
                    PDF-файл
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => {
                      setDocumentFile(e.target.files?.[0] ?? null);
                      setDocumentAnalysis("");
                      setDocumentName("");
                    }}
                    className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700"
                  />
                </label>

                <label className="mt-4 block">
                  <span className="mb-1 block text-sm font-medium text-neutral-700">
                    Что проверить
                  </span>
                  <textarea
                    value={documentNote}
                    onChange={(e) => setDocumentNote(e.target.value)}
                    className="min-h-28 w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-blue-600"
                    placeholder="Например: проверь контакты, сроки передачи показаний, ошибки в формулировках."
                  />
                </label>

                <button
                  onClick={() => void analyzeDocument()}
                  disabled={!documentFile || documentLoading}
                  className="mt-4 h-11 w-full rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-400"
                >
                  {documentLoading ? "Анализирую PDF..." : "Проанализировать"}
                </button>

                {documentAnalysis && (
                  <button
                    onClick={createKnowledgeFromDocument}
                    className="mt-2 h-11 w-full rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold hover:bg-neutral-50"
                  >
                    Создать черновик knowledge
                  </button>
                )}
              </section>

              <section className="rounded-lg border border-neutral-200 bg-white">
                <div className="border-b border-neutral-200 p-4">
                  <h2 className="font-semibold">Отчет ИИ</h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    {documentName
                      ? `Документ: ${documentName}`
                      : "После анализа здесь появятся факты, риски и черновики."}
                  </p>
                </div>

                {documentAnalysis ? (
                  <div className="whitespace-pre-wrap p-4 text-sm leading-6 text-neutral-700">
                    {documentAnalysis}
                  </div>
                ) : (
                  <div className="p-4 text-sm leading-6 text-neutral-500">
                    Пока отчет пустой. Выбери PDF слева и нажми
                    “Проанализировать”.
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
