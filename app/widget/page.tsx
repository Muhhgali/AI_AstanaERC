"use client";

import { ArrowUp, Bot, RefreshCw, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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

const STORAGE_MESSAGES = "astana_erc_widget_messages";
const STORAGE_CONVERSATION_ID = "astana_erc_widget_conversation_id";

const QUICK_PROMPTS = [
  "Как оплатить ЕПД?",
  "Куда передать показания?",
  "Что делать при ошибочной оплате?",
];

function sourceLabel(source?: string) {
  if (source === "knowledge-direct") return "База знаний";
  if (source === "gpt") return "AI + база";
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

export default function WidgetPage() {
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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

      setStorageReady(true);
    });
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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

  const clearChat = () => {
    setMessages([]);
    setInput("");
    setConversationId(undefined);
    window.localStorage.removeItem(STORAGE_MESSAGES);
    window.localStorage.removeItem(STORAGE_CONVERSATION_ID);
    textareaRef.current?.focus();
  };

  const closeWidget = () => {
    window.parent.postMessage({ type: "ASTANA_ERC_WIDGET_CLOSE" }, "*");
  };

  return (
    <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-white text-neutral-950">
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
          <button
            onClick={clearChat}
            className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
            title="Новый чат"
            aria-label="Новый чат"
          >
            <RefreshCw size={15} />
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

      <section className="flex-1 overflow-y-auto bg-[#f7f8fa] px-3 py-4">
        {messages.length === 0 && (
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Bot size={17} className="text-blue-600" />
              Чем помочь?
            </div>
            <p className="mt-2 text-sm leading-5 text-neutral-500">
              Напишите вопрос или выберите быстрый вариант.
            </p>
            <div className="mt-4 grid gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => void sendMessage(prompt)}
                  className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-left text-sm leading-5 hover:border-blue-300 hover:bg-blue-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {messages.map((message, index) => {
            const isUser = message.role === "user";

            return (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[86%] rounded-lg px-3 py-2 text-sm leading-6 shadow-sm ${
                    isUser
                      ? "bg-blue-600 text-white"
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
                            {message.supplierCard.supplierName}
                          </div>
                          <div className="text-sm font-semibold text-neutral-900">
                            {message.supplierCard.managerName}
                          </div>
                          <div className="text-[11px] text-neutral-500">
                            {message.supplierCard.managerRole}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 space-y-0.5 text-[11px] leading-5 text-neutral-700">
                        <div>БИН: {message.supplierCard.bin}</div>
                        <div>Телефон: {message.supplierCard.phone}</div>
                        <div>Почта: {message.supplierCard.email}</div>
                      </div>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {!isUser && message.meterCorrectionForm && (
                    <MeterCorrectionFormCard
                      form={message.meterCorrectionForm}
                      disabled={loading}
                      onSubmit={submitMeterCorrection}
                    />
                  )}
                  {!isUser && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {message.source && (
                        <span className="rounded-md bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-500">
                          {sourceLabel(message.source)}
                        </span>
                      )}
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
            <div className="flex justify-start">
              <div className="rounded-lg border border-neutral-200 bg-white px-3 py-3 shadow-sm">
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
      </section>

      <footer className="border-t border-neutral-200 bg-white p-3">
        <div className="flex items-end gap-2 rounded-lg border border-neutral-300 bg-white p-1.5 focus-within:border-blue-500">
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
