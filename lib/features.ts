// Temporarily pause resident submissions; retain existing requests for staff.
export const METER_CORRECTION_ENABLED: boolean = false;

export function meterCorrectionUnavailableMessage(language: "ru" | "kk") {
  return language === "kk"
    ? "Бот арқылы есептегіш көрсеткіштерін түзету уақытша қолжетімсіз. Басқа сұрағыңызды жазыңыз — көмектесемін."
    : "Корректировка показаний через бот временно недоступна. Напишите другой вопрос — помогу разобраться.";
}
