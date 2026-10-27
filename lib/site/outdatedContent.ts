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
