// The checks: each part has a FULL check and a PLAIN check of a different kind. No account, no password, no secret:
// everything here is either public (the site, the publishable key the app already ships) or answered by the probe
// function inside Supabase, which uses keys Supabase already holds and never shows them.
//
//   part                 full check                                             plain check (a different way)
//   Opening Dialboard    dialboard.io/ and /app load, /app carries a version     /sw.js loads with the same version
//   Signing in           Supabase Auth's /auth/v1/health answers healthy         the sign-in page loads with its log-in form
//   Saving to account    probe: writes one fixed row, reads it back              the database answers a plain request
//   Plans & payments     probe: Stripe answers a cheap read-only request         dialboard-billing answers (a signed-out "no")
//   Emails               probe: Resend's API answers with Dialboard's own key    Resend's API answers from here
//
// A run's verdict for a part: ok | slow (full passed, but slower than the limit) | soft (full failed, plain passed) |
// fail (both failed) | unknown (can't be checked: the probe isn't deployed yet, or answered something we don't know).

export const CONFIG = {
  site: process.env.STATUS_SITE || 'https://dialboard.io',
  supabase: process.env.STATUS_SUPABASE_URL || 'https://cfbqsncwxtdhuwxpqfys.supabase.co',
  // the publishable key: public, the same one js/sync.js and js/account.js ship to every browser
  publishable: process.env.STATUS_SUPABASE_KEY || 'sb_publishable_Yjtg2315aQqiw_3axgKtGw_C3Q0LnZ8',
  probe: process.env.STATUS_PROBE_URL || '',
  expectVersion: process.env.STATUS_EXPECT_VERSION || '',
  timeoutMs: Number(process.env.STATUS_TIMEOUT_MS || 15000),
  resendApi: process.env.STATUS_RESEND_URL || 'https://api.resend.com/',
};
CONFIG.probe = CONFIG.probe || CONFIG.supabase + '/functions/v1/dialboard-status-probe';

// slower than this (ms) on two runs in a row = Slow (DRAFT limits, to tune after a few days of real numbers)
export const SLOW_MS = { open: 4000, signin: 3000, save: 3000, pay: 5000, email: 5000 };

const UA = 'DialboardStatusChecker/1 (+https://status.dialboard.io)';

async function get(url, init = {}, ms = CONFIG.timeoutMs) {
  const t0 = performance.now();
  try {
    const r = await fetch(url, { redirect: 'follow', cache: 'no-store', ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(ms) });
    const text = await r.text();
    return { ok: true, status: r.status, text, ms: performance.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, text: '', ms: performance.now() - t0, err: e && e.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
}
const json = (t) => { try { return JSON.parse(t); } catch { return null; } };
const bust = (u) => u + (u.includes('?') ? '&' : '?') + 'status_check=' + Date.now();
const metaVersion = (html) => (/<meta\s+name=["']dialboard-version["']\s+content=["']([^"']+)["']/i.exec(html) || [])[1] || null;
const VERSION_RE = /^dialboard-v\d+(?:-\d+)*$/;

// ------------------------------------------------------------------ "is it me?"

/** Two of three neutral addresses must answer, or the checker's own connection is the problem. */
export async function internetOk() {
  const urls = ['https://www.google.com/generate_204', 'https://example.com/', 'https://api.github.com/zen'];
  const rs = await Promise.all(urls.map((u) => get(u, {}, 8000)));
  return rs.filter((r) => r.ok && r.status > 0 && r.status < 500).length >= 2;
}

// ------------------------------------------------------------------ the parts

async function openFull() {
  const [home, app] = await Promise.all([get(bust(CONFIG.site + '/')), get(bust(CONFIG.site + '/app'))]);
  const ms = Math.max(home.ms, app.ms);
  if (!home.ok || home.status !== 200 || !/Dialboard/.test(home.text)) return { ok: false, ms, why: 'home_' + (home.err || home.status) };
  const v = metaVersion(app.text);
  if (!app.ok || app.status !== 200 || !v || !VERSION_RE.test(v)) return { ok: false, ms, why: 'app_' + (app.err || app.status || 'no_version') };
  if (CONFIG.expectVersion && v !== CONFIG.expectVersion) return { ok: false, ms, why: 'version_' + v };
  return { ok: true, ms, version: v };
}
async function openPlain(version) {
  const r = await get(bust(CONFIG.site + '/sw.js'));
  const v = (/VERSION\s*=\s*["']([^"']+)["']/.exec(r.text) || [])[1] || null;
  if (!r.ok || r.status !== 200 || !v || !VERSION_RE.test(v)) return { ok: false, ms: r.ms, why: 'sw_' + (r.err || r.status) };
  if (version && v !== version) return { ok: false, ms: r.ms, why: 'sw_version_mismatch' };
  return { ok: true, ms: r.ms, version: v };
}

async function signinFull() {
  const r = await get(CONFIG.supabase + '/auth/v1/health', { headers: { apikey: CONFIG.publishable } });
  const j = json(r.text);
  if (!r.ok || r.status !== 200 || !j) return { ok: false, ms: r.ms, why: 'auth_health_' + (r.err || r.status) };
  return { ok: true, ms: r.ms };
}
async function signinPlain() {
  const r = await get(bust(CONFIG.site + '/auth.html'));
  const ok = r.ok && r.status === 200 && /id=["']login-form["']/.test(r.text) && /type=["']password["']/.test(r.text);
  return { ok, ms: r.ms, why: ok ? null : 'auth_page_' + (r.err || r.status || 'no_form') };
}

/** The probe: one call answers saving, payments and email. null = it doesn't exist yet (404) or can't be read. */
export async function probe() {
  const r = await get(CONFIG.probe, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const j = json(r.text);
  if (!r.ok) return { reached: false, ms: r.ms, why: r.err };
  if (r.status === 404) return { reached: true, missing: true, ms: r.ms };
  if (!j || typeof j !== 'object' || !j.checks) return { reached: true, broken: true, status: r.status, ms: r.ms, why: 'probe_' + r.status };
  return { reached: true, status: r.status, ms: r.ms, body: j };
}

async function savePlain() {
  // signed out, the database refuses (not signed in): any quick JSON answer means it is up and answering
  const r = await get(CONFIG.supabase + '/rest/v1/rpc/dialboard_pull_mine', { method: 'POST', headers: { apikey: CONFIG.publishable, 'Content-Type': 'application/json' }, body: '{"p_rev":null}' });
  const ok = r.ok && r.status > 0 && r.status < 500 && json(r.text) !== null;
  return { ok, ms: r.ms, why: ok ? null : 'rest_' + (r.err || r.status) };
}
async function payPlain() {
  const r = await get(CONFIG.supabase + '/functions/v1/dialboard-billing', { method: 'POST', headers: { apikey: CONFIG.publishable, 'Content-Type': 'application/json' }, body: '{"action":"status_check"}' });
  const j = json(r.text);
  const ok = r.ok && r.status === 401 && j && j.error === 'not_signed_in';
  return { ok, ms: r.ms, why: ok ? null : 'billing_' + (r.err || r.status) };
}
async function emailPlain() {
  const r = await get(CONFIG.resendApi, {}, 10000);
  const ok = r.ok && r.status > 0 && r.status < 500;
  return { ok, ms: r.ms, why: ok ? null : 'resend_' + (r.err || r.status) };
}

function verdict(id, full, plain) {
  if (full.unknown) return { v: 'unknown', ms: full.ms, why: full.why };
  if (full.ok) return { v: full.ms > SLOW_MS[id] ? 'slow' : 'ok', ms: full.ms };
  return { v: plain && plain.ok ? 'soft' : 'fail', ms: full.ms, why: [full.why, plain && plain.why].filter(Boolean).join(',') };
}

/** From the probe's answer, one part's full check. */
function fromProbe(p, key) {
  if (!p.reached) return { ok: false, ms: p.ms, why: 'probe_' + (p.why || 'unreachable') };
  if (p.missing) return { unknown: true, ms: p.ms, why: 'probe_not_deployed' };
  if (p.broken) return { ok: false, ms: p.ms, why: p.why };
  const c = p.body.checks[key];
  if (!c || typeof c.ok !== 'boolean') return { unknown: true, ms: p.ms, why: 'probe_no_' + key };
  return { ok: c.ok, ms: typeof c.ms === 'number' ? c.ms : p.ms, why: c.ok ? null : 'probe_' + key };
}

// ------------------------------------------------------------------ the hourly email round trip

export const MAIL_OK_MS = 10 * 60000;   // arrived within 10 minutes: working (later: slow)
export const MAIL_LATE_MS = 15 * 60000; // not arrived after 15 minutes: a miss

/**
 * From the probe's last 3 test emails (newest first): which are decided, how many misses in a row at the newest end,
 * and how fast the newest one arrived. An email still under 15 minutes old with no arrival is not decided yet.
 */
export function mailDecision(recent, now) {
  const decided = [];
  for (const m of Array.isArray(recent) ? recent : []) {
    const sent = Date.parse(m.sent_at);
    if (!isFinite(sent)) continue;
    if (m.arrived_at) decided.push({ hit: true, sent, delay: Math.max(0, Date.parse(m.arrived_at) - sent) });
    else if (m.send_ok === false) decided.push({ hit: false, sent, why: 'refused' });
    else if (now - sent >= MAIL_LATE_MS) decided.push({ hit: false, sent, why: 'late' });
  }
  let misses = 0;
  for (const d of decided) { if (d.hit) break; misses++; }
  return { decided, misses, head: decided[0] || null };
}

/** Emails from Dialboard: the round trip and Resend's API together (two hourly misses, or a miss plus the API failing). */
export function emailVerdict(full, plain, mail, now) {
  if (full.unknown) return { v: 'unknown', ms: full.ms, why: full.why };
  const dec = mail ? mailDecision(mail.recent, now) : { misses: 0, head: null };
  const detail = dec.head ? (dec.head.hit ? { delivered_ms: dec.head.delay, sent: dec.head.sent } : { missed: dec.misses, sent: dec.head.sent }) : null;
  const out = (v, why) => ({ v, ms: full.ms, why: why || null, detail });
  if (dec.misses >= 2) return out('fail', 'mail_missed_twice');
  if (dec.misses === 1 && !full.ok) return out('fail', 'mail_missed_and_api');
  if (!full.ok) return out(plain && plain.ok ? 'soft' : 'fail', [full.why, plain && plain.why].filter(Boolean).join(','));
  if (dec.misses === 1) return out('ok', 'mail_missed_once');            // one miss alone: wait for the next hour's email
  if (dec.head && dec.head.hit && dec.head.delay > MAIL_OK_MS) return out('slow', 'mail_late');
  return out(full.ms > SLOW_MS.email ? 'slow' : 'ok');
}

/** Every part, once. Plain checks run only when the full one failed (they are the second opinion). */
export async function checkAll() {
  const [oF, sF, p] = await Promise.all([openFull(), signinFull(), probe()]);
  const oP = oF.ok ? null : await openPlain(null);
  const sP = sF.ok ? null : await signinPlain();
  const saveF = fromProbe(p, 'save'), payF = fromProbe(p, 'stripe'), mailF = fromProbe(p, 'resend');
  const [saveP, payP, mailP] = await Promise.all([
    saveF.ok || saveF.unknown ? null : savePlain(),
    payF.ok || payF.unknown ? null : payPlain(),
    mailF.ok || mailF.unknown ? null : emailPlain(),
  ]);
  return {
    version: oF.version || null,
    probeVersion: p.body && p.body.version || null,
    parts: {
      open: verdict('open', oF, oP),
      signin: verdict('signin', sF, sP),
      save: verdict('save', saveF, saveP),
      pay: verdict('pay', payF, payP),
      email: emailVerdict(mailF, mailP, p.body && p.body.checks && p.body.checks.mail && p.body.checks.mail.ok ? p.body.checks.mail : null, Date.now()),
    },
  };
}

// ------------------------------------------------------------------ outside services (shown apart, never a trigger)

export const FEEDS = {
  supabase: 'https://status.supabase.com/api/v2/status.json',
  stripe: 'https://www.stripestatus.com/api/v2/status.json',
  netlify: 'https://www.netlifystatus.com/api/v2/status.json',
  resend: 'https://resend-status.com/api/v2/status.json',
};
export async function services() {
  const ids = Object.keys(FEEDS);
  const rs = await Promise.all(ids.map((id) => get(FEEDS[id], { headers: { Accept: 'application/json' } }, 10000)));
  return ids.map((id, i) => {
    const j = json(rs[i].text);
    const ind = j && j.status && typeof j.status.indicator === 'string' ? j.status.indicator : 'unknown';
    const allowed = ['none', 'minor', 'major', 'critical', 'maintenance'];
    return { id, indicator: allowed.includes(ind) ? ind : 'unknown', checked: Date.now() };
  });
}

// (exported for the live dry run in DEPLOY.md and the tests)
export { openFull, openPlain, signinFull, signinPlain, savePlain, payPlain, emailPlain };
