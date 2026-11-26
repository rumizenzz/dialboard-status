// Every 5 minutes, on Netlify (not GitHub, so it keeps watching even when the checker stops):
//   1. reads the published status (the same JSON the page reads)
//   2. the watchdog: no new results for 30 minutes → one email to the founder (ALERT_TO), and one when they're back
//   3. emails subscribers what's due (lib/due.mjs: 10 minutes, then fixed), recording each one so it never goes twice
//   4. tidies up: unconfirmed sign-ups after 7 days, the email ledger after 100 days
// Needs no secret from GitHub: everything it reads is public.
import { store } from './lib/store.mjs';
import { unsubToken } from './lib/tokens.mjs';
import { render, message, sendBatch, SITE, UNSUB_SLOT } from './lib/mail.mjs';
import { dueFor, isStale } from './lib/due.mjs';
import { W, fill, incidentLines, incidentTitle, partById, etTime } from '../../site/words.js';

const DATA = (process.env.STATUS_DATA_BASE || 'https://raw.githubusercontent.com/rumizenzz/dialboard-status/status-data').replace(/\/+$/, '');

export async function readStatus() {
  if (globalThis.__statusData) return globalThis.__statusData();
  try {
    const r = await fetch(DATA + '/status.json?t=' + Date.now(), { signal: AbortSignal.timeout(10000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export function incidentEmail(inc, kind, now) {
  const p = partById(inc.part);
  const t = (ts) => etTime(ts);
  const lines = incidentLines(inc, t, now);
  if (kind === 'start') {
    const title = incidentTitle(inc);
    return render({ subject: fill(W.mailDownSubject, { title }), heading: title, lines: [...lines, W.mailDownMore], button: [W.mailButton, SITE + '/#i-' + inc.id], stripe: 'red', extra: [W.mailTimes], unsub: UNSUB_SLOT });
  }
  return render({ subject: fill(W.mailFixedSubject, { name: p.name }), heading: fill(W.mailFixedSubject, { name: p.name }), lines, button: [W.mailButton, SITE + '/#i-' + inc.id], stripe: 'green', extra: [W.mailTimes], unsub: UNSUB_SLOT });
}

async function activeSubscribers(s) {
  const out = [];
  for (const k of await s.list('sub/')) {
    const v = await s.get(k);
    if (v && v.state === 'active' && v.email) out.push({ id: k.slice(4), email: v.email });
  }
  return out;
}

async function watchdog(s, status, now) {
  const to = (process.env.ALERT_TO || '').trim();
  const stale = isStale(status, now);
  const flag = await s.get('alert/stale');
  if (stale && !flag) {
    await s.set('alert/stale', { at: now });
    if (to) {
      const since = status && status.generated_at ? etTime(status.generated_at) : 'the start';
      const r = render({ subject: fill(W.alertStaleSubject, { time: since }), heading: fill(W.alertStaleSubject, { time: since }), lines: [fill(W.alertStaleBody, { time: since })], button: ['Open GitHub Actions ›', 'https://github.com/rumizenzz/dialboard-status/actions'], stripe: 'red' });
      await sendBatch([message(to, r, null)], 'alert-stale-' + now).catch(() => false);
    }
    return 'stale';
  }
  if (!stale && flag) {
    await s.del('alert/stale');
    if (to) await sendBatch([message(to, render({ subject: W.alertBackSubject, heading: W.alertBackSubject, lines: [W.alertBackSubject + '.'], button: ['See status ›', SITE + '/'], stripe: 'green' }), null)], 'alert-back-' + now).catch(() => false);
    return 'back';
  }
  return stale ? 'stale' : 'fresh';
}

export async function notifyOnce(now = Date.now()) {
  const s = await store();
  const status = await readStatus();
  const dog = await watchdog(s, status, now);
  const sent = [];
  if (dog === 'fresh' || dog === 'back') {
    let subs = null;
    for (const inc of status.incidents || []) {
      const key = 'sent/' + inc.id;
      const ledger = (await s.get(key)) || { start: [], fixed: [] };
      const due = dueFor(inc, ledger, now);
      if (!due) continue;
      subs = subs || (await activeSubscribers(s));
      const r = incidentEmail(inc, due, now);
      const n = ledger[due].length;
      let ok = true;
      for (let i = 0; i < subs.length; i += 100) {
        const chunk = subs.slice(i, i + 100).map((x) => message(x.email, r, SITE + '/unsubscribe?t=' + encodeURIComponent(unsubToken(x.id))));
        // the same key on a retry: Resend sends each chunk once
        ok = (await sendBatch(chunk, inc.id + '-' + due + '-' + n + '-' + i).catch(() => false)) && ok;
      }
      if (ok) {
        ledger[due].push(now);
        await s.set(key, ledger);
        sent.push({ inc: inc.id, kind: due, to: subs.length });
      }
    }
  }
  // tidy
  for (const k of await s.list('sub/')) {
    const v = await s.get(k);
    if (v && v.state === 'pending' && now - v.created > 7 * 86400000) await s.del(k);
  }
  for (const k of await s.list('sent/')) {
    const v = await s.get(k);
    const last = Math.max(0, ...(v?.start || []), ...(v?.fixed || []));
    if (now - last > 100 * 86400000) await s.del(k);
  }
  for (const k of await s.list('rl/')) {
    const v = await s.get(k);
    const day = v && v.day ? Date.parse(v.day) : Date.parse(k.slice(7) || '');
    if (isFinite(day) && now - day > 2 * 86400000) await s.del(k);
  }
  return { watchdog: dog, sent };
}

export default async () => {
  const r = await notifyOnce();
  console.log('notify', JSON.stringify(r));
  return new Response('ok');
};

export const config = { schedule: '*/5 * * * *' };
