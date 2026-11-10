/** Ist das ein Microsoft-Teams-Link? */
export function isTeamsLink(link: string): boolean {
  return /^https:\/\/(?:[\w-]+\.)*teams\.(?:microsoft|live)\.com\//i.test(String(link ?? '').trim());
}

/** Chat-ID (Thread) aus einem Teams-Link, z. B. 19:meeting_…@thread.v2 */
export function teamsThreadId(link: string): string | null {
  let v = String(link ?? '').trim();
  try {
    v = decodeURIComponent(v);
  } catch {
    /* schon dekodiert */
  }
  return v.match(/19:meeting_[A-Za-z0-9_-]+@thread\.v2/)?.[0] ?? null;
}

/** Adresse, die das Meeting direkt in der Teams-App öffnet (msteams:). */
export function teamsAppUrl(link: string): string | null {
  const v = String(link ?? '').trim();
  if (!isTeamsLink(v)) return null;
  return v.replace(/^https:\/\/(?:[\w-]+\.)*teams\.(?:microsoft|live)\.com/i, 'msteams:');
}
