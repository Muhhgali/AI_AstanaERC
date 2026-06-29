/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseProjectUrl } from "@/lib/supabaseEnv";

let adminClient: ReturnType<typeof createClient<any>> | null = null;

type ChatLanguage = "ru" | "kk";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function getAdminClient() {
  const supabaseUrl = getSupabaseProjectUrl();

  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  adminClient ??= createClient<any>(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  return adminClient;
}

function normalizeLanguage(value: FormDataEntryValue | null): ChatLanguage {
  return value === "kk" ? "kk" : "ru";
}

function isMissingTable(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST205" ||
    Boolean(error.message?.includes("receipt_analysis_requests"))
  );
}

function formatSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} КБ`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
}

function buildMessage(language: ChatLanguage, file: File, saved: boolean) {
  if (language === "kk") {
    return [
      `Файл қабылданды: ${file.name} (${formatSize(file.size)}).`,
      saved
        ? "Оны админкадағы квитанцияны тексеру кезегіне қостым."
        : "Файл тексерілді, бірақ квитанциялар кестесі әлі қосылмаған.",
      "Қазір автоматты толық OCR емес, қауіпсіз MVP-тексеру жұмыс істейді: файл түрі, көлемі және операторға қандай деректерді қарау керегі белгіленеді.",
      "Тексеру кезінде дербес шотты, кезеңді, төлем күнін, соманы және 25-інен кейінгі төлем бар-жоғын салыстырыңыз.",
    ].join("\n");
  }

  return [
    `Файл принят: ${file.name} (${formatSize(file.size)}).`,
    saved
      ? "Я добавил его в очередь проверки квитанций для админки."
      : "Файл проверен, но таблица квитанций еще не подключена.",
    "Сейчас работает безопасный MVP-слой: проверка типа/размера файла и подсказка оператору, какие поля сверить. Полный OCR можно подключить следующим этапом.",
    "При проверке сверяйте лицевой счет, период, дату оплаты, сумму и ситуацию с оплатой после 25 числа.",
  ].join("\n");
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file");
  const language = normalizeLanguage(formData.get("language"));

  if (!(file instanceof File)) {
    return Response.json({ message: "file is required" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json(
      {
        message:
          language === "kk"
            ? "PDF, JPG, PNG немесе WEBP файлын жүктеңіз."
            : "Загрузите PDF, JPG, PNG или WEBP файл.",
      },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return Response.json(
      {
        message:
          language === "kk"
            ? "Файл 10 МБ-тан аспауы керек."
            : "Файл должен быть не больше 10 МБ.",
      },
      { status: 400 }
    );
  }

  let saved = false;

  try {
    const { error } = await getAdminClient()
      .from("receipt_analysis_requests")
      .insert({
        conversation_id:
          typeof formData.get("conversationId") === "string"
            ? formData.get("conversationId")
            : null,
        visitor_id:
          typeof formData.get("visitorId") === "string"
            ? formData.get("visitorId")
            : null,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        status: "new",
        analysis_summary: buildMessage(language, file, true),
      });

    if (error) {
      if (!isMissingTable(error)) {
        throw error;
      }
    } else {
      saved = true;
    }
  } catch (error) {
    console.warn("RECEIPT ANALYSIS SAVE SKIPPED:", error);
  }

  return Response.json({
    message: buildMessage(language, file, saved),
    source: "receipt-analysis",
    suggestedQuestions:
      language === "kk"
        ? ["Төлем 25-інен кейін түсті ме?", "Сома неге екі есе?", "Түбіртекті тексеру"]
        : ["Оплата после 25-го?", "Почему сумма двойная?", "Проверить квитанцию"],
  });
}
