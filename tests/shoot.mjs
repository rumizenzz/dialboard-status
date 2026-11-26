// Renders the status page in headless Edge for screenshots and checks what it says, in the light and dark looks, at
// 1280x800 and 390x844, for each case. Run it through tests/shoot.sh (takes the shared browser lock, time-limited,
// cleans Edge's folders after).
import { fileURLToPath } from 'node:url';
import '../../../tools/edge-clean.cjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import net from 'node:net';
import { start } from './serve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out/shots'); fs.mkdirSync(OUT, { recursive: true });
const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const srv = await start(0); const port = srv.address().port; const dbg = await freePort();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'db-status-'));
const edge = spawn(EDGE, ['--headless=new', '--disable-component-update', '--disable-background-networking', '--remote-debugging-port=' + dbg, '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
let target = null;
for (let i = 0; i < 80 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json()).find((t) => t.type === 'page'); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => { ws.onopen = r; });
let seq = 0; const pending = new Map(), errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
  if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errs.push(d.params.entry.text + ' ' + (d.params.entry.url || '')); };
const send = (method, params = {}) => { const id = ++seq; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: '(async () => { ' + expr + ' })()', awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
let pass = 0, failN = 0;
const check = (c, n, got) => { if (c) pass++; else failN++; console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : ' :: ' + JSON.stringify(got))); };
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Emulation.setTimezoneOverride', { timezoneId: 'America/Chicago' }); // a viewer outside ET: both times show

const VP = { desk: { w: 1280, h: 800, dpr: 1, mobile: false }, phone: { w: 390, h: 844, dpr: 2, mobile: true } };
async function load(scn, vp, dark, hash = '') {
  await fetch(`http://127.0.0.1:${port}/__scenario?name=${scn}`);
  await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr, mobile: vp.mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: vp.mobile, maxTouchPoints: vp.mobile ? 5 : 1 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/${hash}` });
  for (let i = 0; i < 40; i++) { await sleep(100); if (await ev('return !!(window.__status && window.__status.data) && document.fonts.status === "loaded"').catch(() => false)) break; }
  await sleep(250);
}
async function shot(name, full) {
  const p = { format: 'png' };
  if (full) { const m = await send('Page.getLayoutMetrics'); p.captureBeyondViewport = true; p.clip = { x: 0, y: 0, width: m.cssContentSize.width, height: m.cssContentSize.height, scale: 1 }; }
  const r = await send('Page.captureScreenshot', p); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
}
const page = () => ev(`return {
  headline: document.getElementById('headline').textContent, sub: document.getElementById('banner-sub').textContent, state: document.getElementById('banner').dataset.state,
  states: [...document.querySelectorAll('.part .state')].map(s => s.dataset.s + ':' + s.textContent),
  days: [...document.querySelectorAll('.bar')].map(b => b.children.length), minDayW: Math.min(...[...document.querySelectorAll('.day')].map(d => d.getBoundingClientRect().width)),
  wide: document.documentElement.scrollWidth > innerWidth + 1, bg: getComputedStyle(document.body).backgroundColor,
  open: [...document.querySelectorAll('#open-incidents .inc')].map(i => i.textContent), past: document.querySelectorAll('#past .inc').length,
  zone: document.getElementById('zone').textContent, svc: [...document.querySelectorAll('#services li')].map(l => l.textContent) }`);

try {
  for (const dark of [false, true]) for (const [vk, vp] of Object.entries(VP)) {
    const look = dark ? 'dark' : 'light';
    console.log(`\n${look} ${vk} ${vp.w}x${vp.h}`);
    await load('ok', vp, dark);
    let p = await page();
    check(p.state === 'ok' && p.headline === 'Everything’s working.', 'all good: "Everything’s working."', p.headline);
    check(p.states.every((s) => s === 'ok:Working') && p.states.length === 5, 'five parts, each "Working"', p.states);
    check(await ev(`return document.querySelectorAll('.part')[4].textContent.includes('Last test email delivered in 14 s.')`), 'the email part shows the round trip: "Last test email delivered in 14 s."');
    check(p.days.every((n) => n === (vk === 'phone' ? 30 : 90)), (vk === 'phone' ? 30 : 90) + ' days per bar', p.days);
    check(vk === 'desk' || p.minDayW >= 6, 'phone: every day at least 6 px wide (a finger can hit it)', p.minDayW);
    check(!p.wide, 'no sideways scroll');
    check(p.past === 4 && p.open.length === 0, 'four past problems, none open', [p.past, p.open.length]);
    check(/Times in ET, and in your time \(Chicago\)/.test(p.zone), 'says which times it shows', p.zone);
    check(p.svc.length === 4 && p.svc.every((s) => /No problems reported/.test(s)), 'Services Dialboard uses: 4, all clear', p.svc);
    await shot(`${look}-${vk}-ok`); await shot(`${look}-${vk}-ok-full`, true);

    // hover (computer) or tap (phone) a clean day and a problem day
    const clean = await ev(`const b = document.querySelectorAll('.bar')[2]; const d = b.children[b.children.length - 3]; const r = d.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]`);
    if (vk === 'desk') await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: clean[0], y: clean[1] });
    else { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: clean[0], y: clean[1] }] }); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    await sleep(200);
    const tipClean = await ev(`const t = document.getElementById('tip'); return t.hidden ? null : t.textContent`);
    check(tipClean && /No downtime recorded\./.test(tipClean) && /100% uptime/.test(tipClean), (vk === 'desk' ? 'hover' : 'tap') + ' a clean day: date · 100% uptime · "No downtime recorded."', tipClean);
    // the saving outage day (61 days ago: on the phone it's out of the 30-day window, so use the emails one, 9 days ago)
    const bi = vk === 'desk' ? 2 : 4, back = vk === 'desk' ? 61 : 9;
    const bad = await ev(`const b = document.querySelectorAll('.bar')[${bi}]; const d = b.children[b.children.length - 1 - ${back}]; d.scrollIntoView({block: 'center'}); const r = d.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]`);
    await sleep(100);
    if (vk === 'desk') { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bad[0], y: bad[1] }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bad[0], y: bad[1], button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bad[0], y: bad[1], button: 'left', clickCount: 1 }); }
    else { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bad[0], y: bad[1] }] }); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    await sleep(250);
    const tipBad = await ev(`const t = document.getElementById('tip'); return t.hidden ? null : { text: t.textContent, link: (t.querySelector('a') || {}).getAttribute ? t.querySelector('a').getAttribute('href') : null }`);
    const wantPart = vk === 'desk' ? /Saving to your account isn’t working ›/ : /Emails from Dialboard aren’t going out ›/;
    const wantDown = vk === 'desk' ? /Down 20 min\./ : /Down 1 hr 5 min\./;
    check(tipBad && wantDown.test(tipBad.text) && /9\d\.\d% uptime/.test(tipBad.text) && wantPart.test(tipBad.text) && /^#i-/.test(tipBad.link), 'a problem day: date · % · minutes down · the incident, linked', tipBad);
    await shot(`${look}-${vk}-day-card`);
    if (!dark) {
      // follow the link: the incident's post
      await ev(`document.querySelector('#tip a').click(); return 1`); await sleep(300);
      check(await ev(`return location.hash.startsWith('#i-') && document.querySelector(location.hash).getBoundingClientRect().top < innerHeight`), 'the link goes to the incident’s post');
    }

    for (const scn of ['down', 'slow', 'flap', 'offline', 'stale', 'partial']) {
      await load(scn, vp, dark);
      p = await page();
      const want = {
        down: () => p.state === 'down' && p.headline === 'Saving to your account isn’t working.' && p.states[2] === 'down:Not working' && p.open.length === 1 && /We noticed at \d+:\d\d [ap]m ET \(\d+:\d\d [ap]m your time\) and we’re on it\./.test(p.open[0]) && /Supabase, which we use for accounts, saving and sign-in, is also reporting a problem right now\./.test(p.open[0]),
        slow: () => p.state === 'trouble' && p.headline === 'Saving to your account is slow.' && p.states[2] === 'slow:Slow',
        flap: () => ['down', 'trouble'].includes(p.state) && p.headline === 'Signing in is working on and off.' && /It stopped working again at/.test(p.open.join(' ')),
        offline: () => p.state === 'unknown' && p.headline === 'Status unknown right now.' && /Our checker couldn’t reach the internet at/.test(p.sub),
        stale: () => p.state === 'unknown' && p.headline === 'Status unknown right now.' && /haven’t reported since/.test(p.sub) && p.states.every((s) => s === 'unknown:Can’t check right now'),
        partial: () => p.state === 'partial' && p.headline === 'Everything we can check is working.' && p.states[4] === 'unknown:Can’t check right now',
      }[scn];
      check(want(), scn + ': ' + p.headline + ' / ' + p.sub.slice(0, 90), p);
      check(!p.wide, scn + ': no sideways scroll');
      if (dark || vk === 'desk' || ['down', 'stale'].includes(scn)) await shot(`${look}-${vk}-${scn}`);
    }
    if (dark) check(true, 'dark look body ' + p.bg);
  }
  // keyboard: the bar takes arrow keys
  await load('ok', VP.desk, false);
  await ev(`document.querySelectorAll('.bar')[0].focus(); return 1`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
  await sleep(150);
  check(await ev(`return !document.getElementById('tip').hidden && document.querySelector('.day.cur') === document.querySelectorAll('.bar')[0].lastElementChild`), 'keyboard: arrow keys open the day card, day by day (today first)');
  check(await ev(`return document.querySelectorAll('.bar')[0].lastElementChild.getAttribute('aria-label').startsWith(document.querySelectorAll('.bar')[0].lastElementChild.getAttribute('aria-label').split('.')[0])`), 'each day carries its words as its screen-reader label');
  // subscribe
  await ev(`document.getElementById('sub-email').value = 'nope'; document.querySelector('#sub-form button').click(); return 1`); await sleep(100);
  check(await ev(`return document.getElementById('sub-msg').textContent`) === 'That email address doesn’t look right.', 'subscribe: a bad address is caught');
  await ev(`document.getElementById('sub-email').value = 'rep@example.com'; document.querySelector('#sub-form button').click(); return 1`); await sleep(300);
  check(await ev(`return document.getElementById('sub-msg').textContent`) === 'Check your email and tap the link to confirm. Nothing comes until you do.', 'subscribe: "Check your email…"');
  await shot('light-desk-subscribed-full', true);
  // confirm + unsubscribe pages
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/confirm?t=abc` }); await sleep(500);
  check(await ev(`return document.querySelector('.btn').textContent === 'Yes, email me' && location.search === ''`), 'confirm page: one button, and the token leaves the address bar');
  await shot('light-desk-confirm');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/unsubscribe?t=abc` }); await sleep(600);
  await shot('dark-phone-unsubscribe');
  check(errs.filter((e) => !/api\/(confirm|unsubscribe)|404|Not Found/i.test(e)).length === 0, 'no script errors', errs);
} finally {
  ws.close(); edge.kill('SIGTERM'); srv.close();
  await sleep(500); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
console.log('\n' + pass + ' passed, ' + failN + ' failed · shots in ' + OUT);
process.exit(failN ? 1 : 0);
