// The dialboard-support-inbound patch (app-patch/), in the style of dialboard-work/tests/email/support-auth-test.mjs:
// a Deno stand-in, fake Supabase and Resend, signed webhooks. Nothing touches dialboard/ (it's only read).
//   1. the patch still fits today's dialboard-support-inbound (take our lines out: byte for byte the live file)
//   2. the EXISTING support inbox test, run unchanged against the patched function: every other email as today
//   3. the status check email: arrival recorded, and nothing else (no inbox row, no note, no reply, no forward)
// node tests/inbound.test.mjs
import { createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const WORK = path.resolve(ROOT, '../..');                       // dialboard-work
const APP = path.resolve(WORK, '../dialboard');                 // the app (read only)
const PATCH = path.join(ROOT, 'app-patch/supabase/functions');
const REAL = path.join(APP, 'supabase/functions');

let pass = 0, fail = 0;
const ok = (c, name, got) => { if (c) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (got !== undefined ? ' :: ' + JSON.stringify(got).slice(0, 600) : '')); } };

console.log('1. the patch fits today’s file');
const patched = fs.readFileSync(path.join(PATCH, 'dialboard-support-inbound/index.ts'), 'utf8');
const live = fs.readFileSync(path.join(REAL, 'dialboard-support-inbound/index.ts'), 'utf8');
const unpatched = patched
  .replace(/\/\/   \(status page, 2026-11-25\)[\s\S]*?Every other email: as before\.\n/, '')
  .replace('import { statusCheckToken } from "../_shared/status-check.ts";\n', '')
  .replace(/\n  \/\/ the status page's test email:[\s\S]*?return json\(\{ ok: true, status_check: true \}\);\n  \}\n/, '');
ok(unpatched === live, 'patched file minus the status lines = the live dialboard-support-inbound, byte for byte');
ok(patched.indexOf('statusCheckToken(event') > patched.indexOf('verifySignature(secret') && patched.indexOf('statusCheckToken(event') < patched.indexOf('// already done?'), 'the status branch runs after the signature check and before anything is stored');

// a mirror of dialboard/ where only the patched files differ (links to everything else)
const M = path.join(HERE, 'out/mirror');
fs.rmSync(M, { recursive: true, force: true });
const MF = path.join(M, 'dialboard/supabase/functions');
fs.mkdirSync(path.join(MF, '_shared'), { recursive: true });
fs.mkdirSync(path.join(MF, 'dialboard-support-inbound'), { recursive: true });
for (const e of fs.readdirSync(REAL)) if (e !== '_shared' && e !== 'dialboard-support-inbound') fs.symlinkSync(path.join(REAL, e), path.join(MF, e));
for (const e of fs.readdirSync(path.join(REAL, '_shared'))) fs.symlinkSync(path.join(REAL, '_shared', e), path.join(MF, '_shared', e));
fs.copyFileSync(path.join(PATCH, '_shared/status-check.ts'), path.join(MF, '_shared/status-check.ts'));
fs.copyFileSync(path.join(PATCH, 'dialboard-support-inbound/index.ts'), path.join(MF, 'dialboard-support-inbound/index.ts'));
for (const e of fs.readdirSync(APP)) if (e !== 'supabase') fs.symlinkSync(path.join(APP, e), path.join(M, 'dialboard', e));
const T = path.join(M, 'w/tests/email');
fs.mkdirSync(T, { recursive: true });
fs.copyFileSync(path.join(WORK, 'tests/email/support-auth-test.mjs'), path.join(T, 'support-auth-test.mjs'));

console.log('2. the existing support inbox test, against the patched function');
const run = spawnSync(process.execPath, [path.join(T, 'support-auth-test.mjs')], { encoding: 'utf8', timeout: 90000 });
const lastLine = (run.stdout || '').trim().split('\n').pop();
ok(run.status === 0 && /ALL PASSED/.test(lastLine), 'support-auth-test.mjs unchanged: ' + lastLine, (run.stdout + run.stderr).slice(-800));

console.log('3. the status check email');
const ENV = {};
let handler = null;
globalThis.Deno = { env: { get: (k) => ENV[k], toObject: () => ({ ...ENV }) }, serve: (h) => { handler = h; } };
const whsec = 'whsec_' + Buffer.from('status-check-test-secret-32bytes!').toString('base64');
const sign = (id, ts, body) => createHmac('sha256', Buffer.from(whsec.slice(6), 'base64')).update(`${id}.${ts}.${body}`).digest('base64');
const DB = { mail: [], inbox: [] };
const CALLS = [];
let failPatch = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)), method = init.method ?? 'GET';
  CALLS.push(method + ' ' + u.host + u.pathname);
  const res = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
  if (u.pathname.endsWith('/dialboard_status_probe_mail') && method === 'PATCH') {
    if (failPatch) return res({ message: 'db down' }, 503);
    const tok = decodeURIComponent((u.searchParams.get('token') || '').slice(3));
    const row = DB.mail.find((m) => m.token === tok && m.arrived_at == null && u.searchParams.get('arrived_at') === 'is.null');
    if (row) Object.assign(row, JSON.parse(init.body));
    return res([]);
  }
  if (u.host === 'api.resend.com') {
    if (u.pathname.startsWith('/emails/receiving/')) return res({ object: 'email', id: 'x', from: 'someone@example.com', to: ['hello@dialboard.io'], subject: 'Hi', text: 'Hello', headers: {}, attachments: [], authentication: { dmarc: 'pass' }, created_at: '2026-11-25T15:00:00Z' });
    if (u.pathname === '/emails') return res({ id: 're_1' });
    return res({}, 404);
  }
  if (u.pathname.endsWith('/dialboard_support_inbox')) {
    if (method === 'POST') { const row = JSON.parse(init.body); DB.inbox.push(row); return res([row]); }
    if (method === 'PATCH') return res([]);
    return res([]);
  }
  if (u.pathname.endsWith('/dialboard_desk_days_off')) return res([]);
  if (u.pathname.endsWith('/dialboard_email_log')) return res(method === 'POST' ? [JSON.parse(init.body)] : []);
  return res([]);
};
Object.assign(ENV, { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-test', RESEND_API_KEY: 're_test_fake', RESEND_INBOUND_WEBHOOK_SECRET: whsec, APP_URL: 'https://dialboard.io', SUPPORT_FORWARD_TO: 'founder@example.test' });
await import(path.join(MF, 'dialboard-support-inbound/index.ts'));
const SC = await import(path.join(MF, '_shared/status-check.ts'));
ok(typeof handler === 'function', 'the patched function loads');

let n = 0;
async function deliver(data, { good = true } = {}) {
  const id = 'sc' + (++n);
  const b = JSON.stringify({ type: 'email.received', created_at: '2026-11-25T15:00:01Z', data: { email_id: id, from: 'hello@dialboard.io', ...data } });
  const ts = String(Math.floor(Date.now() / 1000));
  const h = new Headers({ 'svix-id': 'msg_' + id, 'svix-timestamp': ts, 'svix-signature': 'v1,' + (good ? sign('msg_' + id, ts, b) : 'AAAA') });
  CALLS.length = 0;
  const r = await handler(new Request('https://fake/functions/v1/dialboard-support-inbound', { method: 'POST', headers: h, body: b }));
  return { status: r.status, body: await r.json().catch(() => null), calls: [...CALLS] };
}

const tok = SC.newStatusToken();
ok(SC.STATUS_TOKEN_RE.test(tok) && SC.statusSubject(tok) === 'Dialboard status check ' + tok, 'tokens look like DBSC- and 32 hex: ' + tok);
DB.mail.push({ token: tok, sent_at: '2026-11-25T15:00:00Z', arrived_at: null, send_ok: true });
const inbox0 = DB.inbox.length;
let d = await deliver({ to: ['status-check@dialboard.io'], subject: SC.statusSubject(tok) });
ok(d.status === 200 && d.body.status_check === true, 'the status email: 200 {status_check: true}', d.body);
ok(DB.mail[0].arrived_at && Date.now() - Date.parse(DB.mail[0].arrived_at) < 5000, 'its arrival time is recorded');
ok(DB.inbox.length === inbox0, 'nothing stored in the support inbox (no note)');
ok(!d.calls.some((c) => c.includes('api.resend.com')), 'Resend never asked: no reading the message, no reply, no forward', d.calls);
ok(d.calls.length === 1 && d.calls[0] === 'PATCH fake.supabase.co/rest/v1/dialboard_status_probe_mail', 'exactly one call: the arrival', d.calls);
const first = DB.mail[0].arrived_at;
d = await deliver({ to: ['status-check@dialboard.io'], subject: SC.statusSubject(tok) });
ok(d.status === 200 && DB.mail[0].arrived_at === first, 'delivered twice (a Resend retry): the first arrival time stays');
d = await deliver({ to: ['Status-Check@Dialboard.io'], subject: 'Re: ' + SC.statusSubject(SC.newStatusToken()) });
ok(d.status === 200 && d.body.status_check === true && DB.inbox.length === inbox0, 'a made-up token: nothing recorded, nothing else either');
d = await deliver({ to: ['status-check@dialboard.io', 'hello@dialboard.io'], subject: SC.statusSubject(tok) }, {});
ok(!d.body?.status_check && DB.inbox.length === inbox0 + 1, 'also sent to hello@: handled exactly as today (stored, a note)', d.body);
d = await deliver({ to: ['status-check@dialboard.io'], subject: 'Hello there' });
ok(!d.body?.status_check && DB.inbox.length === inbox0 + 2, 'to status-check@ without a token: handled exactly as today', d.body);
d = await deliver({ to: ['hello@dialboard.io'], subject: SC.statusSubject(tok) });
ok(!d.body?.status_check, 'a token in a mail to hello@: handled exactly as today');
d = await deliver({ to: ['status-check@dialboard.io'], subject: SC.statusSubject(tok) }, { good: false });
ok(d.status === 400, 'a bad signature is still refused first');
failPatch = true;
const inbox1 = DB.inbox.length;
DB.mail.push({ token: SC.newStatusToken(), sent_at: '2026-11-25T16:00:00Z', arrived_at: null, send_ok: true });
d = await deliver({ to: ['status-check@dialboard.io'], subject: SC.statusSubject(DB.mail[1].token) });
ok(d.status === 500 && DB.inbox.length === inbox1, 'the database can’t record it: 500 so Resend tries again, and still no note');
failPatch = false;
ok(SC.statusCheckToken(['status-check@dialboard.io'], [], 'x DBSC-' + 'A'.repeat(32)) === null, 'upper-case or wrong-length tokens are not the status email');
globalThis.fetch = realFetch;

fs.rmSync(M, { recursive: true, force: true });
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
