export type SupplierManagerCard = {
  supplierName: string;
  bin: string;
  managerName: string;
  managerRole: string;
  phone: string;
  email: string;
  photoUrl?: string;
};

type SupplierRecord = SupplierManagerCard & {
  aliases: string[];
};

const SUPPLIERS: SupplierRecord[] = [
  {
    supplierName: "ТОО Астана Су Арнасы",
    bin: "010140001111",
    aliases: ["астана су арнасы", "су арнасы", "astana su arnasy"],
    managerName: "Айгуль Сериковна Нурланова",
    managerRole: "Менеджер по работе с поставщиками",
    phone: "+7 7172 55 00 01",
    email: "supplier.water@example.kz",
  },
  {
    supplierName: "АО Астана-Энергия",
    bin: "020240002222",
    aliases: ["астана энергия", "астана-энергия", "astana energy"],
    managerName: "Руслан Ермекович Ахметов",
    managerRole: "Куратор поставщика",
    phone: "+7 7172 55 00 02",
    email: "supplier.energy@example.kz",
  },
  {
    supplierName: "ТОО Чистый Город Астана",
    bin: "030340003333",
    aliases: ["чистый город", "чистый город астана", "мусор", "вывоз отходов"],
    managerName: "Динара Болатовна Ибраева",
    managerRole: "Менеджер по договорам",
    phone: "+7 7172 55 00 03",
    email: "supplier.clean@example.kz",
  },
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[«»"']/g, "")
    .replace(/[\s.,;:()_-]+/g, " ")
    .trim();
}

function extractBins(text: string): string[] {
  return text.match(/\b\d{12}\b/g) ?? [];
}

function toManagerCard(supplier: SupplierRecord): SupplierManagerCard {
  return {
    supplierName: supplier.supplierName,
    bin: supplier.bin,
    managerName: supplier.managerName,
    managerRole: supplier.managerRole,
    phone: supplier.phone,
    email: supplier.email,
    photoUrl: supplier.photoUrl,
  };
}

function isSupplierIntent(text: string) {
  const normalized = normalize(text);

  return [
    "поставщик",
    "поставщика",
    "бин",
    "менеджер",
    "куратор",
    "договор",
    "ответственный",
  ].some((word) => normalized.includes(word));
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

  const normalized = normalize(text);

  const byName = SUPPLIERS.find((supplier) =>
      [supplier.supplierName, ...supplier.aliases].some((name) =>
        normalized.includes(normalize(name))
      )
  );

  return byName ? toManagerCard(byName) : null;
}

export function buildSupplierManagerMessage(card: SupplierManagerCard) {
  return [
    `Поставщик: ${card.supplierName}`,
    `БИН: ${card.bin}`,
    "",
    `Ответственный менеджер: ${card.managerName}`,
    `Должность: ${card.managerRole}`,
    `Телефон: ${card.phone}`,
    `Почта: ${card.email}`,
  ].join("\n");
}
