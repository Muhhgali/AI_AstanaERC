/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { sendRequestEmail } from "@/lib/requestEmail";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";

const APPOINTMENT_EMAIL_TO = "office.manager@aerc.kz";
const APPOINTMENT_TIME = "15:00–16:00";

const LEADERS = {
  general_director: {
    title: "Генеральный директор",
    name: "Бекенов А.Б.",
    weekday: 3,
  },
  deputy_director: {
    title: "Заместитель директора",
    name: "Акижанов М.Ж.",
    weekday: 4,
  },
} as const;

let adminSupabase: ReturnType<typeof createClient<any>> | null = null;

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

function isLeaderKey(value: string): value is keyof typeof LEADERS {
  return value in LEADERS;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseClientDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date();
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isMissingConversationColumn(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };

  return (
    maybeError.code === "42703" ||
    Boolean(maybeError.message?.includes("conversation_id")) ||
    Boolean(maybeError.message?.includes("visitor_id"))
  );
}

function getNextDates(weekday: number, baseDate = new Date()) {
  const today = baseDate;
  const dates: string[] = [];
  const cursor = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  while (dates.length < 4) {
    cursor.setDate(cursor.getDate() + 1);

    if (cursor.getDay() === weekday) {
      dates.push(formatDate(cursor));
    }
  }

  return dates;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const firstName = String(body?.firstName ?? "").trim();
    const lastName = String(body?.lastName ?? "").trim();
    const leaderKey = String(body?.leader ?? "").trim();
    const date = String(body?.date ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const email = String(body?.email ?? "").trim();
    const conversationId =
      typeof body?.conversationId === "string" && body.conversationId
        ? body.conversationId
        : null;
    const visitorId =
      typeof body?.visitorId === "string" && body.visitorId
        ? body.visitorId
        : null;
    const clientDate = parseClientDate(body?.clientDate);

    if (!firstName || !lastName || !leaderKey || !date) {
      return Response.json(
        { message: "Заполните имя, фамилию, руководителя и дату приема." },
        { status: 400 }
      );
    }

    if (!phone && !email) {
      return Response.json(
        { message: "Укажите телефон или Email." },
        { status: 400 }
      );
    }

    if (!isLeaderKey(leaderKey)) {
      return Response.json(
        { message: "Выберите руководителя из списка." },
        { status: 400 }
      );
    }

    const leader = LEADERS[leaderKey];
    const allowedDates = getNextDates(leader.weekday, clientDate);

    if (!allowedDates.includes(date)) {
      return Response.json(
        { message: "Выберите дату из доступных вариантов записи." },
        { status: 400 }
      );
    }

    const leaderLabel = `${leader.title} — ${leader.name}`;
    const contacts = [phone ? `Телефон: ${phone}` : "", email ? `Email: ${email}` : ""]
      .filter(Boolean)
      .join("\n");
    const emailText = [
      "Заявка на прием",
      "",
      `Имя, Фамилия: ${firstName} ${lastName}`,
      `Руководитель: ${leaderLabel}`,
      `Дата приема: ${date}`,
      `Время: ${APPOINTMENT_TIME}`,
      "",
      "Контакты:",
      contacts,
    ].join("\n");

    let requestId: string | undefined;
    let storageSaved = false;

    try {
      const payload = {
        conversation_id: conversationId,
        visitor_id: visitorId,
        first_name: firstName,
        last_name: lastName,
        leader_key: leaderKey,
        leader_title: leader.title,
        leader_name: leader.name,
        appointment_date: date,
        appointment_time: APPOINTMENT_TIME,
        phone: phone || null,
        email: email || null,
      };
      let { data, error } = await getAdminSupabase()
        .from("leadership_appointments")
        .insert(payload)
        .select("id")
        .single();

      if (error && isMissingConversationColumn(error)) {
        const fallback = await getAdminSupabase()
          .from("leadership_appointments")
          .insert({
          first_name: firstName,
          last_name: lastName,
          leader_key: leaderKey,
          leader_title: leader.title,
          leader_name: leader.name,
          appointment_date: date,
          appointment_time: APPOINTMENT_TIME,
          phone: phone || null,
          email: email || null,
          })
          .select("id")
          .single();

        data = fallback.data;
        error = fallback.error;
      }

      if (!error && data) {
        requestId = data.id as string;
        storageSaved = true;
      } else {
        console.warn("APPOINTMENT SAVE SKIPPED:", error);
      }
    } catch (error) {
      console.warn("APPOINTMENT SAVE SKIPPED:", error);
    }

    const mail = await sendRequestEmail({
      to: APPOINTMENT_EMAIL_TO,
      subject: "Заявка на прием",
      text: emailText,
    });

    return Response.json({
      ok: true,
      requestId,
      storageSaved,
      emailSent: mail.sent,
      emailReason: mail.reason,
      message:
        "Заявка отправлена. Офис-менеджер свяжется с вами для подтверждения записи.",
    });
  } catch (error) {
    console.error("APPOINTMENT REQUEST ERROR:", error);

    return Response.json(
      { message: "Не удалось отправить заявку на прием." },
      { status: 500 }
    );
  }
}
