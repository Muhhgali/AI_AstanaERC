"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  History,
  Languages,
  Mic,
  MicOff,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
  UploadCloud,
  User,
  Volume2,
  X,
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
  suggestedQuestions?: string[];
  supportCard?: SupportCard;
  appealForm?: boolean;
  appointmentForm?: boolean;
  operatorHandoff?: OperatorHandoff;
};

type ChatResponse = {
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

type HistoryMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  source?: string;
  feedback?: "up" | "down";
  created_at?: string;
};

type HistoryConversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: HistoryMessage[];
};

type StoredConversationSummary = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
};

type RequestStatusItem = {
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

type ChatLanguage = "ru" | "kk";

type OperatorHandoff = {
  id: string;
  status: string;
  created_at: string;
};

type SupplierManagerCard = {
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

type SupportCard = {
  title: string;
  description: string;
  contactLabel: string;
  contactValue: string;
  note?: string;
  href?: string;
};

type AppealRequestValues = {
  name: string;
  topic: string;
  message: string;
  contact: string;
  files: File[];
};

type AppointmentRequestValues = {
  firstName: string;
  lastName: string;
  leader: "general_director" | "deputy_director";
  date: string;
  phone: string;
  email: string;
};

const LEADERSHIP_OPTIONS = [
  {
    value: "general_director",
    label: "Генеральный директор — Бекенов А.Б.",
    dayLabel: "Среда: 15:00–16:00",
    weekday: 3,
  },
  {
    value: "deputy_director",
    label: "Заместитель директора — Акижанов М.Ж.",
    dayLabel: "Четверг: 15:00–16:00",
    weekday: 4,
  },
] as const;

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
const STORAGE_CHAT_INDEX = "astana_erc_chat_index";
const STORAGE_VISITOR_ID = "astana_erc_visitor_id";
const STORAGE_LANGUAGE = "astana_erc_language";

const QUICK_GROUPS = [
  {
    title: "Часто спрашивают",
    items: [
      "Почему пришла двойная сумма?",
      "Что делать, если оплатил после 25 числа?",
      "Как получить дубликат квитанции?",
    ],
  },
  {
    title: "Показания и счетчики",
    items: [
      "Куда передавать показания электроэнергии?",
      "Нужно исправить показания счетчика",
    ],
  },
  {
    title: "Поставщики",
    items: [
      "Как найти менеджера поставщика?",
      "Найти поставщика по коду или БИН",
    ],
  },
];

const GUIDED_SCENARIOS = [
  {
    title: "Оплата",
    text: "разобрать сумму, оплату после 25-го или ошибочный платеж",
    prompt: "Помогите разобраться с оплатой и суммой в квитанции",
  },
  {
    title: "Показания",
    text: "передать или исправить показания счетчика",
    prompt: "Нужно исправить показания счетчика",
  },
  {
    title: "Квитанция",
    text: "проверить ЕПД, период, сумму и оплату",
    prompt: "Хочу проверить квитанцию и начисления",
  },
  {
    title: "Поставщик",
    text: "найти менеджера по организации, коду или БИН",
    prompt: "Как найти менеджера поставщика?",
  },
];

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Отвечает по базе",
    text: "Если данных не хватает, не придумывает и показывает контакты.",
  },
  {
    icon: Search,
    title: "Ведет дальше",
    text: "После ответа предлагает аккуратные следующие вопросы.",
  },
  {
    icon: FileText,
    title: "Принимает заявки",
    text: "Обращение, запись к руководству и корректировка показаний.",
  },
];

function sourceLabel(source?: string) {
  if (source === "knowledge-direct") return "База знаний";
  if (source === "gpt") return "AI + база знаний";
  if (source === "uncertain") return "Нужна проверка";
  if (source === "supplier-manager") return "Карточка поставщика";
  if (source === "billing-guidance") return "Начисления";
  if (source === "appeal-form") return "Обращение";
  if (source === "appeal-sent") return "Обращение отправлено";
  if (source === "appeal-saved") return "Обращение принято";
  if (source === "appointment-form") return "Запись на прием";
  if (source === "appointment-sent") return "Заявка отправлена";
  if (source === "appointment-saved") return "Заявка принята";
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

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatReadableDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    weekday: "long",
  }).format(date);
}

function getNextWeekdayDates(weekday: number) {
  const today = new Date();
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dates: string[] = [];

  while (dates.length < 4) {
    cursor.setDate(cursor.getDate() + 1);

    if (cursor.getDay() === weekday) {
      dates.push(formatLocalDate(cursor));
    }
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

  const requiredMissing =
    !values.name.trim() || !values.topic.trim() || !values.message.trim();

  const updateValue = (
    key: Exclude<keyof AppealRequestValues, "files">,
    value: string
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setError("");
  };

  const submit = async () => {
    if (requiredMissing) {
      setError("Заполните имя, тему и сообщение.");
      return;
    }

    const sent = await onSubmit(values);
    setSubmitted(sent);
  };

  return (
    <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/70 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Имя *
          </span>
          <input
            value={values.name}
            onChange={(event) => updateValue("name", event.target.value)}
            className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-emerald-600"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Тема *
          </span>
          <input
            value={values.topic}
            onChange={(event) => updateValue("topic", event.target.value)}
            className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-emerald-600"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Ваше сообщение *
          </span>
          <textarea
            value={values.message}
            onChange={(event) => updateValue("message", event.target.value)}
            className="min-h-24 w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Телефон или email
          </span>
          <input
            value={values.contact}
            onChange={(event) => updateValue("contact", event.target.value)}
            className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-emerald-600"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Документы или файлы
          </span>
          <input
            type="file"
            multiple
            onChange={(event) =>
              setValues((prev) => ({
                ...prev,
                files: Array.from(event.target.files ?? []),
              }))
            }
            className="w-full rounded-md border border-dashed border-neutral-300 bg-white px-3 py-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
          />
        </label>
      </div>

      <button
        onClick={() => void submit()}
        disabled={disabled || submitted}
        className="mt-3 h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
      >
        {submitted ? "Обращение отправлено" : "Отправить обращение"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
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
  const requiredMissing =
    !values.firstName.trim() ||
    !values.lastName.trim() ||
    !values.leader ||
    !values.date ||
    (!values.phone.trim() && !values.email.trim());

  const updateValue = (key: keyof AppointmentRequestValues, value: string) => {
    setValues((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "leader" ? { date: "" } : {}),
    }));
    setError("");
  };

  const submit = async () => {
    if (requiredMissing) {
      setError("Заполните обязательные поля и укажите телефон или Email.");
      return;
    }

    const sent = await onSubmit(values);
    setSubmitted(sent);
  };

  return (
    <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/70 p-3">
      <div className="mb-3 rounded-md bg-white/70 p-3 text-xs leading-5 text-violet-950">
        <div className="font-semibold">Часы приема руководства</div>
        <div>Генеральный директор — Бекенов А.Б. Среда: 15:00–16:00</div>
        <div>Заместитель директора — Акижанов М.Ж. Четверг: 15:00–16:00</div>
        <div className="mt-2">
          Выберите удобную дату. Время приема фиксированное: 15:00–16:00.
          После отправки заявки с вами свяжется офис-менеджер.
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Имя *
          </span>
          <input
            value={values.firstName}
            onChange={(event) => updateValue("firstName", event.target.value)}
            className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-violet-600"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Фамилия *
          </span>
          <input
            value={values.lastName}
            onChange={(event) => updateValue("lastName", event.target.value)}
            className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-violet-600"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Руководитель *
          </span>
          <select
            value={values.leader}
            onChange={(event) => updateValue("leader", event.target.value)}
            className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-violet-600"
          >
            {LEADERSHIP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Дата приема *
          </span>
          <select
            value={values.date}
            onChange={(event) => updateValue("date", event.target.value)}
            className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-violet-600"
          >
            <option value="">Выберите дату</option>
            {dates.map((date) => (
              <option key={date} value={date}>
                {formatReadableDate(date)}
              </option>
            ))}
          </select>
          <div className="mt-2 rounded-md bg-white/70 px-3 py-2 text-xs font-medium text-violet-900">
            Время приема: 15:00–16:00
          </div>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Телефон
          </span>
          <input
            value={values.phone}
            onChange={(event) => updateValue("phone", event.target.value)}
            className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-violet-600"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Email
          </span>
          <input
            value={values.email}
            onChange={(event) => updateValue("email", event.target.value)}
            className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-violet-600"
          />
        </label>
      </div>

      <button
        onClick={() => void submit()}
        disabled={disabled || submitted}
        className="mt-3 h-10 rounded-md bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
      >
        {submitted ? "Заявка отправлена" : "Записаться на прием"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function Home() {
  const [conversationId, setConversationId] = useState<
    string | undefined
  >();
  const [visitorId, setVisitorId] = useState("");
  const [language, setLanguage] = useState<ChatLanguage>("ru");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
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
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [speakingMessageIndex, setSpeakingMessageIndex] = useState<
    number | null
  >(null);
  const [highlightedMessageIndex, setHighlightedMessageIndex] = useState<
    number | null
  >(null);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const topRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const hasMessages = messages.length > 0;

  const lastSource = useMemo(() => {
    const assistantMessages = messages.filter(
      (message) => message.role === "assistant"
    );

    return sourceLabel(assistantMessages.at(-1)?.source);
  }, [messages]);

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
    if (!storageReady) {
      return;
    }

    window.localStorage.setItem(STORAGE_LANGUAGE, language);
  }, [language, storageReady]);

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

    if (!container) {
      return;
    }

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    setChatAtBottom(distanceFromBottom < 96);
    setChatCanScrollTop(container.scrollTop > 180);
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

  useEffect(() => {
    const speechWindow = window as SpeechWindow;
    window.setTimeout(() => {
      setSpeechSupported(
        Boolean(
          speechWindow.SpeechRecognition ??
            speechWindow.webkitSpeechRecognition
        )
      );
      setVoiceSupported("speechSynthesis" in window);
    }, 0);

    return () => {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
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

      const botMessage = {
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

  const startAppealRequest = () => {
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content:
          "Заполните обращение. Можно указать контакт для обратной связи и приложить документы или файлы.",
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
          "Заполните заявку на прием к руководству. Время приема фиксированное: 15:00–16:00.",
        source: "appointment-form",
        appointmentForm: true,
      },
    ]);
  };

  const submitAppealRequest = async (values: AppealRequestValues) => {
    if (loading) return false;

    const userMessage = {
      role: "user",
      content: `Обращение: ${values.topic}`,
    } satisfies ChatMessage;

    setMessages((prev) => [...prev, userMessage]);
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

      if (!res.ok) {
        throw new Error(data.message ?? "Не удалось отправить обращение.");
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            data.message ??
            "Обращение отправлено. Специалист рассмотрит сообщение и свяжется с вами при необходимости.",
          source: data.emailSent ? "appeal-sent" : "appeal-saved",
          suggestedQuestions: [
            "Как проверить статус обращения?",
            "Куда обратиться по срочному вопросу?",
            "Записаться на прием к руководству",
          ],
        },
      ]);
      window.setTimeout(() => void loadRequestStatuses(), 300);
      return true;
    } catch (error) {
      console.error("APPEAL FORM ERROR:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Не удалось отправить обращение.",
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

    const leader = LEADERSHIP_OPTIONS.find(
      (item) => item.value === values.leader
    );
    const userMessage = {
      role: "user",
      content: `Заявка на прием: ${leader?.label ?? "руководитель"}, ${formatReadableDate(values.date)}`,
    } satisfies ChatMessage;

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const res = await fetch("/api/requests/appointment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

      if (!res.ok) {
        throw new Error(data.message ?? "Не удалось отправить заявку.");
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            data.message ??
            "Заявка отправлена. Офис-менеджер свяжется с вами для подтверждения записи.",
          source: data.emailSent ? "appointment-sent" : "appointment-saved",
          suggestedQuestions: [
            "Какие вопросы можно обсудить на приеме?",
            "Оставить обычное обращение",
            "Куда обратиться по срочному вопросу?",
          ],
        },
      ]);
      window.setTimeout(() => void loadRequestStatuses(), 300);
      return true;
    } catch (error) {
      console.error("APPOINTMENT FORM ERROR:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Не удалось отправить заявку на прием.",
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

    const userMessage = {
      role: "user",
      content:
        language === "kk"
          ? `Түбіртек жүктелді: ${file.name}`
          : `Загружена квитанция: ${file.name}`,
    } satisfies ChatMessage;

    setMessages((prev) => [...prev, userMessage]);
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
        throw new Error(
          data.message ??
            (language === "kk"
              ? "Файлды тексеру мүмкін болмады."
              : "Не удалось проверить файл.")
        );
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
            error instanceof Error
              ? error.message
              : language === "kk"
                ? "Файлды тексеру мүмкін болмады."
                : "Не удалось проверить файл.",
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
    recognition.lang = language === "kk" ? "kk-KZ" : "ru-RU";
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
    <main className="min-h-screen overflow-y-auto bg-[#eef4fb] text-neutral-950">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 lg:px-6">
        <header className="mb-4 flex shrink-0 items-center justify-between rounded-lg border border-white/70 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
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
            <div className="flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 p-1">
              <Languages size={15} className="ml-1 text-neutral-400" />
              {(["ru", "kk"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setLanguage(item)}
                  className={`h-7 rounded px-2 text-xs font-semibold transition ${
                    language === item
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-neutral-500 hover:bg-white"
                  }`}
                >
                  {item.toUpperCase()}
                </button>
              ))}
            </div>
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
            <section className="surface-panel rounded-lg border border-white/70 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="text-blue-600" size={18} />
                <h2 className="font-semibold">Подсказки</h2>
              </div>

              <div className="space-y-4">
                {QUICK_GROUPS.map((group) => (
                  <div key={group.title}>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                      {group.title}
                    </div>
                    <div className="space-y-1.5">
                      {group.items.map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => handleGuidedAction(prompt)}
                          className="w-full rounded-md px-2 py-1.5 text-left text-sm leading-5 text-neutral-700 hover:bg-neutral-50 hover:text-neutral-950"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t border-neutral-100 pt-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Маршруты
                </div>
                <div className="grid gap-2">
                  {GUIDED_SCENARIOS.map((scenario) => (
                    <button
                      key={scenario.title}
                      type="button"
                      onClick={() => handleGuidedAction(scenario.prompt)}
                      className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-left hover:border-blue-200 hover:bg-blue-50"
                    >
                      <span className="block text-sm font-semibold text-neutral-800">
                        {scenario.title}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-neutral-500">
                        {scenario.text}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 border-t border-neutral-100 pt-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  Действия
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={startAppealRequest}
                    className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Обращение
                  </button>
                  <button
                    type="button"
                    onClick={startAppointmentRequest}
                    className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Прием
                  </button>
                  <button
                    type="button"
                    onClick={() => receiptInputRef.current?.click()}
                    className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Квитанция
                  </button>
                </div>
              </div>
            </section>

            <section className="surface-panel rounded-lg border border-white/70 p-4">
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

            <section className="rounded-lg border border-emerald-200 bg-emerald-50/90 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <CheckCircle2 size={17} />
                История и Knowledge подключены
              </div>
              <p className="mt-2 text-sm leading-5 text-emerald-800/80">
                Последний источник: {lastSource}
              </p>
            </section>
          </aside>

          <section className="surface-panel relative flex h-[78vh] min-h-[600px] flex-col overflow-hidden rounded-lg border border-white/70 lg:h-[82vh]">
            <div className="border-b border-neutral-200 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Чат поддержки</h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    Диалог сохраняется и продолжится после обновления страницы
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => void loadHistory()}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                  >
                    <History size={14} />
                    <span className="hidden sm:inline">История</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setToolPanel((value) =>
                        value === "search" ? null : "search"
                      )
                    }
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                  >
                    <Search size={14} />
                    <span className="hidden sm:inline">Поиск</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadRequestStatuses()}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50"
                  >
                    <ClipboardList size={14} />
                    <span className="hidden sm:inline">Статусы</span>
                  </button>
                  <button
                    type="button"
                    onClick={downloadTranscript}
                    disabled={messages.length === 0}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Download size={14} />
                    <span className="hidden sm:inline">Экспорт</span>
                  </button>
                </div>
              </div>
            </div>

            {toolPanel && (
              <div className="border-b border-neutral-200 bg-white px-4 py-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">
                    {toolPanel === "history" && "Предыдущие чаты"}
                    {toolPanel === "search" && "Поиск по текущему чату"}
                    {toolPanel === "requests" && "Статусы заявок"}
                  </div>
                  <button
                    type="button"
                    onClick={() => setToolPanel(null)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
                    aria-label="Закрыть панель"
                    title="Закрыть"
                  >
                    <X size={15} />
                  </button>
                </div>

                {panelError && (
                  <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {panelError}
                  </div>
                )}

                {toolPanel === "search" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
                      <Search size={15} className="text-neutral-400" />
                      <input
                        value={chatSearch}
                        onChange={(event) => setChatSearch(event.target.value)}
                        placeholder="Введите слово или фразу"
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      />
                    </div>
                    <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                      {chatSearch && searchResults.length === 0 && (
                        <div className="text-xs text-neutral-500">
                          Совпадений нет.
                        </div>
                      )}
                      {searchResults.map(({ message, index }) => (
                        <button
                          key={`${message.role}-${index}`}
                          type="button"
                          onClick={() => jumpToMessage(index)}
                          className="block w-full rounded-md bg-neutral-50 px-3 py-2 text-left text-xs hover:bg-blue-50"
                        >
                          <span className="font-semibold text-neutral-700">
                            {message.role === "user" ? "Вы" : "Бот"}:
                          </span>{" "}
                          <span className="text-neutral-600">
                            {message.content.slice(0, 160)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {toolPanel === "history" && (
                  <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                    {panelLoading && (
                      <div className="text-xs text-neutral-500">
                        Загружаю историю...
                      </div>
                    )}
                    {!panelLoading && historyConversations.length === 0 && (
                      <div className="text-xs text-neutral-500">
                        На этом устройстве пока нет предыдущих диалогов.
                      </div>
                    )}
                    {historyConversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => openHistoryConversation(conversation)}
                        className="block w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-left hover:border-blue-200 hover:bg-blue-50"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-semibold text-neutral-800">
                            {conversation.title}
                          </span>
                          <span className="shrink-0 text-[11px] text-neutral-400">
                            {formatShortDate(conversation.updated_at)}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-xs text-neutral-500">
                          {conversation.messages.at(-1)?.content ??
                            "Сообщений пока нет"}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {toolPanel === "requests" && (
                  <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                    {panelLoading && (
                      <div className="text-xs text-neutral-500">
                        Проверяю статусы...
                      </div>
                    )}
                    {!panelLoading && requestStatuses.length === 0 && (
                      <div className="text-xs text-neutral-500">
                        По вашим текущим диалогам заявок пока нет.
                      </div>
                    )}
                    {!panelLoading && requestStatuses.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-md bg-blue-50 px-3 py-2">
                          <div className="text-[11px] text-blue-700">Новые</div>
                          <div className="text-lg font-semibold text-blue-950">
                            {requestSummary.new}
                          </div>
                        </div>
                        <div className="rounded-md bg-amber-50 px-3 py-2">
                          <div className="text-[11px] text-amber-700">В работе</div>
                          <div className="text-lg font-semibold text-amber-950">
                            {requestSummary.active}
                          </div>
                        </div>
                        <div className="rounded-md bg-emerald-50 px-3 py-2">
                          <div className="text-[11px] text-emerald-700">Закрыто</div>
                          <div className="text-lg font-semibold text-emerald-950">
                            {requestSummary.closed}
                          </div>
                        </div>
                      </div>
                    )}
                    {requestStatuses.map((item) => (
                      <div
                        key={`${item.type}-${item.id}`}
                        className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-neutral-800">
                            {item.title}
                          </div>
                          <span className="rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-blue-700">
                            {requestStatusLabel(item.status)}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">
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

            <div
              ref={chatScrollRef}
              onScroll={updateChatScrollState}
              className="app-scrollbar min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(#ffffff,#f8fbff)] px-4 py-5"
            >
              <div ref={topRef} />
              {!hasMessages && (
                <div className="soft-enter mx-auto flex max-w-2xl flex-col items-center justify-center py-12 text-center">
                  <div className="mb-5">
                    <BrandMark size="lg" />
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    С чего начнем?
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-500">
                    Напишите вопрос своими словами: про оплату, квитанцию,
                    показания, начисления, поставщика или обращение. Если
                    точного ответа нет, я покажу куда обратиться.
                  </p>

                  <div className="mt-5 flex max-w-xl flex-wrap justify-center gap-2">
                    {[
                      "Почему пришла двойная сумма?",
                      "Нужно исправить показания счетчика",
                      "Как найти менеджера поставщика?",
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => handleGuidedAction(prompt)}
                        className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 hover:border-blue-200 hover:text-blue-700"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-neutral-500">
                    <span>Нужно не спросить, а оформить?</span>
                    <button
                      type="button"
                      onClick={startAppealRequest}
                      className="font-semibold text-emerald-700 hover:text-emerald-800"
                    >
                      Оставить обращение
                    </button>
                    <span className="text-neutral-300">/</span>
                    <button
                      type="button"
                      onClick={startAppointmentRequest}
                      className="font-semibold text-violet-700 hover:text-violet-800"
                    >
                      Записаться на прием
                    </button>
                  </div>

                  <div className="mt-6 grid w-full gap-2 sm:grid-cols-2 lg:hidden">
                    {GUIDED_SCENARIOS.map((scenario) => (
                      <button
                        key={scenario.title}
                        onClick={() => handleGuidedAction(scenario.prompt)}
                        className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-left text-sm leading-5 hover:border-blue-300"
                      >
                        <span className="block font-semibold">
                          {scenario.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-neutral-500">
                          {scenario.text}
                        </span>
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
                      ref={(node) => {
                        messageRefs.current[index] = node;
                      }}
                      className={`soft-enter rounded-lg transition ${
                        highlightedMessageIndex === index
                          ? "bg-yellow-100/70 ring-2 ring-yellow-300"
                          : ""
                      } flex gap-3 ${
                        isUser ? "justify-end" : "justify-start"
                      }`}
                    >
                      {!isUser && (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white shadow-sm">
                          <Bot size={18} />
                        </div>
                      )}

                      <div
                        className={`max-w-[88%] rounded-lg px-4 py-3 text-sm leading-6 shadow-sm md:max-w-[82%] ${
                          isUser
                            ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-blue-900/10"
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
                                  Менеджер Астана-ЕРЦ
                                </div>
                                <div className="mt-0.5 font-semibold text-neutral-900">
                                  {msg.supplierCard.managerName}
                                </div>
                                <div className="text-xs text-neutral-500">
                                  {msg.supplierCard.supplierName}
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 grid gap-1 text-xs text-neutral-700 sm:grid-cols-2">
                              <div>
                                Телефон менеджера:{" "}
                                {msg.supplierCard.managerPhone || "не указан"}
                              </div>
                              <div className="sm:col-span-2">
                                Почта менеджера:{" "}
                                {msg.supplierCard.managerEmail || "не указана"}
                              </div>
                            </div>
                            <div className="mt-3 rounded-md bg-white/70 p-2 text-xs leading-5 text-neutral-600">
                              <div className="font-semibold text-neutral-800">
                                Данные поставщика
                              </div>
                              <div>БИН: {msg.supplierCard.bin || "не указан"}</div>
                              {msg.supplierCard.supplierPhone && (
                                <div>
                                  Телефон поставщика:{" "}
                                  {msg.supplierCard.supplierPhone}
                                </div>
                              )}
                              {msg.supplierCard.supplierEmail && (
                                <div>
                                  Почта поставщика:{" "}
                                  {msg.supplierCard.supplierEmail}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        {!isUser && msg.operatorHandoff && (
                          <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900">
                            <div className="font-semibold">Очередь оператора</div>
                            <div className="mt-1">
                              ID: {msg.operatorHandoff.id.slice(0, 8)} · статус:{" "}
                              {requestStatusLabel(msg.operatorHandoff.status)}
                            </div>
                          </div>
                        )}
                        {!isUser && msg.supportCard && (
                          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                            <div className="text-sm font-semibold text-amber-950">
                              {msg.supportCard.title}
                            </div>
                            <p className="mt-1 text-xs leading-5 text-amber-900">
                              {msg.supportCard.description}
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {msg.supportCard.href ? (
                                <a
                                  href={msg.supportCard.href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-md bg-amber-900 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-950"
                                >
                                  {msg.supportCard.contactLabel}:{" "}
                                  {msg.supportCard.contactValue}
                                </a>
                              ) : (
                                <span className="rounded-md bg-amber-900 px-3 py-2 text-xs font-semibold text-white">
                                  {msg.supportCard.contactLabel}:{" "}
                                  {msg.supportCard.contactValue}
                                </span>
                              )}
                              {msg.supportCard.note && (
                                <span className="text-xs leading-5 text-amber-900">
                                  {msg.supportCard.note}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        {!isUser && msg.meterCorrectionForm && (
                          <MeterCorrectionFormCard
                            form={msg.meterCorrectionForm}
                            disabled={loading}
                            onSubmit={submitMeterCorrection}
                          />
                        )}
                        {!isUser && msg.appealForm && (
                          <AppealRequestFormCard
                            disabled={loading}
                            onSubmit={submitAppealRequest}
                          />
                        )}
                        {!isUser && msg.appointmentForm && (
                          <AppointmentRequestFormCard
                            disabled={loading}
                            onSubmit={submitAppointmentRequest}
                          />
                        )}
                        {!isUser && msg.suggestedQuestions?.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {msg.suggestedQuestions.map((question) => (
                              <button
                                key={question}
                                type="button"
                                onClick={() => handleGuidedAction(question)}
                                disabled={loading}
                                className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-left text-xs font-medium leading-5 text-blue-800 hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {question}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {!isUser && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {msg.source && (
                              <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-500">
                                Источник: {sourceLabel(msg.source)}
                              </span>
                            )}

                            <button
                              onClick={() => toggleSpeakMessage(msg.content, index)}
                              disabled={!voiceSupported}
                              className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium ${
                                speakingMessageIndex === index
                                  ? "border-blue-300 bg-blue-50 text-blue-700"
                                  : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                              } disabled:cursor-not-allowed disabled:opacity-40`}
                              title="Прослушать ответ"
                            >
                              {speakingMessageIndex === index ? (
                                <Square size={12} />
                              ) : (
                                <Volume2 size={13} />
                              )}
                              <span className="hidden sm:inline">
                                {speakingMessageIndex === index ? "Стоп" : "Слушать"}
                              </span>
                            </button>

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
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-neutral-700 shadow-sm">
                          <User size={18} />
                        </div>
                      )}
                    </div>
                  );
                })}

                {loading && (
                  <div className="soft-enter flex justify-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
                      <Bot size={18} />
                    </div>
                    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 shadow-sm">
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
            </div>

            {(chatCanScrollTop || !chatAtBottom) && (
              <div className="absolute bottom-24 right-4 z-10 flex flex-col gap-2">
                {chatCanScrollTop && (
                  <button
                    type="button"
                    onClick={scrollChatToTop}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white/95 text-neutral-600 shadow-lg backdrop-blur transition hover:-translate-y-0.5 hover:text-blue-700"
                    title="К началу диалога"
                    aria-label="К началу диалога"
                  >
                    <ArrowUp size={16} />
                  </button>
                )}
                {!chatAtBottom && (
                  <button
                    type="button"
                    onClick={() => scrollChatToBottom()}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-blue-100 bg-blue-600 text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-700"
                    title="К последнему сообщению"
                    aria-label="К последнему сообщению"
                  >
                    <ArrowDown size={16} />
                  </button>
                )}
              </div>
            )}

            <div className="shrink-0 border-t border-neutral-200 bg-white/95 p-4 backdrop-blur">
              <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-lg border border-neutral-300 bg-white p-2 shadow-sm transition focus-within:border-blue-500 focus-within:shadow-md">
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
                >
                  <UploadCloud size={18} />
                </button>
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
