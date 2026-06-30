"use client";

import {
  ArrowDown,
  ArrowUp,
  Bot,
  ClipboardList,
  Download,
  History,
  Languages,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
  Square,
  ThumbsDown,
  ThumbsUp,
  UploadCloud,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import type {
  ChatMessage,
  ChatResponse,
  HistoryMessage,
  HistoryConversation,
  StoredConversationSummary,
  RequestStatusItem,
  ChatLanguage,
  OperatorHandoff,
  SupplierManagerCard,
  MeterCorrectionValues,
  MeterCorrectionServiceOption,
  MeterCorrectionForm,
  SupportCard,
  AppealRequestValues,
  AppointmentRequestValues,
} from "@/lib/types";

const LEADERSHIP_OPTIONS = [
  {
    value: "general_director",
    label: "Генеральный директор — Бекенов А.Б.",
    weekday: 3,
  },
  {
    value: "deputy_director",
    label: "Заместитель директора — Акижанов М.Ж.",
    weekday: 4,
  },
] as const;

const STORAGE_MESSAGES = "astana_erc_widget_messages";
const STORAGE_CONVERSATION_ID = "astana_erc_widget_conversation_id";
const STORAGE_CHAT_INDEX = "astana_erc_chat_index";
const STORAGE_VISITOR_ID = "astana_erc_visitor_id";
const STORAGE_LANGUAGE = "astana_erc_language";

const QUICK_PROMPTS = [
  "Как оплатить ЕПД?",
  "Куда передать показания?",
  "Что делать при ошибочной оплате?",
];

function sourceLabel(source?: string) {
  if (source === "knowledge-direct") return "База знаний";
  if (source === "gpt") return "AI + база";
  if (source === "uncertain") return "Нужна проверка";
  if (source === "supplier-manager") return "Поставщик";
  if (source === "billing-guidance") return "Начисления";
  if (source === "appeal-form") return "Обращение";
  if (source === "appeal-sent") return "Отправлено";
  if (source === "appeal-saved") return "Принято";
  if (source === "appointment-form") return "Прием";
  if (source === "appointment-sent") return "Отправлено";
  if (source === "appointment-saved") return "Принято";
  if (source === "operator-handoff") return "Оператор";
  if (source === "receipt-analysis") return "Квитанция";
  if (source === "error") return "Ошибка";
  return source ?? "Ответ";
}

function requestStatusLabel(status: string) {
  if (status === "new") return "Новая";
  if (status === "in_progress") return "В работе";
  if (status === "done") return "Выполнена";
  if (status === "rejected") return "Отклонена";
  if (status === "confirmed") return "Подтверждена";
  if (status === "cancelled") return "Отменена";
  return status;
}

function requestTypeLabel(type: RequestStatusItem["type"]) {
  if (type === "meter") return "Показания";
  if (type === "appointment") return "Прием";
  return "Обращение";
}

function buildRequestSummary(items: RequestStatusItem[]) {
  return {
    new: items.filter((item) => item.status === "new").length,
    active: items.filter((item) =>
      ["in_progress", "confirmed"].includes(item.status)
    ).length,
    closed: items.filter((item) =>
      ["done", "rejected", "cancelled"].includes(item.status)
    ).length,
  };
}

function formatShortDate(value?: string) {
  if (!value) return "";

  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildConversationSummary(
  id: string,
  messages: ChatMessage[]
): StoredConversationSummary {
  const firstUserMessage =
    messages.find((message) => message.role === "user")?.content ??
    "Новый диалог";
  const lastMessage = messages.at(-1)?.content ?? firstUserMessage;

  return {
    id,
    title: firstUserMessage.slice(0, 64),
    preview: lastMessage.slice(0, 96),
    updatedAt: new Date().toISOString(),
  };
}

function readConversationIndex() {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_CHAT_INDEX) ?? "[]"
    ) as StoredConversationSummary[];

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    window.localStorage.removeItem(STORAGE_CHAT_INDEX);
    return [];
  }
}

function writeConversationIndex(items: StoredConversationSummary[]) {
  window.localStorage.setItem(
    STORAGE_CHAT_INDEX,
    JSON.stringify(items.slice(0, 30))
  );
}

function getOrCreateVisitorId() {
  const saved = window.localStorage.getItem(STORAGE_VISITOR_ID);

  if (saved) {
    return saved;
  }

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  window.localStorage.setItem(STORAGE_VISITOR_ID, id);
  return id;
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

function MeterCorrectionFormCard({
  form,
  disabled,
  onSubmit,
}: {
  form: MeterCorrectionForm;
  disabled: boolean;
  onSubmit: (values: MeterCorrectionValues) => Promise<boolean>;
}) {
  const [values, setValues] = useState<MeterCorrectionValues>({
    accountNumber: form.values?.accountNumber ?? "",
    serviceType: form.values?.serviceType ?? "",
    meterNumber: form.values?.meterNumber ?? "",
    correctReading: form.values?.correctReading ?? "",
    contact: form.values?.contact ?? "",
    comment: form.values?.comment ?? "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const requiredMissing =
    !values.accountNumber?.trim() ||
    !values.serviceType?.trim() ||
    !values.meterNumber?.trim() ||
    !values.correctReading?.trim() ||
    !values.contact?.trim();

  const updateValue = (key: keyof MeterCorrectionValues, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setError("");
  };

  const submit = async () => {
    if (requiredMissing) {
      setError("Заполните обязательные поля.");
      return;
    }

    const sent = await onSubmit(values);
    setSubmitted(sent);
  };

  return (
    <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/70 p-2.5">
      <div className="space-y-2">
        <input
          value={values.accountNumber}
          onChange={(event) => updateValue("accountNumber", event.target.value)}
          placeholder="Лицевой счёт *"
          className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-blue-600"
        />
        <select
          value={values.serviceType}
          onChange={(event) => updateValue("serviceType", event.target.value)}
          className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-blue-600"
        >
          <option value="">Вид услуги *</option>
          {form.serviceOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} - {option.provider}
            </option>
          ))}
        </select>
        <input
          value={values.meterNumber}
          onChange={(event) => updateValue("meterNumber", event.target.value)}
          placeholder="Номер счётчика *"
          className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-blue-600"
        />
        <input
          value={values.correctReading}
          onChange={(event) => updateValue("correctReading", event.target.value)}
          placeholder="Верные показания *"
          className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-blue-600"
        />
        <input
          value={values.contact}
          onChange={(event) => updateValue("contact", event.target.value)}
          placeholder="Телефон или email *"
          className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-blue-600"
        />
        <textarea
          value={values.comment}
          onChange={(event) => updateValue("comment", event.target.value)}
          placeholder="Комментарий"
          className="min-h-16 w-full resize-y rounded-md border border-neutral-300 bg-white px-2 py-2 text-xs outline-none focus:border-blue-600"
        />
      </div>
      <button
        onClick={() => void submit()}
        disabled={disabled || submitted}
        className="mt-2 h-9 w-full rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
      >
        {submitted ? "Заявка отправлена" : "Отправить заявку"}
      </button>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatReadableDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    weekday: "long",
  }).format(new Date(year, month - 1, day));
}

function getNextWeekdayDates(weekday: number) {
  const today = new Date();
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dates: string[] = [];

  while (dates.length < 4) {
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getDay() === weekday) dates.push(formatLocalDate(cursor));
  }

  return dates;
}

function AppealRequestFormCard({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (values: AppealRequestValues) => Promise<boolean>;
}) {
  const [values, setValues] = useState<AppealRequestValues>({
    name: "",
    topic: "",
    message: "",
    contact: "",
    files: [],
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const update = (
    key: Exclude<keyof AppealRequestValues, "files">,
    value: string
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setError("");
  };

  const submit = async () => {
    if (!values.name.trim() || !values.topic.trim() || !values.message.trim()) {
      setError("Заполните имя, тему и сообщение.");
      return;
    }

    setSubmitted(await onSubmit(values));
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-emerald-100 bg-emerald-50/70 p-2.5">
      <input
        value={values.name}
        onChange={(event) => update("name", event.target.value)}
        placeholder="Имя *"
        className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-emerald-600"
      />
      <input
        value={values.topic}
        onChange={(event) => update("topic", event.target.value)}
        placeholder="Тема *"
        className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-emerald-600"
      />
      <textarea
        value={values.message}
        onChange={(event) => update("message", event.target.value)}
        placeholder="Ваше сообщение *"
        className="min-h-16 w-full resize-y rounded-md border border-neutral-300 bg-white px-2 py-2 text-xs outline-none focus:border-emerald-600"
      />
      <input
        value={values.contact}
        onChange={(event) => update("contact", event.target.value)}
        placeholder="Телефон или email"
        className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-emerald-600"
      />
      <input
        type="file"
        multiple
        onChange={(event) =>
          setValues((prev) => ({
            ...prev,
            files: Array.from(event.target.files ?? []),
          }))
        }
        className="w-full rounded-md border border-dashed border-neutral-300 bg-white px-2 py-2 text-xs file:mr-2 file:rounded-md file:border-0 file:bg-neutral-900 file:px-2 file:py-1.5 file:text-[11px] file:font-semibold file:text-white"
      />
      <button
        onClick={() => void submit()}
        disabled={disabled || submitted}
        className="h-9 w-full rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white disabled:bg-neutral-300"
      >
        {submitted ? "Обращение отправлено" : "Отправить обращение"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function AppointmentRequestFormCard({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (values: AppointmentRequestValues) => Promise<boolean>;
}) {
  const [values, setValues] = useState<AppointmentRequestValues>({
    firstName: "",
    lastName: "",
    leader: "general_director",
    date: "",
    phone: "",
    email: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const leader = LEADERSHIP_OPTIONS.find(
    (item) => item.value === values.leader
  );
  const dates = getNextWeekdayDates(leader?.weekday ?? 3);

  const update = (key: keyof AppointmentRequestValues, value: string) => {
    setValues((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "leader" ? { date: "" } : {}),
    }));
    setError("");
  };

  const submit = async () => {
    if (
      !values.firstName.trim() ||
      !values.lastName.trim() ||
      !values.date ||
      (!values.phone.trim() && !values.email.trim())
    ) {
      setError("Заполните поля и телефон или Email.");
      return;
    }

    setSubmitted(await onSubmit(values));
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-violet-100 bg-violet-50/70 p-2.5">
      <p className="text-[11px] leading-5 text-violet-950">
        Выберите удобную дату. Время приема фиксированное: 15:00–16:00.
      </p>
      <input
        value={values.firstName}
        onChange={(event) => update("firstName", event.target.value)}
        placeholder="Имя *"
        className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-violet-600"
      />
      <input
        value={values.lastName}
        onChange={(event) => update("lastName", event.target.value)}
        placeholder="Фамилия *"
        className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-violet-600"
      />
      <select
        value={values.leader}
        onChange={(event) => update("leader", event.target.value)}
        className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-violet-600"
      >
        {LEADERSHIP_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        value={values.date}
        onChange={(event) => update("date", event.target.value)}
        className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-violet-600"
      >
        <option value="">Дата приема *</option>
        {dates.map((date) => (
          <option key={date} value={date}>
            {formatReadableDate(date)}
          </option>
        ))}
      </select>
      <div className="rounded-md bg-white/70 px-2 py-1.5 text-[11px] font-medium text-violet-900">
        Время приема: 15:00–16:00
      </div>
      <input
        value={values.phone}
        onChange={(event) => update("phone", event.target.value)}
        placeholder="Телефон"
        className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-violet-600"
      />
      <input
        value={values.email}
        onChange={(event) => update("email", event.target.value)}
        placeholder="Email"
        className="h-9 w-full rounded-md border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-violet-600"
      />
      <button
        onClick={() => void submit()}
        disabled={disabled || submitted}
        className="h-9 w-full rounded-md bg-violet-700 px-3 text-xs font-semibold text-white disabled:bg-neutral-300"
      >
        {submitted ? "Заявка отправлена" : "Записаться на прием"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function WidgetPage() {
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [visitorId, setVisitorId] = useState("");
  const [language, setLanguage] = useState<ChatLanguage>("ru");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [chatAtBottom, setChatAtBottom] = useState(true);
  const [chatCanScrollTop, setChatCanScrollTop] = useState(false);
  const [toolPanel, setToolPanel] = useState<
    "history" | "search" | "requests" | null
  >(null);
  const [chatSearch, setChatSearch] = useState("");
  const [conversationIndex, setConversationIndex] = useState<
    StoredConversationSummary[]
  >([]);
  const [historyConversations, setHistoryConversations] = useState<
    HistoryConversation[]
  >([]);
  const [requestStatuses, setRequestStatuses] = useState<RequestStatusItem[]>(
    []
  );
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [speakingMessageIndex, setSpeakingMessageIndex] = useState<
    number | null
  >(null);
  const [highlightedMessageIndex, setHighlightedMessageIndex] = useState<
    number | null
  >(null);

  const chatScrollRef = useRef<HTMLElement | null>(null);
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const topRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  const knownConversationIds = useMemo(() => {
    return Array.from(
      new Set(
        [conversationId, ...conversationIndex.map((item) => item.id)].filter(
          Boolean
        ) as string[]
      )
    );
  }, [conversationId, conversationIndex]);

  const searchResults = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();

    if (!query) {
      return [];
    }

    return messages
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => message.content.toLowerCase().includes(query));
  }, [chatSearch, messages]);

  const requestSummary = useMemo(
    () => buildRequestSummary(requestStatuses),
    [requestStatuses]
  );

  useEffect(() => {
    void Promise.resolve().then(() => {
      const savedMessages = window.localStorage.getItem(STORAGE_MESSAGES);
      const savedConversationId = window.localStorage.getItem(
        STORAGE_CONVERSATION_ID
      );

      if (savedMessages) {
        try {
          const parsed = JSON.parse(savedMessages) as ChatMessage[];
          setMessages(Array.isArray(parsed) ? parsed : []);
        } catch {
          window.localStorage.removeItem(STORAGE_MESSAGES);
        }
      }

      if (savedConversationId) {
        setConversationId(savedConversationId);
      }

      const savedLanguage = window.localStorage.getItem(STORAGE_LANGUAGE);
      if (savedLanguage === "kk" || savedLanguage === "ru") {
        setLanguage(savedLanguage);
      }

      setVisitorId(getOrCreateVisitorId());
      setConversationIndex(readConversationIndex());
      setStorageReady(true);
    });
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_LANGUAGE, language);
  }, [language, storageReady]);

  useEffect(() => {
    setVoiceSupported("speechSynthesis" in window);

    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_MESSAGES, JSON.stringify(messages));
  }, [messages, storageReady]);

  useEffect(() => {
    if (!storageReady) return;

    if (conversationId) {
      window.localStorage.setItem(STORAGE_CONVERSATION_ID, conversationId);
    } else {
      window.localStorage.removeItem(STORAGE_CONVERSATION_ID);
    }
  }, [conversationId, storageReady]);

  useEffect(() => {
    if (!storageReady || !conversationId || messages.length === 0) {
      return;
    }

    const summary = buildConversationSummary(conversationId, messages);

    setConversationIndex((prev) => {
      const next = [
        summary,
        ...prev.filter((item) => item.id !== conversationId),
      ].slice(0, 30);

      writeConversationIndex(next);
      return next;
    });
  }, [conversationId, messages, storageReady]);

  const updateChatScrollState = () => {
    const container = chatScrollRef.current;

    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    setChatAtBottom(distanceFromBottom < 80);
    setChatCanScrollTop(container.scrollTop > 140);
  };

  const scrollChatToBottom = (behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  };

  const scrollChatToTop = () => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const jumpToMessage = (index: number) => {
    messageRefs.current[index]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setHighlightedMessageIndex(index);
    window.setTimeout(() => setHighlightedMessageIndex(null), 1800);
  };

  useEffect(() => {
    if (chatAtBottom || loading) {
      scrollChatToBottom("smooth");
    }
  }, [chatAtBottom, messages, loading]);

  const sendMessage = async (text = input) => {
    const content = text.trim();

    if (!content || loading) return;

    const userMessage = {
      role: "user",
      content,
    } satisfies ChatMessage;
    const updated = [...messages, userMessage];

    setMessages(updated);
    setInput("");
    setLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId,
          visitorId,
          language,
          messages: updated.map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      });

      const data = (await res.json()) as ChatResponse;

      if (!res.ok) {
        throw new Error(data.message ?? "Не удалось получить ответ.");
      }

      if (data.conversationId) {
        setConversationId(data.conversationId);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: data.messageId,
          role: "assistant",
          content: data.message ?? "Не удалось получить ответ.",
          source: data.source,
          supplierCard: data.supplierCard,
          meterCorrectionForm: data.meterCorrectionForm,
          suggestedQuestions: data.suggestedQuestions,
          supportCard: data.supportCard,
          appealForm: data.appealForm,
          appointmentForm: data.appointmentForm,
          operatorHandoff: data.operatorHandoff,
        },
      ]);
    } catch (error) {
      console.error("WIDGET CHAT ERROR:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Не получилось получить ответ. Проверь подключение и попробуй ещё раз.",
          source: "error",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const submitMeterCorrection = async (values: MeterCorrectionValues) => {
    if (loading) return false;

    const userMessage = {
      role: "user",
      content: "Отправлена форма корректировки показаний",
    } satisfies ChatMessage;
    const updated = [...messages, userMessage];

    setMessages(updated);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId,
          visitorId,
          language,
          messages: updated.map(({ role, content }) => ({
            role,
            content,
          })),
          meterCorrection: values,
        }),
      });

      const data = (await res.json()) as ChatResponse;

      if (!res.ok) {
        throw new Error(data.message ?? "Не удалось отправить заявку.");
      }

      if (data.conversationId) {
        setConversationId(data.conversationId);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: data.messageId,
          role: "assistant",
          content: data.message ?? "Заявка отправлена.",
          source: data.source,
          suggestedQuestions: data.suggestedQuestions,
          supportCard: data.supportCard,
        },
      ]);
      window.setTimeout(() => void loadRequestStatuses(), 300);
      return true;
    } catch (error) {
      console.error("WIDGET METER CORRECTION ERROR:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Не удалось отправить заявку.",
          source: "error",
        },
      ]);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const startAppealRequest = () => {
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content:
          "Заполните обращение. Можно указать контакт и приложить документы или файлы.",
        source: "appeal-form",
        appealForm: true,
      },
    ]);
  };

  const startAppointmentRequest = () => {
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content:
          "Заполните заявку на прием к руководству. Время приема: 15:00–16:00.",
        source: "appointment-form",
        appointmentForm: true,
      },
    ]);
  };

  const submitAppealRequest = async (values: AppealRequestValues) => {
    if (loading) return false;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: `Обращение: ${values.topic}` },
    ]);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("name", values.name);
      formData.append("topic", values.topic);
      formData.append("message", values.message);
      formData.append("contact", values.contact);
      if (conversationId) {
        formData.append("conversationId", conversationId);
      }
      if (visitorId) {
        formData.append("visitorId", visitorId);
      }
      values.files.forEach((file) => formData.append("files", file));

      const res = await fetch("/api/requests/appeal", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as {
        message?: string;
        emailSent?: boolean;
      };

      if (!res.ok) throw new Error(data.message ?? "Не удалось отправить.");

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            data.message ??
            "Обращение отправлено. Специалист рассмотрит сообщение.",
          source: data.emailSent ? "appeal-sent" : "appeal-saved",
        },
      ]);
      window.setTimeout(() => void loadRequestStatuses(), 300);
      return true;
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error instanceof Error ? error.message : "Не удалось отправить.",
          source: "error",
        },
      ]);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const submitAppointmentRequest = async (
    values: AppointmentRequestValues
  ) => {
    if (loading) return false;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: "Заявка на прием к руководству" },
    ]);
    setLoading(true);

    try {
      const res = await fetch("/api/requests/appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          conversationId,
          visitorId,
          clientDate: formatLocalDate(new Date()),
        }),
      });
      const data = (await res.json()) as {
        message?: string;
        emailSent?: boolean;
      };

      if (!res.ok) throw new Error(data.message ?? "Не удалось отправить.");

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            data.message ??
            "Заявка отправлена. Офис-менеджер свяжется с вами.",
          source: data.emailSent ? "appointment-sent" : "appointment-saved",
        },
      ]);
      window.setTimeout(() => void loadRequestStatuses(), 300);
      return true;
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error instanceof Error ? error.message : "Не удалось отправить.",
          source: "error",
        },
      ]);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const rateMessage = async (
    messageIndex: number,
    messageId: string | undefined,
    feedback: "up" | "down"
  ) => {
    setMessages((prev) =>
      prev.map((message, index) =>
        index === messageIndex ? { ...message, feedback } : message
      )
    );

    if (!messageId) return;

    try {
      await fetch("/api/chat/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messageId,
          feedback,
        }),
      });
    } catch (error) {
      console.error("WIDGET FEEDBACK ERROR:", error);
    }
  };

  const loadHistory = async () => {
    setToolPanel("history");
    setPanelError("");

    if (knownConversationIds.length === 0) {
      setHistoryConversations([]);
      return;
    }

    setPanelLoading(true);

    try {
      const res = await fetch("/api/chat/history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationIds: knownConversationIds,
          visitorId,
        }),
      });
      const data = (await res.json()) as {
        conversations?: HistoryConversation[];
        message?: string;
      };

      if (!res.ok) {
        throw new Error(data.message ?? "Не удалось загрузить историю.");
      }

      setHistoryConversations(data.conversations ?? []);
    } catch (error) {
      setPanelError(
        error instanceof Error ? error.message : "Не удалось загрузить историю."
      );
    } finally {
      setPanelLoading(false);
    }
  };

  const loadRequestStatuses = async () => {
    setToolPanel("requests");
    setPanelError("");

    if (knownConversationIds.length === 0) {
      setRequestStatuses([]);
      return;
    }

    setPanelLoading(true);

    try {
      const res = await fetch("/api/requests/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationIds: knownConversationIds,
          visitorId,
        }),
      });
      const data = (await res.json()) as {
        requests?: RequestStatusItem[];
        message?: string;
      };

      if (!res.ok) {
        throw new Error(data.message ?? "Не удалось загрузить статусы.");
      }

      setRequestStatuses(data.requests ?? []);
    } catch (error) {
      setPanelError(
        error instanceof Error ? error.message : "Не удалось загрузить статусы."
      );
    } finally {
      setPanelLoading(false);
    }
  };

  const openHistoryConversation = (conversation: HistoryConversation) => {
    setConversationId(conversation.id);
    setMessages(
      conversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        source: message.source,
        feedback: message.feedback,
      }))
    );
    setToolPanel(null);
    window.setTimeout(() => scrollChatToBottom("auto"), 0);
  };

  const downloadTranscript = () => {
    if (messages.length === 0) {
      return;
    }

    const content = [
      "Диалог с AI-помощником Астана-ЕРЦ",
      `Дата выгрузки: ${new Date().toLocaleString("ru-RU")}`,
      conversationId ? `ID диалога: ${conversationId}` : "",
      "",
      ...messages.map((message) =>
        [
          message.role === "user" ? "Житель" : "Бот",
          message.source ? ` (${sourceLabel(message.source)})` : "",
          ": ",
          message.content,
        ].join("")
      ),
    ]
      .filter(Boolean)
      .join("\n\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/plain;charset=utf-8" })
    );
    const link = document.createElement("a");

    link.href = url;
    link.download = `astana-erc-chat-${new Date()
      .toISOString()
      .slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const analyzeReceiptFile = async (file: File) => {
    if (receiptUploading) {
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content:
          language === "kk"
            ? `Түбіртек жүктелді: ${file.name}`
            : `Загружена квитанция: ${file.name}`,
      },
    ]);
    setReceiptUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("language", language);
      if (conversationId) {
        formData.append("conversationId", conversationId);
      }
      if (visitorId) {
        formData.append("visitorId", visitorId);
      }

      const res = await fetch("/api/receipts/analyze", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as {
        message?: string;
        source?: string;
        suggestedQuestions?: string[];
      };

      if (!res.ok) {
        throw new Error(data.message ?? "Не удалось проверить файл.");
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.message ?? "",
          source: data.source ?? "receipt-analysis",
          suggestedQuestions: data.suggestedQuestions,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error instanceof Error ? error.message : "Не удалось проверить файл.",
          source: "error",
        },
      ]);
    } finally {
      setReceiptUploading(false);
      if (receiptInputRef.current) {
        receiptInputRef.current.value = "";
      }
    }
  };

  const toggleSpeakMessage = (text: string, index: number) => {
    if (!voiceSupported) {
      return;
    }

    if (speakingMessageIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingMessageIndex(null);
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === "kk" ? "kk-KZ" : "ru-RU";
    utterance.rate = 0.96;
    utterance.onend = () => setSpeakingMessageIndex(null);
    utterance.onerror = () => setSpeakingMessageIndex(null);

    setSpeakingMessageIndex(index);
    window.speechSynthesis.speak(utterance);
  };

  const clearChat = () => {
    setMessages([]);
    setInput("");
    setConversationId(undefined);
    setSpeakingMessageIndex(null);
    window.speechSynthesis?.cancel();
    window.localStorage.removeItem(STORAGE_MESSAGES);
    window.localStorage.removeItem(STORAGE_CONVERSATION_ID);
    textareaRef.current?.focus();
  };

  const handleGuidedAction = (text: string) => {
    const normalized = text.toLowerCase();

    if (
      normalized.includes("обращение") ||
      normalized.includes("өтініш") ||
      normalized.includes("шағым")
    ) {
      startAppealRequest();
      return;
    }

    if (
      normalized.includes("прием") ||
      normalized.includes("приём") ||
      normalized.includes("қабылдау") ||
      normalized.includes("жазыл")
    ) {
      startAppointmentRequest();
      return;
    }

    void sendMessage(text);
  };

  const toggleFullscreen = () => {
    setFullscreen((value) => {
      const next = !value;
      window.parent.postMessage(
        { type: "ASTANA_ERC_WIDGET_FULLSCREEN", fullscreen: next },
        "*"
      );
      return next;
    });
  };

  const closeWidget = () => {
    window.parent.postMessage({ type: "ASTANA_ERC_WIDGET_CLOSE" }, "*");
  };

  return (
    <main
      className={`relative flex h-screen min-h-0 flex-col overflow-hidden bg-white text-neutral-950 ${
        fullscreen ? "fixed inset-0 z-50" : ""
      }`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark size="sm" />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">
              Астана ЕРЦ Поддержка
            </h1>
            <p className="truncate text-xs text-neutral-500">
              ЕПД, оплата, показания, начисления
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className="flex items-center gap-0.5 rounded-md border border-neutral-200 bg-neutral-50 p-0.5">
            <Languages size={13} className="mx-1 text-neutral-400" />
            {(["ru", "kk"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setLanguage(item)}
                className={`h-7 rounded px-1.5 text-[11px] font-semibold ${
                  language === item
                    ? "bg-blue-600 text-white"
                    : "text-neutral-500 hover:bg-white"
                }`}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={clearChat}
            className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
            title="Новый чат"
            aria-label="Новый чат"
          >
            <RefreshCw size={15} />
          </button>
          <button
            onClick={() => void loadHistory()}
            className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
            title="Предыдущие чаты"
            aria-label="Предыдущие чаты"
          >
            <History size={15} />
          </button>
          <button
            onClick={() =>
              setToolPanel((value) => (value === "search" ? null : "search"))
            }
            className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
            title="Поиск по чату"
            aria-label="Поиск по чату"
          >
            <Search size={15} />
          </button>
          <button
            onClick={() => void loadRequestStatuses()}
            className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
            title="Статус заявок"
            aria-label="Статус заявок"
          >
            <ClipboardList size={15} />
          </button>
          <button
            onClick={downloadTranscript}
            disabled={messages.length === 0}
            className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
            title="Скачать диалог"
            aria-label="Скачать диалог"
          >
            <Download size={15} />
          </button>
          <button
            onClick={toggleFullscreen}
            className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
            title={fullscreen ? "Свернуть" : "На весь экран"}
            aria-label={fullscreen ? "Свернуть" : "На весь экран"}
          >
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            onClick={closeWidget}
            className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
            title="Закрыть"
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {toolPanel && (
        <div className="border-b border-neutral-200 bg-white px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-semibold">
              {toolPanel === "history" && "Предыдущие чаты"}
              {toolPanel === "search" && "Поиск по чату"}
              {toolPanel === "requests" && "Статусы заявок"}
            </div>
            <button
              type="button"
              onClick={() => setToolPanel(null)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
              aria-label="Закрыть панель"
              title="Закрыть"
            >
              <X size={13} />
            </button>
          </div>

          {panelError && (
            <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
              {panelError}
            </div>
          )}

          {toolPanel === "search" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5">
                <Search size={13} className="text-neutral-400" />
                <input
                  value={chatSearch}
                  onChange={(event) => setChatSearch(event.target.value)}
                  placeholder="Найти в сообщениях"
                  className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                />
              </div>
              <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
                {chatSearch && searchResults.length === 0 && (
                  <div className="text-[11px] text-neutral-500">
                    Совпадений нет.
                  </div>
                )}
                {searchResults.map(({ message, index }) => (
                  <button
                    key={`${message.role}-${index}`}
                    type="button"
                    onClick={() => jumpToMessage(index)}
                    className="block w-full rounded-md bg-neutral-50 px-2 py-1.5 text-left text-[11px] hover:bg-blue-50"
                  >
                    <span className="font-semibold">
                      {message.role === "user" ? "Вы" : "Бот"}:
                    </span>{" "}
                    {message.content.slice(0, 120)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {toolPanel === "history" && (
            <div className="max-h-32 space-y-1.5 overflow-y-auto pr-1">
              {panelLoading && (
                <div className="text-[11px] text-neutral-500">
                  Загружаю историю...
                </div>
              )}
              {!panelLoading && historyConversations.length === 0 && (
                <div className="text-[11px] text-neutral-500">
                  На этом устройстве пока нет прошлых диалогов.
                </div>
              )}
              {historyConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => openHistoryConversation(conversation)}
                  className="block w-full rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-left hover:border-blue-200 hover:bg-blue-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold">
                      {conversation.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-neutral-400">
                      {formatShortDate(conversation.updated_at)}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-neutral-500">
                    {conversation.messages.at(-1)?.content ??
                      "Сообщений пока нет"}
                  </div>
                </button>
              ))}
            </div>
          )}

          {toolPanel === "requests" && (
            <div className="max-h-32 space-y-1.5 overflow-y-auto pr-1">
              {panelLoading && (
                <div className="text-[11px] text-neutral-500">
                  Проверяю статусы...
                </div>
              )}
              {!panelLoading && requestStatuses.length === 0 && (
                <div className="text-[11px] text-neutral-500">
                  По вашим диалогам заявок пока нет.
                </div>
              )}
              {!panelLoading && requestStatuses.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="rounded-md bg-blue-50 px-2 py-1.5">
                    <div className="text-[10px] text-blue-700">Новые</div>
                    <div className="font-semibold text-blue-950">
                      {requestSummary.new}
                    </div>
                  </div>
                  <div className="rounded-md bg-amber-50 px-2 py-1.5">
                    <div className="text-[10px] text-amber-700">В работе</div>
                    <div className="font-semibold text-amber-950">
                      {requestSummary.active}
                    </div>
                  </div>
                  <div className="rounded-md bg-emerald-50 px-2 py-1.5">
                    <div className="text-[10px] text-emerald-700">Закрыто</div>
                    <div className="font-semibold text-emerald-950">
                      {requestSummary.closed}
                    </div>
                  </div>
                </div>
              )}
              {requestStatuses.map((item) => (
                <div
                  key={`${item.type}-${item.id}`}
                  className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-xs font-semibold">
                      {item.title}
                    </div>
                    <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                      {requestStatusLabel(item.status)}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-neutral-500">
                    {requestTypeLabel(item.type)}
                    {item.detail ? ` · ${item.detail}` : ""}
                    {item.time ? ` · ${item.time}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <section
        ref={chatScrollRef}
        onScroll={updateChatScrollState}
        className="app-scrollbar min-h-0 flex-1 overflow-y-auto bg-[#f3f7fc] px-3 py-4"
      >
        <div ref={topRef} />
        {messages.length === 0 && (
          <div className="soft-enter rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Bot size={17} className="text-blue-600" />
              С чего начнем?
            </div>
            <p className="mt-2 text-sm leading-5 text-neutral-500">
              Напишите вопрос своими словами. Если точного ответа нет, покажу
              куда обратиться.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleGuidedAction(prompt)}
                  className="rounded-full border border-neutral-200 bg-white px-2.5 py-1.5 text-left text-[11px] font-medium leading-4 text-neutral-600 hover:border-blue-300 hover:bg-blue-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <button
                onClick={startAppealRequest}
                className="font-semibold text-emerald-700"
              >
                Оставить обращение
              </button>
              <span className="text-neutral-300">/</span>
              <button
                onClick={startAppointmentRequest}
                className="font-semibold text-violet-700"
              >
                Записаться на прием
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {messages.map((message, index) => {
            const isUser = message.role === "user";

            return (
              <div
                key={`${message.role}-${index}`}
                ref={(node) => {
                  messageRefs.current[index] = node;
                }}
                className={`soft-enter rounded-lg transition ${
                  highlightedMessageIndex === index
                    ? "bg-yellow-100/70 ring-2 ring-yellow-300"
                    : ""
                } flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[86%] rounded-lg px-3 py-2 text-sm leading-6 shadow-sm ${
                    isUser
                      ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white"
                      : "border border-neutral-200 bg-white text-neutral-800"
                  }`}
                >
                  {message.supplierCard && (
                    <div className="mb-2 rounded-lg border border-blue-100 bg-blue-50/70 p-2.5">
                      <div className="flex gap-2.5">
                        {message.supplierCard.photoUrl ? (
                          <div
                            className="h-12 w-12 shrink-0 rounded-md bg-cover bg-center"
                            style={{
                              backgroundImage: `url(${message.supplierCard.photoUrl})`,
                            }}
                            aria-label={message.supplierCard.managerName}
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-blue-600 text-xs font-semibold text-white">
                            {getInitials(message.supplierCard.managerName)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium text-blue-700">
                            Менеджер Астана-ЕРЦ
                          </div>
                          <div className="text-sm font-semibold text-neutral-900">
                            {message.supplierCard.managerName}
                          </div>
                          <div className="text-[11px] text-neutral-500">
                            {message.supplierCard.supplierName}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 space-y-0.5 text-[11px] leading-5 text-neutral-700">
                        <div>
                          Телефон менеджера:{" "}
                          {message.supplierCard.managerPhone || "не указан"}
                        </div>
                        <div>
                          Почта менеджера:{" "}
                          {message.supplierCard.managerEmail || "не указана"}
                        </div>
                      </div>
                      <div className="mt-2 rounded-md bg-white/70 p-2 text-[11px] leading-5 text-neutral-600">
                        <div className="font-semibold text-neutral-800">
                          Данные поставщика
                        </div>
                        <div>БИН: {message.supplierCard.bin || "не указан"}</div>
                        {message.supplierCard.supplierPhone && (
                          <div>
                            Телефон поставщика:{" "}
                            {message.supplierCard.supplierPhone}
                          </div>
                        )}
                        {message.supplierCard.supplierEmail && (
                          <div>
                            Почта поставщика:{" "}
                            {message.supplierCard.supplierEmail}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {!isUser && message.operatorHandoff && (
                    <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50 p-2 text-[11px] text-violet-900">
                      <div className="font-semibold">Очередь оператора</div>
                      <div className="mt-0.5">
                        ID: {message.operatorHandoff.id.slice(0, 8)} ·{" "}
                        {requestStatusLabel(message.operatorHandoff.status)}
                      </div>
                    </div>
                  )}
                  {!isUser && message.supportCard && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                      <div className="text-xs font-semibold text-amber-950">
                        {message.supportCard.title}
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-amber-900">
                        {message.supportCard.description}
                      </p>
                      <div className="mt-2 space-y-1">
                        {message.supportCard.href ? (
                          <a
                            href={message.supportCard.href}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex rounded-md bg-amber-900 px-2.5 py-1.5 text-[11px] font-semibold text-white"
                          >
                            {message.supportCard.contactLabel}:{" "}
                            {message.supportCard.contactValue}
                          </a>
                        ) : (
                          <div className="inline-flex rounded-md bg-amber-900 px-2.5 py-1.5 text-[11px] font-semibold text-white">
                            {message.supportCard.contactLabel}:{" "}
                            {message.supportCard.contactValue}
                          </div>
                        )}
                        {message.supportCard.note && (
                          <div className="text-[11px] leading-5 text-amber-900">
                            {message.supportCard.note}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {!isUser && message.meterCorrectionForm && (
                    <MeterCorrectionFormCard
                      form={message.meterCorrectionForm}
                      disabled={loading}
                      onSubmit={submitMeterCorrection}
                    />
                  )}
                  {!isUser && message.appealForm && (
                    <AppealRequestFormCard
                      disabled={loading}
                      onSubmit={submitAppealRequest}
                    />
                  )}
                  {!isUser && message.appointmentForm && (
                    <AppointmentRequestFormCard
                      disabled={loading}
                      onSubmit={submitAppointmentRequest}
                    />
                  )}
                  {!isUser && message.suggestedQuestions?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {message.suggestedQuestions.map((question) => (
                        <button
                          key={question}
                          type="button"
                          onClick={() => handleGuidedAction(question)}
                          disabled={loading}
                          className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-left text-[11px] font-medium leading-4 text-blue-800 disabled:opacity-60"
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {!isUser && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {message.source && (
                        <span className="rounded-md bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-500">
                          {sourceLabel(message.source)}
                        </span>
                      )}
                      <button
                        onClick={() => toggleSpeakMessage(message.content, index)}
                        disabled={!voiceSupported}
                        className={`flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium ${
                          speakingMessageIndex === index
                            ? "border-blue-300 bg-blue-50 text-blue-700"
                            : "border-neutral-200 text-neutral-500"
                        } disabled:cursor-not-allowed disabled:opacity-40`}
                        title="Прослушать"
                      >
                        {speakingMessageIndex === index ? (
                          <Square size={11} />
                        ) : (
                          <Volume2 size={12} />
                        )}
                      </button>
                      <button
                        onClick={() =>
                          void rateMessage(index, message.id, "up")
                        }
                        className={`flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium ${
                          message.feedback === "up"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-neutral-200 text-neutral-500"
                        }`}
                      >
                        <ThumbsUp size={12} />
                        Да
                      </button>
                      <button
                        onClick={() =>
                          void rateMessage(index, message.id, "down")
                        }
                        className={`flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium ${
                          message.feedback === "down"
                            ? "border-red-300 bg-red-50 text-red-700"
                            : "border-neutral-200 text-neutral-500"
                        }`}
                      >
                        <ThumbsDown size={12} />
                        Нет
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="soft-enter flex justify-start">
              <div className="rounded-lg border border-neutral-200 bg-white px-3 py-3 shadow-sm">
                <div className="flex gap-1">
                  <span className="typing-dot h-2 w-2 rounded-full bg-blue-500" />
                  <span className="typing-dot h-2 w-2 rounded-full bg-blue-500" />
                  <span className="typing-dot h-2 w-2 rounded-full bg-blue-500" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </section>

      {(chatCanScrollTop || !chatAtBottom) && (
        <div className="absolute bottom-20 right-3 z-10 flex flex-col gap-1.5">
          {chatCanScrollTop && (
            <button
              type="button"
              onClick={scrollChatToTop}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white/95 text-neutral-600 shadow-lg"
              title="К началу диалога"
              aria-label="К началу диалога"
            >
              <ArrowUp size={14} />
            </button>
          )}
          {!chatAtBottom && (
            <button
              type="button"
              onClick={() => scrollChatToBottom()}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg"
              title="К последнему сообщению"
              aria-label="К последнему сообщению"
            >
              <ArrowDown size={14} />
            </button>
          )}
        </div>
      )}

      <footer className="shrink-0 border-t border-neutral-200 bg-white p-3">
        <div className="flex items-end gap-2 rounded-lg border border-neutral-300 bg-white p-1.5 shadow-sm transition focus-within:border-blue-500 focus-within:shadow-md">
          <input
            ref={receiptInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void analyzeReceiptFile(file);
              }
            }}
          />
          <button
            type="button"
            onClick={() => receiptInputRef.current?.click()}
            disabled={receiptUploading || loading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-300"
            title="Загрузить квитанцию"
            aria-label="Загрузить квитанцию"
          >
            <UploadCloud size={17} />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            onChange={(event) => {
              setInput(event.target.value);
              event.currentTarget.style.height = "44px";
              event.currentTarget.style.height = `${Math.min(
                event.currentTarget.scrollHeight,
                116
              )}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Напишите вопрос..."
            className="max-h-28 min-h-11 flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-sm leading-5 outline-none"
          />
          <button
            onClick={() => void sendMessage()}
            disabled={!input.trim() || loading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
            title="Отправить"
            aria-label="Отправить"
          >
            <ArrowUp size={17} />
          </button>
        </div>
      </footer>
    </main>
  );
}
