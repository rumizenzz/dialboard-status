// One checker run: node checker/run.mjs <data dir>
// Reads <data>/state.json, checks everything, writes <data>/state.json, status.json and feed.xml. The workflow then
// commits the data folder to the status-data branch. Exits 0 even when Dialboard is down (that's a result, not an error);
// exits 1 only when the checker itself broke, so GitHub shows a failed run.

import fs from 'node:fs';
import path from 'node:path';
import { step, outputs } from './engine.mjs';
import { checkAll, internetOk, services } from './checks.mjs';
import { feed } from './rss.mjs';

const dir = path.resolve(process.argv[2] || 'data');
fs.mkdirSync(dir, { recursive: true });

function readJson(f) { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } }
function writeAtomic(f, s) { const p = path.join(dir, f); fs.writeFileSync(p + '.tmp', s); fs.renameSync(p + '.tmp', p); }

export async function oneRun(now = Date.now()) {
  const state = readJson('state.json');
  let run;
  if (!(await internetOk())) {
    run = { at: now, offline: true };
  } else {
    const [c, s] = await Promise.all([checkAll(), services().catch(() => null)]);
    run = { at: now, offline: false, parts: c.parts, services: s || undefined };
    run.version = c.version;
  }
  const { state: next, events } = step(state, run);
  const out = outputs(next, now);
  if (run.version) out.app_version = run.version;
  writeAtomic('state.json', JSON.stringify(next));
  writeAtomic('status.json', JSON.stringify(out));
  writeAtomic('feed.xml', feed(out));
  return { run, events, out };
}

if (import.meta.url === 'file://' + process.argv[1] || process.argv[1]?.endsWith('run.mjs')) {
  oneRun().then(({ run, events, out }) => {
    const parts = run.offline ? 'checker offline' : Object.entries(run.parts).map(([k, v]) => k + '=' + v.v + (v.ms != null ? '(' + Math.round(v.ms) + 'ms)' : '') + (v.why ? '[' + v.why + ']' : '')).join(' ');
    console.log(new Date(run.at).toISOString(), out.overall, parts);
    for (const e of events) console.log('  event', JSON.stringify(e));
  }).catch((e) => { console.error('checker broke:', e && e.stack || e); process.exit(1); });
}
