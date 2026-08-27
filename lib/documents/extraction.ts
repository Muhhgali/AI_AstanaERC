import OpenAI from "openai";
import { DOCUMENT_MAX_PAGES } from "./validation";
import type { DocumentExtractionMethod } from "./types";

export type DocumentExtractionResult =
  | {
      status: "ready";
      method: Exclude<DocumentExtractionMethod, "none">;
      text: string;
      pageCount: number;
      warnings: string[];
    }
  | {
      status: "ocr_required";
      method: "none";
      text: "";
      pageCount: number;
      warnings: string[];
    }
  | {
      status: "failed";
      method: "none";
      text: "";
      pageCount: number;
      warnings: string[];
      errorMessage: string;
    };

export type DocumentExtractRequest = {
  bytes: Uint8Array;
  contentType: "application/pdf" | "image/png" | "image/jpeg";
  fileName?: string;
  pageCountHint?: number;
};

export interface DocumentTextExtractor {
  extract(bytes: Uint8Array): Promise<DocumentExtractionResult>;
}

export interface OcrDocumentExtractor {
  extract(request: DocumentExtractRequest): Promise<DocumentExtractionResult>;
}

type PdfParserInstance = {
  getInfo(): Promise<{ total?: number }>;
  getText(): Promise<{ text?: string }>;
  destroy(): Promise<void>;
};

type PdfParserConstructor = new (options: { data: Uint8Array }) => PdfParserInstance;

type VisionOcrClient = {
  files: {
    create: (body: {
      file: File;
      purpose: "user_data";
    }) => Promise<{ id: string }>;
    delete: (id: string) => Promise<unknown>;
  };
  responses: {
    create: (body: {
      model: string;
      instructions: string;
      input: Array<{
        role: "user";
        content: Array<
          | { type: "input_text"; text: string }
          | { type: "input_file"; file_id: string }
          | {
              type: "input_image";
              detail: "low" | "high" | "auto" | "original";
              image_url: string;
            }
        >;
      }>;
    }) => Promise<{ output_text?: string }>;
  };
};

const MIN_USABLE_TEXT_LENGTH = 80;

const OCR_INSTRUCTIONS = [
  "Ты OCR-движок для квитанций Астана-ЕРЦ и банковских чеков.",
  "Извлеки весь видимый текст документа дословно.",
  "Сохраняй числа, даты, лицевые счета, суммы, статусы и названия поставщиков без изменений.",
  "Не суммируй, не интерпретируй и не выдумывай отсутствующие поля.",
  "Верни только распознанный текст, без markdown и без комментариев.",
].join(" ");

const OCR_USER_PROMPT =
  "Извлеки весь видимый текст из этого документа дословно. Это ЕПД/квитанция или банковский чек.";

let pdfParserConstructor: PdfParserConstructor | null = null;
let openaiClient: VisionOcrClient | null = null;
let openaiClientFactory: (() => VisionOcrClient) | null = null;

export function setVisionOcrClientFactory(
  factory: (() => VisionOcrClient) | null
) {
  openaiClientFactory = factory;
  openaiClient = null;
}

function getVisionOcrModel() {
  return process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-4.1";
}

function getVisionOcrClient(): VisionOcrClient | null {
  if (openaiClientFactory) {
    openaiClient ??= openaiClientFactory();
    return openaiClient;
  }

  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  openaiClient ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }) as unknown as VisionOcrClient;

  return openaiClient;
}

async function ensurePdfRuntime() {
  const globalScope = globalThis as unknown as Record<string, unknown>;

  if (globalScope.DOMMatrix && globalScope.ImageData && globalScope.Path2D) {
    return;
  }

  const canvas = await import("@napi-rs/canvas").catch(() => null);

  if (!canvas) {
    return;
  }

  globalScope.DOMMatrix ??= canvas.DOMMatrix;
  globalScope.ImageData ??= canvas.ImageData;
  globalScope.Path2D ??= canvas.Path2D;
}

async function getPdfParserConstructor() {
  if (pdfParserConstructor) {
    return pdfParserConstructor;
  }

  await ensurePdfRuntime();
  const pdfParse = (await import("pdf-parse")) as {
    PDFParse: PdfParserConstructor;
  };
  pdfParserConstructor = pdfParse.PDFParse;

  return pdfParserConstructor;
}

function normalizeExtractedText(text: string) {
  return text.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").trim();
}

function isPasswordOrEncryptedError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  return (
    message.includes("password") ||
    message.includes("encrypted") ||
    message.includes("needpassword") ||
    message.includes("incorrect password")
  );
}

function bytesToBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

function defaultFileName(
  contentType: DocumentExtractRequest["contentType"],
  fileName?: string
) {
  if (fileName?.trim()) {
    return fileName.trim();
  }

  if (contentType === "image/png") {
    return "document.png";
  }

  if (contentType === "image/jpeg") {
    return "document.jpg";
  }

  return "document.pdf";
}

export class NativePdfExtractor implements DocumentTextExtractor {
  async extract(bytes: Uint8Array): Promise<DocumentExtractionResult> {
    let parser: PdfParserInstance | null = null;

    try {
      const PDFParse = await getPdfParserConstructor();
      parser = new PDFParse({ data: bytes });
      const info = await parser.getInfo();
      const pageCount = info.total ?? 0;

      if (pageCount > DOCUMENT_MAX_PAGES) {
        return {
          status: "failed",
          method: "none",
          text: "",
          pageCount,
          warnings: [`PDF has ${pageCount} pages; max is ${DOCUMENT_MAX_PAGES}.`],
          errorMessage: `PDF слишком длинный. Максимум ${DOCUMENT_MAX_PAGES} страниц.`,
        };
      }

      const result = await parser.getText();
      const text = normalizeExtractedText(result.text ?? "");
      const warnings: string[] = [];

      if (text.length < MIN_USABLE_TEXT_LENGTH) {
        warnings.push(
          "Native text extraction returned too little text; OCR is required."
        );

        return {
          status: "ocr_required",
          method: "none",
          text: "",
          pageCount,
          warnings,
        };
      }

      return {
        status: "ready",
        method: "native_pdf",
        text,
        pageCount,
        warnings,
      };
    } catch (error) {
      return {
        status: "failed",
        method: "none",
        text: "",
        pageCount: 0,
        warnings: [],
        errorMessage: isPasswordOrEncryptedError(error)
          ? "PDF защищён паролем или зашифрован. Загрузите незапароленный PDF."
          : "Не удалось прочитать PDF. Возможно, файл повреждён или имеет неподдерживаемый формат.",
      };
    } finally {
      await parser?.destroy().catch(() => undefined);
    }
  }
}

export class OcrExtractor implements OcrDocumentExtractor {
  async extract(
    request: DocumentExtractRequest
  ): Promise<DocumentExtractionResult> {
    const pageCount =
      request.pageCountHint && request.pageCountHint > 0
        ? request.pageCountHint
        : request.contentType === "application/pdf"
          ? 0
          : 1;

    const client = getVisionOcrClient();

    if (!client) {
      return {
        status: "ocr_required",
        method: "none",
        text: "",
        pageCount,
        warnings: [
          "OCR/vision provider is not configured. Set OPENAI_API_KEY to enable scan and image recognition.",
        ],
      };
    }

    const fileName = defaultFileName(request.contentType, request.fileName);
    let uploadedFileId: string | null = null;

    try {
      const content: Array<
        | { type: "input_text"; text: string }
        | { type: "input_file"; file_id: string }
        | {
            type: "input_image";
            detail: "high";
            image_url: string;
          }
      > = [{ type: "input_text", text: OCR_USER_PROMPT }];

      if (request.contentType === "application/pdf") {
        const uploaded = await client.files.create({
          file: new File([Buffer.from(request.bytes)], fileName, {
            type: "application/pdf",
          }),
          purpose: "user_data",
        });
        uploadedFileId = uploaded.id;
        content.push({ type: "input_file", file_id: uploaded.id });
      } else {
        content.push({
          type: "input_image",
          detail: "high",
          image_url: `data:${request.contentType};base64,${bytesToBase64(request.bytes)}`,
        });
      }

      const response = await client.responses.create({
        model: getVisionOcrModel(),
        instructions: OCR_INSTRUCTIONS,
        input: [
          {
            role: "user",
            content,
          },
        ],
      });

      const text = normalizeExtractedText(response.output_text ?? "");

      if (text.length < MIN_USABLE_TEXT_LENGTH) {
        return {
          status: "failed",
          method: "none",
          text: "",
          pageCount,
          warnings: [
            "Vision OCR returned too little text to structure the document.",
          ],
          errorMessage:
            "Не удалось распознать текст на скане или изображении. Загрузите более чёткое фото или текстовый PDF.",
        };
      }

      return {
        status: "ready",
        method: "vision",
        text,
        pageCount: pageCount || 1,
        warnings: ["Text extracted via OpenAI vision OCR."],
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Vision OCR request failed.";

      return {
        status: "failed",
        method: "none",
        text: "",
        pageCount,
        warnings: [message],
        errorMessage:
          "Не удалось распознать документ через OCR/vision. Попробуйте ещё раз или загрузите текстовый PDF.",
      };
    } finally {
      if (uploadedFileId && client) {
        await client.files.delete(uploadedFileId).catch(() => undefined);
      }
    }
  }
}

export async function extractResidentDocumentText(
  request: DocumentExtractRequest
): Promise<DocumentExtractionResult> {
  if (request.contentType === "application/pdf") {
    const native = await new NativePdfExtractor().extract(request.bytes);

    if (native.status !== "ocr_required") {
      return native;
    }

    const ocr = await new OcrExtractor().extract({
      ...request,
      pageCountHint: native.pageCount || request.pageCountHint,
    });

    if (ocr.status === "ready") {
      return {
        ...ocr,
        warnings: [...native.warnings, ...ocr.warnings],
      };
    }

    if (ocr.status === "ocr_required") {
      return {
        ...ocr,
        pageCount: native.pageCount || ocr.pageCount,
        warnings: [...native.warnings, ...ocr.warnings],
      };
    }

    return {
      ...ocr,
      pageCount: native.pageCount || ocr.pageCount,
      warnings: [...native.warnings, ...ocr.warnings],
    };
  }

  return new OcrExtractor().extract({
    ...request,
    pageCountHint: request.pageCountHint ?? 1,
  });
}
