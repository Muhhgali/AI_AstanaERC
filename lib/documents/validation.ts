import { createHash } from "node:crypto";

export const DOCUMENT_MAX_FILE_SIZE = 8 * 1024 * 1024;
export const DOCUMENT_MAX_PAGES = 5;
export const DOCUMENT_STORAGE_BUCKET = "resident-documents";

export type PdfValidationResult =
  | {
      ok: true;
      bytes: Uint8Array;
      hash: string;
    }
  | {
      ok: false;
      code:
        | "missing_file"
        | "empty_file"
        | "invalid_type"
        | "too_large"
        | "fake_pdf";
      message: string;
    };

function hasPdfExtension(fileName: string) {
  return /\.pdf$/i.test(fileName.trim());
}

export function formatDocumentSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function hasPdfMagicBytes(bytes: Uint8Array) {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

export async function validatePdfFile(file: unknown): Promise<PdfValidationResult> {
  if (!(file instanceof File)) {
    return {
      ok: false,
      code: "missing_file",
      message: "file is required",
    };
  }

  if (file.size <= 0) {
    return {
      ok: false,
      code: "empty_file",
      message: "Файл пустой. Загрузите PDF-квитанцию.",
    };
  }

  if (file.size > DOCUMENT_MAX_FILE_SIZE) {
    return {
      ok: false,
      code: "too_large",
      message: `PDF слишком большой. Максимум ${formatDocumentSize(
        DOCUMENT_MAX_FILE_SIZE
      )}.`,
    };
  }

  if (file.type !== "application/pdf" || !hasPdfExtension(file.name)) {
    return {
      ok: false,
      code: "invalid_type",
      message: "Можно загрузить только PDF-файл.",
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (!hasPdfMagicBytes(bytes)) {
    return {
      ok: false,
      code: "fake_pdf",
      message: "Файл выглядит не как настоящий PDF. Проверьте файл и загрузите снова.",
    };
  }

  return {
    ok: true,
    bytes,
    hash: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function buildDocumentStoragePath(params: {
  visitorId: string;
  documentId: string;
  fileHash: string;
}) {
  return `${params.visitorId}/${params.documentId}/${params.fileHash}.pdf`;
}
