import { createHash } from "node:crypto";
import type { DocumentFileKind } from "@/lib/documents/types";

export const DOCUMENT_MAX_FILE_SIZE = 8 * 1024 * 1024;
export const DOCUMENT_MAX_PAGES = 5;
export const DOCUMENT_MAX_IMAGE_PIXELS = 32_000_000;
export const DOCUMENT_STORAGE_BUCKET = "resident-documents";

export type DocumentValidationResult =
  | {
      ok: true;
      bytes: Uint8Array;
      hash: string;
      kind: DocumentFileKind;
      contentType: "application/pdf" | "image/png" | "image/jpeg";
      extension: "pdf" | "png" | "jpg";
      width?: number;
      height?: number;
    }
  | {
      ok: false;
      code:
        | "missing_file"
        | "empty_file"
        | "invalid_type"
        | "too_large"
        | "fake_pdf"
        | "fake_image"
        | "image_too_large";
      message: string;
    };

export type PdfValidationResult = DocumentValidationResult;

function extensionOf(fileName: string) {
  return fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
}

function hasPdfExtension(fileName: string) {
  return extensionOf(fileName) === "pdf";
}

function hasPngExtension(fileName: string) {
  return extensionOf(fileName) === "png";
}

function hasJpegExtension(fileName: string) {
  return ["jpg", "jpeg"].includes(extensionOf(fileName) ?? "");
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

export function hasPngMagicBytes(bytes: Uint8Array) {
  return (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

export function hasJpegMagicBytes(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function readUint32Be(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] * 16_777_216 +
    bytes[offset + 1] * 65_536 +
    bytes[offset + 2] * 256 +
    bytes[offset + 3]
  );
}

function getPngDimensions(bytes: Uint8Array) {
  if (!hasPngMagicBytes(bytes)) {
    return null;
  }

  return {
    width: readUint32Be(bytes, 16),
    height: readUint32Be(bytes, 20),
  };
}

function getJpegDimensions(bytes: Uint8Array) {
  let offset = 2;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    const length = bytes[offset + 2] * 256 + bytes[offset + 3];
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isSof && length >= 7) {
      return {
        height: bytes[offset + 5] * 256 + bytes[offset + 6],
        width: bytes[offset + 7] * 256 + bytes[offset + 8],
      };
    }

    if (length < 2) {
      return null;
    }

    offset += 2 + length;
  }

  return null;
}

function validateImageDimensions(
  dimensions: { width: number; height: number } | null
) {
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return false;
  }

  return dimensions.width * dimensions.height <= DOCUMENT_MAX_IMAGE_PIXELS;
}

export async function validateResidentDocumentFile(
  file: unknown
): Promise<DocumentValidationResult> {
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
      message: "Файл пустой. Загрузите PDF, JPG или PNG.",
    };
  }

  if (file.size > DOCUMENT_MAX_FILE_SIZE) {
    return {
      ok: false,
      code: "too_large",
      message: `Файл слишком большой. Максимум ${formatDocumentSize(
        DOCUMENT_MAX_FILE_SIZE
      )}.`,
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");

  if (file.type === "application/pdf" && hasPdfExtension(file.name)) {
    if (!hasPdfMagicBytes(bytes)) {
      return {
        ok: false,
        code: "fake_pdf",
        message:
          "Файл выглядит не как настоящий PDF. Проверьте файл и загрузите снова.",
      };
    }

    return {
      ok: true,
      bytes,
      hash,
      kind: "pdf",
      contentType: "application/pdf",
      extension: "pdf",
    };
  }

  if (file.type === "image/png" && hasPngExtension(file.name)) {
    const dimensions = getPngDimensions(bytes);

    if (!hasPngMagicBytes(bytes)) {
      return {
        ok: false,
        code: "fake_image",
        message:
          "Файл выглядит не как настоящий PNG. Проверьте изображение и загрузите снова.",
      };
    }

    if (!validateImageDimensions(dimensions)) {
      return {
        ok: false,
        code: "image_too_large",
        message: "Изображение слишком большое или повреждено.",
      };
    }

    return {
      ok: true,
      bytes,
      hash,
      kind: "png",
      contentType: "image/png",
      extension: "png",
      width: dimensions?.width,
      height: dimensions?.height,
    };
  }

  if (file.type === "image/jpeg" && hasJpegExtension(file.name)) {
    const dimensions = getJpegDimensions(bytes);

    if (!hasJpegMagicBytes(bytes)) {
      return {
        ok: false,
        code: "fake_image",
        message:
          "Файл выглядит не как настоящий JPEG. Проверьте изображение и загрузите снова.",
      };
    }

    if (!validateImageDimensions(dimensions)) {
      return {
        ok: false,
        code: "image_too_large",
        message: "Изображение слишком большое или повреждено.",
      };
    }

    return {
      ok: true,
      bytes,
      hash,
      kind: "jpeg",
      contentType: "image/jpeg",
      extension: "jpg",
      width: dimensions?.width,
      height: dimensions?.height,
    };
  }

  return {
    ok: false,
    code: "invalid_type",
    message: "Можно загрузить только PDF, JPG или PNG.",
  };
}

export async function validatePdfFile(file: unknown): Promise<PdfValidationResult> {
  const validation = await validateResidentDocumentFile(file);

  if (!validation.ok) {
    return validation;
  }

  if (validation.kind !== "pdf") {
    return {
      ok: false,
      code: "invalid_type",
      message: "Можно загрузить только PDF-файл.",
    };
  }

  return validation;
}

export function buildDocumentStoragePath(params: {
  visitorId: string;
  documentId: string;
  fileHash: string;
  extension?: string;
}) {
  const extension = params.extension?.replace(/[^a-z0-9]/gi, "") || "pdf";

  return `${params.visitorId}/${params.documentId}/${params.fileHash}.${extension}`;
}
