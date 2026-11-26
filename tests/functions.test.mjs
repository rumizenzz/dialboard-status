// The status site's functions (subscribe, confirm, unsubscribe, notify + watchdog) with an in-memory store and captured
// emails. Nothing is sent anywhere. node tests/functions.test.mjs
import { memoryStore } from '../netlify/functions/lib/store.mjs';

process.env.SUBSCRIBE_SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
process.env.ALERT_TO = 'founder@example.test';
const mem = memoryStore();
globalThis.__statusStore = mem;
let outbox = [];
globalThis.__statusSend = async (msgs, key) => { outbox.push(...msgs.map((m) => ({ ...m, key }))); return true; };
let published = null;
globalThis.__statusData = async () => published;

const subscribe = (await import('../netlify/functions/subscribe.mjs')).default;
const confirm = (await import('../netlify/functions/confirm.mjs')).default;
const unsubscribe = (await import('../netlify/functions/unsubscribe.mjs')).default;
const { notifyOnce } = await import('../netlify/functions/notify.mjs');
const { step, outputs } = await import('../checker/engine.mjs');
const { ALL_OK, SERVICES_OK } = await import('./scenarios.mjs');

let pass = 0, fail = 0;
const ok = (c, name, got) => { if (c) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (got !== undefined ? ' :: ' + JSON.stringify(got) : '')); } };
const post = (fn, url, body, ip = '203.0.113.7', type = 'application/json') => fn(new Request('https://status.dialboard.io' + url, { method: 'POST', headers: { 'content-type': type }, body: typeof body === 'string' ? body : JSON.stringify(body) }), { ip });
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });

console.log('subscribe (double opt-in)');
ok((await j(await post(subscribe, '/api/subscribe', { email: 'not an email' }))).status === 400, 'a bad address is refused');
ok((await j(await post(subscribe, '/api/subscribe', { email: 'bot@example.com', website: 'spam' }))).body.ok && outbox.length === 0, 'the hidden field filled: a calm yes, nothing sent');
let r = await j(await post(subscribe, '/api/subscribe', { email: '  Rep@Example.com ' }));
ok(r.status === 200 && r.body.ok, 'a real address: ok');
ok(outbox.length === 1 && outbox[0].to[0] === 'rep@example.com' && outbox[0].subject === 'Confirm your Dialboard status emails', 'one confirmation email, to the lower-cased address', outbox[0] && outbox[0].subject);
const link = /https:\/\/status\.dialboard\.io\/confirm\?t=([^"\s]+)/.exec(outbox[0].text);
ok(!!link, 'it carries the confirm link');
ok(!outbox[0].headers, 'the confirmation has no unsubscribe header (nothing to stop yet)');
const keys = [...mem.m.keys()].filter((k) => k.startsWith('sub/'));
ok(keys.length === 1 && !keys[0].includes('rep') && JSON.parse(mem.m.get(keys[0])).state === 'pending', 'stored as pending, under a keyed id (not the address)');
await post(subscribe, '/api/subscribe', { email: 'rep@example.com' });
ok(outbox.length === 1, 'asking again within 10 minutes sends nothing more');
ok((await j(await post(subscribe, '/api/subscribe', { email: 'rep@example.com' }))).body.ok, 'and answers the same (nobody can tell who signed up)');
for (let i = 0; i < 2; i++) await post(subscribe, '/api/subscribe', { email: 'x' + i + '@example.com' }, '203.0.113.7');
const sixth = await post(subscribe, '/api/subscribe', { email: 'x9@example.com' }, '203.0.113.7');
ok(sixth.status === 429, 'the 6th sign-up from one browser address in a day is refused');

console.log('confirm');
ok((await j(await post(confirm, '/api/confirm', { t: ((s) => s.slice(0, -1) + (s.endsWith('A') ? 'B' : 'A'))(decodeURIComponent(link[1])) }))).status === 400, 'a changed token is refused');
ok((await j(await post(confirm, '/api/confirm', { t: decodeURIComponent(link[1]) }))).body.ok, 'the real token confirms');
ok(JSON.parse(mem.m.get(keys[0])).state === 'active', 'now active');
ok((await j(await post(confirm, '/api/confirm', { t: decodeURIComponent(link[1]) }))).body.ok, 'tapping it twice is fine');
const getC = await confirm(new Request('https://status.dialboard.io/api/confirm?t=' + link[1]));
ok(getC.status === 405, 'GET never confirms (mail scanners open links)');

console.log('notify: 10 minutes, then fixed');
const T0 = Date.now() - 60 * 60000;
let S = null;
const run = (i, save) => { S = step(S, { at: T0 + i * 300000, offline: false, services: SERVICES_OK, parts: { ...ALL_OK(), save: { v: save, ms: 900 } } }).state; published = outputs(S, S.last_run_at); return S.last_run_at; };
outbox = [];
run(0, 'ok'); run(1, 'fail'); let now = run(2, 'fail');
await notifyOnce(now);
ok(outbox.length === 0, 'down 5 minutes: no email yet');
now = run(3, 'fail');
let res = await notifyOnce(now);
ok(res.sent.length === 1 && outbox.length === 1, 'down 10 minutes: one email to the one confirmed subscriber', res);
const m = outbox[0];
ok(m.to[0] === 'rep@example.com' && m.subject === 'Saving to your account isn’t working right now', 'subject', m.subject);
ok(m.text.includes('We noticed at') && m.text.includes(' ET and we’re on it.') && m.text.includes('We’ll email you again when it’s fixed.'), 'body: the fixed words, in ET');
ok(m.headers && m.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click' && /^<https:\/\/status\.dialboard\.io\/api\/unsubscribe\?t=/.test(m.headers['List-Unsubscribe']), 'one-click unsubscribe headers');
ok(/https:\/\/status\.dialboard\.io\/unsubscribe\?t=/.test(m.html) && m.html.includes('Stop these emails'), 'and a "Stop these emails" link in the email');
ok(m.from === 'Dialboard Status <status@dialboard.io>' && m.reply_to === 'hello@dialboard.io', 'from status@, replies to hello@');
ok(!outbox.some((x) => x.to[0].startsWith('x')), 'never to someone who didn’t confirm');
now = run(4, 'fail');
await notifyOnce(now);
ok(outbox.length === 1, 'never twice');
run(5, 'ok'); now = run(6, 'ok');
res = await notifyOnce(now);
ok(outbox.length === 2 && outbox[1].subject === 'Fixed: Saving to your account', 'fixed: one more email', outbox[1] && outbox[1].subject);
ok(outbox[1].text.includes('It was down for 20 min.'), 'it says how long', outbox[1].text.split('\n').find((l) => l.startsWith('Fixed')));
await notifyOnce(now + 300000);
ok(outbox.length === 2, 'and nothing after');

console.log('notify: slow never emails');
outbox = []; S = null;
run(0, 'ok'); run(1, 'slow'); run(2, 'slow'); run(3, 'slow'); run(4, 'slow'); now = run(5, 'slow');
await notifyOnce(now);
ok(outbox.length === 0, 'slow for 20 minutes: no email');

console.log('unsubscribe');
const tok = new URL(m.headers['List-Unsubscribe'].slice(1, -1)).searchParams.get('t');
const bad = await post(unsubscribe, '/api/unsubscribe?t=' + tok.slice(0, -2) + (tok.endsWith('zz') ? 'yy' : 'zz'), 'List-Unsubscribe=One-Click', '1.1.1.1', 'application/x-www-form-urlencoded');
ok(bad.status === 400, 'a changed link does nothing');
const one = await post(unsubscribe, '/api/unsubscribe?t=' + encodeURIComponent(tok), 'List-Unsubscribe=One-Click', '1.1.1.1', 'application/x-www-form-urlencoded');
ok(one.status === 200, 'the mail app’s one-click POST: 200');
ok(![...mem.m.keys()].some((k) => k === keys[0]), 'the address is deleted, not just switched off');
const g = await unsubscribe(new Request('https://status.dialboard.io/api/unsubscribe?t=' + encodeURIComponent(tok)));
ok(g.status === 303 && g.headers.get('location').startsWith('/unsubscribe?t='), 'GET goes to the page (which does the POST)');
outbox = []; S = null;
run(0, 'ok'); run(1, 'fail'); run(2, 'fail'); now = run(3, 'fail');
await notifyOnce(now);
ok(outbox.length === 0, 'after unsubscribing: nothing');

console.log('watchdog');
outbox = [];
published = { ...published, generated_at: Date.now() - 31 * 60000 };
res = await notifyOnce(Date.now());
ok(res.watchdog === 'stale' && outbox.length === 1 && outbox[0].to[0] === 'founder@example.test' && /hasn’t reported since/.test(outbox[0].subject), 'no results for 30 min: one email to the founder', outbox.map((x) => x.subject));
await notifyOnce(Date.now() + 300000);
ok(outbox.length === 1, 'only once');
published = { ...published, generated_at: Date.now() };
res = await notifyOnce(Date.now());
ok(res.watchdog === 'back' && outbox.length === 2 && outbox[1].subject === 'Status checker is reporting again', 'and one when it’s back');
published = null;
res = await notifyOnce(Date.now());
ok(res.watchdog === 'stale' && res.sent.length === 0, 'data unreadable: counted as stale, no subscriber emails');

console.log('tidy');
mem.m.set('sub/old', JSON.stringify({ email: 'old@example.com', state: 'pending', created: Date.now() - 8 * 86400000, sent: 0 }));
await notifyOnce(Date.now());
ok(!mem.m.has('sub/old'), 'unconfirmed sign-ups are deleted after 7 days');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
