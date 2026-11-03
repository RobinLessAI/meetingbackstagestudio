// Gemeinsame Textnormalisierung für Ortserkennung, Abstimmung und Wortwolke.

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;
const NON_WORD = /[^\p{L}\p{N}\s-]/gu;

/** Kleinbuchstaben, ohne Emoji und Satzzeichen, Leerraum zusammengefasst. Bindestriche bleiben. */
export function normalize(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(EMOJI, ' ')
    .replace(NON_WORD, ' ')
    .replace(/\s-+|-+\s|^-+|-+$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Wie normalize, aber mit Originalschreibweise (für die Anzeige in der Wortwolke). */
export function cleanKeepCase(text: string): string {
  return text
    .normalize('NFC')
    .replace(EMOJI, ' ')
    .replace(NON_WORD, ' ')
    .replace(/\s-+|-+\s|^-+|-+$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);

/**
 * Sucht `needle` als ganzes Wort bzw. ganze Wortfolge in `haystack`.
 * Bindestriche zählen als Wortgrenze, damit „Wien-Floridsdorf“ Wien findet.
 */
export function findWord(haystack: string, needle: string, from = 0): number {
  let idx = haystack.indexOf(needle, from);
  while (idx !== -1) {
    const before = haystack[idx - 1];
    const after = haystack[idx + needle.length];
    if (!isWordChar(before) && !isWordChar(after)) return idx;
    idx = haystack.indexOf(needle, idx + 1);
  }
  return -1;
}

export function wordCount(text: string): number {
  const n = normalize(text);
  return n ? n.split(' ').length : 0;
}
