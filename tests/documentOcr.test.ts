import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OcrExtractor,
  setVisionOcrClientFactory,
} from "../lib/documents/extraction";

const kaspiOcrText = `
Kaspi.kz
Чек об оплате
Платеж успешно
Дата оплаты: 27.07.2026 14:20
Сумма платежа: 1200.50 ₸
Комиссия: 0.00 ₸
Получатель: ТОО Астана-ЕРЦ
Лицевой счет: 123456789
ID транзакции: KSP-123456
`;

afterEach(() => {
  setVisionOcrClientFactory(null);
  vi.unstubAllEnvs();
});

describe("vision OCR extractor", () => {
  it("returns ocr_required when OpenAI key is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    setVisionOcrClientFactory(null);

    const result = await new OcrExtractor().extract({
      bytes: new Uint8Array([1, 2, 3, 4]),
      contentType: "image/jpeg",
      fileName: "scan.jpg",
    });

    expect(result.status).toBe("ocr_required");
    expect(result.warnings.join(" ")).toMatch(/OPENAI_API_KEY/i);
  });

  it("extracts text from JPEG via vision input_image", async () => {
    const responsesCreate = vi.fn().mockResolvedValue({
      output_text: kaspiOcrText,
    });
    const filesCreate = vi.fn();
    const filesDelete = vi.fn();

    setVisionOcrClientFactory(() => ({
      files: {
        create: filesCreate,
        delete: filesDelete,
      },
      responses: {
        create: responsesCreate,
      },
    }));

    const result = await new OcrExtractor().extract({
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
      contentType: "image/jpeg",
      fileName: "kaspi.jpg",
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.method).toBe("vision");
      expect(result.text).toContain("Kaspi.kz");
      expect(result.text).toContain("123456789");
    }
    expect(filesCreate).not.toHaveBeenCalled();
    expect(responsesCreate).toHaveBeenCalledOnce();
    const body = responsesCreate.mock.calls[0][0];
    expect(body.input[0].content.some((part: { type: string }) => part.type === "input_image")).toBe(
      true
    );
  });

  it("uploads PDF to OpenAI files API and deletes temporary file", async () => {
    const responsesCreate = vi.fn().mockResolvedValue({
      output_text: kaspiOcrText,
    });
    const filesCreate = vi.fn().mockResolvedValue({ id: "file_test_1" });
    const filesDelete = vi.fn().mockResolvedValue({});

    setVisionOcrClientFactory(() => ({
      files: {
        create: filesCreate,
        delete: filesDelete,
      },
      responses: {
        create: responsesCreate,
      },
    }));

    const result = await new OcrExtractor().extract({
      bytes: new TextEncoder().encode("%PDF-1.4 scan without text"),
      contentType: "application/pdf",
      fileName: "scan.pdf",
      pageCountHint: 1,
    });

    expect(result.status).toBe("ready");
    expect(filesCreate).toHaveBeenCalledOnce();
    expect(filesDelete).toHaveBeenCalledWith("file_test_1");
    const body = responsesCreate.mock.calls[0][0];
    expect(body.input[0].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "input_file", file_id: "file_test_1" }),
      ])
    );
  });

  it("fails clearly when vision returns almost no text", async () => {
    setVisionOcrClientFactory(() => ({
      files: {
        create: vi.fn(),
        delete: vi.fn(),
      },
      responses: {
        create: vi.fn().mockResolvedValue({ output_text: "??" }),
      },
    }));

    const result = await new OcrExtractor().extract({
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      contentType: "image/png",
      fileName: "blurry.png",
    });

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorMessage).toMatch(/распознать/i);
    }
  });
});
