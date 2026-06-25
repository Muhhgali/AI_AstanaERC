"use client";

import Link from "next/link";
import {
  ArrowUp,
  Bot,
  CheckCircle2,
  FileText,
  Mic,
  MicOff,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  User,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "@/components/BrandMark";

type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  source?: string;
  feedback?: "up" | "down";
  supplierCard?: SupplierManagerCard;
  meterCorrectionForm?: MeterCorrectionForm;
};

type ChatResponse = {
  message?: string;
  source?: string;
  conversationId?: string;
  messageId?: string;
  supplierCard?: SupplierManagerCard;
  meterCorrectionForm?: MeterCorrectionForm;
};

type SupplierManagerCard = {
  supplierName: string;
  bin: string;
  managerName: string;
  managerRole: string;
  phone: string;
  email: string;
  photoUrl?: string;
};

type MeterCorrectionValues = {
  accountNumber?: string;
  serviceType?: string;
  meterNumber?: string;
  correctReading?: string;
  contact?: string;
  comment?: string;
};

type MeterCorrectionServiceOption = {
  value: string;
  label: string;
  provider: string;
};

type MeterCorrectionForm = {
  values?: MeterCorrectionValues;
  serviceOptions: MeterCorrectionServiceOption[];
};

type SpeechRecognitionResult = {
  readonly isFinal: boolean;
  readonly [index: number]: {
    readonly transcript: string;
  };
};

type SpeechRecognitionEvent = Event & {
  readonly results: {
    readonly length: number;
    readonly [index: number]: SpeechRecognitionResult;
  };
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const STORAGE_MESSAGES = "astana_erc_chat_messages";
const STORAGE_CONVERSATION_ID = "astana_erc_conversation_id";

const QUICK_PROMPTS = [
  "Можно ли оплатить через Kaspi?",
  "Куда передавать показания электроэнергии?",
  "Что делать при ошибочной оплате?",
  "Где получить дубликат квитанции?",
];

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Проверенные ответы",
    text: "Приоритет у записей, отмеченных как проверенные.",
  },
  {
    icon: Search,
    title: "Память диалога",
    text: "Бот учитывает текущую переписку и сохраняет историю.",
  },
  {
    icon: FileText,
    title: "База знаний",
    text: "Поиск по ЕПД, оплате, показаниям и начислениям.",
  },
];

function sourceLabel(source?: string) {
  if (source === "knowledge-direct") return "База знаний";
  if (source === "gpt") return "AI + база знаний";
  if (source === "supplier-manager") return "Карточка поставщика";
  if (source === "error") return "Ошибка";
  return source ?? "Ответ";
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
    <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Лицевой счёт *
          </span>
          <input
            value={values.accountNumber}
            onChange={(event) => updateValue("accountNumber", event.target.value)}
            className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Вид услуги *
          </span>
          <select
            value={values.serviceType}
            onChange={(event) => updateValue("serviceType", event.target.value)}
            className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
          >
            <option value="">Выберите услугу</option>
            {form.serviceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} - {option.provider}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Номер счётчика *
          </span>
          <input
            value={values.meterNumber}
            onChange={(event) => updateValue("meterNumber", event.target.value)}
            className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Верные показания *
          </span>
          <input
            value={values.correctReading}
            onChange={(event) => updateValue("correctReading", event.target.value)}
            className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Телефон или email для связи *
          </span>
          <input
            value={values.contact}
            onChange={(event) => updateValue("contact", event.target.value)}
            className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-blue-600"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Комментарий
          </span>
          <textarea
            value={values.comment}
            onChange={(event) => updateValue("comment", event.target.value)}
            className="min-h-20 w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600"
          />
        </label>
      </div>

      <button
        onClick={() => void submit()}
        disabled={disabled || submitted}
        className="mt-3 h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
      >
        {submitted ? "Заявка отправлена" : "Отправить заявку"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function Home() {
  const [conversationId, setConversationId] = useState<
    string | undefined
  >();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const hasMessages = messages.length > 0;

  const lastSource = useMemo(() => {
    const assistantMessages = messages.filter(
      (message) => message.role === "assistant"
    );

    return sourceLabel(assistantMessages.at(-1)?.source);
  }, [messages]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      const savedMessages =
        window.localStorage.getItem(STORAGE_MESSAGES);
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

      setStorageReady(true);
    });
  }, []);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    window.localStorage.setItem(
      STORAGE_MESSAGES,
      JSON.stringify(messages)
    );
  }, [messages, storageReady]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    if (conversationId) {
      window.localStorage.setItem(
        STORAGE_CONVERSATION_ID,
        conversationId
      );
    } else {
      window.localStorage.removeItem(STORAGE_CONVERSATION_ID);
    }
  }, [conversationId, storageReady]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const speechWindow = window as SpeechWindow;
    window.setTimeout(() => {
      setSpeechSupported(
        Boolean(
          speechWindow.SpeechRecognition ??
            speechWindow.webkitSpeechRecognition
        )
      );
    }, 0);

    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

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
      textareaRef.current.style.height = "48px";
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId,
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

      const botMessage = {
        id: data.messageId,
        role: "assistant",
        content: data.message ?? "Не удалось получить ответ.",
        source: data.source,
        supplierCard: data.supplierCard,
        meterCorrectionForm: data.meterCorrectionForm,
      } satisfies ChatMessage;

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error("CHAT ERROR:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Не получилось получить ответ. Проверь подключение и попробуй еще раз.",
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
        },
      ]);
      return true;
    } catch (error) {
      console.error("METER CORRECTION ERROR:", error);
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

    if (!messageId) {
      return;
    }

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
      console.error("FEEDBACK ERROR:", error);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setInput("");
    setConversationId(undefined);
    window.localStorage.removeItem(STORAGE_MESSAGES);
    window.localStorage.removeItem(STORAGE_CONVERSATION_ID);
    textareaRef.current?.focus();
  };

  const toggleVoiceInput = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const speechWindow = window as SpeechWindow;
    const SpeechRecognition =
      speechWindow.SpeechRecognition ??
      speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ru-RU";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let transcript = "";

      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
      }

      setInput(transcript.trim());
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      textareaRef.current?.focus();
    };

    recognition.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-neutral-950">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 lg:px-6">
        <header className="mb-4 flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark size="md" variant="full" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold md:text-lg">
                Астана ЕРЦ Поддержка
              </h1>
              <p className="truncate text-sm text-neutral-500">
                Помощник по ЕПД, оплате, показаниям и начислениям
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {false && (
            <Link
              href="/admin"
              className="flex h-10 w-10 items-center justify-center rounded-md border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
              title="Панель управления"
              aria-label="Панель управления"
            >
              <Settings size={17} />
            </Link>
            )}

            <button
              onClick={clearChat}
              className="flex h-10 items-center gap-2 rounded-md border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-50"
            >
              <RefreshCw size={16} />
              <span className="hidden sm:inline">Новый чат</span>
            </button>
          </div>
        </header>

        <div className="grid flex-1 gap-4 lg:grid-cols-[320px_1fr]">
          <aside className="hidden flex-col gap-4 lg:flex">
            <section className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="text-blue-600" size={18} />
                <h2 className="font-semibold">Быстрые вопросы</h2>
              </div>

              <div className="space-y-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => void sendMessage(prompt)}
                    className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-sm leading-5 hover:border-blue-300 hover:bg-white"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-neutral-200 bg-white p-4">
              <h2 className="mb-3 font-semibold">Как отвечает бот</h2>
              <div className="space-y-4">
                {FEATURES.map((feature) => {
                  const Icon = feature.icon;

                  return (
                    <div key={feature.title} className="flex gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
                        <Icon size={17} />
                      </div>
                      <div>
                        <div className="text-sm font-medium">
                          {feature.title}
                        </div>
                        <p className="mt-1 text-sm leading-5 text-neutral-500">
                          {feature.text}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <CheckCircle2 size={17} />
                История и Knowledge подключены
              </div>
              <p className="mt-2 text-sm leading-5 text-emerald-800/80">
                Последний источник: {lastSource}
              </p>
            </section>
          </aside>

          <section className="flex min-h-[calc(100vh-112px)] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <div className="border-b border-neutral-200 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Чат поддержки</h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    Диалог сохраняется и продолжится после обновления страницы
                  </p>
                </div>
                <div className="hidden rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600 sm:block">
                  RAG + Supabase
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-[linear-gradient(#ffffff,#fbfbfc)] px-4 py-5">
              {!hasMessages && (
                <div className="mx-auto flex max-w-2xl flex-col items-center justify-center py-12 text-center">
                  <div className="mb-5">
                    <BrandMark size="lg" />
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    Чем помочь сегодня?
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-500">
                    Спроси про оплату ЕПД, передачу показаний, квитанции,
                    начисления или обращение в поддержку.
                  </p>

                  <div className="mt-6 grid w-full gap-2 sm:grid-cols-2 lg:hidden">
                    {QUICK_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => void sendMessage(prompt)}
                        className="rounded-md border border-neutral-200 bg-white px-3 py-3 text-left text-sm leading-5 hover:border-blue-300"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mx-auto flex max-w-3xl flex-col gap-4">
                {messages.map((msg, index) => {
                  const isUser = msg.role === "user";

                  return (
                    <div
                      key={`${msg.role}-${index}`}
                      className={`flex gap-3 ${
                        isUser ? "justify-end" : "justify-start"
                      }`}
                    >
                      {!isUser && (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
                          <Bot size={18} />
                        </div>
                      )}

                      <div
                        className={`max-w-[82%] rounded-lg px-4 py-3 text-sm leading-6 shadow-sm ${
                          isUser
                            ? "bg-neutral-950 text-white"
                            : "border border-neutral-200 bg-white text-neutral-800"
                        }`}
                      >
                        {msg.supplierCard && (
                          <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                            <div className="flex gap-3">
                              {msg.supplierCard.photoUrl ? (
                                <div
                                  className="h-14 w-14 shrink-0 rounded-md bg-cover bg-center"
                                  style={{
                                    backgroundImage: `url(${msg.supplierCard.photoUrl})`,
                                  }}
                                  aria-label={msg.supplierCard.managerName}
                                />
                              ) : (
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-blue-600 text-sm font-semibold text-white">
                                  {getInitials(msg.supplierCard.managerName)}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-blue-700">
                                  {msg.supplierCard.supplierName}
                                </div>
                                <div className="mt-0.5 font-semibold text-neutral-900">
                                  {msg.supplierCard.managerName}
                                </div>
                                <div className="text-xs text-neutral-500">
                                  {msg.supplierCard.managerRole}
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 grid gap-1 text-xs text-neutral-700 sm:grid-cols-2">
                              <div>БИН: {msg.supplierCard.bin}</div>
                              <div>Телефон: {msg.supplierCard.phone}</div>
                              <div className="sm:col-span-2">
                                Почта: {msg.supplierCard.email}
                              </div>
                            </div>
                          </div>
                        )}
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        {!isUser && msg.meterCorrectionForm && (
                          <MeterCorrectionFormCard
                            form={msg.meterCorrectionForm}
                            disabled={loading}
                            onSubmit={submitMeterCorrection}
                          />
                        )}
                        {!isUser && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {msg.source && (
                              <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-500">
                                Источник: {sourceLabel(msg.source)}
                              </span>
                            )}

                            <button
                              onClick={() =>
                                void rateMessage(index, msg.id, "up")
                              }
                              className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium ${
                                msg.feedback === "up"
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                  : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                              }`}
                            >
                              <ThumbsUp size={13} />
                              Полезно
                            </button>
                            <button
                              onClick={() =>
                                void rateMessage(index, msg.id, "down")
                              }
                              className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium ${
                                msg.feedback === "down"
                                  ? "border-red-300 bg-red-50 text-red-700"
                                  : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                              }`}
                            >
                              <ThumbsDown size={13} />
                              Не помогло
                            </button>
                          </div>
                        )}
                      </div>

                      {isUser && (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
                          <User size={18} />
                        </div>
                      )}
                    </div>
                  );
                })}

                {loading && (
                  <div className="flex justify-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
                      <Bot size={18} />
                    </div>
                    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 shadow-sm">
                      <div className="flex gap-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-400" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-400 [animation-delay:120ms]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-neutral-400 [animation-delay:240ms]" />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            </div>

            <div className="border-t border-neutral-200 bg-white p-4">
              <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-lg border border-neutral-300 bg-white p-2 shadow-sm focus-within:border-blue-500">
                <textarea
                  ref={textareaRef}
                  value={input}
                  rows={1}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.currentTarget.style.height = "48px";
                    e.currentTarget.style.height = `${Math.min(
                      e.currentTarget.scrollHeight,
                      144
                    )}px`;
                  }}
                  placeholder="Напиши вопрос..."
                  className="max-h-36 min-h-12 flex-1 resize-none border-0 bg-transparent px-2 py-3 text-sm leading-6 outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />

                <button
                  onClick={toggleVoiceInput}
                  disabled={!speechSupported || loading}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${
                    listening
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                  } disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-300`}
                  title={
                    speechSupported
                      ? listening
                        ? "Остановить голосовой ввод"
                        : "Голосовой ввод"
                      : "Голосовой ввод не поддерживается браузером"
                  }
                >
                  {listening ? <MicOff size={18} /> : <Mic size={18} />}
                </button>

                <button
                  onClick={() => void sendMessage()}
                  disabled={!input.trim() || loading}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
                  title="Отправить"
                >
                  <ArrowUp size={18} />
                </button>
              </div>
              <p className="mx-auto mt-2 max-w-3xl text-xs text-neutral-400">
                Enter отправляет сообщение, Shift+Enter переносит строку.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
