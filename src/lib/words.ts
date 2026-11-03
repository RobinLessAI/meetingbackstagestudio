import type { CloudFilters } from '../state/types.ts';
import { cleanKeepCase } from './text.ts';

/** Häufige deutsche und englische Füllwörter. */
export const STOPWORDS = new Set([
  'aber', 'alle', 'allem', 'allen', 'aller', 'alles', 'als', 'also', 'am', 'an', 'ander', 'andere',
  'anderen', 'auch', 'auf', 'aus', 'bei', 'beim', 'bin', 'bis', 'bisschen', 'bitte', 'bzw', 'da',
  'dabei', 'dafür', 'damit', 'dann', 'das', 'dass', 'dem', 'den', 'denn', 'der', 'des', 'die',
  'dies', 'diese', 'diesem', 'diesen', 'dieser', 'dir', 'doch', 'dort', 'du', 'durch', 'eher',
  'ein', 'eine', 'einem', 'einen', 'einer', 'eines', 'einfach', 'er', 'es', 'etwas', 'euch',
  'euer', 'eure', 'für', 'ganz', 'gar', 'gerade', 'gern', 'gerne', 'gibt', 'grad', 'gut', 'hab',
  'habe', 'haben', 'hallo', 'hat', 'hatte', 'heute', 'hier', 'hin', 'ich', 'ihr', 'ihre', 'im',
  'immer', 'in', 'ins', 'ist', 'ja', 'jetzt', 'kann', 'kein', 'keine', 'man', 'mal', 'mehr',
  'mein', 'meine', 'mich', 'mir', 'mit', 'moin', 'muss', 'nach', 'nein', 'nicht', 'nichts', 'noch',
  'nur', 'ob', 'oder', 'ohne', 'schon', 'sehr', 'sein', 'sich', 'sie', 'sind', 'so', 'sowie',
  'über', 'um', 'und', 'uns', 'unser', 'unsere', 'viel', 'viele', 'vom', 'von', 'vor', 'war',
  'waren', 'was', 'weil', 'wenn', 'wer', 'wie', 'wieder', 'wir', 'wird', 'wo', 'würde', 'zu',
  'zum', 'zur', 'grüße', 'gruß', 'danke', 'okay', 'ok', 'the', 'and', 'a', 'an', 'of', 'to', 'is',
  'it', 'for', 'in', 'on', 'with', 'this', 'that',
]);

/**
 * Kleine Beispielliste für unangemessene Begriffe. In einer echten Anwendung
 * sollte diese Liste von der Organisation gepflegt werden.
 */
export const BLOCKLIST = new Set([
  'arsch', 'arschloch', 'blöd', 'blödsinn', 'depp', 'doof', 'idiot', 'idioten', 'kacke', 'mist',
  'scheiß', 'scheiße', 'scheisse', 'verdammt', 'verdammte', 'wtf', 'shit', 'fuck', 'damn',
]);

export type ExclusionReason = 'fuellwort' | 'kurz' | 'unangemessen' | 'ausgeblendet' | 'selten';

export interface CloudTerm {
  key: string;
  display: string;
  count: number;
  senders: string[];
  excluded: ExclusionReason | null;
}

export interface CloudInput {
  text: string;
  sender: string;
}

/** Zerlegt einen Beitrag in Begriffe. Jeder Begriff zählt pro Nachricht einmal. */
export function tokenize(text: string): { key: string; display: string }[] {
  const seen = new Set<string>();
  const out: { key: string; display: string }[] = [];
  for (const raw of cleanKeepCase(text).split(' ')) {
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, display: raw });
  }
  return out;
}

export function buildCloud(
  inputs: CloudInput[],
  filters: CloudFilters,
  hidden: string[],
): CloudTerm[] {
  const map = new Map<string, { count: number; senders: Set<string>; forms: Map<string, number> }>();
  for (const input of inputs) {
    for (const t of tokenize(input.text)) {
      const entry = map.get(t.key) ?? { count: 0, senders: new Set(), forms: new Map() };
      entry.count += 1;
      entry.senders.add(input.sender);
      entry.forms.set(t.display, (entry.forms.get(t.display) ?? 0) + 1);
      map.set(t.key, entry);
    }
  }
  const hiddenSet = new Set(hidden);
  const terms: CloudTerm[] = [];
  for (const [key, e] of map) {
    // Häufigste Schreibweise anzeigen; bei Gleichstand die großgeschriebene.
    const display = [...e.forms.entries()].sort(
      (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
    )[0][0];
    let excluded: ExclusionReason | null = null;
    if (filters.profanity && BLOCKLIST.has(key)) excluded = 'unangemessen';
    else if (hiddenSet.has(key)) excluded = 'ausgeblendet';
    else if (filters.stopwords && STOPWORDS.has(key)) excluded = 'fuellwort';
    else if (filters.shortWords && (key.length < 3 || /^\d+$/.test(key))) excluded = 'kurz';
    else if (e.count < filters.minCount) excluded = 'selten';
    terms.push({ key, display, count: e.count, senders: [...e.senders], excluded });
  }
  return terms.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'de'));
}

export const EXCLUSION_LABEL: Record<ExclusionReason, string> = {
  fuellwort: 'Füllwort',
  kurz: 'Kurzwort',
  unangemessen: 'Unangemessen',
  ausgeblendet: 'Manuell ausgeblendet',
  selten: 'Zu selten',
};
