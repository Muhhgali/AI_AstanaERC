/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { sendRequestEmail } from "@/lib/requestEmail";
import { enforceRateLimit, RATE_LIMIT_POLICIES } from "@/lib/rateLimit";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";
import {
  getOrCreateVisitorOwnership,
  getOwnedConversationId,
  jsonWithVisitorOwnership,
} from "@/lib/security/visitorOwnership";

const APPEAL_EMAIL_TO = "office.manager@aerc.kz";
const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

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

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
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

async function uploadFiles(files: File[]) {
  const uploaded: { name: string; path?: string; size: number; type: string }[] =
    [];
  const supabase = getAdminSupabase();

  for (const file of files) {
    const safeName = file.name.replace(/[^\w.\-а-яА-ЯёЁ]+/g, "_");
    const path = `appeals/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage
      .from("request-attachments")
      .upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });

    uploaded.push({
      name: file.name,
      path: error ? undefined : path,
      size: file.size,
      type: file.type,
    });
  }

  return uploaded;
}

export async function POST(req: Request) {
  const visitorOwnership = getOrCreateVisitorOwnership(req);
  const jsonResponse = (body: unknown, init?: ResponseInit) =>
    jsonWithVisitorOwnership(body, visitorOwnership, init);
  const rateLimited = enforceRateLimit(req, RATE_LIMIT_POLICIES.publicMutation);

  if (rateLimited) {
    if (visitorOwnership.cookieHeader) {
      rateLimited.headers.append("Set-Cookie", visitorOwnership.cookieHeader);
    }

    return rateLimited;
  }

  try {
    const formData = await req.formData();
    const name = readText(formData, "name");
    const topic = readText(formData, "topic");
    const message = readText(formData, "message");
    const contact = readText(formData, "contact");
    const conversationId = await getOwnedConversationId(
      getAdminSupabase(),
      readText(formData, "conversationId"),
      visitorOwnership.visitorId
    );
    const files = formData
      .getAll("files")
      .filter((file): file is File => file instanceof File && file.size > 0);

    if (!name || !topic || !message) {
      return jsonResponse(
        { message: "Заполните имя, тему и сообщение." },
        { status: 400 }
      );
    }

    if (files.length > MAX_FILES) {
      return jsonResponse(
        { message: `Можно загрузить не больше ${MAX_FILES} файлов.` },
        { status: 400 }
      );
    }

    const oversized = files.find((file) => file.size > MAX_FILE_SIZE);

    if (oversized) {
      return jsonResponse(
        { message: `Файл ${oversized.name} больше 10 МБ.` },
        { status: 400 }
      );
    }

    const attachments = files.length ? await uploadFiles(files) : [];
    const emailText = [
      "Новое обращение из чат-бота Астана-ЕРЦ",
      "",
      `Имя: ${name}`,
      `Тема: ${topic}`,
      `Контакт: ${contact || "не указан"}`,
      "",
      "Сообщение:",
      message,
      "",
      attachments.length
        ? `Файлы: ${attachments
            .map((file) => `${file.name}${file.path ? ` (${file.path})` : ""}`)
            .join(", ")}`
        : "Файлы: не приложены",
    ].join("\n");

    let requestId: string | undefined;
    let storageSaved = false;

    try {
      const payload = {
        conversation_id: conversationId,
        visitor_id: visitorOwnership.visitorId,
        name,
        topic,
        message,
        contact: contact || null,
        attachments,
      };
      let { data, error } = await getAdminSupabase()
        .from("appeal_requests")
        .insert(payload)
        .select("id")
        .single();

      if (error && isMissingConversationColumn(error)) {
        const fallback = await getAdminSupabase()
          .from("appeal_requests")
          .insert({
          name,
          topic,
          message,
          contact: contact || null,
          attachments,
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
        console.warn("APPEAL SAVE SKIPPED:", error);
      }
    } catch (error) {
      console.warn("APPEAL SAVE SKIPPED:", error);
    }

    const email = await sendRequestEmail({
      to: APPEAL_EMAIL_TO,
      subject: `Обращение: ${topic}`,
      text: emailText,
    });

    return jsonResponse({
      ok: true,
      requestId,
      storageSaved,
      emailSent: email.sent,
      emailReason: email.reason,
      message:
        "Обращение отправлено. Специалист рассмотрит сообщение и свяжется с вами при необходимости.",
    });
  } catch (error) {
    console.error("APPEAL REQUEST ERROR:", error);

    return jsonResponse(
      { message: "Не удалось отправить обращение." },
      { status: 500 }
    );
  }
}
