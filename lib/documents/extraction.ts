import { DOCUMENT_MAX_PAGES } from "@/lib/documents/validation";

export type DocumentExtractionResult =
  | {
      status: "ready";
      method: "native_pdf";
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

export interface DocumentTextExtractor {
  extract(bytes: Uint8Array): Promise<DocumentExtractionResult>;
}

type PdfParserInstance = {
  getInfo(): Promise<{ total?: number }>;
  getText(): Promise<{ text?: string }>;
  destroy(): Promise<void>;
};

type PdfParserConstructor = new (options: { data: Uint8Array }) => PdfParserInstance;

let pdfParserConstructor: PdfParserConstructor | null = null;

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

      if (text.length < 80) {
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

export class OcrExtractor implements DocumentTextExtractor {
  async extract(): Promise<DocumentExtractionResult> {
    return {
      status: "ocr_required",
      method: "none",
      text: "",
      pageCount: 0,
      warnings: ["OCR provider is not configured for Stage 5 MVP."],
    };
  }
}
