// Every word the status page, its emails and its RSS feed can say. One file, used by the page (browser), the checker
// (Node, for the RSS feed) and the Netlify functions (emails), so the three always say the same thing.
//
// DRAFT: every sentence below is waiting for the founder's approval. Nothing here is live yet.
// Rules for the words: no blame, no jargon, no "we apologize for any inconvenience", no guesses about the cause, no
// promised fix time. "Fixed" only when the checks say so.
//
// {time} is always given already written out (for example "2:14 pm ET"); {dur} as "17 min" or "1 hr 5 min".

export const DRAFT = true;

export const PARTS = [
  {
    id: 'open', name: 'Opening Dialboard', what: 'dialboard.io and your board open',
    down: 'Dialboard isn’t opening right now. We noticed at {time} and we’re on it.',
    slow: 'Dialboard is slower than usual to open. It still works, just slower. We noticed at {time}.',
    downPast: 'Dialboard stopped opening at {time}.',
    slowPast: 'Dialboard got slow to open at {time}.',
    fixed: 'Fixed at {time}. Dialboard is opening again. It was down for {dur}.',
    fixedSlow: 'Back to normal at {time}. Dialboard opens at its usual speed again.',
    title: { down: 'Dialboard isn’t opening', slow: 'Dialboard is slow to open', flap: 'Dialboard is opening on and off' },
    providers: ['netlify'],
  },
  {
    id: 'signin', name: 'Signing in', what: 'logging in and staying logged in',
    down: 'Signing in isn’t working right now. If you’re already on your board, you can keep going. We noticed at {time} and we’re on it.',
    slow: 'Signing in is slower than usual. It still works, just slower. We noticed at {time}.',
    downPast: 'Signing in stopped working at {time}.',
    slowPast: 'Signing in got slower than usual at {time}.',
    fixed: 'Fixed at {time}. Signing in is working again. It was down for {dur}.',
    fixedSlow: 'Back to normal at {time}. Signing in is at its usual speed again.',
    title: { down: 'Signing in isn’t working', slow: 'Signing in is slow', flap: 'Signing in is working on and off' },
    providers: ['supabase'],
  },
  {
    id: 'save', name: 'Saving to your account', what: 'your board backing up to your account',
    down: 'Saving to your account isn’t working right now. Your board keeps your changes on this device until it can save. We noticed at {time} and we’re on it.',
    slow: 'Saving to your account is slower than usual. Your changes still save, just slower. We noticed at {time}.',
    downPast: 'Saving to your account stopped working at {time}.',
    slowPast: 'Saving to your account got slower than usual at {time}.',
    fixed: 'Fixed at {time}. Saving to your account is working again. It was down for {dur}. Changes you made during the problem save the next time your board is open.',
    fixedSlow: 'Back to normal at {time}. Saving is at its usual speed again.',
    title: { down: 'Saving to your account isn’t working', slow: 'Saving to your account is slow', flap: 'Saving to your account is working on and off' },
    providers: ['supabase'],
  },
  {
    id: 'pay', name: 'Plans & payments', what: 'changing plans, paying and receipts',
    down: 'Plans and payments aren’t working right now. Your plan stays as it is. We noticed at {time} and we’re on it.',
    slow: 'Plans and payments are slower than usual. They still work, just slower. We noticed at {time}.',
    downPast: 'Plans and payments stopped working at {time}.',
    slowPast: 'Plans and payments got slower than usual at {time}.',
    fixed: 'Fixed at {time}. Plans and payments are working again. They were down for {dur}.',
    fixedSlow: 'Back to normal at {time}. Plans and payments are at their usual speed again.',
    title: { down: 'Plans and payments aren’t working', slow: 'Plans and payments are slow', flap: 'Plans and payments are working on and off' },
    providers: ['stripe', 'supabase'],
  },
  {
    id: 'email', name: 'Emails from Dialboard', what: 'sign-in codes, receipts and reminders',
    down: 'Emails from Dialboard aren’t going out right now. We noticed at {time} and we’re on it.',
    slow: 'Emails from Dialboard are slower than usual. They still go out, just later. We noticed at {time}.',
    downPast: 'Emails from Dialboard stopped going out at {time}.',
    slowPast: 'Emails from Dialboard got slower than usual at {time}.',
    fixed: 'Fixed at {time}. Emails from Dialboard are going out again. They were down for {dur}.',
    fixedSlow: 'Back to normal at {time}. Emails go out at their usual speed again.',
    title: { down: 'Emails from Dialboard aren’t going out', slow: 'Emails from Dialboard are slow', flap: 'Emails from Dialboard are going on and off' },
    providers: ['resend', 'supabase'],
  },
];

export const SERVICES = [
  { id: 'supabase', name: 'Supabase', for: 'accounts, saving and sign-in', url: 'https://status.supabase.com' },
  { id: 'stripe', name: 'Stripe', for: 'payments', url: 'https://status.stripe.com' },
  { id: 'netlify', name: 'Netlify', for: 'the website', url: 'https://www.netlifystatus.com' },
  { id: 'resend', name: 'Resend', for: 'emails', url: 'https://resend-status.com' },
];

export const W = {
  // the top banner
  bannerOk: 'Everything’s working.',
  bannerOkSub: 'All five parts of Dialboard passed their last check.',
  bannerTroubleOne: '{title}.',                       // one part slow or down, e.g. "Saving to your account is slow."
  bannerTroubleMany: 'Some parts of Dialboard are having trouble.',
  bannerDown: 'Dialboard is down right now.',
  bannerDownSub: 'We noticed at {time} and we’re on it.',
  bannerPartial: 'Everything we can check is working.',
  bannerPartialSub: 'One part can’t be checked right now. It’s marked below.',
  bannerUnknown: 'Status unknown right now.',
  bannerUnknownSub: 'Our checks haven’t reported since {time}. That doesn’t mean Dialboard is down, only that we can’t confirm it.',
  bannerUnknownNever: 'Our checks haven’t reported yet.',
  bannerCheckerOffline: 'Our checker couldn’t reach the internet at {time}, so this time it can’t say. It tries again in 5 minutes.',
  lastChecked: 'Last checked {ago}.',
  autoLine: 'Checked automatically every 5 minutes. Nobody types these updates.',
  zoneLine: 'Times in ET',
  zoneLineYours: 'Times in ET, and in your time ({zone})',

  // the email part's round trip (under its name)
  mailDelivered: 'Last test email delivered in {secs}.',
  mailMissedOnce: 'Our last test email didn’t arrive. The next one goes out within the hour.',

  // a part's state word (a dot and a word, so colour is never the only signal)
  state: { ok: 'Working', slow: 'Slow', down: 'Not working', unknown: 'Can’t check right now' },

  // the day bar's legend
  legend: { ok: 'Working', slow: 'Slow', down: 'Not working', nodata: 'No data', none: 'Before our checks began' },
  daysLabel: '{n} days ago',
  today: 'Today',

  // the day card (hover or tap a day)
  dayClean: 'No downtime recorded.',
  dayBlip: 'Less than 1 min down.',
  dayDown: 'Down {dur}.',
  daySlow: 'Slow for {dur}. Still working.',
  dayNoData: 'Our checks were offline for {dur}. We can’t say for that time.',
  dayAllNoData: 'Our checks were offline all day. We can’t say.',
  dayBefore: 'Our checks hadn’t started yet.',
  dayUptime: '{pct} uptime',
  dayUptimeNA: 'No uptime figure',
  dayNoIncident: 'No incident post for this downtime.',

  // incidents
  stillGoing: 'Still working on it. It started at {time}.',
  flapping: 'It’s going on and off. We’re watching it closely.',
  againAt: 'It stopped working again at {time}.',
  worseAt: 'At {time} it stopped working completely.',
  betterAt: 'At {time} it started working again, but slower than usual.',
  alsoProvider: '{provider}, which we use for {for}, is also reporting a problem right now.',
  alsoProviderPast: '{provider}, which we use for {for}, was also reporting a problem at the time.',
  open: 'Happening now',
  resolved: 'Fixed',
  pastTitle: 'Past problems',
  pastNone: 'No problems in the last 90 days.',
  lasted: 'Lasted {dur}',

  // the other boxes
  servicesTitle: 'Services Dialboard uses',
  servicesNote: 'These are the companies’ own status pages. A problem there only shows here. It never marks a part of Dialboard as down by itself.',
  serviceState: { none: 'No problems reported', minor: 'Reporting a minor problem', major: 'Reporting a major problem', critical: 'Reporting a big outage', maintenance: 'Planned work', unknown: 'Couldn’t read their page' },
  disagree: 'Something not working for you, but it shows green here? Tell us ›',
  howTitle: 'How we count',
  how: [
    'A robot checks each part every 5 minutes, from GitHub’s computers, outside our own servers.',
    'A part only shows as not working after two checks in a row fail, and a second, different kind of check agrees. One bad check never shows here.',
    'A part shows as fixed after two good checks in a row.',
    'Once an hour we send a real email to ourselves and time it. Arriving within 10 minutes is working, later is slow, and two missed in a row (or one missed while Resend isn’t answering) is not working.',
    'If our robot can’t reach the internet at all, it blames itself, not Dialboard, and that time shows as “No data”.',
    'If the robot stops reporting for 20 minutes, this page turns grey. It never shows green on old news.',
    'Uptime only counts confirmed problems. Slow time shows in yellow, but doesn’t lower the uptime.',
    'Uptime is rounded down, so a day with any downtime never shows as 100%.',
  ],
  subTitle: 'Email me when something breaks',
  subNote: 'One email when a problem lasts 10 minutes, one when it’s fixed. Nothing else.',
  subButton: 'Email me',
  subSent: 'Check your email and tap the link to confirm. Nothing comes until you do.',
  subBad: 'That email address doesn’t look right.',
  subBusy: 'We couldn’t sign you up right now. Please try again in a few minutes.',
  rss: 'RSS feed',
  back: 'Go to dialboard.io ›',
  help: 'Help',
  privacy: 'Privacy',
  stillStuck: 'Still stuck? Email hello@dialboard.io',

  // confirm and unsubscribe pages
  confirmTitle: 'Get Dialboard status emails?',
  confirmBody: 'We’ll email you when part of Dialboard stops working for 10 minutes or more, and again when it’s fixed.',
  confirmButton: 'Yes, email me',
  confirmDone: 'You’re on the list. We’ll only email you when something breaks, and when it’s fixed.',
  confirmOld: 'This link has run out or was already used. You can sign up again on the status page.',
  unsubDone: 'You won’t get status emails any more.',
  unsubBad: 'This link doesn’t work. If you still get emails, reply to one and we’ll take you off.',
  unsubWorking: 'Taking you off the list…',
  backToStatus: 'Back to the status page ›',

  // emails (subject / body). Signed "— Dialboard".
  mailConfirmSubject: 'Confirm your Dialboard status emails',
  mailConfirmBody: 'Tap below and we’ll email you when part of Dialboard stops working for 10 minutes or more, and again when it’s fixed. Nothing else.',
  mailConfirmButton: 'Yes, email me ›',
  mailConfirmIgnore: 'Didn’t ask for this? Ignore this email and nothing more will come.',
  mailDownSubject: '{title} right now',
  mailDownMore: 'We’ll email you again when it’s fixed.',
  mailFixedSubject: 'Fixed: {name}',
  mailButton: 'See status ›',
  mailWhy: 'You get this because you asked for Dialboard status emails.',
  mailUnsub: 'Stop these emails',
  mailTimes: 'Times are Eastern Time (ET).',

  // founder-only alerts (never public)
  alertStaleSubject: 'Status checker hasn’t reported since {time}',
  alertStaleBody: 'status.dialboard.io has had no new results since {time}, so it shows “Status unknown right now”. Check the status-check workflow on GitHub (Actions tab). It may have been switched off, or GitHub may be slow.',
  alertBackSubject: 'Status checker is reporting again',
};

/** Fill {slots}. Unknown slots stay as they are, so a missing value is easy to spot in a test. */
export function fill(s, v) {
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m));
}

export function partById(id) { return PARTS.find((p) => p.id === id) || null; }
export function serviceById(id) { return SERVICES.find((s) => s.id === id) || null; }

/** "17 min", "1 hr 5 min", "2 hr", "less than 1 min". */
export function dur(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 1) return 'less than 1 min';
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), r = m % 60;
  return h + ' hr' + (r ? ' ' + r + ' min' : '');
}

/** "14 s", "2 min" (how long a test email took). */
export function secs(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return s + ' s';
  return dur(s / 60);
}

/** Honest rounding: always down, so any downtime never reads 100%. One decimal for a day, two for a bar. */
export function pct(up, decimals) {
  if (up == null || !isFinite(up)) return null;
  const f = Math.pow(10, decimals);
  const v = Math.floor(up * 100 * f + 1e-9) / f;
  return v.toFixed(v === 100 ? 0 : decimals) + '%';
}

/** "2:14 pm" in a time zone. */
export function clock(ts, tz) {
  const s = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).format(new Date(ts));
  return s.replace(/\s?AM$/i, ' am').replace(/\s?PM$/i, ' pm').replace(/ /g, ' ');
}
/** "2:14 pm ET", plus "(11:14 am your time)" when the viewer's zone differs. */
export function etTime(ts, viewerTz) {
  const et = clock(ts, 'America/New_York') + ' ET';
  if (!viewerTz || sameClock(ts, viewerTz)) return et;
  return et + ' (' + clock(ts, viewerTz) + ' your time)';
}
function sameClock(ts, tz) {
  try { return clock(ts, tz) === clock(ts, 'America/New_York'); } catch (_) { return true; }
}
/** "Tue, Nov 24" (the year added when it isn't this year). */
export function dayName(ymd, nowTs) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const thisYear = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'America/New_York' }).format(new Date(nowTs || Date.now()));
  const o = { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' };
  if (String(y) !== thisYear) o.year = 'numeric';
  return new Intl.DateTimeFormat('en-US', o).format(dt);
}

// ------------------------------------------------------------------ an incident in words (page, emails, RSS)

/** The incident's title: "Saving to your account isn’t working" (or slow, or on and off). */
export function incidentTitle(inc) {
  const p = partById(inc.part);
  if (!p) return '';
  if (inc.flap) return p.title.flap;
  return p.title[inc.kind === 'down' ? 'down' : 'slow'];
}

/**
 * The incident's sentences, oldest first. t(ts) writes a time ("2:14 pm ET"); now is for "still going".
 * Only fixed templates: the part's own opening sentence, the update lines, the provider line, the fixed line.
 */
export function incidentLines(inc, t, now) {
  const p = partById(inc.part);
  if (!p) return [];
  const out = [];
  // an open problem speaks in the present ("isn’t working right now… we’re on it"), a fixed one in the past
  const done = inc.resolved != null;
  const first = inc.firstKind === 'down' ? (done ? p.downPast : p.down) : (done ? p.slowPast : p.slow);
  out.push(fill(first, { time: t(inc.started) }));
  for (const u of inc.updates || []) {
    if (u.t === 'worse') out.push(fill(W.worseAt, { time: t(u.at) }));
    else if (u.t === 'better') out.push(fill(W.betterAt, { time: t(u.at) }));
    else if (u.t === 'again') out.push(fill(W.againAt, { time: t(u.at) }));
  }
  if (inc.flap && inc.resolved == null) out.push(W.flapping);
  for (const sid of inc.providers || []) {
    const s = serviceById(sid);
    if (s) out.push(fill(done ? W.alsoProviderPast : W.alsoProvider, { provider: s.name, for: s.for }));
  }
  if (inc.resolved != null) {
    const downMin = inc.downMin != null ? inc.downMin : 0;
    out.push(inc.kind === 'down' ? fill(p.fixed, { time: t(inc.resolved), dur: dur(downMin) }) : fill(p.fixedSlow, { time: t(inc.resolved) }));
  } else if (now != null && now - inc.started >= 30 * 60000 && !inc.flap) {
    out.push(fill(W.stillGoing, { time: t(inc.started) }));
  }
  return out;
}
