import "dotenv/config";

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

type SupplierInput = {
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

const INPUT_FILE = process.argv[2] ?? "data/suppliers-2026-06-25.normalized.json";
const SOURCE_DATE = "2026-06-25";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toRecord(item: SupplierInput) {
  return {
    supplier_code: item.supplierCode,
    supplier_name: cleanText(item.supplierName),
    bin: cleanText(item.bin),
    contract: cleanText(item.contract),
    address: cleanText(item.address),
    district: cleanText(item.district),
    chair_phone: cleanText(item.chairPhone),
    chair_name: cleanText(item.chairName),
    supplier_category: cleanText(item.supplierCategory),
    manager_name: cleanText(item.managerName),
    manager_photo_url: cleanText(item.managerPhotoUrl ?? ""),
    manager_phone: cleanText(item.managerPhone ?? ""),
    manager_email: cleanText(item.managerEmail ?? ""),
    supplier_email: cleanText(item.supplierEmail),
    settlement_type: cleanText(item.settlementType),
    source_date: SOURCE_DATE,
    updated_at: new Date().toISOString(),
  };
}

async function run() {
  const supabase = createClient(supabaseUrl!, serviceRoleKey!);
  const raw = fs.readFileSync(INPUT_FILE, "utf8");
  const items = JSON.parse(raw) as SupplierInput[];
  const records = items.map(toRecord);
  const pageSize = 500;

  for (let index = 0; index < records.length; index += pageSize) {
    const chunk = records.slice(index, index + pageSize);
    const { error } = await supabase
      .from("suppliers")
      .upsert(chunk, { onConflict: "supplier_code" });

    if (error) {
      throw error;
    }

    console.log(`Imported ${Math.min(index + pageSize, records.length)}/${records.length}`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
