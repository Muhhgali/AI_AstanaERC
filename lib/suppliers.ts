import suppliers from "@/data/suppliers-2026-06-25.normalized.json";

type SupplierRecord = {
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

type ChatLanguage = "ru" | "kk";

export type SupplierManagerCard = {
  supplierName: string;
  bin: string;
  managerName: string;
  managerRole: string;
  phone: string;
  email: string;
  managerPhone: string;
  managerEmail: string;
  supplierPhone: string;
  supplierEmail: string;
  supplierCode: number;
  category: string;
  district: string;
  contactName: string;
  contract: string;
  photoUrl?: string;
};

const SUPPLIERS = suppliers as SupplierRecord[];

const ORG_TYPE_TOKENS = new Set([
  "тоо",
  "ао",
  "ип",
  "оси",
  "кск",
  "пк",
  "гкп",
  "ксп",
  "жк",
]);

const SEARCH_STOP_WORDS = new Set([
  "найти",
  "найди",
  "покажи",
  "подскажи",
  "кто",
  "какой",
  "какая",
  "менеджер",
  "менеджера",
  "куратор",
  "ответственный",
  "поставщик",
  "поставщика",
  "организация",
  "организации",
  "компания",
  "компании",
  "бин",
  "бсн",
  "бину",
  "код",
  "коду",
  "договор",
  "по",
  "у",
  "для",
  "из",
  "и",
  "или",
  "менеджерін",
  "жеткізуші",
  "жабдықтаушы",
  "коды",
  "кім",
]);

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[«»"']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function getRawTokens(value: string) {
  return normalize(value).split(" ").filter(Boolean);
}

function getSearchTokens(value: string) {
  return getRawTokens(value).filter(
    (token) => token.length >= 2 && !SEARCH_STOP_WORDS.has(token)
  );
}

function extractBins(text: string): string[] {
  const compact = text.replace(/\D/g, "");
  const direct = text.match(/\b\d{12}\b/g) ?? [];
  const compactBins =
    compact.length >= 12 ? (compact.match(/\d{12}/g) ?? []) : [];

  return Array.from(new Set([...direct, ...compactBins]));
}

function hasSupplierCodeIntent(text: string) {
  const normalized = normalize(text);

  return [
    "код",
    "коду",
    "кодом",
    "supplier code",
    "код поставщика",
    "поставщик код",
    "коды",
  ].some((word) => normalized.includes(word));
}

function extractSupplierCodes(text: string): number[] {
  if (!hasSupplierCodeIntent(text)) {
    return [];
  }

  return Array.from(
    new Set(
      (text.match(/\b\d{1,5}\b/g) ?? [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  );
}

function toManagerCard(supplier: SupplierRecord): SupplierManagerCard {
  return {
    supplierName: supplier.supplierName,
    bin: supplier.bin,
    managerName: supplier.managerName || "Не назначен",
    managerRole: "Пользователь Астана-ЕРЦ",
    phone: supplier.managerPhone ?? "",
    email: supplier.managerEmail ?? "",
    managerPhone: supplier.managerPhone ?? "",
    managerEmail: supplier.managerEmail ?? "",
    supplierPhone: supplier.chairPhone,
    supplierEmail: supplier.supplierEmail,
    supplierCode: supplier.supplierCode,
    category: supplier.supplierCategory,
    district: supplier.district,
    contactName: supplier.chairName,
    contract: supplier.contract,
    photoUrl: supplier.managerPhotoUrl,
  };
}

function isSupplierIntent(text: string) {
  const normalized = normalize(text);

  return [
    "поставщик",
    "поставщика",
    "бин",
    "бсн",
    "менеджер",
    "менеджера",
    "куратор",
    "договор",
    "ответственный",
    "кск",
    "оси",
    "жк",
    "пик",
    "жабдықтаушы",
    "жеткізуші",
    "менеджері",
    "шарт",
    "жауапты",
    "мүлік иелері",
  ].some((word) => normalized.includes(word));
}

function findBySupplierCode(text: string) {
  const codes = extractSupplierCodes(text);

  if (codes.length === 0) {
    return null;
  }

  return (
    SUPPLIERS.find((supplier) => codes.includes(supplier.supplierCode)) ?? null
  );
}

function filterCandidatesByRequestedOrgType(text: string) {
  const requestedTypes = getRawTokens(text).filter((token) =>
    ORG_TYPE_TOKENS.has(token)
  );

  if (requestedTypes.length === 0) {
    return SUPPLIERS;
  }

  const candidates = SUPPLIERS.filter((supplier) => {
    const nameTokens = getRawTokens(supplier.supplierName);

    return requestedTypes.some((type) => nameTokens.includes(type));
  });

  return candidates.length > 0 ? candidates : SUPPLIERS;
}

function findByName(text: string) {
  const normalized = normalize(text);
  const queryTokens = getSearchTokens(text);

  if (queryTokens.length === 0) {
    return null;
  }

  const rawQueryTokens = getRawTokens(text);
  const candidates = filterCandidatesByRequestedOrgType(text);
  let best: { supplier: SupplierRecord; score: number } | null = null;

  for (const supplier of candidates) {
    const name = normalize(supplier.supplierName);
    const rawNameTokens = getRawTokens(supplier.supplierName);
    const nameTokens = getSearchTokens(supplier.supplierName);
    const nameText = nameTokens.join(" ");
    const compactName = nameText.replace(/\s+/g, "");
    const compactQuery = queryTokens.join("").replace(/\s+/g, "");
    const directNameHit =
      name.length > 3 &&
      (normalized.includes(name) || name.includes(normalized));
    const matchedTokens = queryTokens.filter((token) =>
      nameTokens.some(
        (nameToken) =>
          nameToken === token ||
          (token.length >= 4 && nameToken.includes(token)) ||
          (nameToken.length >= 4 && token.includes(nameToken))
      )
    );
    const matchingOrgTypes = rawQueryTokens.filter(
      (token) => ORG_TYPE_TOKENS.has(token) && rawNameTokens.includes(token)
    ).length;
    const mismatchedOrgTypePenalty =
      rawQueryTokens.includes("оси") && rawNameTokens.includes("тоо") ? 35 : 0;
    const coverage = matchedTokens.length / Math.max(queryTokens.length, 1);
    const score =
      (directNameHit ? 100 : 0) +
      coverage * 60 +
      (nameText.includes(queryTokens.join(" ")) ? 25 : 0) +
      (compactQuery.length >= 4 && compactName.includes(compactQuery)
        ? 35
        : 0) +
      matchingOrgTypes * 35 -
      mismatchedOrgTypePenalty +
      matchedTokens.filter((token) => token.length >= 5).length * 5;

    if (score > (best?.score ?? 0)) {
      best = { supplier, score };
    }
  }

  return best && best.score >= 45 ? best.supplier : null;
}

export function findSupplierManager(text: string) {
  const bins = extractBins(text);

  if (bins.length > 0) {
    const byBin = SUPPLIERS.find((supplier) => bins.includes(supplier.bin));

    if (byBin) {
      return toManagerCard(byBin);
    }
  }

  if (!isSupplierIntent(text)) {
    return null;
  }

  const byCode = findBySupplierCode(text);

  if (byCode) {
    return toManagerCard(byCode);
  }

  const byName = findByName(text);

  return byName ? toManagerCard(byName) : null;
}

export function buildSupplierManagerMessage(
  card: SupplierManagerCard,
  language: ChatLanguage = "ru"
) {
  if (language === "kk") {
    return [
      `Астана-ЕРЦ менеджері: ${card.managerName}`,
      `Менеджер телефоны: ${card.managerPhone || "көрсетілмеген"}`,
      `Менеджер поштасы: ${card.managerEmail || "көрсетілмеген"}`,
      "",
      `Жабдықтаушы: ${card.supplierName}`,
      `Код: ${card.supplierCode}`,
      `БСН: ${card.bin || "көрсетілмеген"}`,
      card.contract ? `Шарт: ${card.contract}` : "",
      card.category ? `Санат: ${card.category}` : "",
      card.district ? `Аудан: ${card.district}` : "",
      "",
      card.contactName ? `Жабдықтаушы байланысы: ${card.contactName}` : "",
      card.supplierPhone ? `Жабдықтаушы телефоны: ${card.supplierPhone}` : "",
      card.supplierEmail ? `Жабдықтаушы поштасы: ${card.supplierEmail}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `Менеджер Астана-ЕРЦ: ${card.managerName}`,
    `Телефон менеджера: ${card.managerPhone || "не указан"}`,
    `Почта менеджера: ${card.managerEmail || "не указана"}`,
    "",
    `Поставщик: ${card.supplierName}`,
    `Код поставщика: ${card.supplierCode}`,
    `БИН: ${card.bin || "не указан"}`,
    card.contract ? `Договор: ${card.contract}` : "",
    card.category ? `Категория: ${card.category}` : "",
    card.district ? `Район: ${card.district}` : "",
    "",
    card.contactName ? `Контакт поставщика: ${card.contactName}` : "",
    card.supplierPhone ? `Телефон поставщика: ${card.supplierPhone}` : "",
    card.supplierEmail ? `Почта поставщика: ${card.supplierEmail}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
