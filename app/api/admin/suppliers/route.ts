/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseProjectUrl } from "@/lib/supabaseEnv";

type SupplierItem = {
  supplierCode: number;
  supplierName: string;
  bin: string;
  contract: string;
  address: string;
  district: string;
  chairPhone: string;
  chairName: string;
  supplierCategory: string;
  managerName: string;
  managerPhotoUrl?: string;
  managerPhone?: string;
  managerEmail?: string;
  supplierEmail: string;
  settlementType: string;
};

type SupplierPayload = Partial<SupplierItem> & {
  originalSupplierCode?: number;
  mode?: "supplier" | "manager";
  originalManagerName?: string;
};

const SUPPLIERS_FILE = path.join(
  process.cwd(),
  "data",
  "suppliers-2026-06-25.normalized.json"
);
const MANAGERS_FILE = path.join(
  process.cwd(),
  "data",
  "suppliers.by-manager.json"
);
const SOURCE_DATE = "2026-06-25";

let authClient: ReturnType<typeof createClient<any>> | null = null;
let adminClient: ReturnType<typeof createClient<any>> | null = null;

function getAuthClient() {
  const supabaseUrl = getSupabaseProjectUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  authClient ??= createClient<any>(supabaseUrl, supabaseAnonKey);

  return authClient;
}

function getAdminClient() {
  const supabaseUrl = getSupabaseProjectUrl();

  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  adminClient ??= createClient<any>(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  return adminClient;
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await getAuthClient().auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function isMissingTable(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST205" ||
    error.code === "42703" ||
    Boolean(error.message?.includes("suppliers")) ||
    Boolean(error.message?.includes("manager_photo_url")) ||
    Boolean(error.message?.includes("manager_phone")) ||
    Boolean(error.message?.includes("manager_email"))
  );
}

function readLocalSuppliers() {
  return JSON.parse(fs.readFileSync(SUPPLIERS_FILE, "utf8")) as SupplierItem[];
}

function groupByManager(suppliers: SupplierItem[]) {
  return [
    ...suppliers.reduce<Map<string, SupplierItem[]>>((acc, supplier) => {
      const managerName = supplier.managerName || "Не назначен";

      if (!acc.has(managerName)) {
        acc.set(managerName, []);
      }

      acc.get(managerName)!.push(supplier);
      return acc;
    }, new Map()),
  ]
    .map(([managerName, items]) => {
      const photoUrl =
        items.find((supplier) => supplier.managerPhotoUrl)?.managerPhotoUrl ??
        "";
      const managerPhone =
        items.find((supplier) => supplier.managerPhone)?.managerPhone ?? "";
      const managerEmail =
        items.find((supplier) => supplier.managerEmail)?.managerEmail ?? "";

      return {
        managerName,
        managerPhotoUrl: photoUrl,
        managerPhone,
        managerEmail,
        supplierCount: items.length,
        categories: [
        ...items.reduce<Map<string, number>>((acc, supplier) => {
          const category = supplier.supplierCategory || "Без категории";
          acc.set(category, (acc.get(category) ?? 0) + 1);
          return acc;
        }, new Map()),
        ]
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count),
        suppliers: items.sort((a, b) =>
          a.supplierName.localeCompare(b.supplierName, "ru")
        ),
      };
    })
    .sort(
      (a, b) =>
        b.supplierCount - a.supplierCount ||
        a.managerName.localeCompare(b.managerName, "ru")
    );
}

function writeLocalSuppliers(suppliers: SupplierItem[]) {
  const sorted = suppliers.sort((a, b) => a.supplierCode - b.supplierCode);
  fs.writeFileSync(SUPPLIERS_FILE, JSON.stringify(sorted, null, 2), "utf8");
  fs.writeFileSync(
    MANAGERS_FILE,
    JSON.stringify(groupByManager(sorted), null, 2),
    "utf8"
  );
}

function validateSupplier(payload: SupplierPayload): SupplierItem {
  const supplierCode = Number(payload.supplierCode);
  const supplierName = cleanText(payload.supplierName);

  if (!Number.isInteger(supplierCode) || supplierCode <= 0) {
    throw new Error("Код поставщика должен быть положительным числом");
  }

  if (!supplierName) {
    throw new Error("Название организации обязательно");
  }

  return {
    supplierCode,
    supplierName,
    bin: cleanText(payload.bin),
    contract: cleanText(payload.contract),
    address: cleanText(payload.address),
    district: cleanText(payload.district),
    chairPhone: cleanText(payload.chairPhone),
    chairName: cleanText(payload.chairName),
    supplierCategory: cleanText(payload.supplierCategory),
    managerName: cleanText(payload.managerName),
    managerPhotoUrl: cleanText(payload.managerPhotoUrl),
    managerPhone: cleanText(payload.managerPhone),
    managerEmail: cleanText(payload.managerEmail),
    supplierEmail: cleanText(payload.supplierEmail),
    settlementType: cleanText(payload.settlementType),
  };
}

function toDbRecord(supplier: SupplierItem) {
  return {
    supplier_code: supplier.supplierCode,
    supplier_name: supplier.supplierName,
    bin: supplier.bin,
    contract: supplier.contract,
    address: supplier.address,
    district: supplier.district,
    chair_phone: supplier.chairPhone,
    chair_name: supplier.chairName,
    supplier_category: supplier.supplierCategory,
    manager_name: supplier.managerName,
    manager_photo_url: supplier.managerPhotoUrl ?? "",
    manager_phone: supplier.managerPhone ?? "",
    manager_email: supplier.managerEmail ?? "",
    supplier_email: supplier.supplierEmail,
    settlement_type: supplier.settlementType,
    source_date: SOURCE_DATE,
    updated_at: new Date().toISOString(),
  };
}

function fromDbRecord(row: any): SupplierItem {
  return {
    supplierCode: Number(row.supplier_code) || 0,
    supplierName: cleanText(row.supplier_name),
    bin: cleanText(row.bin),
    contract: cleanText(row.contract),
    address: cleanText(row.address),
    district: cleanText(row.district),
    chairPhone: cleanText(row.chair_phone),
    chairName: cleanText(row.chair_name),
    supplierCategory: cleanText(row.supplier_category),
    managerName: cleanText(row.manager_name),
    managerPhotoUrl: cleanText(row.manager_photo_url),
    managerPhone: cleanText(row.manager_phone),
    managerEmail: cleanText(row.manager_email),
    supplierEmail: cleanText(row.supplier_email),
    settlementType: cleanText(row.settlement_type),
  };
}

async function loadSuppliers() {
  const admin = getAdminClient();

  if (admin) {
    const { data, error } = await admin
      .from("suppliers")
      .select(
        "supplier_code,supplier_name,bin,contract,address,district,chair_phone,chair_name,supplier_category,manager_name,manager_photo_url,manager_phone,manager_email,supplier_email,settlement_type"
      )
      .order("supplier_code", { ascending: true });

    if (!error) {
      return { suppliers: (data ?? []).map(fromDbRecord), storage: "supabase" };
    }

    if (!isMissingTable(error)) {
      throw error;
    }
  }

  return { suppliers: readLocalSuppliers(), storage: "local-json" };
}

export async function GET(req: Request) {
  const user = await requireUser(req);

  if (!user) {
    return Response.json(
      { message: "Сессия администратора не прошла проверку." },
      { status: 401 }
    );
  }

  try {
    const { suppliers, storage } = await loadSuppliers();

    return Response.json({
      suppliers,
      managers: groupByManager(suppliers),
      sourceDate: SOURCE_DATE,
      storage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return Response.json({ message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const user = await requireUser(req);

  if (!user) {
    return Response.json(
      { message: "Сессия администратора не прошла проверку." },
      { status: 401 }
    );
  }

  try {
    const payload = (await req.json()) as SupplierPayload;
    const mode = payload.mode ?? "supplier";

    if (mode === "manager") {
      const originalManagerName = cleanText(payload.originalManagerName);
      const managerName = cleanText(payload.managerName);
      const managerPhotoUrl = cleanText(payload.managerPhotoUrl);
      const managerPhone = cleanText(payload.managerPhone);
      const managerEmail = cleanText(payload.managerEmail);

      if (!originalManagerName) {
        throw new Error("Исходный менеджер обязателен");
      }

      if (!managerName) {
        throw new Error("Имя менеджера обязательно");
      }

      const admin = getAdminClient();

      if (admin) {
        const { error } = await admin
          .from("suppliers")
          .update({
            manager_name: managerName,
            manager_photo_url: managerPhotoUrl,
            manager_phone: managerPhone,
            manager_email: managerEmail,
            updated_at: new Date().toISOString(),
          })
          .eq(
            "manager_name",
            originalManagerName === "Не назначен" ? "" : originalManagerName
          );

        if (!error) {
          return Response.json({ ok: true, storage: "supabase" });
        }

        if (!isMissingTable(error)) {
          return Response.json({ message: error.message }, { status: 500 });
        }
      }

      const suppliers = readLocalSuppliers();
      const oldName = originalManagerName === "Не назначен" ? "" : originalManagerName;
      const changed = suppliers.map((supplier) =>
        (supplier.managerName || "") === oldName
          ? {
              ...supplier,
              managerName,
              managerPhotoUrl,
              managerPhone,
              managerEmail,
            }
          : supplier
      );

      writeLocalSuppliers(changed);

      return Response.json({ ok: true, storage: "local-json" });
    }

    const originalSupplierCode = Number(payload.originalSupplierCode);
    const supplier = validateSupplier(payload);

    if (!Number.isInteger(originalSupplierCode) || originalSupplierCode <= 0) {
      throw new Error("Исходный код поставщика обязателен");
    }

    const admin = getAdminClient();

    if (admin) {
      const { data, error } = await admin
        .from("suppliers")
        .update(toDbRecord(supplier))
        .eq("supplier_code", originalSupplierCode)
        .select(
          "supplier_code,supplier_name,bin,contract,address,district,chair_phone,chair_name,supplier_category,manager_name,manager_photo_url,manager_phone,manager_email,supplier_email,settlement_type"
        )
        .single();

      if (!error) {
        return Response.json({
          item: fromDbRecord(data),
          storage: "supabase",
        });
      }

      if (!isMissingTable(error)) {
        return Response.json({ message: error.message }, { status: 500 });
      }
    }

    const suppliers = readLocalSuppliers();
    const index = suppliers.findIndex(
      (item) => item.supplierCode === originalSupplierCode
    );

    if (index < 0) {
      return Response.json(
        { message: "Поставщик не найден" },
        { status: 404 }
      );
    }

    const duplicate = suppliers.find(
      (item) =>
        item.supplierCode === supplier.supplierCode &&
        item.supplierCode !== originalSupplierCode
    );

    if (duplicate) {
      throw new Error("Поставщик с таким кодом уже существует");
    }

    suppliers[index] = supplier;
    writeLocalSuppliers(suppliers);

    return Response.json({
      item: supplier,
      storage: "local-json",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return Response.json({ message }, { status: 400 });
  }
}
