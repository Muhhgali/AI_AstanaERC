// Parts of aerc.kz that the company has confirmed are out of date. They are
// kept out of the knowledge base and the site navigator until the site is
// updated.
//
// Meter readings: Astana-ERC integrated with the suppliers and now accepts
// readings for every service through its own online form
// (/abonentam/readings/). The site still lists each supplier's call centre.

const OUTDATED_PATHS = [/\/guide\/peredacha-pokazaniy-?\//];

const OUTDATED_FAQ_QUESTIONS = [
  /номера для передачи показаний/i,
  /көрсеткіштерді беру(ге)? арналған/i,
  /көрсеткіш.*(нөмір|байланыс)/i,
];

export function isOutdatedSitePage(path: string) {
  return OUTDATED_PATHS.some((pattern) => pattern.test(path));
}

export function isOutdatedSiteFaq(question: string) {
  return OUTDATED_FAQ_QUESTIONS.some((pattern) => pattern.test(question));
}

// Knowledge rows written before the integration that still send readings to
// supplier channels (Telegram bot, etolem.kz, call centres, SMS, app).
const READINGS_TOPIC = /показан|көрсеткіш/i;
const OLD_READINGS_CHANNELS =
  /astrekbot|etolem|telegram|телеграм|call-?центр|колл-?центр|горяч\S* лини|мобильн\S* приложени|sms|смс/i;
const SUBMISSION_WORDS = /переда|принима|прием|приём|беру|қабылда/i;

export function isOutdatedReadingsKnowledge(row: { title?: string | null; content?: string | null }) {
  const title = row.title ?? "";
  const content = row.content ?? "";
  const text = `${title}\n${content}`;

  return (
    READINGS_TOPIC.test(text) &&
    SUBMISSION_WORDS.test(text) &&
    OLD_READINGS_CHANNELS.test(content) &&
    !/aerc\.kz\/(ru|kk)\/abonentam\/readings/i.test(content)
  );
}
