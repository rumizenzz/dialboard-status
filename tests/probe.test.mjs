// dialboard-status-probe (app-patch/) under a Deno stand-in with fake Supabase, Stripe and Resend: what it writes, what
// it sends (one test email an hour), what it answers (never a token or a key). Nothing leaves this computer.
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const P = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app-patch/supabase/functions');
let pass = 0, fail = 0;
const ok = (c, name, got) => { if (c) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (got !== undefined ? ' :: ' + JSON.stringify(got).slice(0, 500) : '')); } };

const ENV = { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc', STRIPE_SECRET_KEY: 'sk_test_x', RESEND_API_KEY: 're_x' };
let handler = null;
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handler = h; } };
let now = Date.parse('2026-11-25T15:00:00Z');
const realNow = Date.now; Date.now = () => now;
const DB = { probe: null, mail: [] }, SENT = [];
let stripeDown = false;
const res = (b, s = 200) => new Response(b == null ? null : JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)), m = init.method ?? 'GET';
  if (u.host === 'api.stripe.com') return stripeDown ? res({}, 500) : res({ object: 'balance' });
  if (u.host === 'api.resend.com') {
    if (u.pathname === '/domains') return res({ data: [] });
    if (u.pathname === '/emails' && m === 'POST') { SENT.push({ ...JSON.parse(init.body), idem: init.headers['Idempotency-Key'] }); return res({ id: 're_' + SENT.length }); }
  }
  if (u.pathname.endsWith('/dialboard_status_probe')) {
    if (m === 'GET') return res(DB.probe ? [{ ...DB.probe }] : []);
    if (m === 'POST') { const b = JSON.parse(init.body); DB.probe = { ...(DB.probe || {}), ...b }; return res(null, 201); }
    if (m === 'PATCH') { Object.assign(DB.probe, JSON.parse(init.body)); return res(null, 204); }
  }
  if (u.pathname.endsWith('/dialboard_status_probe_mail')) {
    if (m === 'GET') return res(DB.mail.slice().sort((a, b) => b.sent_at.localeCompare(a.sent_at)).slice(0, 3));
    if (m === 'POST') { DB.mail.push({ arrived_at: null, send_ok: null, ...JSON.parse(init.body) }); return res(null, 201); }
    if (m === 'PATCH') { const t = u.searchParams.get('token').slice(3); Object.assign(DB.mail.find((x) => x.token === t), JSON.parse(init.body)); return res(null, 204); }
    if (m === 'DELETE') { const lt = decodeURIComponent(u.searchParams.get('sent_at').slice(3)); DB.mail = DB.mail.filter((x) => x.sent_at >= lt); return res(null, 204); }
  }
  return res({}, 404);
};
await import(path.join(P, 'dialboard-status-probe/index.ts'));
const call = async (body = '{}') => { const r = await handler(new Request('https://fake/functions/v1/dialboard-status-probe', { method: 'POST', body })); return { status: r.status, j: await r.json() }; };

let r = await call('{"evil": "ignored"}');
ok(r.status === 200 && r.j.ok && r.j.version === 'status-probe-2' && r.j.cached === false, 'answers ok, with its version', r.j);
ok(['save', 'stripe', 'resend', 'mail'].every((k) => r.j.checks[k]), 'four checks: save, stripe, resend, mail');
ok(DB.probe && DB.probe.id === 1 && typeof DB.probe.nonce === 'string', 'saving: one fixed row (id 1) written and read back');
ok(SENT.length === 1 && SENT[0].to[0] === 'status-check@dialboard.io' && /^Dialboard status check DBSC-[0-9a-f]{32}$/.test(SENT[0].subject), 'one real test email to status-check@ with a token in the subject', SENT[0]);
ok(SENT[0].from === 'Dialboard <hello@dialboard.io>' && SENT[0].headers['Auto-Submitted'] === 'auto-generated' && SENT[0].idem === 'status-check:' + SENT[0].subject.split(' ').pop(), 'from the usual Dialboard sender, marked automatic, sent once per token');
ok(DB.mail.length === 1 && DB.mail[0].send_ok === true, 'its row: sent, Resend took it');
const txt = JSON.stringify(r.j);
ok(!/DBSC-|sk_test|re_x|svc/.test(txt) && r.j.checks.mail.recent.length === 1 && !('token' in r.j.checks.mail.recent[0]), 'the answer never carries a token or a key', txt.slice(0, 300));
now += 20000; r = await call();
ok(r.j.cached === true && SENT.length === 1, '20 s later: the same answer again (cached), nothing sent, Stripe and Resend not asked');
now += 30 * 60000; r = await call();
ok(r.j.cached === false && SENT.length === 1, '30 min later: checked again, but no second email within the hour');
DB.mail[0].arrived_at = new Date(Date.parse(DB.mail[0].sent_at) + 14000).toISOString();
now += 29 * 60000; r = await call();
ok(SENT.length === 2 && r.j.checks.mail.recent.length === 2 && r.j.checks.mail.recent[1].arrived_at, '59 min after the first (checks every 5 min): the next hour’s email goes', r.j.checks.mail);
now += 4 * 86400000; r = await call();
ok(DB.mail.length === 1, 'rows older than 3 days are deleted');
stripeDown = true; now += 60000; r = await call();
ok(r.j.ok === false && r.j.checks.stripe.ok === false && r.j.checks.save.ok, 'Stripe not answering: only that check fails');
Date.now = realNow;
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
