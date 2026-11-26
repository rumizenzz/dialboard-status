// Simulated checker runs for the tests and the screenshots. Pure: no network.
import { step, outputs, RUN_MS } from '../checker/engine.mjs';
import { PART_IDS } from '../checker/engine.mjs';

export const ALL_OK = () => Object.fromEntries(PART_IDS.map((id) => [id, id === 'email' ? { v: 'ok', ms: 400, detail: { delivered_ms: 14000 } } : { v: 'ok', ms: 400 }]));
export const SERVICES_OK = [{ id: 'supabase', indicator: 'none' }, { id: 'stripe', indicator: 'none' }, { id: 'netlify', indicator: 'none' }, { id: 'resend', indicator: 'none' }];

/** Runs every 5 minutes from `from` to `to`; fn(at) returns a run (or null to skip: the checker didn't run). */
export function simulate(from, to, fn, state = null) {
  let S = state;
  const events = [];
  for (let at = from; at <= to; at += RUN_MS) {
    const r = fn(at);
    if (!r) continue;
    const res = step(S, { at, ...r }, { mutate: true });
    S = res.state;
    for (const e of res.events) events.push({ at, ...e });
  }
  return { state: S, events };
}

const align = (t) => Math.floor(t / RUN_MS) * RUN_MS;

/**
 * A believable 90 days for the screenshots: a few honest problems in the past, then whatever `now` scenario.
 *   now: 'ok' | 'slow' | 'down' | 'flap' | 'offline' | 'stale' | 'partial' | 'fresh'
 */
export function history(nowKind, nowTs = Date.now()) {
  const now = align(nowTs);
  const D = 86400000, M = 60000;
  const start = nowKind === 'fresh' ? now - 3 * 3600000 : now - 89 * D - 10 * 3600000;
  // past problems (minutes back from now)
  const past = [
    { part: 'save', from: now - 61 * D, len: 17 * M, v: 'fail' },                    // fails for 17 min: shows as 20 (checks are 5 min apart)
    { part: 'pay', from: now - 40 * D, len: 42 * M, v: 'slow', ms: 7200 },           // slow payments for 42 min
    { part: 'signin', from: now - 22 * D, len: 10 * M, v: 'fail' },                  // sign-in down, on and off:
    { part: 'signin', from: now - 22 * D + 20 * M, len: 15 * M, v: 'fail' },         //   back after 10 min, then again
    { part: 'email', from: now - 9 * D, len: 65 * M, v: 'fail', provider: 'resend' }, // emails down 1 hr 5 min
    { part: 'open', from: now - 5 * D, len: 5 * M, v: 'fail' },                      // a single bad run: never shown
  ];
  const offline = [{ from: now - 30 * D, len: 50 * M }];                             // our checker offline for 50 min
  const skipped = [{ from: now - 14 * D, len: 35 * M }];                             // GitHub didn't run us for 35 min
  const tail = 35 * M; // the "now" scenario covers the last 35 minutes
  const fn = (at) => {
    if (skipped.some((s) => at >= s.from && at < s.from + s.len)) return null;
    if (offline.some((s) => at >= s.from && at < s.from + s.len)) return { offline: true };
    const parts = ALL_OK();
    const services = SERVICES_OK.map((s) => ({ ...s }));
    for (const p of past) if (at >= p.from && at < p.from + p.len) {
      parts[p.part] = { v: p.v, ms: p.ms || 900 };
      if (p.provider) services.find((s) => s.id === p.provider).indicator = 'minor';
    }
    const t = now - at;
    if (t < tail) {
      if (nowKind === 'slow') parts.save = { v: 'slow', ms: 5200 };
      if (nowKind === 'down' && t < 30 * M) { parts.save = { v: 'fail', ms: 15000 }; services[0].indicator = 'minor'; }
      if (nowKind === 'flap') parts.signin = { v: Math.floor(t / (10 * M)) % 2 ? 'ok' : 'fail', ms: 800 };
      if (nowKind === 'partial') parts.email = { v: 'unknown', why: 'probe_not_deployed' };
    }
    if (nowKind === 'offline' && t < 10 * M) return { offline: true };
    return { offline: false, parts, services };
  };
  const end = nowKind === 'stale' ? now - 45 * M : now;
  const { state, events } = simulate(start, end, fn);
  return { out: outputs(state, end), state, events };
}
