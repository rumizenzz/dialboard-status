// The checks against a pretend Dialboard on this computer (nothing on the internet is touched).
// node tests/checks.test.mjs
import http from 'node:http';

const mode = { mail: null, site: 'ok', auth: 'ok', probe: 'ok', rest: 'ok', billing: 'ok', resend: 'ok', slowProbe: 0, version: 'dialboard-v144-76', sw: 'dialboard-v144-76' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (s, body, t = 'text/html') => { res.writeHead(s, { 'content-type': t }); res.end(body); };
  if (u.pathname === '/' ) return mode.site === 'down' ? send(503, 'x') : send(200, '<title>Dialboard</title>');
  if (u.pathname === '/app') return mode.site === 'down' ? send(503, 'x') : send(200, mode.version ? `<meta name="dialboard-version" content="${mode.version}">` : '<p>no</p>');
  if (u.pathname === '/sw.js') return mode.site === 'down' ? send(503, '') : send(200, `const VERSION="${mode.sw}";`, 'text/javascript');
  if (u.pathname === '/auth.html') return mode.site === 'down' ? send(503, '') : send(200, '<form id="login-form"><input type="password"></form>');
  if (u.pathname === '/auth/v1/health') return mode.auth === 'down' ? send(502, 'bad gateway') : send(200, '{"version":"v2","name":"GoTrue"}', 'application/json');
  if (u.pathname === '/rest/v1/rpc/dialboard_pull_mine') return mode.rest === 'down' ? send(504, '') : send(401, '{"code":"42501","message":"not signed in"}', 'application/json');
  if (u.pathname === '/functions/v1/dialboard-billing') return mode.billing === 'down' ? send(500, '') : send(401, '{"error":"not_signed_in"}', 'application/json');
  if (u.pathname === '/functions/v1/dialboard-status-probe') {
    if (mode.probe === 'missing') return send(404, '{"code":"NOT_FOUND"}', 'application/json');
    if (mode.probe === 'down') return send(500, 'boom');
    const c = (k) => ({ ok: mode.probe !== 'fail-' + k, ms: k === 'save' ? 120 + mode.slowProbe : 200 });
    return setTimeout(() => send(200, JSON.stringify({ ok: true, version: 'status-probe-2', checks: { save: c('save'), stripe: c('stripe'), resend: c('resend'), ...(mode.mail ? { mail: { ok: true, sent: false, recent: mode.mail } } : {}) } }), 'application/json'), 5);
  }
  if (u.pathname === '/resend/') return mode.resend === 'down' ? req.destroy() : send(200, '{"message":"hi"}', 'application/json');
  send(404, 'no');
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;
Object.assign(process.env, { STATUS_SITE: base, STATUS_SUPABASE_URL: base, STATUS_RESEND_URL: base + '/resend/', STATUS_TIMEOUT_MS: '3000' });
const { checkAll, mailDecision, emailVerdict } = await import('../checker/checks.mjs');

let pass = 0, fail = 0;
const ok = (c, name, got) => { if (c) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + ' :: ' + JSON.stringify(got)); } };
const reset = () => Object.assign(mode, { mail: null, site: 'ok', auth: 'ok', probe: 'ok', rest: 'ok', billing: 'ok', resend: 'ok', slowProbe: 0, version: 'dialboard-v144-76', sw: 'dialboard-v144-76' });
const v = (r) => Object.fromEntries(Object.entries(r.parts).map(([k, x]) => [k, x.v]));

let r = await checkAll();
ok(Object.values(v(r)).every((x) => x === 'ok') && r.version === 'dialboard-v144-76', 'everything up: all ok, version read', v(r));
mode.site = 'down'; r = await checkAll();
ok(v(r).open === 'fail', 'site down: Opening Dialboard fails (both ways agree)', r.parts.open);
ok(v(r).signin === 'ok', 'and Signing in is judged on its own (Auth health still answers)', v(r));
reset(); mode.version = null; r = await checkAll();
ok(v(r).open === 'soft', 'the app page lost its version but sw.js is fine: soft (the second check disagrees)', r.parts.open);
reset(); mode.auth = 'down'; r = await checkAll();
ok(v(r).signin === 'soft', 'Auth health down, sign-in page fine: soft', r.parts.signin);
mode.site = 'down'; r = await checkAll();
ok(v(r).signin === 'fail', 'Auth health down AND the sign-in page down: fail', r.parts.signin);
reset(); mode.probe = 'missing'; r = await checkAll();
ok(v(r).save === 'unknown' && v(r).pay === 'unknown' && v(r).email === 'unknown', 'probe not deployed yet: those three are "can’t check", never down', v(r));
reset(); mode.probe = 'fail-save'; mode.rest = 'down'; r = await checkAll();
ok(v(r).save === 'fail' && v(r).pay === 'ok', 'saving fails and the database doesn’t answer: fail (only saving)', v(r));
reset(); mode.probe = 'fail-save'; r = await checkAll();
ok(v(r).save === 'soft', 'saving fails but the database answers: soft', v(r));
reset(); mode.probe = 'fail-stripe'; r = await checkAll();
ok(v(r).pay === 'soft', 'Stripe doesn’t answer but billing does: soft', v(r));
reset(); mode.probe = 'down'; mode.billing = 'down'; r = await checkAll();
ok(v(r).pay === 'fail' && v(r).save === 'soft' && v(r).email === 'soft', 'the probe itself broken: each part asks its own second opinion', v(r));
reset(); mode.probe = 'fail-resend'; mode.resend = 'down'; r = await checkAll();
ok(v(r).email === 'fail', 'Resend fails both ways: fail', v(r));
reset(); mode.slowProbe = 3500; r = await checkAll();
ok(v(r).save === 'slow', 'saving took 3.6 s: slow', r.parts.save);

console.log('the hourly email round trip');
const NOW = Date.now(), ago = (m) => new Date(NOW - m * 60000).toISOString();
const row = (sentMin, arrivedSec, ok = true) => ({ sent_at: ago(sentMin), arrived_at: arrivedSec == null ? null : new Date(Date.parse(ago(sentMin)) + arrivedSec * 1000).toISOString(), send_ok: ok });
let d = mailDecision([row(3, null), row(63, 14), row(123, 20)], NOW);
ok(d.misses === 0 && d.head.hit && d.head.delay === 14000, 'an email 3 min old not yet in is "not decided"; the newest decided one arrived in 14 s', d);
d = mailDecision([row(20, null), row(80, 9)], NOW);
ok(d.misses === 1 && !d.head.hit, 'not arrived after 15 minutes: a miss', d);
d = mailDecision([row(5, null, false), row(65, null)], NOW);
ok(d.misses === 2, 'Resend refusing it counts as a miss at once', d);
const api = { ok: true, ms: 300 }, apiDown = { ok: false, ms: 300, why: 'probe_resend' };
let e = emailVerdict(api, null, { recent: [row(30, 14)] }, NOW);
ok(e.v === 'ok' && e.detail.delivered_ms === 14000, 'arrived in 14 s: working, with the time as a detail', e);
e = emailVerdict(api, null, { recent: [row(30, 12 * 60)] }, NOW);
ok(e.v === 'slow', 'arrived after 12 minutes: slow', e);
e = emailVerdict(api, null, { recent: [row(20, null), row(80, 9)] }, NOW);
ok(e.v === 'ok' && e.why === 'mail_missed_once' && e.detail.missed === 1, 'ONE miss with Resend answering: not shown yet (waits for the next hour)', e);
e = emailVerdict(apiDown, { ok: true }, { recent: [row(20, null), row(80, 9)] }, NOW);
ok(e.v === 'fail', 'a miss plus Resend’s API failing: fail', e);
e = emailVerdict(api, null, { recent: [row(20, null), row(80, null), row(140, 9)] }, NOW);
ok(e.v === 'fail' && e.why === 'mail_missed_twice', 'two hourly misses: fail', e);
e = emailVerdict(apiDown, { ok: true }, { recent: [row(30, 14)] }, NOW);
ok(e.v === 'soft', 'Resend’s API failing, emails still arriving: soft (as before)', e);
e = emailVerdict(api, null, null, NOW);
ok(e.v === 'ok', 'no round-trip data yet (first hour): judged on the API alone', e);
reset(); mode.mail = [row(20, null), row(80, null)]; r = await checkAll();
ok(v(r).email === 'fail' && r.parts.email.why === 'mail_missed_twice', 'end to end through the probe: two misses → fail', r.parts.email);
reset(); mode.mail = [row(4, 11)]; r = await checkAll();
ok(v(r).email === 'ok' && r.parts.email.detail.delivered_ms === 11000, 'end to end: delivered in 11 s', r.parts.email);
srv.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
