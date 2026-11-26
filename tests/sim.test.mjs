// The engine under the five cases the founder named (good, slow, down, flapping, checker offline) plus the edges, and
// what the page, the emails and the RSS feed would SAY in each. node tests/sim.test.mjs
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { step, outputs, midnight, ymdOf, lastDays, RUN_MS } from '../checker/engine.mjs';
import { incidentLines, incidentTitle, etTime, pct, dur, W, PARTS, fill } from '../site/words.js';
import { feed } from '../checker/rss.mjs';
import { dueFor } from '../netlify/functions/lib/due.mjs';
import { simulate, ALL_OK, SERVICES_OK, history } from './scenarios.mjs';
import { emailVerdict } from '../checker/checks.mjs';

let pass = 0, fail = 0;
const ok = (c, name, got) => { if (c) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (got !== undefined ? ' :: ' + JSON.stringify(got) : '')); } };
const M = 60000;
const T0 = Date.UTC(2026, 10, 24, 19, 0); // Tue Nov 24 2026, 2:00 pm ET
const et = (ts) => etTime(ts);
const runs = (S, list) => { let s = S; const ev = []; list.forEach((r, i) => { const x = step(s, { at: T0 + i * RUN_MS, offline: false, services: SERVICES_OK, ...r }); s = x.state; ev.push(...x.events.map((e) => ({ i, ...e }))); }); return { S: s, ev }; };
const with_ = (id, v, ms = 900) => ({ parts: { ...ALL_OK(), [id]: { v, ms } } });
const good = () => ({ parts: ALL_OK() });

console.log('time in ET');
ok(ymdOf(T0) === '2026-11-24', 'Nov 24 2:00 pm ET is Nov 24');
ok(midnight('2026-11-24') === Date.UTC(2026, 10, 24, 5), 'ET midnight in November is 05:00 UTC');
ok(midnight('2026-07-04') === Date.UTC(2026, 6, 4, 4), 'ET midnight in July is 04:00 UTC');
ok((midnight('2026-11-02') - midnight('2026-11-01')) / M === 1500, 'the day the clocks go back has 25 hours');
ok((midnight('2026-03-09') - midnight('2026-03-08')) / M === 1380, 'the day the clocks go forward has 23 hours');
ok(lastDays(T0, 90).length === 90 && lastDays(T0, 90)[89] === '2026-11-24', '90 days end today');
ok(et(T0) === '2:00 pm ET', 'times read "2:00 pm ET"', et(T0));
ok(etTime(T0, 'Europe/Rome') === '2:00 pm ET (8:00 pm your time)', 'and add the viewer’s own time when it differs', etTime(T0, 'Europe/Rome'));

console.log('honest numbers');
ok(pct(1, 1) === '100%', '100% only when nothing was down');
ok(pct(1 - 1 / 1440, 1) === '99.9%', '1 min down in a day reads 99.9%, never 100%', pct(1 - 1 / 1440, 1));
ok(pct(1 - 17 / 1440, 1) === '98.8%', '17 min down reads 98.8%');
ok(pct(0.99996, 2) === '99.99%', 'bar % rounds down at two decimals');
ok(dur(65) === '1 hr 5 min' && dur(17) === '17 min' && dur(0.4) === 'less than 1 min', 'durations in plain words');

console.log('1. good');
{
  const { S, ev } = runs(null, Array.from({ length: 12 }, good));
  const o = outputs(S, S.last_run_at);
  ok(o.overall === 'ok' && o.parts.every((p) => p.state === 'ok'), 'all five parts Working, banner "Everything’s working."');
  ok(!o.incidents.length && !ev.length, 'no incidents');
  const today = o.history.save[89];
  ok(today.down === 0 && today.checked === 55 && today.none > 0, 'today counts only the minutes actually checked', today);
}

console.log('2. slow');
{
  const { S, ev } = runs(null, [good(), with_('save', 'slow', 5200), good(), with_('save', 'slow', 5200), with_('save', 'slow', 5200), with_('save', 'slow', 5200), good(), good(), good()]);
  const slowEv = ev.filter((e) => e.e === 'slow');
  ok(slowEv.length === 1 && slowEv[0].i === 4, 'one slow run never shows; two in a row open a Slow notice (at the 2nd)', slowEv);
  const inc = outputs(S, S.last_run_at).incidents[0];
  ok(inc && inc.kind === 'slow' && inc.started === T0 + 3 * RUN_MS, 'Slow starts at the first slow run of the streak');
  ok(inc.resolved === T0 + 6 * RUN_MS, 'back to normal after 2 good runs, from the first of them');
  const o = outputs(S, S.last_run_at);
  ok(o.totals.save === 1, 'slow time never lowers the uptime');
  ok(o.history.save[89].slow === 15, 'but the day shows 15 slow minutes', o.history.save[89]);
  ok(dueFor(inc, null, S.last_run_at + 20 * M) === null, 'slow never emails');
  const lines = incidentLines(inc, et, S.last_run_at);
  ok(lines[0] === 'Saving to your account got slower than usual at 2:15 pm ET.', 'slow words', lines);
  ok(lines[1] === 'Back to normal at 2:30 pm ET. Saving is at its usual speed again.', 'back-to-normal words', lines[1]);
}

console.log('3. down');
{
  const list = [good(), good(), with_('save', 'fail'), with_('save', 'fail'), with_('save', 'fail'), with_('save', 'fail'), good(), good(), good()];
  const { S, ev } = runs(null, list);
  const d = ev.find((e) => e.e === 'down');
  ok(d && d.i === 3, 'down only at the 2nd failed run in a row', d);
  const inc = outputs(S, S.last_run_at).incidents[0];
  ok(inc.started === T0 + 2 * RUN_MS, '"We noticed at" is the first failed run (2:10 pm)');
  ok(inc.resolved === T0 + 6 * RUN_MS && inc.downMin === 20, 'fixed at the first of 2 good runs; 20 min down', [inc.resolved, inc.downMin]);
  const lines = incidentLines(inc, et, S.last_run_at);
  ok(lines[0] === 'Saving to your account stopped working at 2:10 pm ET.', 'fixed incident, past words', lines[0]);
  const openLines = incidentLines(outputs(runs(null, list.slice(0, 5)).S, T0 + 4 * RUN_MS).incidents[0], et, T0 + 4 * RUN_MS);
  ok(openLines[0] === 'Saving to your account isn’t working right now. Your board keeps your changes on this device until it can save. We noticed at 2:10 pm ET and we’re on it.', 'open incident, present words', openLines[0]);
  ok(lines[1] === 'Fixed at 2:30 pm ET. Saving to your account is working again. It was down for 20 min. Changes you made during the problem save the next time your board is open.', 'fixed words', lines[1]);
  ok(incidentTitle(inc) === 'Saving to your account isn’t working', 'title');
  const o = outputs(S, S.last_run_at);
  ok(o.history.save[89].down === 20 && o.history.save[89].inc[0] === inc.id, 'the day bar: 20 min down, linked to the incident');
  ok(pct(o.history.save[89].up, 1) !== '100%', 'and never 100%');
  // mid-incident, page and banner
  const mid = runs(null, list.slice(0, 5)).S;
  const om = outputs(mid, mid.last_run_at);
  ok(om.overall === 'trouble' && om.parts.find((p) => p.id === 'save').state === 'down', 'while down: the part reads Not working, the banner "some trouble"');
  ok(fill(W.bannerTroubleOne, { title: incidentTitle(om.incidents[0]) }) === 'Saving to your account isn’t working.', 'banner words');
  // emails
  const open = om.incidents[0];
  ok(dueFor(open, null, open.started + 9 * M) === null, 'no email at 9 minutes');
  ok(dueFor(open, null, open.started + 10 * M) === 'start', 'first email at 10 minutes');
  ok(dueFor(open, { start: [1], fixed: [] }, open.started + 15 * M) === null, 'never twice');
  ok(dueFor(inc, { start: [1], fixed: [] }, inc.resolved + M) === 'fixed', 'then one "fixed" email');
  ok(dueFor(inc, { start: [1], fixed: [2] }, inc.resolved + M) === null, 'and nothing after');
  // a short problem: shown, never emailed
  const short = runs(null, [good(), with_('pay', 'fail'), with_('pay', 'fail'), good(), good()]).S;
  const si = outputs(short, short.last_run_at).incidents[0];
  ok(si && si.resolved && si.downMin === 10 && dueFor(si, null, si.resolved + M) === 'fixed', '10 min down fixed before the email went: one "fixed" email that says both');
  const one = runs(null, [good(), with_('open', 'fail'), good(), good()]).S;
  ok(!outputs(one, one.last_run_at).incidents.length, 'a single failed run is never shown');
  // Opening Dialboard down = "Dialboard is down right now."
  const big = runs(null, [good(), with_('open', 'fail'), with_('open', 'fail')]).S;
  ok(outputs(big, big.last_run_at).overall === 'down', 'Opening Dialboard down: the banner says "Dialboard is down right now."');
  // soft: only the full check fails
  const soft = runs(null, [good(), with_('signin', 'soft'), with_('signin', 'soft'), with_('signin', 'soft')]);
  ok(!soft.ev.some((e) => e.e === 'down'), 'full check failing alone, 3 runs: not shown (the plain check disagrees)');
  const s4 = runs(null, [good(), with_('signin', 'soft'), with_('signin', 'soft'), with_('signin', 'soft'), with_('signin', 'soft')]);
  ok(s4.ev.some((e) => e.e === 'down' && e.i === 4), '4 runs in a row (20 min): shown as down (DRAFT rule)');
  // outside service: the reason is added, never the trigger
  const prov = runs(null, [{ ...good(), services: SERVICES_OK.map((s) => (s.id === 'supabase' ? { ...s, indicator: 'major' } : s)) }]).S;
  ok(outputs(prov, prov.last_run_at).overall === 'ok', 'Supabase reporting a big problem alone changes nothing on our parts');
  const prov2 = runs(null, [good(), with_('save', 'fail'), { ...with_('save', 'fail'), services: SERVICES_OK.map((s) => (s.id === 'supabase' ? { ...s, indicator: 'major' } : s)) }]).S;
  const pi = outputs(prov2, prov2.last_run_at).incidents[0];
  ok(pi.providers.includes('supabase') && incidentLines(pi, et).includes('Supabase, which we use for accounts, saving and sign-in, is also reporting a problem right now.'), 'with our own failure, the provider line is added');
  // a 30-minute one says "still working on it"
  const long = runs(null, [good(), ...Array.from({ length: 8 }, () => with_('email', 'fail'))]).S;
  const li = outputs(long, long.last_run_at).incidents[0];
  ok(incidentLines(li, et, long.last_run_at).some((l) => l.startsWith('Still working on it.')), 'after 30 minutes: "Still working on it."');
}

console.log('4. flapping');
{
  const pat = [good()];
  for (let k = 0; k < 4; k++) pat.push(with_('signin', 'fail'), with_('signin', 'fail'), good(), good());
  const { S, ev } = runs(null, pat);
  const o = outputs(S, S.last_run_at);
  const incs = o.incidents.filter((i) => i.part === 'signin');
  ok(incs.length === 1, 'down and up 4 times in an hour: ONE incident', incs.length);
  ok(incs[0].flap && incidentTitle(incs[0]) === 'Signing in is working on and off', 'titled "on and off"');
  ok(incs[0].updates.filter((u) => u.t === 'again').length === 3, 'with "It stopped working again at …" 3 times');
  ok(incs[0].downMin === 40, 'and 40 minutes down in all', incs[0].downMin);
  let led = { start: [], fixed: [] }, sent = [];
  // walk the published states run by run and count emails
  let s = null;
  pat.forEach((r, i) => {
    s = step(s, { at: T0 + i * RUN_MS, offline: false, services: SERVICES_OK, ...r }).state;
    for (const inc of outputs(s, T0 + i * RUN_MS).incidents) { const d = dueFor(inc, led, T0 + i * RUN_MS); if (d) { led[d].push(i); sent.push(d); } }
  });
  ok(sent.join(',') === 'start,fixed,start,fixed', 'down 4 times in an hour: at most 2 "not working" emails, each answered by "fixed" (no storm)', sent);
  const pat2 = [good()];
  for (let k = 0; k < 4; k++) pat2.push(with_('signin', 'fail'), with_('signin', 'fail'), with_('signin', 'fail'), good(), good());
  led = { start: [], fixed: [] }; sent = []; s = null;
  pat2.forEach((r, i) => {
    s = step(s, { at: T0 + i * RUN_MS, offline: false, services: SERVICES_OK, ...r }).state;
    for (const inc of outputs(s, T0 + i * RUN_MS).incidents) { const d = dueFor(inc, led, T0 + i * RUN_MS); if (d) { led[d].push(i); sent.push(d); } }
  });
  ok(sent.join(',') === 'start,fixed,start,fixed', '15-minute spells 4 times: at most 2 "not working" emails, each answered', sent.join(','));
}

console.log('5. checker offline');
{
  const { S, ev } = runs(null, [good(), { offline: true }, { offline: true }, { offline: true }, good()]);
  const mid = runs(null, [good(), { offline: true }]).S;
  const om = outputs(mid, mid.last_run_at);
  ok(om.overall === 'unknown' && om.checker.offline, 'checker offline: the banner says it can’t say (grey), never down');
  ok(om.parts.every((p) => p.state === 'ok'), 'nothing about Dialboard changes');
  ok(fill(W.bannerCheckerOffline, { time: et(om.checker.offline_since) }).startsWith('Our checker couldn’t reach the internet at 2:05 pm ET'), 'offline words');
  const o = outputs(S, S.last_run_at);
  ok(o.overall === 'ok' && !o.incidents.length, 'back online: all good, no incident');
  ok(o.history.save[89].nodata === 15, 'the offline time shows as 15 min No data', o.history.save[89]);
  // offline in the middle of a down streak doesn't reset or confirm it
  const x = runs(null, [good(), with_('save', 'fail'), { offline: true }, with_('save', 'fail')]);
  ok(x.ev.some((e) => e.e === 'down' && e.i === 3), 'an offline run in a failure streak neither confirms nor clears it');
  // GitHub skipped us for 40 minutes
  let S2 = runs(null, [good(), good()]).S;
  S2 = step(S2, { at: S2.last_run_at + 40 * M, offline: false, parts: ALL_OK(), services: SERVICES_OK }).state;
  ok(outputs(S2, S2.last_run_at).history.save[89].nodata === 35, 'a 40 min gap in runs: 35 min No data (never green, never red)');
  // unknown (probe not deployed)
  const u = runs(null, [{ parts: { ...ALL_OK(), save: { v: 'unknown' }, pay: { v: 'unknown' }, email: { v: 'unknown' } } }]).S;
  const ou = outputs(u, u.last_run_at);
  ok(ou.overall === 'partial' && ou.parts.find((p) => p.id === 'save').state === 'unknown', 'probe not deployed yet: those parts read "Can’t check right now", never down');
}

console.log('7. the hourly email round trip');
{
  // a test email at the top of each hour; `fate[h]` says what happened to hour h's email (seconds to arrive, or null = lost)
  const roundTrip = (fate, hours) => {
    let S = null; const ev = [];
    for (let i = 0; i <= hours * 12; i++) {
      const at = T0 + i * RUN_MS;
      const recent = [];
      for (let h = Math.floor(i / 12); h >= 0 && recent.length < 3; h--) {
        const sent = T0 + h * 3600000;
        const f = fate[h];
        const arrived = f != null && sent + f * 1000 <= at ? new Date(sent + f * 1000).toISOString() : null;
        recent.push({ sent_at: new Date(sent).toISOString(), arrived_at: arrived, send_ok: true });
      }
      const email = emailVerdict({ ok: true, ms: 300 }, null, { recent }, at);
      const x = step(S, { at, offline: false, services: SERVICES_OK, parts: { ...ALL_OK(), email } });
      S = x.state; ev.push(...x.events.map((e) => ({ i, ...e })));
    }
    return { S, ev };
  };
  let r = roundTrip([14, null, 20, 9], 4);
  ok(!r.ev.length && !outputs(r.S, r.S.last_run_at).incidents.length, 'one lost email between good ones: nothing shown, nothing emailed');
  ok(outputs(r.S, r.S.last_run_at).parts.find((p) => p.id === 'email').last.detail.delivered_ms === 9000, 'the page gets "delivered in 9 s"');
  r = roundTrip([14, null, null, 12], 4);
  const down = r.ev.find((e) => e.e === 'down');
  ok(down && down.i === 12 * 2 + 3 + 1, 'two lost in a row: down once the 2nd is 15 min late, confirmed by the next run (4:20 pm)', down);
  const inc = outputs(r.S, r.S.last_run_at).incidents[0];
  ok(inc && inc.part === 'email' && inc.resolved === T0 + 3 * 3600000 + 5 * 60000, 'fixed when the next email arrives (checked at 5:05 pm)', inc && [et(inc.started), inc.resolved && et(inc.resolved)]);
  r = roundTrip([14, 11 * 60, 12 * 60, 9], 4);
  ok(r.ev.some((e) => e.e === 'slow') && !r.ev.some((e) => e.e === 'down'), 'emails taking 11–12 minutes: slow, never down');
}

console.log('6. the whole 90 days (the screenshots’ data)');
for (const k of ['ok', 'slow', 'down', 'flap', 'offline', 'stale', 'partial', 'fresh']) {
  const { out } = history(k);
  const want = { ok: 'ok', slow: 'trouble', down: 'trouble', flap: 'trouble', offline: 'unknown', stale: 'ok', partial: 'partial', fresh: 'ok' }[k];
  ok(out.overall === want, k + ': overall ' + want, out.overall);
}
{
  const { out } = history('ok');
  const titles = out.incidents.map(incidentTitle);
  ok(out.incidents.length === 4, 'four past problems: saving 20 min, slow payments, sign-in on and off, emails 65 min; the single bad run is not one', titles);
  ok(out.incidents.find((i) => i.part === 'email').providers.includes('resend'), 'the emails one names Resend');
  ok(out.incidents.find((i) => i.part === 'signin').flap, 'the sign-in one is "on and off"');
  ok(out.history.save.some((d) => d.nodata >= 50), 'the checker-offline hour shows as No data');
  const xml = feed(out);
  ok(xml.includes('<title>Emails from Dialboard aren’t going out (fixed)</title>') && (xml.match(/<item>/g) || []).length === 4, 'RSS: one item per incident');
  ok(JSON.stringify(out).length < 120000, 'status.json stays small (' + Math.round(JSON.stringify(out).length / 1024) + ' KB)');
}

// fixtures for the browser shots
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out', 'fixtures');
fs.mkdirSync(OUT, { recursive: true });
for (const k of ['ok', 'slow', 'down', 'flap', 'offline', 'stale', 'partial', 'fresh']) fs.writeFileSync(path.join(OUT, k + '.json'), JSON.stringify(history(k).out));
fs.writeFileSync(path.join(OUT, 'feed.xml'), feed(history('ok').out));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
