/* eslint-disable @typescript-eslint/no-explicit-any */
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { createEmbedding } from "@/lib/embedding";
import { searchKnowledge } from "@/lib/retrieval";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";
import {
  buildMeterCorrectionCreatedMessage,
  buildMeterCorrectionQuestion,
  getMissingMeterCorrectionFields,
  getMeterCorrectionServiceOptions,
  getMeterCorrectionServiceLabel,
  isMeterCorrectionIntent,
  MeterCorrectionFormPayload,
  mergeMeterCorrectionDrafts,
  validateMeterCorrectionForm,
} from "@/lib/meterCorrection";
import {
  buildSupplierManagerMessage,
  findSupplierManager,
  toPublicSupplierManagerCard,
} from "@/lib/suppliers";

let openai: OpenAI | null = null;
let adminSupabase: ReturnType<typeof createClient<any>> | null = null;

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  openai ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  return openai;
}

function getAdminSupabase() {
  const supabaseUrl = getSupabaseProjectUrl();

  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  adminSupabase ??= createClient<any>(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  return adminSupabase;
}

type ChatBodyMessage = {
  role?: "user" | "assistant";
  content?: string;
};

type KnowledgeGapReason =
  | "no-match"
  | "weak-match"
  | "unverified-match"
  | "gpt-answer";

type SupportCard = {
  title: string;
  description: string;
  contactLabel: string;
  contactValue: string;
  note?: string;
  href?: string;
};

type ChatLanguage = "ru" | "kk";
type SmallTalkIntent = "greeting" | "thanks" | "goodbye" | "capabilities";

const DIRECT_MATCH_THRESHOLD = 0.72;
const MIN_CONTEXT_THRESHOLD = 0.62;

const GENERAL_SUPPORT_CARDS: Record<ChatLanguage, SupportCard> = {
  ru: {
    title: "Куда обратиться",
    description:
      "По вопросам начислений, оплаты, квитанций, лицевого счета и коммунальных услуг можно обратиться в Центр городских услуг Qalaqyzmet.",
    contactLabel: "Телефон",
    contactValue: "109",
    note: "QALAQYZMET.KZ, г. Астана, ул. Сәкен Сейфуллин, 27",
  },
  kk: {
    title: "Қайда жүгінуге болады",
    description:
      "Есептеулер, төлемдер, түбіртектер, дербес шот және коммуналдық қызметтер бойынша Qalaqyzmet қалалық қызметтер орталығына жүгінуге болады.",
    contactLabel: "Телефон",
    contactValue: "109",
    note: "QALAQYZMET.KZ, Астана қ., Сәкен Сейфуллин к-сі, 27",
  },
};

const TECH_SUPPORT_CARDS: Record<ChatLanguage, SupportCard> = {
  ru: {
    title: "Техническая поддержка",
    description:
      "Если вопрос связан с ошибкой сайта, личного кабинета, виджета, отправки формы или другой технической проблемой, напишите в WhatsApp.",
    contactLabel: "WhatsApp",
    contactValue: "+7-777-003-3013",
    note: "Только для сообщений WhatsApp. Звонки на этот номер не принимаются.",
    href: "https://wa.me/77770033013",
  },
  kk: {
    title: "Техникалық қолдау",
    description:
      "Сайт, жеке кабинет, виджет, форма жіберу немесе басқа техникалық қате бойынша WhatsApp-қа жазыңыз.",
    contactLabel: "WhatsApp",
    contactValue: "+7-777-003-3013",
    note: "Тек WhatsApp хабарламалары үшін. Бұл нөмірге қоңырау қабылданбайды.",
    href: "https://wa.me/77770033013",
  },
};

async function ensureConversation(
  conversationId: string | undefined,
  title: string,
  visitorId?: string
) {
  if (conversationId) {
    if (visitorId) {
      await getAdminSupabase()
        .from("chat_conversations")
        .update({ visitor_id: visitorId })
        .eq("id", conversationId)
        .then(({ error }) => {
          if (error && !isMissingVisitorIdColumn(error)) {
            throw error;
          }
        });
    }

    return conversationId;
  }

  const payload = {
    title: title.slice(0, 90),
    visitor_id: visitorId,
  };
  let { data, error } = await getAdminSupabase()
    .from("chat_conversations")
    .insert(payload)
    .select("id")
    .single();

  if (error && isMissingVisitorIdColumn(error)) {
    const fallback = await getAdminSupabase()
      .from("chat_conversations")
      .insert({
        title: title.slice(0, 90),
      })
      .select("id")
      .single();

    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data) {
    throw error ?? new Error("Failed to create conversation");
  }

  return data.id as string;
}

function isMissingVisitorIdColumn(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };

  return (
    maybeError.code === "42703" ||
    Boolean(maybeError.message?.includes("visitor_id"))
  );
}

async function saveTurn(params: {
  conversationId?: string;
  visitorId?: string;
  userMessage: string;
  assistantMessage: string;
  source: string;
}) {
  try {
    const conversationId = await ensureConversation(
      params.conversationId,
      params.userMessage,
      params.visitorId
    );

    const { data, error } = await getAdminSupabase()
      .from("chat_messages")
      .insert([
        {
          conversation_id: conversationId,
          role: "user",
          content: params.userMessage,
        },
        {
          conversation_id: conversationId,
          role: "assistant",
          content: params.assistantMessage,
          source: params.source,
        },
      ])
      .select("id,role");

    if (error) {
      throw error;
    }

    await getAdminSupabase()
      .from("chat_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    const assistantMessageId = (data ?? []).find(
      (message) => message.role === "assistant"
    )?.id as string | undefined;

    return {
      conversationId,
      messageId: assistantMessageId,
    };
  } catch (error) {
    console.warn("CHAT HISTORY SAVE SKIPPED:", error);
    return {
      conversationId: params.conversationId,
      messageId: undefined,
    };
  }
}

function inferGapTopic(question: string) {
  const normalized = question.toLowerCase();

  const matches = [
    {
      topic: "Оплата",
      keywords: ["оплат", "kaspi", "каспи", "платеж", "банк"],
    },
    {
      topic: "Показания счетчиков",
      keywords: ["показан", "счетчик", "счётчик", "электр", "вода", "газ"],
    },
    {
      topic: "Квитанции и ЕПД",
      keywords: ["квитанц", "епд", "достав", "дубликат"],
    },
    {
      topic: "Лицевой счет",
      keywords: ["лицев", "счет", "счёт", "владел", "прожива"],
    },
    {
      topic: "Начисления и перерасчет",
      keywords: ["начисл", "перерасчет", "перерасчёт", "долг", "ошиб"],
    },
    {
      topic: "Контакты и офис",
      keywords: ["адрес", "офис", "телефон", "график", "поддерж"],
    },
    {
      topic: "Онлайн-сервисы",
      keywords: ["сайт", "кабинет", "telegram", "телеграм", "онлайн"],
    },
  ];

  return (
    matches.find((item) =>
      item.keywords.some((keyword) => normalized.includes(keyword))
    )?.topic ?? question.trim().slice(0, 90)
  );
}

function hasMissingInfoAnswer(answer: string) {
  const normalized = answer.toLowerCase();

  return [
    "точной информации нет",
    "нет точной информации",
    "информации нет",
    "нет в базе",
    "уточнить",
    "обратиться в поддержку",
  ].some((phrase) => normalized.includes(phrase));
}

function getGapReason(params: {
  top?: { similarity: number; verified?: boolean | null };
  assistantMessage: string;
}): KnowledgeGapReason | null {
  if (!params.top) {
    return "no-match";
  }

  if (hasMissingInfoAnswer(params.assistantMessage)) {
    return "gpt-answer";
  }

  if (!params.top.verified) {
    return "unverified-match";
  }

  if (params.top.similarity < 0.72) {
    return "weak-match";
  }

  return null;
}

function getUncertainReason(top?: {
  similarity: number;
  verified?: boolean | null;
}): KnowledgeGapReason | null {
  if (!top) {
    return "no-match";
  }

  if (top.similarity < MIN_CONTEXT_THRESHOLD) {
    return "weak-match";
  }

  if (!top.verified) {
    return "unverified-match";
  }

  return null;
}

function detectChatLanguage(text: string): ChatLanguage {
  const normalized = text.toLowerCase();
  const hasKazakhChars = /[әғқңөұүһі]/i.test(normalized);
  const hasKazakhWords = [
    "сәлем",
    "төлем",
    "түбіртек",
    "шот",
    "дербес",
    "көрсеткіш",
    "есептегіш",
    "санауыш",
    "өтініш",
    "қайда",
    "қалай",
    "қашан",
    "қанша",
    "кім",
    "жабдықтаушы",
    "жеткізуші",
    "қызмет",
    "қабылдау",
    "жазыл",
    "басшылық",
  ].some((word) => normalized.includes(word));

  return hasKazakhChars || hasKazakhWords ? "kk" : "ru";
}

function languageName(language: ChatLanguage) {
  return language === "kk" ? "казахском языке" : "русском языке";
}

function buildUncertainAnswer(
  hasSupportDirection: boolean,
  language: ChatLanguage
) {
  if (language === "kk") {
    return [
      "Бұл сұрақ бойынша базада әзірге нақты тексерілген ақпарат жоқ.",
      "Қате мәлімет бермеу үшін жауапты ойдан шығармаймын.",
      hasSupportDirection
        ? "Төменде қолайлы байланыс қалдырдым. Бұл тақырыпты білім базасын толықтыруға белгіледім."
        : "Бұл тақырыпты білім базасын толықтыруға белгіледім.",
    ].join("\n");
  }

  return [
    "По этому вопросу в базе пока нет точной проверенной информации.",
    "Я не буду придумывать ответ, чтобы не дать неверные данные.",
    hasSupportDirection
      ? "Ниже оставил подходящий контакт. Тему уже отметил для пополнения базы знаний."
      : "Тему уже отметил для пополнения базы знаний.",
  ].join("\n");
}

function normalizeRu(text: string) {
  return text.toLowerCase().replace(/ё/g, "е");
}

function uniqueQuestions(questions: string[]) {
  return Array.from(new Set(questions)).slice(0, 3);
}

function hasBusinessSignal(question: string) {
  const normalized = normalizeRu(question);

  return [
    "епд",
    "квитанц",
    "оплат",
    "кас",
    "kaspi",
    "платеж",
    "начисл",
    "долг",
    "пен",
    "счет",
    "счетчик",
    "показан",
    "лицев",
    "адрес",
    "телефон",
    "контакт",
    "офис",
    "график",
    "заяв",
    "обращ",
    "жалоб",
    "оператор",
    "справк",
    "поставщик",
    "услуг",
    "коммун",
    "төлем",
    "түбіртек",
    "шот",
    "көрсеткіш",
    "есептегіш",
    "өтініш",
    "қызмет",
  ].some((word) => normalized.includes(word));
}

function detectSmallTalkIntent(question: string): SmallTalkIntent | null {
  const normalized = normalizeRu(question).trim();
  const compact = normalized.replace(/[!?.,"\s]+/g, " ").trim();
  const words = compact ? compact.split(" ") : [];

  if (!compact || hasBusinessSignal(compact) || words.length > 6) {
    return null;
  }

  if (
    [
      "привет",
      "здравствуй",
      "здравствуйте",
      "добрый день",
      "доброе утро",
      "добрый вечер",
      "салам",
      "сәлем",
      "салем",
      "hello",
      "hi",
      "как дела",
      "как ты",
      "қалайсың",
    ].some((phrase) => compact === phrase || compact.startsWith(`${phrase} `))
  ) {
    return "greeting";
  }

  if (
    [
      "спасибо",
      "благодарю",
      "рахмет",
      "спс",
      "thanks",
      "thank you",
    ].some((phrase) => compact === phrase || compact.startsWith(`${phrase} `))
  ) {
    return "thanks";
  }

  if (
    [
      "пока",
      "до свидания",
      "увидимся",
      "сау бол",
      "bye",
    ].some((phrase) => compact === phrase || compact.startsWith(`${phrase} `))
  ) {
    return "goodbye";
  }

  if (
    [
      "что ты умеешь",
      "чем поможешь",
      "кто ты",
      "ты кто",
      "что умеет бот",
      "как пользоваться ботом",
      "как ты можешь помочь",
      "не істей аласың",
      "сен кімсің",
    ].some((phrase) => compact.includes(phrase))
  ) {
    return "capabilities";
  }

  return null;
}

function buildSmallTalkAnswer(
  intent: SmallTalkIntent,
  language: ChatLanguage
) {
  if (language === "kk") {
    if (intent === "thanks") {
      return "Рақмет! Тағы сұрағыңыз болса, жазыңыз. ЕПД, төлем, түбіртек, көрсеткіштер немесе өтініш бойынша көмектесемін.";
    }

    if (intent === "goodbye") {
      return "Сау болыңыз! Қажет болса, қайта жазыңыз - көмектесуге дайынмын.";
    }

    if (intent === "capabilities") {
      return "Мен Астана ЕРЦ бойынша көмектесемін: ЕПД, төлем, түбіртек, дербес шот, көрсеткіштер, өтініштер және жеткізушілер туралы сұрақтарға жауап беремін. Сұрағыңызды қысқаша жазыңыз.";
    }

    return "Сәлеметсіз бе! Мен Астана ЕРЦ бойынша көмекшімін. ЕПД, төлем, түбіртек, дербес шот, көрсеткіштер немесе өтініш бойынша сұрағыңызды жазыңыз.";
  }

  if (intent === "thanks") {
    return "Пожалуйста! Если появится ещё вопрос, напишите. Помогу с ЕПД, оплатой, квитанциями, показаниями, лицевым счётом или обращениями.";
  }

  if (intent === "goodbye") {
    return "До свидания! Если понадобится помощь по Астана ЕРЦ, просто напишите.";
  }

  if (intent === "capabilities") {
    return "Я помощник Астана ЕРЦ. Могу подсказать по ЕПД, оплате, квитанциям, лицевому счёту, показаниям, обращениям и поставщикам услуг. Напишите вопрос коротко, и я постараюсь ответить по базе знаний.";
  }

  return "Здравствуйте! Я помощник Астана ЕРЦ. Напишите вопрос по ЕПД, оплате, квитанции, лицевому счёту, показаниям или обращению - помогу разобраться.";
}

function isTechnicalSupportQuestion(question: string) {
  const normalized = normalizeRu(question);
  const hasPlainIssue = [
    "ошибка",
    "не открывается",
    "не работает",
    "не отправ",
    "не приходит",
    "не могу",
    "завис",
    "слом",
    "қате",
    "ашылмай",
    "жұмыс істем",
    "жіберілмей",
    "келмей",
    "кіре алма",
    "істемей",
  ].some((word) => normalized.includes(word));
  const hasPlainDigitalSurface = [
    "сайт",
    "личный кабинет",
    "кабинет",
    "прилож",
    "виджет",
    "чат",
    "бот",
    "форма",
    "авторизац",
    "логин",
    "пароль",
    "смс",
    "sms",
    "qr",
    "жеке кабинет",
    "қосымша",
    "құпиясөз",
  ].some((word) => normalized.includes(word));
  const hasPlainLoginIssue = [
    "авторизац",
    "войти",
    "логин",
    "пароль",
    "смс",
    "sms",
    "кіру",
    "құпиясөз",
  ].some((word) => normalized.includes(word));

  if ((hasPlainIssue && hasPlainDigitalSurface) || hasPlainLoginIssue) {
    return true;
  }
  const hasIssue = [
    "ошибка",
    "не открывается",
    "не работает",
    "не отправ",
    "не приходит",
    "не могу",
    "завис",
    "слом",
    "қате",
    "ашылмай",
    "жұмыс істем",
    "жіберілмей",
    "келмей",
    "кіре алма",
    "істемей",
  ].some((word) => normalized.includes(word));

  const hasDigitalSurface = [
    "сайт",
    "личный кабинет",
    "кабинет",
    "прилож",
    "виджет",
    "чат",
    "бот",
    "форма",
    "авторизац",
    "логин",
    "пароль",
    "смс",
    "sms",
    "qr",
    "сайт",
    "жеке кабинет",
    "кабинет",
    "қосымша",
    "виджет",
    "чат",
    "бот",
    "форма",
    "авторизация",
    "логин",
    "құпиясөз",
  ].some((word) => normalized.includes(word));

  const hasLoginIssue = [
    "авторизац",
    "войти",
    "логин",
    "пароль",
    "смс",
    "sms",
    "кіру",
    "құпиясөз",
  ].some((word) => normalized.includes(word));

  return (hasIssue && hasDigitalSurface) || hasLoginIssue;
}

function isExplicitSupportRequest(question: string) {
  const normalized = normalizeRu(question);

  if (
    [
      "109",
      "кала кыз",
      "калакыз",
      "qala",
      "qyzmet",
      "телефон",
      "контакт",
      "куда обратиться",
      "к кому обратиться",
      "поддержк",
      "адрес",
      "офис",
      "жалоб",
      "обращен",
      "whatsapp",
      "ватсап",
      "қайда жүгін",
      "кімге жүгін",
      "байланыс",
      "мекенжай",
      "өтініш",
      "маман",
    ].some((word) => normalized.includes(word))
  ) {
    return true;
  }

  return [
    "109",
    "кала кыз",
    "калакыз",
    "qala",
    "qyzmet",
    "телефон",
    "контакт",
    "куда обратиться",
    "к кому обратиться",
    "оператор",
    "поддержк",
    "специалист",
    "адрес",
    "офис",
    "прием",
    "запис",
    "жалоб",
    "обращен",
    "whatsapp",
    "ватсап",
    "қайда жүгін",
    "кімге жүгін",
    "байланыс",
    "телефон",
    "мекенжай",
    "кеңсе",
    "қабылдау",
    "жазыл",
    "шағым",
    "өтініш",
    "маман",
  ].some((word) => normalized.includes(word));
}

function getSupportCardIfNeeded(
  question: string,
  language: ChatLanguage
): SupportCard | undefined {
  if (isTechnicalSupportQuestion(question)) {
    return TECH_SUPPORT_CARDS[language];
  }

  if (isExplicitSupportRequest(question)) {
    return GENERAL_SUPPORT_CARDS[language];
  }

  return undefined;
}

function isOperatorHandoffIntent(question: string) {
  const normalized = normalizeRu(question);

  if (
    [
      "оператор",
      "живой человек",
      "живого человека",
      "соедините",
      "переключите",
      "специалист",
      "сотрудник",
      "менеджер поддержки",
      "хочу поговорить",
      "позовите",
      "оператор керек",
      "маман керек",
      "тірі адам",
      "қызметкер",
      "байланыстыр",
    ].some((phrase) => normalized.includes(phrase))
  ) {
    return true;
  }

  return [
    "оператор",
    "живой человек",
    "живого человека",
    "соедините",
    "переключите",
    "специалист",
    "сотрудник",
    "менеджер поддержки",
    "хочу поговорить",
    "позовите",
    "оператор керек",
    "маман керек",
    "тірі адам",
    "қызметкер",
    "байланыстыр",
  ].some((phrase) => normalized.includes(phrase));
}

function isAppealFormIntent(question: string) {
  const normalized = normalizeRu(question);

  const hasAppealWord = [
    "обращен",
    "обращение",
    "жалоб",
    "заявление",
    "оставить заявку",
    "написать заявку",
    "претензи",
    "өтініш",
    "шағым",
  ].some((phrase) => normalized.includes(phrase));
  const hasLeadershipWord = [
    "руковод",
    "директор",
    "бекенов",
    "акижанов",
    "прием",
    "приём",
    "қабылдау",
    "басшы",
  ].some((phrase) => normalized.includes(phrase));

  return hasAppealWord && !hasLeadershipWord;
}

function isLeadershipAppointmentIntent(question: string) {
  const normalized = normalizeRu(question);
  const hasAppointmentWord = [
    "запис",
    "прием",
    "приём",
    "встреч",
    "қабылдау",
    "жазыл",
  ].some((phrase) => normalized.includes(phrase));
  const hasLeadershipWord = [
    "руковод",
    "директор",
    "генеральн",
    "заместител",
    "бекенов",
    "акижанов",
    "басшы",
    "директор",
  ].some((phrase) => normalized.includes(phrase));

  return hasAppointmentWord && hasLeadershipWord;
}

function isKaspiPaymentIntent(question: string) {
  const normalized = normalizeRu(question);
  const hasKaspi = normalized.includes("kaspi") || normalized.includes("каспи");
  const hasPayment = [
    "оплат",
    "платеж",
    "платёж",
    "епд",
    "коммун",
    "төле",
    "төлем",
  ].some((phrase) => normalized.includes(phrase));

  return hasKaspi && hasPayment;
}

function buildAppealFormIntro(language: ChatLanguage) {
  if (language === "kk") {
    return "Өтініш формасын толтырыңыз. Қажет болса байланыс дерегін көрсетіп, құжаттар немесе файлдар қоса аласыз.";
  }

  return "Заполните обращение. Можно указать контакт для обратной связи и приложить документы или файлы.";
}

function buildAppointmentFormIntro(language: ChatLanguage) {
  if (language === "kk") {
    return "Басшылықтың қабылдауына жазылу формасын толтырыңыз. Қабылдау уақыты тұрақты: 15:00-16:00.";
  }

  return "Заполните заявку на прием к руководству. Время приема фиксированное: 15:00-16:00.";
}

function buildKaspiPaymentAnswer(language: ChatLanguage) {
  if (language === "kk") {
    return "Иә, ЕПД-ны Kaspi Bank арқылы төлеуге болады. Төлем жасағанда түбіртектегі дербес шотты және соманы дұрыс көрсетіңіз.";
  }

  return "Да, ЕПД можно оплатить через Kaspi Bank. При оплате проверьте лицевой счет и сумму из квитанции, чтобы платеж корректно зачелся.";
}

function isEpdDefinitionIntent(question: string) {
  const normalized = normalizeRu(question);

  return (
    normalized.includes("епд") &&
    [
      "что такое",
      "что значит",
      "расшифр",
      "зачем",
      "единый платеж",
      "единый платёж",
      "деген не",
      "не үшін",
    ].some((phrase) => normalized.includes(phrase))
  );
}

function buildEpdDefinitionAnswer(language: ChatLanguage) {
  if (language === "kk") {
    return [
      "ЕПД - бірнеше коммуналдық және басқа қызметтерді бір түбіртекке біріктіретін бірыңғай төлем құжаты.",
      "Ол тұрғындарға төлемдерді бір жерден көруге және ыңғайлы төлеуге көмектеседі.",
      "ЕПД-ны электронды түрде алуға немесе қағаз түбіртектен бас тартуға болады.",
    ].join("\n");
  }

  return [
    "ЕПД - это единый платежный документ: одна квитанция, где объединены коммунальные и другие услуги для удобства жителей.",
    "По нему можно видеть начисления и оплачивать услуги в одном месте.",
    "ЕПД можно получать в электронном виде, а от бумажной квитанции можно отказаться.",
  ].join("\n");
}

function isMeterReadingSubmissionIntent(question: string) {
  const normalized = normalizeRu(question);
  const hasMeter =
    normalized.includes("показан") ||
    normalized.includes("счетчик") ||
    normalized.includes("счетчик") ||
    normalized.includes("прибор") ||
    normalized.includes("көрсеткіш") ||
    normalized.includes("есептегіш") ||
    normalized.includes("санауыш");
  const hasSubmitIntent = [
    "передать",
    "сдать",
    "отправить",
    "куда",
    "как",
    "қалай",
    "қайда",
    "жібер",
    "беру",
  ].some((phrase) => normalized.includes(phrase));
  const hasCorrectionIntent = [
    "исправ",
    "коррект",
    "ошиб",
    "неверн",
    "неправильн",
    "не приняли",
    "не попали",
    "түзет",
    "қате",
    "дұрыс емес",
  ].some((phrase) => normalized.includes(phrase));

  return hasMeter && hasSubmitIntent && !hasCorrectionIntent;
}

function buildMeterReadingSubmissionAnswer(language: ChatLanguage) {
  if (language === "kk") {
    return [
      "Көрсеткіштерді Астана ЕРЦ сайтындағы бөлім арқылы беруге болады: https://www.aerc.kz/ru/abonentam/readings/.",
      "Базадағы ақпарат бойынша көрсеткіштер айдың 10-ынан 30/31-іне дейін қабылданады.",
      "Теплотранзит бойынша көрсеткіштер 15-інен бастап қабылданады.",
    ].join("\n");
  }

  return [
    "Показания можно передать на сайте Астана ЕРЦ: https://www.aerc.kz/ru/abonentam/readings/.",
    "По данным базы, передача показаний доступна с 10 числа месяца по 30/31 число.",
    "По Теплотранзиту показания принимаются с 15 числа.",
  ].join("\n");
}

function isSupplierManagerLookupHelpIntent(question: string) {
  const normalized = normalizeRu(question);
  const hasSupplierContext = [
    "поставщик",
    "поставщика",
    "менеджер",
    "менеджера",
    "куратор",
    "ответственный",
    "бин",
    "код",
    "договор",
    "жабдықтаушы",
    "жеткізуші",
    "менеджері",
    "бсн",
  ].some((phrase) => normalized.includes(phrase));
  const hasHowToIntent = [
    "как",
    "найти",
    "узнать",
    "показать",
    "подскажи",
    "что нужно",
    "қалай",
    "қайдан",
    "табу",
    "көрсет",
  ].some((phrase) => normalized.includes(phrase));

  return hasSupplierContext && hasHowToIntent;
}

function buildSupplierManagerLookupHelpAnswer(language: ChatLanguage) {
  if (language === "kk") {
    return [
      "Менеджерді табу үшін жеткізушінің атауын, БСН-н немесе жеткізуші кодын жазыңыз.",
      "Мысалы: «код поставщика 1201», «БИН 123456789012» немесе ұйымның атауы.",
      "Егер жеткізуші базада болса, бот Астана-ЕРЦ менеджерін және қолжетімді байланыс деректерін көрсетеді.",
    ].join("\n");
  }

  return [
    "Чтобы найти менеджера поставщика, напишите название организации, БИН или код поставщика.",
    "Например: «код поставщика 1201», «БИН 123456789012» или название КСК/ОСИ/ТОО.",
    "Если поставщик есть в базе, бот покажет менеджера Астана-ЕРЦ и доступные контакты.",
  ].join("\n");
}

function buildOperatorHandoffAnswer(language: ChatLanguage) {
  if (language === "kk") {
    return [
      "Түсіндім, сұрағыңызды қолмен қарау үшін оператор кезегіне белгіледім.",
      "Админкада бұл диалог бөлек көрінеді: жауапты маман қарап, мәртебесін қоя алады.",
      "Егер мәселе техникалық болса, WhatsApp арқылы +7-777-003-3013 нөміріне жазыңыз. Бұл нөмір тек хабарлама үшін, қоңырау қабылданбайды.",
    ].join("\n");
  }

  return [
    "Понял, отметил этот диалог для ручной обработки оператором.",
    "В админке он появится в отдельной очереди: специалист сможет принять, закрыть или передать дальше.",
    "Если вопрос технический, напишите в WhatsApp на +7-777-003-3013. Номер только для сообщений, звонки не принимаются.",
  ].join("\n");
}

function isLatePaymentDoubleChargeIntent(question: string) {
  const normalized = normalizeRu(question);
  const hasPlainDoubleAmount =
    normalized.includes("двойн") ||
    normalized.includes("две суммы") ||
    normalized.includes("2 суммы") ||
    normalized.includes("сумма больше") ||
    normalized.includes("много пришл") ||
    normalized.includes("не сел") ||
    normalized.includes("не села") ||
    normalized.includes("не учли") ||
    normalized.includes("не зачел") ||
    normalized.includes("не зачел") ||
    normalized.includes("не зачисл") ||
    normalized.includes("екі есе") ||
    normalized.includes("екі сома") ||
    normalized.includes("екі төлем") ||
    normalized.includes("сома көп") ||
    normalized.includes("артық кел") ||
    normalized.includes("ескерілм") ||
    normalized.includes("түспе");
  const hasPlainPaymentOrReceipt =
    normalized.includes("оплат") ||
    normalized.includes("квитанц") ||
    normalized.includes("епд") ||
    normalized.includes("счет") ||
    normalized.includes("счёт") ||
    normalized.includes("сумм") ||
    normalized.includes("пришл") ||
    normalized.includes("төле") ||
    normalized.includes("төлем") ||
    normalized.includes("түбіртек") ||
    normalized.includes("шот") ||
    normalized.includes("сома");

  if (hasPlainDoubleAmount && hasPlainPaymentOrReceipt) {
    return true;
  }
  const hasDoubleAmount =
    normalized.includes("двойн") ||
    normalized.includes("две суммы") ||
    normalized.includes("2 суммы") ||
    normalized.includes("сумма больше") ||
    normalized.includes("много пришл") ||
    normalized.includes("не сел") ||
    normalized.includes("не села") ||
    normalized.includes("не учли") ||
    normalized.includes("не зачел") ||
    normalized.includes("не зачисл") ||
    normalized.includes("екі есе") ||
    normalized.includes("екі сома") ||
    normalized.includes("екі төлем") ||
    normalized.includes("сома көп") ||
    normalized.includes("артық кел") ||
    normalized.includes("ескерілм") ||
    normalized.includes("түспе");
  const hasPaymentOrReceipt =
    normalized.includes("оплат") ||
    normalized.includes("квитанц") ||
    normalized.includes("епд") ||
    normalized.includes("счет") ||
    normalized.includes("сумм") ||
    normalized.includes("пришл") ||
    normalized.includes("төле") ||
    normalized.includes("төлем") ||
    normalized.includes("түбіртек") ||
    normalized.includes("шот") ||
    normalized.includes("сома");

  return hasDoubleAmount && hasPaymentOrReceipt;
}

function buildLatePaymentDoubleChargeAnswer(language: ChatLanguage) {
  if (language === "kk") {
    return [
      "Сірә, төлем түбіртек қалыптасқаннан кейін немесе 25-інен кейін жасалған, сондықтан ағымдағы ЕПД-ға кірмей қалуы мүмкін.",
      "Төлем әдетте жоғалмайды: ақша дербес шотта қалады, ал түбіртекте кеш төлем ескерілмеген сома көрінуі мүмкін.",
      "Егер соманың бір бөлігі төленген болса, тек айырмасын төлеңіз. Келесі жолы төлем түбіртекте дұрыс көрінуі үшін 25-іне дейін төлеген дұрыс.",
    ].join("\n");
  }

  return [
    "Скорее всего, оплата была сделана после формирования квитанции или после 25 числа, поэтому она могла не попасть в текущий ЕПД.",
    "Платеж обычно не пропадает: деньги остаются на лицевом счете, а квитанция может показывать сумму без учета поздней оплаты.",
    "Если часть уже оплачена, оплатите только разницу. В следующий раз лучше платить до 25 числа, чтобы платеж успел отразиться.",
  ].join("\n");
}

function buildSuggestedQuestions(params: {
  question: string;
  source?: string;
  category?: string | null;
  language: ChatLanguage;
}) {
  const normalized = normalizeRu(
    `${params.question} ${params.category ?? ""} ${params.source ?? ""}`
  );

  if (params.source === "supplier-manager") {
    return params.language === "kk"
      ? ["Кодпен табу", "Жабдықтаушы байланысы", "Менің менеджерім"]
      : ["Найти по коду", "Контакты поставщика", "Мой менеджер"];
  }

  if (params.source === "supplier-lookup-help") {
    return params.language === "kk"
      ? ["Кодпен табу", "БСН бойынша іздеу", "Жеткізуші атауы"]
      : ["Найти по коду", "Поиск по БИН", "Название поставщика"];
  }

  if (params.source === "small-talk") {
    return params.language === "kk"
      ? ["ЕПД деген не?", "Төлем қалай жасалады?", "Көрсеткіш беру"]
      : ["Что такое ЕПД?", "Как оплатить?", "Передать показания"];
  }

  if (params.source?.startsWith("meter-correction")) {
    return params.language === "kk"
      ? ["Қандай деректер керек?", "Өтінім мәртебесі", "Көрсеткішті түзету"]
      : ["Какие данные нужны?", "Статус заявки", "Исправить показания"];
  }

  if (isLatePaymentDoubleChargeIntent(params.question)) {
    return params.language === "kk"
      ? ["25-інен кейінгі төлем", "Айырмасын төлеу", "Төлем түсті ме?"]
      : ["Оплата после 25-го", "Оплатить разницу", "Платеж зачислен?"];
  }

  if (
    normalized.includes("оплат") ||
    normalized.includes("kaspi") ||
    normalized.includes("каспи") ||
    normalized.includes("платеж") ||
    normalized.includes("төле") ||
    normalized.includes("төлем")
  ) {
    return params.language === "kk"
      ? ["Kaspi арқылы төлеу", "Төлем көрінбейді", "Қате төлем"]
      : ["Оплата через Kaspi", "Платеж не отразился", "Ошибочная оплата"];
  }

  if (
    normalized.includes("показан") ||
    normalized.includes("счетчик") ||
    normalized.includes("счетчик") ||
    normalized.includes("электр") ||
    normalized.includes("вода") ||
    normalized.includes("көрсеткіш") ||
    normalized.includes("есептегіш") ||
    normalized.includes("санауыш") ||
    normalized.includes("су")
  ) {
    return params.language === "kk"
      ? ["Көрсеткіш жіберу", "Көрсеткішті түзету", "Неге кірмеді?"]
      : ["Передать показания", "Исправить показания", "Почему не попали?"];
  }

  if (
    normalized.includes("квитанц") ||
    normalized.includes("епд") ||
    normalized.includes("дубликат") ||
    normalized.includes("бумаж") ||
    normalized.includes("түбіртек") ||
    normalized.includes("қағаз")
  ) {
    return params.language === "kk"
      ? ["Түбіртек көшірмесі", "Электронды түбіртек", "Қағаздан бас тарту"]
      : ["Дубликат квитанции", "Электронная квитанция", "Отказ от бумаги"];
  }

  if (
    normalized.includes("лицев") ||
    normalized.includes("владел") ||
    normalized.includes("переоформ") ||
    normalized.includes("дербес") ||
    normalized.includes("иесі") ||
    normalized.includes("қайта рәсім")
  ) {
    return params.language === "kk"
      ? ["Иесін ауыстыру", "Қандай құжаттар?", "Дербес шот нөмірі"]
      : ["Сменить владельца", "Какие документы?", "Номер лицевого счета"];
  }

  if (isTechnicalSupportQuestion(params.question)) {
    return params.language === "kk"
      ? ["Қайда жазу керек?", "Кабинет ашылмайды", "Форма жіберілмейді"]
      : ["Куда написать?", "Кабинет не открывается", "Форма не отправляется"];
  }

  return params.language === "kk"
    ? uniqueQuestions([
        "Қандай деректер керек?",
        "Есептеуді тексеру",
        "Өтініш қалдыру",
      ])
    : uniqueQuestions([
        "Какие данные нужны?",
        "Проверить начисления",
        "Оставить обращение",
      ]);
}

async function saveKnowledgeGap(params: {
  conversationId?: string;
  assistantMessageId?: string;
  userQuestion: string;
  assistantAnswer: string;
  reason: KnowledgeGapReason;
  topSimilarity?: number;
}) {
  try {
    const { error } = await getAdminSupabase()
      .from("knowledge_gaps")
      .insert({
        conversation_id: params.conversationId,
        assistant_message_id: params.assistantMessageId,
        topic: inferGapTopic(params.userQuestion),
        user_question: params.userQuestion,
        assistant_answer: params.assistantAnswer,
        reason: params.reason,
        top_similarity: params.topSimilarity ?? null,
      });

    if (error) {
      console.warn("KNOWLEDGE GAP SAVE SKIPPED:", error);
    }
  } catch (error) {
    console.warn("KNOWLEDGE GAP SAVE SKIPPED:", error);
  }
}

async function createOperatorHandoff(params: {
  conversationId?: string;
  visitorId?: string;
  userMessage: string;
  reason: string;
}) {
  try {
    const { data, error } = await getAdminSupabase()
      .from("operator_handoffs")
      .insert({
        conversation_id: params.conversationId,
        visitor_id: params.visitorId,
        user_message: params.userMessage,
        reason: params.reason,
        status: "new",
        priority: 80,
      })
      .select("id,status,created_at")
      .single();

    if (error) {
      if (
        error.code === "PGRST205" ||
        error.message?.includes("operator_handoffs")
      ) {
        return { setupRequired: true };
      }

      throw error;
    }

    return { handoff: data };
  } catch (error) {
    console.warn("OPERATOR HANDOFF SAVE SKIPPED:", error);
    return { setupRequired: true };
  }
}

async function createMeterCorrectionRequest(params: {
  conversationId?: string;
  visitorId?: string;
  draft: ReturnType<typeof mergeMeterCorrectionDrafts>;
  rawText: string;
}) {
  const requestNumber = `MC-${Date.now().toString(36).toUpperCase()}`;
  const payload = {
    request_number: requestNumber,
    conversation_id: params.conversationId,
    visitor_id: params.visitorId,
    account_number: params.draft.accountNumber,
    meter_number: params.draft.meterNumber,
    correct_reading: params.draft.correctReading,
    contact: params.draft.contact,
    service_type: params.draft.serviceType
      ? getMeterCorrectionServiceLabel(params.draft.serviceType)
      : params.draft.serviceType,
    comment: params.draft.comment,
    reason: params.draft.reason ?? params.rawText,
    raw_text: params.rawText,
  };
  let { error } = await getAdminSupabase()
    .from("meter_correction_requests")
    .insert(payload);

  if (error && isMissingVisitorIdColumn(error)) {
    const fallback = await getAdminSupabase()
      .from("meter_correction_requests")
      .insert({
      request_number: requestNumber,
      conversation_id: params.conversationId,
      account_number: params.draft.accountNumber,
      meter_number: params.draft.meterNumber,
      correct_reading: params.draft.correctReading,
      contact: params.draft.contact,
      service_type: params.draft.serviceType
        ? getMeterCorrectionServiceLabel(params.draft.serviceType)
        : params.draft.serviceType,
      comment: params.draft.comment,
      reason: params.draft.reason ?? params.rawText,
      raw_text: params.rawText,
    });

    error = fallback.error;
  }

  if (error) {
    throw error;
  }

  return requestNumber;
}

function isMissingMeterCorrectionTable(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };

  return (
    maybeError.code === "PGRST205" ||
    Boolean(maybeError.message?.includes("meter_correction_requests")) ||
    Boolean(maybeError.message?.includes("comment"))
  );
}

export async function POST(req: Request) {
  try {
    // ===== BODY =====
    const body = await req.json().catch(() => ({}));

    const messages: ChatBodyMessage[] = Array.isArray(body?.messages)
      ? body.messages
      : [];
    const conversationId =
      typeof body?.conversationId === "string"
        ? body.conversationId
        : undefined;
    const visitorId =
      typeof body?.visitorId === "string" && body.visitorId.length <= 120
        ? body.visitorId
        : undefined;

    if (messages.length === 0) {
      return Response.json(
        {
          message: "No messages provided",
        },
        {
          status: 400,
        }
      );
    }

    // ===== LAST MESSAGE =====
    const lastMessage =
      messages[messages.length - 1]?.content;

    if (!lastMessage) {
      return Response.json(
        {
          message: "Empty message",
        },
        {
          status: 400,
        }
      );
    }

    const requestedLanguage =
      body?.language === "kk" || body?.language === "ru"
        ? (body.language as ChatLanguage)
        : undefined;
    const responseLanguage = requestedLanguage ?? detectChatLanguage(lastMessage);
    const submittedMeterCorrection =
      typeof body?.meterCorrection === "object" && body.meterCorrection
        ? (body.meterCorrection as MeterCorrectionFormPayload)
        : null;
    const userMessages = messages.filter((message) => message.role === "user");

    if (submittedMeterCorrection) {
      const { draft, missing } = validateMeterCorrectionForm(
        submittedMeterCorrection
      );

      if (missing.length > 0) {
        return Response.json(
          {
            message:
              responseLanguage === "kk"
                ? `Міндетті өрістерді толтырыңыз: ${missing.join(", ")}.`
                : `Заполните обязательные поля: ${missing.join(", ")}.`,
          },
          { status: 400 }
        );
      }

      let assistantMessage = "";
      let source = "meter-correction-created";

      try {
        assistantMessage = buildMeterCorrectionCreatedMessage(
          await createMeterCorrectionRequest({
            conversationId,
            visitorId,
            draft,
            rawText: [
              ...userMessages.map((message) => message.content),
              `Форма корректировки: ${JSON.stringify(draft)}`,
            ].join("\n"),
          }),
          responseLanguage
        );
      } catch (error) {
        if (!isMissingMeterCorrectionTable(error)) {
          throw error;
        }

        assistantMessage =
          responseLanguage === "kk"
            ? "Форма деректері жиналды, бірақ өтінімдер кестесі әлі бапталмаған. Әкімші Supabase SQL Editor ішінде scripts/chatHistory.sql орындауы керек."
            : "Данные формы собраны, но таблица заявок ещё не настроена. Администратору нужно выполнить scripts/chatHistory.sql в Supabase SQL Editor.";
        source = "meter-correction-setup-required";
      }

      const saved = await saveTurn({
        conversationId,
        visitorId,
        userMessage: "Отправлена форма корректировки показаний",
        assistantMessage,
        source,
      });

      return Response.json({
        message: assistantMessage,
        source,
        conversationId: saved.conversationId,
        messageId: saved.messageId,
        suggestedQuestions: buildSuggestedQuestions({
          question: lastMessage,
          source,
          language: responseLanguage,
        }),
      });
    }

    const smallTalkIntent = detectSmallTalkIntent(lastMessage);

    if (smallTalkIntent) {
      const assistantMessage = buildSmallTalkAnswer(
        smallTalkIntent,
        responseLanguage
      );
      const saved = await saveTurn({
        conversationId,
        visitorId,
        userMessage: lastMessage,
        assistantMessage,
        source: "small-talk",
      });

      return Response.json({
        message: assistantMessage,
        source: "small-talk",
        conversationId: saved.conversationId,
        messageId: saved.messageId,
        suggestedQuestions: buildSuggestedQuestions({
          question: lastMessage,
          source: "small-talk",
          language: responseLanguage,
        }),
      });
    }

    if (isEpdDefinitionIntent(lastMessage)) {
      const assistantMessage = buildEpdDefinitionAnswer(responseLanguage);
      const saved = await saveTurn({
        conversationId,
        visitorId,
        userMessage: lastMessage,
        assistantMessage,
        source: "epd-guidance",
      });

      return Response.json({
        message: assistantMessage,
        source: "epd-guidance",
        conversationId: saved.conversationId,
        messageId: saved.messageId,
        suggestedQuestions: buildSuggestedQuestions({
          question: lastMessage,
          source: "epd-guidance",
          language: responseLanguage,
        }),
      });
    }

    if (isMeterReadingSubmissionIntent(lastMessage)) {
      const assistantMessage =
        buildMeterReadingSubmissionAnswer(responseLanguage);
      const saved = await saveTurn({
        conversationId,
        visitorId,
        userMessage: lastMessage,
        assistantMessage,
        source: "meter-reading-guidance",
      });

      return Response.json({
        message: assistantMessage,
        source: "meter-reading-guidance",
        conversationId: saved.conversationId,
        messageId: saved.messageId,
        suggestedQuestions: buildSuggestedQuestions({
          question: lastMessage,
          source: "meter-reading-guidance",
          language: responseLanguage,
        }),
      });
    }

    if (isKaspiPaymentIntent(lastMessage)) {
      const assistantMessage = buildKaspiPaymentAnswer(responseLanguage);
      const saved = await saveTurn({
        conversationId,
        visitorId,
        userMessage: lastMessage,
        assistantMessage,
        source: "payment-guidance",
      });

      return Response.json({
        message: assistantMessage,
        source: "payment-guidance",
        conversationId: saved.conversationId,
        messageId: saved.messageId,
        suggestedQuestions: buildSuggestedQuestions({
          question: lastMessage,
          source: "payment-guidance",
          language: responseLanguage,
        }),
      });
    }

    if (isAppealFormIntent(lastMessage)) {
      const assistantMessage = buildAppealFormIntro(responseLanguage);
      const saved = await saveTurn({
        conversationId,
        visitorId,
        userMessage: lastMessage,
        assistantMessage,
        source: "appeal-form",
      });

      return Response.json({
        message: assistantMessage,
        source: "appeal-form",
        conversationId: saved.conversationId,
        messageId: saved.messageId,
        suggestedQuestions: buildSuggestedQuestions({
          question: lastMessage,
          source: "appeal-form",
          language: responseLanguage,
        }),
        appealForm: true,
      });
    }

    if (isLeadershipAppointmentIntent(lastMessage)) {
      const assistantMessage = buildAppointmentFormIntro(responseLanguage);
      const saved = await saveTurn({
        conversationId,
        visitorId,
        userMessage: lastMessage,
        assistantMessage,
        source: "appointment-form",
      });

      return Response.json({
        message: assistantMessage,
        source: "appointment-form",
        conversationId: saved.conversationId,
        messageId: saved.messageId,
        suggestedQuestions: buildSuggestedQuestions({
          question: lastMessage,
          source: "appointment-form",
          language: responseLanguage,
        }),
        appointmentForm: true,
      });
    }

    if (isOperatorHandoffIntent(lastMessage)) {
      const assistantMessage = buildOperatorHandoffAnswer(responseLanguage);
      const saved = await saveTurn({
        conversationId,
        visitorId,
        userMessage: lastMessage,
        assistantMessage,
        source: "operator-handoff",
      });
      const handoff = await createOperatorHandoff({
        conversationId: saved.conversationId,
        visitorId,
        userMessage: lastMessage,
        reason: "user-request",
      });

      return Response.json({
        message: handoff.setupRequired
          ? `${assistantMessage}\n\nАдминистратору нужно выполнить обновленный scripts/chatHistory.sql, чтобы очередь операторов сохранялась в Supabase.`
          : assistantMessage,
        source: "operator-handoff",
        conversationId: saved.conversationId,
        messageId: saved.messageId,
        suggestedQuestions:
          responseLanguage === "kk"
            ? ["Өтініш мәртебесі", "Техникалық сұрақ", "Құжат тіркеу"]
            : ["Статус заявки", "Технический вопрос", "Приложить документ"],
        operatorHandoff: handoff.handoff,
      });
    }

    if (isMeterCorrectionIntent(lastMessage)) {
      const meterCorrectionDraft = mergeMeterCorrectionDrafts(userMessages);
      const assistantMessage = buildMeterCorrectionQuestion(
        undefined,
        responseLanguage
      );
      const saved = await saveTurn({
        conversationId,
        visitorId,
        userMessage: lastMessage,
        assistantMessage,
        source: "meter-correction-form",
      });

      return Response.json({
        message: assistantMessage,
        source: "meter-correction-form",
        conversationId: saved.conversationId,
        messageId: saved.messageId,
        suggestedQuestions: buildSuggestedQuestions({
          question: lastMessage,
          source: "meter-correction-form",
          language: responseLanguage,
        }),
        meterCorrectionForm: {
          values: meterCorrectionDraft,
          serviceOptions: getMeterCorrectionServiceOptions(responseLanguage),
        },
      });
    }

    const meterCorrectionDraft = mergeMeterCorrectionDrafts(userMessages);
    const meterCorrectionActive =
      isMeterCorrectionIntent(lastMessage) ||
      messages.some(
        (message) =>
          message.role === "assistant" &&
          (message.content?.includes("заявку на корректировку показаний") ||
            message.content?.includes("Көрсеткіштерді түзетуге өтінім"))
      );

    if (meterCorrectionActive) {
      const missingFields = getMissingMeterCorrectionFields(
        meterCorrectionDraft
      );
      let assistantMessage = buildMeterCorrectionQuestion(
        missingFields,
        responseLanguage
      );
      let source = "meter-correction-form";

      if (missingFields.length === 0) {
        try {
          assistantMessage = buildMeterCorrectionCreatedMessage(
            await createMeterCorrectionRequest({
              conversationId,
              visitorId,
              draft: meterCorrectionDraft,
              rawText: userMessages
                .map((message) => message.content)
                .join("\n"),
            }),
            responseLanguage
          );
          source = "meter-correction-created";
        } catch (error) {
          if (!isMissingMeterCorrectionTable(error)) {
            throw error;
          }

          assistantMessage =
            responseLanguage === "kk"
              ? "Өтінім деректері жиналды, бірақ өтінімдер кестесі әлі бапталмаған. Әкімші Supabase SQL Editor ішінде scripts/chatHistory.sql орындауы керек."
              : "Данные для заявки собраны, но таблица заявок ещё не настроена. Администратору нужно выполнить scripts/chatHistory.sql в Supabase SQL Editor.";
          source = "meter-correction-setup-required";
        }
      }

      const saved = await saveTurn({
        conversationId,
        visitorId,
        userMessage: lastMessage,
        assistantMessage,
        source,
      });

      return Response.json({
        message: assistantMessage,
        source,
        conversationId: saved.conversationId,
        messageId: saved.messageId,
        suggestedQuestions: buildSuggestedQuestions({
          question: lastMessage,
          source,
          language: responseLanguage,
        }),
      });
    }

    const supplierCard = findSupplierManager(lastMessage);

    if (supplierCard) {
      const publicSupplierCard = toPublicSupplierManagerCard(supplierCard);
      const assistantMessage = buildSupplierManagerMessage(
        publicSupplierCard,
        responseLanguage
      );
      const saved = await saveTurn({
        conversationId,
        visitorId,
        userMessage: lastMessage,
        assistantMessage,
        source: "supplier-manager",
      });

      return Response.json({
        message: assistantMessage,
        source: "supplier-manager",
        conversationId: saved.conversationId,
        messageId: saved.messageId,
        suggestedQuestions: buildSuggestedQuestions({
          question: lastMessage,
          source: "supplier-manager",
          language: responseLanguage,
        }),
        supplierCard: publicSupplierCard,
      });
    }

    if (isSupplierManagerLookupHelpIntent(lastMessage)) {
      const assistantMessage =
        buildSupplierManagerLookupHelpAnswer(responseLanguage);
      const saved = await saveTurn({
        conversationId,
        visitorId,
        userMessage: lastMessage,
        assistantMessage,
        source: "supplier-lookup-help",
      });

      return Response.json({
        message: assistantMessage,
        source: "supplier-lookup-help",
        conversationId: saved.conversationId,
        messageId: saved.messageId,
        suggestedQuestions: buildSuggestedQuestions({
          question: lastMessage,
          source: "supplier-lookup-help",
          language: responseLanguage,
        }),
      });
    }

    if (isLatePaymentDoubleChargeIntent(lastMessage)) {
      const assistantMessage = buildLatePaymentDoubleChargeAnswer(
        responseLanguage
      );
      const saved = await saveTurn({
        conversationId,
        visitorId,
        userMessage: lastMessage,
        assistantMessage,
        source: "billing-guidance",
      });

      return Response.json({
        message: assistantMessage,
        source: "billing-guidance",
        conversationId: saved.conversationId,
        messageId: saved.messageId,
        suggestedQuestions: buildSuggestedQuestions({
          question: lastMessage,
          source: "billing-guidance",
          language: responseLanguage,
        }),
      });
    }

    // ===== CREATE QUERY EMBEDDING =====
    const queryEmbedding =
      await createEmbedding(lastMessage);

    // ===== SEARCH KNOWLEDGE =====
    const results =
      await searchKnowledge(queryEmbedding, lastMessage);

    if (process.env.DEBUG_RETRIEVAL === "true") {
      console.log(
        "TOP RESULTS:",
        results.map((r) => ({
          title: r.title,
          similarity: r.similarity,
          score: r.score,
        }))
      );
    }

    const top = results?.[0];

    // ===== DIRECT ANSWER IF VERY STRONG MATCH =====
    if (
      responseLanguage === "ru" &&
      top &&
      top.similarity > DIRECT_MATCH_THRESHOLD &&
      top.verified
    ) {
      const saved = await saveTurn({
        conversationId,
        visitorId,
        userMessage: lastMessage,
        assistantMessage: top.content ?? "",
        source: "knowledge-direct",
      });

      return Response.json({
        message: top.content,
        source: "knowledge-direct",
        conversationId: saved.conversationId,
        messageId: saved.messageId,
        suggestedQuestions: buildSuggestedQuestions({
          question: lastMessage,
          source: "knowledge-direct",
          category: top.category,
          language: responseLanguage,
        }),
      });
    }

    const uncertainReason = getUncertainReason(top);

    if (uncertainReason) {
      const supportCard = getSupportCardIfNeeded(
        lastMessage,
        responseLanguage
      );
      const assistantMessage = buildUncertainAnswer(
        Boolean(supportCard),
        responseLanguage
      );
      const saved = await saveTurn({
        conversationId,
        visitorId,
        userMessage: lastMessage,
        assistantMessage,
        source: "uncertain",
      });

      await saveKnowledgeGap({
        conversationId: saved.conversationId,
        assistantMessageId: saved.messageId,
        userQuestion: lastMessage,
        assistantAnswer: assistantMessage,
        reason: uncertainReason,
        topSimilarity: top?.similarity,
      });

      return Response.json({
        message: assistantMessage,
        source: "uncertain",
        conversationId: saved.conversationId,
        messageId: saved.messageId,
        suggestedQuestions: buildSuggestedQuestions({
          question: lastMessage,
          source: "uncertain",
          category: top?.category,
          language: responseLanguage,
        }),
        supportCard,
      });
    }

    // ===== BUILD CONTEXT =====
    const context = results
      .slice(0, 5)
      .map(
        (r) => `
TITLE:
${r.title}

CONTENT:
${r.content}
`
      )
      .join("\n\n");

    // ===== GPT =====
    const completion =
      await getOpenAI().chat.completions.create({
        model: "gpt-4.1-mini",

        temperature: 0.3,

        messages: [
          {
            role: "system",

            content: `
Ты AI помощник компании Астана ЕРЦ.

Пользователь задал последний вопрос на ${languageName(responseLanguage)}. Ответь на этом же языке.

Отвечай только по информации из базы знаний ниже.

Если есть несколько похожих фрагментов, в первую очередь используй проверенные и более точные.

Если база знаний на русском, а пользователь спрашивает на казахском, кратко и точно перескажи найденную информацию на казахском языке. Смысл, номера, адреса и сроки не меняй.

Если точного ответа в базе нет, честно скажи, что точной информации нет, и предложи уточнить вопрос.

Не придумывай факты, номера телефонов, адреса, сроки или способы оплаты.

Отвечай кратко: 2-5 коротких предложений или до 3 пунктов. Без повторов и лишних вступлений.

Контакты и направление в поддержку добавляй только если пользователь прямо просит, куда обратиться, или вопрос явно технический.

БАЗА ЗНАНИЙ:
${context}
            `.trim(),
          },

          ...messages
            .filter(
              (message) =>
                message.role &&
                ["user", "assistant"].includes(message.role) &&
                message.content
            )
            .map((message) => ({
              role: message.role!,
              content: message.content!,
            })),
        ],
      });

    const assistantMessage =
      completion.choices[0].message.content ??
      (responseLanguage === "kk"
        ? "Жауап алу мүмкін болмады."
        : "Не удалось получить ответ.");
    const saved = await saveTurn({
      conversationId,
      visitorId,
      userMessage: lastMessage,
      assistantMessage,
      source: "gpt",
    });

    const gapReason = getGapReason({
      top,
      assistantMessage,
    });

    if (gapReason) {
      await saveKnowledgeGap({
        conversationId: saved.conversationId,
        assistantMessageId: saved.messageId,
        userQuestion: lastMessage,
        assistantAnswer: assistantMessage,
        reason: gapReason,
        topSimilarity: top?.similarity,
      });
    }

    // ===== RESPONSE =====
    return Response.json({
      message: assistantMessage,
      source: "gpt",
      conversationId: saved.conversationId,
      messageId: saved.messageId,
      suggestedQuestions: buildSuggestedQuestions({
        question: lastMessage,
        source: "gpt",
        category: top?.category,
        language: responseLanguage,
      }),
      supportCard: gapReason
        ? getSupportCardIfNeeded(lastMessage, responseLanguage)
        : undefined,
    });

  } catch (err) {
    console.error(
      "CHAT API ERROR:",
      err
    );

    return Response.json(
      {
        message: "Internal server error",
      },
      {
        status: 500,
      }
    );
  }
}
