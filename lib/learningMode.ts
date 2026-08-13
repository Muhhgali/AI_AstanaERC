export type LearningGap = {
  id: string;
  topic?: string | null;
  user_question?: string | null;
  assistant_answer?: string | null;
  reason?: string | null;
  top_similarity?: number | null;
};

export function inferLearningCategory(input: string) {
  const normalized = input.toLowerCase();

  if (/оплат|kaspi|плат[её]ж|сумм|төлем|ақша/.test(normalized)) {
    return "payments";
  }

  if (/показан|счетчик|счётчик|су|есептегіш|көрсеткіш/.test(normalized)) {
    return "meters";
  }

  if (/квитанц|епд|түбіртек|дубликат/.test(normalized)) {
    return "receipts";
  }

  if (/лицев|дербес|владел|сч[её]т|шот/.test(normalized)) {
    return "accounts";
  }

  if (/начисл|перерасч[её]т|долг|қарыз|есептеу/.test(normalized)) {
    return "billing";
  }

  if (/сайт|кабинет|виджет|форма|ошибк|whatsapp|телефон|тех/.test(normalized)) {
    return "services";
  }

  return "support";
}

export function buildLearningQuestion(gap: LearningGap) {
  const userQuestion = gap.user_question?.trim();
  const topic = gap.topic?.trim();

  if (userQuestion) {
    return `Я не уверен, как правильно ответить жителю на вопрос: «${userQuestion}». Какой проверенный ответ мне нужно давать?`;
  }

  if (topic) {
    return `У меня есть непонятная тема: «${topic}». Объясните, пожалуйста, как правильно отвечать жителям по этой теме.`;
  }

  return "У меня есть пробел в базе знаний. Объясните, пожалуйста, какой ответ нужно давать жителю.";
}

export function buildLearningKnowledgeContent(params: {
  ownerExplanation: string;
  gap: LearningGap;
}) {
  const explanation = params.ownerExplanation.trim();
  const blocks = [
    explanation,
    "",
    "Контекст обучения:",
    params.gap.user_question
      ? `- Вопрос жителя: ${params.gap.user_question}`
      : null,
    params.gap.topic ? `- Тема: ${params.gap.topic}` : null,
    params.gap.reason ? `- Почему бот спросил: ${params.gap.reason}` : null,
  ];

  return blocks.filter(Boolean).join("\n");
}

export function buildLearningKnowledgeTitle(gap: LearningGap) {
  return (gap.user_question || gap.topic || "Ответ из обучения бота").trim();
}
