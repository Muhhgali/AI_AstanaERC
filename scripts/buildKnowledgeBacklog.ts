import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type GapCandidate = {
  topic: string;
  category: string;
  frequency: number;
  exampleQueries: string[];
  reasons: Record<string, number>;
  informationRequiredFromOwner: string;
};

type AnswerEvalPayload = {
  results: Array<{
    category: string;
    pass: boolean;
    failureType: string | null;
  }>;
};

const args = process.argv.slice(2);
const gapsPath = getArg("--gaps", "data/knowledge-gap-candidates.json");
const answerEvalPath = getArg("--answer-eval", ".tmp/answer-eval-real-world.json");
const backlogPath = getArg("--out", "data/knowledge-backlog.json");
const ownerPackPath = getArg("--owner-pack", "data/owner-question-pack.md");

function getArg(name: string, fallback: string) {
  const index = args.indexOf(name);

  return index === -1 ? fallback : args[index + 1] ?? fallback;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as T;
}

function ensureParent(path: string) {
  mkdirSync(dirname(resolve(process.cwd(), path)), { recursive: true });
}

function impactFor(category: string) {
  if (["payments", "debt", "receipts", "contacts"].includes(category)) return 3;
  if (["suppliers", "ownership", "accounts", "technical"].includes(category)) return 2;

  return 1;
}

function priorityFor(score: number) {
  if (score >= 70) return "P0";
  if (score >= 25) return "P1";

  return "P2";
}

function ownerQuestions(topic: string, category: string) {
  if (["payments", "debt"].includes(category)) {
    return [
      "Что именно должен делать житель, если платёж списался с карты, но не отразился в ЕПД?",
      "Через сколько времени после оплаты сумма обычно отображается в ЕПД/системе?",
      "Какие данные можно безопасно просить у жителя для проверки платежа: дата, способ оплаты, чек, строка квитанции?",
      "Что делать при ошибочной оплате или оплате не на тот лицевой счёт?",
      "Как объяснять ситуацию, когда долг остался после оплаты, не предполагая оплату после 25 числа?",
    ];
  }

  if (category === "receipts") {
    return [
      "Когда считается сформированной электронная квитанция и где её смотреть?",
      "Что делать, если бумажная квитанция не доставлена?",
      "Как подключить или изменить доставку квитанции на email?",
      "Как получить дубликат квитанции?",
      "Что должен ответить бот, если житель спрашивает «квитанция вышла?» без лицевого счёта?",
    ];
  }

  if (category === "suppliers") {
    return [
      "Какие данные о поставщиках бот имеет право показывать: услуга, БИН, контакты, менеджер?",
      "Как жителю найти менеджера конкретного поставщика?",
      "Что отвечать, если пользователь написал только название ТОО/ИП без вопроса?",
      "Есть ли официальный источник/таблица соответствия поставщик → услуга → контакт?",
    ];
  }

  if (["contacts", "technical"].includes(category)) {
    return [
      "Какие актуальные телефоны, адреса и график работы можно показывать пользователю?",
      "Что отвечать пользователю из другой области, если он не может дозвониться на 109?",
      "Какие каналы поддержки доступны при ошибке сайта или формы?",
    ];
  }

  if (["accounts", "ownership"].includes(category)) {
    return [
      "Какой официальный процесс для смены владельца лицевого счёта после покупки квартиры?",
      "Как житель может узнать номер лицевого счёта без раскрытия персональных данных в чате?",
      "Какие документы/данные нужны для изменения данных по квартире?",
    ];
  }

  if (category === "meters") {
    return [
      "Куда передавать показания по каждому типу счётчика?",
      "Как исправить уже отправленные показания?",
      "Что делать, если сервис передачи показаний не работает?",
    ];
  }

  return [
    `Какой проверенный официальный ответ должен давать бот по теме «${topic}»?`,
  ];
}

function main() {
  const gaps = readJson<GapCandidate[]>(gapsPath);
  const answerEval = readJson<AnswerEvalPayload>(answerEvalPath);
  const failuresByCategory = answerEval.results.reduce<Record<string, number>>(
    (acc, item) => {
      if (!item.pass) acc[item.category] = (acc[item.category] ?? 0) + 1;
      return acc;
    },
    {}
  );
  const backlog = gaps.slice(0, 20).map((gap) => {
    const failureCount = failuresByCategory[gap.category] ?? 0;
    const impact = impactFor(gap.category);
    const score = gap.frequency * impact + failureCount * 3;

    return {
      priority: priorityFor(score),
      topic: gap.topic,
      category: gap.category,
      frequency: gap.frequency,
      currentFailureCount: failureCount,
      impact,
      score,
      currentBotBehavior:
        failureCount > 0
          ? "Часто уточняет или уходит в неполный/неуверенный ответ."
          : "Есть gap candidate; требуется бизнес-проверка перед расширением KB.",
      requiredBusinessKnowledge: gap.informationRequiredFromOwner,
      exampleQueries: gap.exampleQueries.slice(0, 3),
      ownerQuestions: ownerQuestions(gap.topic, gap.category).slice(0, 5),
    };
  }).sort((a, b) => b.score - a.score);
  const selectedQuestions = backlog
    .filter((item) => ["P0", "P1"].includes(item.priority))
    .flatMap((item) =>
      item.ownerQuestions.map((question) => ({
        priority: item.priority,
        topic: item.topic,
        question,
      }))
    )
    .slice(0, 28);
  const ownerPack = [
    "# OWNER QUESTION PACK — Stage 2.2",
    "",
    "Ответы на эти вопросы нужны, чтобы закрыть реальные knowledge gaps без догадок.",
    "",
    ...selectedQuestions.flatMap((item, index) => [
      `## ${index + 1}. ${item.priority} — ${item.topic}`,
      "",
      item.question,
      "",
    ]),
  ].join("\n");

  ensureParent(backlogPath);
  writeFileSync(
    resolve(process.cwd(), backlogPath),
    `${JSON.stringify(backlog, null, 2)}\n`,
    "utf8"
  );
  ensureParent(ownerPackPath);
  writeFileSync(resolve(process.cwd(), ownerPackPath), ownerPack, "utf8");

  console.log(
    JSON.stringify(
      {
        backlogPath,
        ownerPackPath,
        backlogItems: backlog.length,
        ownerQuestions: selectedQuestions.length,
        p0: backlog.filter((item) => item.priority === "P0").length,
        p1: backlog.filter((item) => item.priority === "P1").length,
      },
      null,
      2
    )
  );
}

main();
