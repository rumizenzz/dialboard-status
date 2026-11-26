// Which subscriber emails are due, from the published status and the ledger of what already went. Pure (tests use it).
// Rules: only problems where a part is NOT WORKING (slow never emails). The first email once it has lasted 10 minutes;
// one more when it's fixed. A part going on and off: at most 2 "not working" emails per incident, each answered by one
// "fixed". A problem that lasted 10+ minutes but was fixed before we got to it: one "fixed" email that says both.
export const NOTIFY_AFTER_MS = 10 * 60000;
export const STALE_MS = 30 * 60000;
export const MAX_STARTS = 2;

function openDownFrom(inc) {
  const s = (inc.spans || []).find((x) => x.to == null && x.kind === 'down');
  return s ? s.from : null;
}

/** 'start' | 'fixed' | null */
export function dueFor(inc, sent, now) {
  if (inc.downSince == null) return null;
  const starts = (sent && sent.start) || [], fixeds = (sent && sent.fixed) || [];
  if (inc.resolved == null) {
    const from = openDownFrom(inc);
    if (from == null) return null;
    if (now - from > 24 * 3600000 && !starts.length) return null; // never a "right now" email about something old
    if (starts.length === fixeds.length && starts.length < MAX_STARTS && now - from >= NOTIFY_AFTER_MS) return 'start';
    return null;
  }
  if (starts.length > fixeds.length) return 'fixed';
  if (!starts.length && !fixeds.length && (inc.downMin || 0) >= 10 && now - inc.resolved < 6 * 3600000) return 'fixed';
  return null;
}

export function isStale(status, now) {
  return !status || !status.generated_at || now - status.generated_at > STALE_MS;
}
