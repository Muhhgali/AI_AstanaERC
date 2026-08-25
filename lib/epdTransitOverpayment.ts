export type EpdTransitOverpaymentLanguage = "ru" | "kk";

function normalize(text: string) {
  return text.toLowerCase().replace(/ё/g, "е");
}

export function isEpdTransitOverpaymentIntent(question: string) {
  const normalized = normalize(question);
  const hasEpdContext = [
    "епд",
    "квитанц",
    "сальдо",
    "начисл",
    "к оплате",
    "төлем құжат",
    "түбіртек",
  ].some((phrase) => normalized.includes(phrase));
  const hasOverpaymentSignal = [
    "оплата больше",
    "больше чем сальдо",
    "больше сальдо",
    "оплачено больше",
    "переплат",
    "излиш",
    "артық төлем",
    "артық төл",
  ].some((phrase) => normalized.includes(phrase));
  const hasDeferredSignal = [
    "транзит",
    "следующ",
    "почему начисл",
    "начисления есть",
    "не уменьш",
    "не зач",
    "кейінгі",
    "келесі",
  ].some((phrase) => normalized.includes(phrase)) ||
    (normalized.includes("начисл") && normalized.includes("есть"));

  return hasEpdContext && hasOverpaymentSignal && hasDeferredSignal;
}

export function buildEpdTransitOverpaymentAnswer(
  language: EpdTransitOverpaymentLanguage
) {
  if (language === "kk") {
    return [
      "Егер ЕПД-де төлем сомасы алдыңғы сальдодан көп болса, айырма ықтимал артық төлем/қалдық ретінде қаралады.",
      "Мұндай ақша меншік иесінің транзиттік шотында сақталып, келесі есептік кезеңде немесе нақты жеткізушінің ережесі бойынша ескерілуі мүмкін.",
      "Сондықтан бот бұл соманы барлық ағымдағы начислениеден өздігінен шегермеуі керек. Негізгі бағдар — «Төлеуге» бағаны, келесі ЕПД және ішкі зачисление тексерісі.",
    ].join("\n");
  }

  return [
    "Если в ЕПД оплата больше предыдущего сальдо, разница считается возможной переплатой/излишком.",
    "Такие деньги могут храниться на транзитных счетах собственника и учитываться в следующем расчётном периоде или по правилам конкретного поставщика.",
    "Поэтому бот не должен автоматически вычитать эту переплату из всех текущих начислений. Главные ориентиры — колонка «К оплате», следующий ЕПД и внутренняя проверка зачисления.",
  ].join("\n");
}
