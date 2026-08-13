import OpenAI from "openai";
import { enforceRateLimit, RATE_LIMIT_POLICIES } from "@/lib/rateLimit";
import { requireAdmin } from "@/lib/auth/requireAdmin";

let openai: OpenAI | null = null;

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  openai ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  return openai;
}

export async function POST(req: Request) {
  const rateLimited = enforceRateLimit(
    req,
    RATE_LIMIT_POLICIES.documentAnalysis
  );

  if (rateLimited) {
    return rateLimited;
  }

  const authorization = await requireAdmin(req);

  if (!authorization.ok) {
    return authorization.response;
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const note = formData.get("note");

  if (!(file instanceof File)) {
    return Response.json(
      { message: "Загрузи PDF-файл для анализа." },
      { status: 400 }
    );
  }

  if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
    return Response.json(
      { message: "Пока поддерживаются только PDF-файлы." },
      { status: 400 }
    );
  }

  if (file.size > 20 * 1024 * 1024) {
    return Response.json(
      { message: "PDF слишком большой. Максимум 20 MB." },
      { status: 400 }
    );
  }

  try {
    const client = getOpenAI();
    const uploaded = await client.files.create({
      file,
      purpose: "user_data",
    });

    const response = await client.responses.create({
      model: process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-4.1",
      instructions:
        "Ты эксперт по базе знаний клиентской поддержки Астана ЕРЦ. Анализируй PDF строго по содержанию файла. Не выдумывай факты. Если в документе нет информации, так и скажи.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Проанализируй PDF для будущей базы знаний AI-бота.",
                "",
                "Найди:",
                "1. Краткое содержание документа.",
                "2. Какие факты можно добавить в knowledge как проверенные.",
                "3. Что в документе непонятно, устарело, противоречиво или требует проверки.",
                "4. Какие вопросы пользователей этот документ закрывает.",
                "5. Готовые черновики записей knowledge в формате: Заголовок / Категория / Ответ.",
                "",
                typeof note === "string" && note.trim()
                  ? `Комментарий администратора: ${note.trim()}`
                  : "",
              ]
                .filter(Boolean)
                .join("\n"),
            },
            {
              type: "input_file",
              file_id: uploaded.id,
            },
          ],
        },
      ],
    });

    return Response.json({
      fileName: file.name,
      fileId: uploaded.id,
      analysis: response.output_text,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось проанализировать PDF";

    return Response.json({ message }, { status: 500 });
  }
}
