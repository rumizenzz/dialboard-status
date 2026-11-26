// The status engine: pure, no network, no clock of its own. The checker calls step() once per run with what the checks
// found, then outputs() to get what the page, the feed and the next run read. The tests drive the same two functions.
//
// The rules (the founder's, 2026-11-25):
//   * A part counts as DOWN only after 2 failed runs in a row where a second, different kind of check agreed ('fail').
//     When only the full check fails and the plain one passes ('soft'), it takes 4 runs in a row (20 minutes) instead:
//     a lasting failure that only the full check can see is still real (DRAFT rule, for the founder to approve).
//   * SLOW after 2 slow runs in a row. Slow never lowers the uptime and never emails anyone.
//   * FIXED after 2 good runs in a row. It was working from the first of them, so that is the fixed time.
//   * A problem that comes back within 60 minutes of being fixed reopens the same incident ("on and off"), so a part that
//     flaps makes one incident, not a pile of them.
//   * If the checker can't reach the internet at all ('offline'), nothing about Dialboard changes: that time is No data.
//   * A run more than 15 minutes after the last one: the gap is No data (never green, never red).
//   * 'unknown' (a part that can't be checked, for example the probe isn't deployed yet): No data for that part only.

import { PARTS } from '../site/words.js';

export const TZ = 'America/New_York';
export const RUN_MS = 5 * 60000;
export const GAP_MS = 15 * 60000;
export const FAIL_N = 2;
export const SOFT_N = 4;
export const SLOW_N = 2;
export const GOOD_N = 2;
export const FLAP_MS = 60 * 60000;
export const KEEP_DAYS = 90;
export const PART_IDS = PARTS.map((p) => p.id);

// ------------------------------------------------------------------ time in ET

const fmtParts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function etParts(ts) {
  const o = {};
  for (const p of fmtParts.formatToParts(new Date(ts))) o[p.type] = p.value;
  return { ymd: o.year + '-' + o.month + '-' + o.day, h: Number(o.hour) % 24, mi: Number(o.minute) };
}
export function ymdOf(ts) { return etParts(ts).ymd; }
/** The instant a day starts in ET (handles the two DST days). */
export function midnight(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d, 5);
  for (let i = 0; i < 4; i++) {
    const p = etParts(t);
    const dayOff = p.ymd === ymd ? 0 : p.ymd < ymd ? -1440 : 1440;
    const off = dayOff + p.h * 60 + p.mi;
    if (off === 0) break;
    t -= off * 60000;
  }
  return t;
}
export function nextYmd(ymd) { return ymdOf(midnight(ymd) + 36 * 3600000); }
export function prevYmd(ymd) { return ymdOf(midnight(ymd) - 12 * 3600000); }
/** The last n ET days, oldest first, ending with the day of ts. */
export function lastDays(ts, n) {
  const out = [ymdOf(ts)];
  while (out.length < n) out.unshift(prevYmd(out[0]));
  return out;
}

// ------------------------------------------------------------------ intervals

function addInterval(list, from, to) {
  if (!(to > from)) return list;
  list.push([from, to]);
  list.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const iv of list) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

// ------------------------------------------------------------------ state

function freshPart() {
  return { state: 'ok', failRun: 0, badRun: 0, badStart: null, slowRun: 0, slowStart: null, good: 0, goodStart: null, inc: null, last: null };
}
export function initState(at) {
  const parts = {};
  for (const id of PART_IDS) parts[id] = freshPart();
  const nodata = {};
  for (const id of PART_IDS) nodata[id] = [];
  return { v: 1, started_at: at, last_run_at: null, offline_at: null, offline_since: null, parts, nodata, incidents: [], services: [], runs: [], seq: 0 };
}

function clockId(ts) { const p = etParts(ts); return p.ymd + '-' + String(p.h).padStart(2, '0') + String(p.mi).padStart(2, '0'); }

function openSpan(inc, kind, from) {
  const cur = inc.spans[inc.spans.length - 1];
  if (cur && cur.to == null) {
    if (cur.kind === kind) return;
    cur.to = from;
  }
  inc.spans.push({ kind, from, to: null });
  if (kind === 'down') inc.kind = 'down';
  if (kind === 'down' && inc.downSince == null) inc.downSince = from;
}
function closeSpans(inc, at) {
  for (const s of inc.spans) if (s.to == null) s.to = Math.max(s.from, at);
}
export function spanMinutes(inc, kind, now) {
  let ms = 0;
  for (const s of inc.spans) if (s.kind === kind) ms += (s.to == null ? now : s.to) - s.from;
  return ms / 60000;
}

function openIncident(S, id, kind, from, at) {
  const P = S.parts[id];
  // came back within an hour of being fixed: the same incident, on and off
  const last = S.incidents.filter((i) => i.part === id).sort((a, b) => b.started - a.started)[0];
  if (last && last.resolved != null && from - last.resolved <= FLAP_MS) {
    last.resolved = null;
    last.flap = true;
    last.updates.push({ t: 'again', at: from });
    openSpan(last, kind, from);
    P.inc = last.id;
    return last;
  }
  let iid = clockId(from) + '-' + id;
  while (S.incidents.some((i) => i.id === iid)) iid += 'b';
  const inc = { id: iid, part: id, kind, firstKind: kind, started: from, confirmed: at, resolved: null, flap: false, downSince: null, spans: [], updates: [{ t: 'opened', at: from }], providers: [] };
  openSpan(inc, kind, from);
  S.incidents.push(inc);
  P.inc = iid;
  return inc;
}
function incOf(S, id) { const P = S.parts[id]; return P.inc ? S.incidents.find((i) => i.id === P.inc) || null : null; }

/**
 * One run of the checker.
 *   run = { at, offline: bool, parts: { <id>: { v: 'ok'|'slow'|'soft'|'fail'|'unknown', ms, why } }, services: [...] }
 * Returns the new state (the old one is not changed) and the list of things that happened (for logs and tests).
 */
export function step(S0, run, opts) {
  // opts.mutate: change S0 in place (the long simulations in the tests; the checker always gets a copy)
  const S = S0 ? (opts && opts.mutate ? S0 : JSON.parse(JSON.stringify(S0))) : initState(run.at);
  const at = run.at;
  const events = [];
  const prev = S.last_run_at;
  if (prev != null && at <= prev) return { state: S, events: [{ e: 'ignored_old_run' }] };

  // the slice of time this run speaks for
  let sliceFrom = prev == null ? at : prev;
  if (prev != null && at - prev > GAP_MS) {
    for (const id of PART_IDS) S.nodata[id] = addInterval(S.nodata[id], prev, at - RUN_MS);
    sliceFrom = at - RUN_MS;
    events.push({ e: 'gap', from: prev, to: at - RUN_MS });
  }
  if (Array.isArray(run.services)) S.services = run.services;

  if (run.offline) {
    for (const id of PART_IDS) S.nodata[id] = addInterval(S.nodata[id], sliceFrom, at);
    if (S.offline_since == null) S.offline_since = at;
    S.offline_at = at;
    S.last_run_at = at;
    S.runs.push({ at, off: 1 });
    events.push({ e: 'checker_offline' });
    return finish(S, at, events);
  }
  S.offline_since = null;

  for (const id of PART_IDS) {
    const P = S.parts[id];
    const r = (run.parts && run.parts[id]) || { v: 'unknown', why: 'no_result' };
    const v = r.v;
    P.last = { v, ms: r.ms == null ? null : Math.round(r.ms), why: r.why || null, at, ...(r.detail ? { detail: r.detail } : {}) };
    if (v === 'unknown') { S.nodata[id] = addInterval(S.nodata[id], sliceFrom, at); continue; }
    const bad = v === 'fail' || v === 'soft';

    if (bad) {
      P.failRun = v === 'fail' ? P.failRun + 1 : 0;
      P.badRun += 1;
      if (P.badStart == null) P.badStart = at;
      P.good = 0; P.goodStart = null;
    } else {
      P.failRun = 0; P.badRun = 0; P.badStart = null;
    }
    if (v === 'slow') { P.slowRun += 1; if (P.slowStart == null) P.slowStart = at; } else { P.slowRun = 0; P.slowStart = null; }

    if (P.state !== 'down') {
      if (bad && (P.failRun >= FAIL_N || P.badRun >= SOFT_N)) {
        const cur = incOf(S, id);
        if (cur && cur.resolved == null) {
          cur.updates.push({ t: 'worse', at: P.badStart });
          openSpan(cur, 'down', P.badStart);
        } else {
          openIncident(S, id, 'down', P.badStart, at);
        }
        P.state = 'down'; P.good = 0; P.goodStart = null;
        events.push({ e: 'down', part: id, since: P.badStart });
      } else if (P.state === 'ok' && v === 'slow' && P.slowRun >= SLOW_N) {
        openIncident(S, id, 'slow', P.slowStart, at);
        P.state = 'slow'; P.good = 0; P.goodStart = null;
        events.push({ e: 'slow', part: id, since: P.slowStart });
      } else if (P.state === 'slow') {
        if (v === 'ok') {
          P.good += 1; if (P.goodStart == null) P.goodStart = at;
          if (P.good >= GOOD_N) {
            const inc = incOf(S, id);
            if (inc) { closeSpans(inc, P.goodStart); inc.resolved = P.goodStart; inc.updates.push({ t: 'fixed', at: P.goodStart }); }
            P.state = 'ok'; P.inc = null; P.good = 0;
            events.push({ e: 'fixed', part: id, at: P.goodStart, was: 'slow' });
            P.goodStart = null;
          }
        } else { P.good = 0; P.goodStart = null; }
      }
    } else if (!bad) {
      // down, and this run worked (fast or slow)
      P.good += 1; if (P.goodStart == null) P.goodStart = at;
      if (P.good >= GOOD_N) {
        const inc = incOf(S, id);
        if (P.slowRun >= GOOD_N && inc) {
          // working again, but slow: the incident carries on as a slow one
          openSpan(inc, 'slow', P.goodStart);
          inc.updates.push({ t: 'better', at: P.goodStart });
          P.state = 'slow';
          events.push({ e: 'better', part: id, at: P.goodStart });
        } else {
          if (inc) { closeSpans(inc, P.goodStart); inc.resolved = P.goodStart; inc.updates.push({ t: 'fixed', at: P.goodStart }); }
          P.state = 'ok'; P.inc = null;
          events.push({ e: 'fixed', part: id, at: P.goodStart, was: 'down' });
        }
        P.good = 0; P.goodStart = null;
      }
    }
  }

  // an outside service reporting trouble while one of our parts has an open problem: the reason is added, never the trigger
  const troubled = new Set((S.services || []).filter((s) => s.indicator && s.indicator !== 'none' && s.indicator !== 'unknown').map((s) => s.id));
  for (const inc of S.incidents) {
    if (inc.resolved != null) continue;
    const p = PARTS.find((x) => x.id === inc.part);
    for (const sid of p.providers) if (troubled.has(sid) && !inc.providers.includes(sid)) inc.providers.push(sid);
  }

  S.last_run_at = at;
  const compact = {};
  for (const id of PART_IDS) compact[id] = S.parts[id].last.v[0] + (S.parts[id].last.ms != null ? S.parts[id].last.ms : '');
  S.runs.push({ at, p: compact });
  return finish(S, at, events);
}

function finish(S, at, events) {
  const keepFrom = at - (KEEP_DAYS + 1) * 86400000;
  S.incidents = S.incidents.filter((i) => i.resolved == null || i.resolved >= keepFrom);
  for (const id of PART_IDS) S.nodata[id] = S.nodata[id].filter((iv) => iv[1] >= keepFrom);
  S.runs = S.runs.filter((r) => r.at >= at - 48 * 3600000);
  return { state: S, events };
}

// ------------------------------------------------------------------ what the page reads

/** Per part, per ET day: minutes down, slow, no data, checked; the uptime; the incidents that touched it. */
export function dayStats(S, partId, ymd, now) {
  const start = midnight(ymd), end = midnight(nextYmd(ymd));
  const len = Math.round((end - start) / 60000);
  const a = new Uint8Array(len); // 0 ok, 1 slow, 2 down, 3 no data, 4 not counted (before checks began, or still to come)
  const mark = (from, to, val, over) => {
    const i0 = Math.max(0, Math.floor((from - start) / 60000)), i1 = Math.min(len, Math.ceil((to - start) / 60000));
    for (let i = i0; i < i1; i++) if (over(a[i])) a[i] = val;
  };
  for (const iv of S.nodata[partId] || []) if (iv[1] > start && iv[0] < end) mark(iv[0], iv[1], 3, () => true);
  const inc = [];
  for (const x of S.incidents) {
    if (x.part !== partId) continue;
    let touched = false;
    for (const sp of x.spans) {
      const to = sp.to == null ? now : sp.to;
      if (to > start && sp.from < end) { touched = true; mark(sp.from, to, sp.kind === 'down' ? 2 : 1, (c) => sp.kind === 'down' || c !== 2); }
    }
    if (touched) inc.push(x.id);
  }
  const began = S.started_at;
  if (began > start) mark(start, began, 4, () => true);
  if (now < end) mark(now, end, 4, () => true);
  let down = 0, slow = 0, nodata = 0, checked = 0, none = 0;
  for (let i = 0; i < len; i++) {
    const c = a[i];
    if (c === 0) checked++; else if (c === 1) { slow++; checked++; } else if (c === 2) { down++; checked++; } else if (c === 3) nodata++; else none++;
  }
  return { d: ymd, down, slow, nodata, checked, none, up: checked ? 1 - down / checked : null, inc };
}

function partState(S, id) {
  const P = S.parts[id];
  if (!P.last || P.last.v === 'unknown') return P.state === 'down' || P.state === 'slow' ? P.state : 'unknown';
  return P.state;
}

export function outputs(S, now) {
  const at = now == null ? S.last_run_at : now;
  const days = lastDays(at, KEEP_DAYS);
  const history = {}, totals = {};
  for (const id of PART_IDS) {
    history[id] = days.map((d) => dayStats(S, id, d, at));
    let down = 0, checked = 0;
    for (const x of history[id]) { down += x.down; checked += x.checked; }
    totals[id] = checked ? 1 - down / checked : null;
  }
  const parts = PARTS.map((p) => {
    const P = S.parts[p.id];
    const inc = incOf(S, p.id);
    return { id: p.id, state: partState(S, p.id), since: inc ? inc.started : null, inc: inc ? inc.id : null, last: P.last };
  });
  const offline = S.offline_since != null;
  const downs = parts.filter((p) => p.state === 'down');
  const slows = parts.filter((p) => p.state === 'slow');
  const unknowns = parts.filter((p) => p.state === 'unknown');
  let overall = 'ok';
  if (offline || S.last_run_at == null) overall = 'unknown';
  else if (downs.some((p) => p.id === 'open') || downs.length >= 3) overall = 'down';
  else if (downs.length || slows.length) overall = 'trouble';
  else if (unknowns.length === parts.length) overall = 'unknown';
  else if (unknowns.length) overall = 'partial';
  const incidents = S.incidents.slice().sort((a, b) => b.started - a.started).map((i) => ({
    ...i, downMin: Math.round(spanMinutes(i, 'down', at)), slowMin: Math.round(spanMinutes(i, 'slow', at)),
  }));
  return {
    v: 1, generated_at: at, started_at: S.started_at,
    checker: { last_run: S.last_run_at, offline, offline_since: S.offline_since },
    overall, parts, services: S.services, incidents, days, history, totals,
  };
}
