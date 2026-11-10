import type { ZoomMeeting } from '../sync/SyncProvider.tsx';

export interface MeetingFilter {
  art: 'alle' | 'wiederkehrend' | 'einmalig';
  /** Zeitraum für Meetings mit Termin; wiederkehrende ohne feste Zeit und der persönliche Raum gelten immer. */
  zeitraum: 'heute' | 'woche' | 'monat' | 'ab-heute' | 'alle';
  sortierung: 'datum-auf' | 'datum-ab' | 'name';
  suche: string;
}

const DAY = 24 * 3600_000;

/** Filtert und sortiert die Meetings aus dem Zoom-Konto. */
export function filterMeetings(list: ZoomMeeting[], f: MeetingFilter, now: number = Date.now()): ZoomMeeting[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const from = startOfToday.getTime();
  const until =
    f.zeitraum === 'heute' ? from + DAY : f.zeitraum === 'woche' ? from + 7 * DAY : f.zeitraum === 'monat' ? from + 30 * DAY : Infinity;
  const q = f.suche.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');

  const result = list.filter((m) => {
    if (f.art === 'wiederkehrend' && !m.recurring) return false;
    if (f.art === 'einmalig' && m.recurring) return false;
    if (q && !m.topic.toLowerCase().includes(q) && !(digits.length >= 3 && m.id.includes(digits))) return false;
    const t = m.start ? Date.parse(m.start) : NaN;
    // Ohne Termin (wiederkehrend ohne feste Zeit, persönlicher Raum): nur bei „Ab heute“ und „Auch vergangene“
    if (Number.isNaN(t)) return f.zeitraum === 'ab-heute' || f.zeitraum === 'alle';
    if (f.zeitraum === 'alle') return true;
    return t >= from && t < until;
  });

  const time = (m: ZoomMeeting) => (m.start ? Date.parse(m.start) : NaN);
  return result.sort((a, b) => {
    if (f.sortierung === 'name') return a.topic.localeCompare(b.topic, 'de');
    const ta = time(a);
    const tb = time(b);
    // Meetings ohne Termin ans Ende
    if (Number.isNaN(ta) && Number.isNaN(tb)) return a.topic.localeCompare(b.topic, 'de');
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return f.sortierung === 'datum-auf' ? ta - tb : tb - ta;
  });
}
