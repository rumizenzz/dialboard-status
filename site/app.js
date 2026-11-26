// status.dialboard.io: reads /data/status.json (the checker's latest, every 60 seconds) and draws it. Never green on old
// news: results older than 20 minutes turn the page grey ("Status unknown right now").
import { PARTS, SERVICES, W, fill, dur, secs, pct, etTime, dayName, incidentTitle, incidentLines } from './words.js';

const STALE_MS = 20 * 60000;
const REFRESH_MS = 60000;
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
let viewerTz = null;
try { viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (_) { viewerTz = null; }
const T = (ts) => etTime(ts, viewerTz);
const phone = window.matchMedia('(max-width: 640px)');
let data = null, loadedAt = 0, failed = false;

// ------------------------------------------------------------------ fixed words in the page

function staticWords() {
  for (const n of document.querySelectorAll('[data-w]')) {
    const v = W[n.getAttribute('data-w')];
    if (typeof v === 'string') n.textContent = v;
  }
  const how = $('how');
  how.textContent = '';
  for (const s of W.how) how.appendChild(el('li', null, s));
  const lg = $('legend');
  lg.textContent = '';
  for (const k of ['ok', 'slow', 'down', 'nodata', 'none']) {
    const li = el('li');
    li.appendChild(el('span', 'sw ' + k));
    li.appendChild(document.createTextNode(W.legend[k]));
    lg.appendChild(li);
  }
  const sameAsEt = !viewerTz || new Date().toLocaleString('en-US', { timeZone: viewerTz }) === new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  $('zone').textContent = sameAsEt ? W.zoneLine : fill(W.zoneLineYours, { zone: viewerTz.split('/').pop().replace(/_/g, ' ') });
}

// ------------------------------------------------------------------ the banner

function ago(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'less than a minute ago';
  if (m === 1) return '1 minute ago';
  if (m < 60) return m + ' minutes ago';
  const h = Math.floor(m / 60);
  return h === 1 ? 'about an hour ago' : 'about ' + h + ' hours ago';
}

function overallNow() {
  if (!data) return 'unknown';
  if (Date.now() - data.generated_at > STALE_MS) return 'stale';
  return data.overall;
}

function banner() {
  const b = $('banner'), h = $('headline'), sub = $('banner-sub');
  const o = overallNow();
  b.dataset.state = o === 'stale' ? 'unknown' : o;
  // a part that isn't working reads red even when the rest is fine; slow alone reads yellow
  const anyDown = data && o !== 'stale' && (data.parts || []).some((p) => p.state === 'down');
  if (o === 'trouble' && anyDown) b.dataset.state = 'down';
  $('last-checked').textContent = data ? fill(W.lastChecked, { ago: ago(data.generated_at) }) : '';
  if (!data) {
    h.textContent = W.bannerUnknown;
    sub.textContent = failed ? W.bannerUnknownNever : 'Checking…';
    return;
  }
  if (o === 'stale') { h.textContent = W.bannerUnknown; sub.textContent = fill(W.bannerUnknownSub, { time: T(data.generated_at) }); return; }
  if (o === 'unknown') {
    h.textContent = W.bannerUnknown;
    sub.textContent = data.checker && data.checker.offline ? fill(W.bannerCheckerOffline, { time: T(data.checker.offline_since || data.generated_at) }) : W.bannerUnknownNever;
    return;
  }
  const open = (data.incidents || []).filter((i) => i.resolved == null);
  if (o === 'ok') { h.textContent = W.bannerOk; sub.textContent = W.bannerOkSub; return; }
  if (o === 'partial') { h.textContent = W.bannerPartial; sub.textContent = W.bannerPartialSub; return; }
  if (o === 'down') {
    h.textContent = W.bannerDown;
    const first = open.slice().sort((a, b2) => a.started - b2.started)[0];
    sub.textContent = first ? fill(W.bannerDownSub, { time: T(first.started) }) : '';
    return;
  }
  // trouble
  h.textContent = open.length === 1 ? fill(W.bannerTroubleOne, { title: incidentTitle(open[0]) }) : W.bannerTroubleMany;
  sub.textContent = open.length === 1 ? '' : open.map(incidentTitle).join(' · ');
  sub.hidden = !sub.textContent;
}

// ------------------------------------------------------------------ incidents

function incidentNode(inc) {
  const box = el('article', 'inc');
  box.id = 'i-' + inc.id;
  const h3 = el('h3');
  h3.appendChild(document.createTextNode(incidentTitle(inc)));
  const open = inc.resolved == null;
  h3.appendChild(el('span', 'tag ' + (open ? 'now' + (inc.kind === 'down' ? '' : ' slow') : 'fixed'), open ? W.open : W.resolved));
  box.appendChild(h3);
  for (const line of incidentLines(inc, T, Date.now())) box.appendChild(el('p', null, line));
  const lasted = open ? null : inc.kind === 'down' ? inc.downMin : inc.slowMin;
  const when = dayName(ymdEt(inc.started), Date.now()) + (lasted != null ? ' · ' + fill(W.lasted, { dur: dur(lasted) }) : '');
  box.appendChild(el('p', 'when', when));
  return box;
}
function ymdEt(ts) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
}

function incidents() {
  const open = $('open-incidents'), past = $('past');
  open.textContent = ''; past.textContent = '';
  const all = data ? data.incidents || [] : [];
  for (const i of all.filter((x) => x.resolved == null)) open.appendChild(incidentNode(i));
  const done = all.filter((x) => x.resolved != null);
  if (!done.length) past.appendChild(el('p', 'past-none', W.pastNone));
  for (const i of done) past.appendChild(incidentNode(i));
}

// ------------------------------------------------------------------ the parts and their day bars

function dayText(d) {
  const lines = [];
  const name = dayName(d.d, Date.now());
  if (!d.checked && !d.nodata) return { name, lines: [W.dayBefore], label: name + '. ' + W.dayBefore };
  if (!d.checked) return { name, lines: [W.dayAllNoData], label: name + '. ' + W.dayAllNoData };
  lines.push({ t: fill(W.dayUptime, { pct: pct(d.up, 1) }) });
  if (d.down > 0) lines.push({ t: fill(W.dayDown, { dur: dur(d.down) }), c: 't-down' });
  if (d.slow > 0) lines.push({ t: fill(W.daySlow, { dur: dur(d.slow) }), c: 't-slow' });
  if (d.nodata > 0) lines.push({ t: fill(W.dayNoData, { dur: dur(d.nodata) }) });
  if (!d.down && !d.slow) lines.push({ t: W.dayClean });
  const titles = (d.inc || []).map((id) => (data.incidents || []).find((x) => x.id === id)).filter(Boolean);
  const label = name + '. ' + lines.map((l) => l.t).join(' ') + (titles.length ? ' ' + titles.map(incidentTitle).join('. ') + '.' : '');
  return { name, lines, titles, label };
}

function dayNode(d) {
  const n = el('span', 'day');
  n.setAttribute('role', 'img');
  const counted = d.checked + d.nodata;
  if (!counted) n.classList.add('k-none');
  else if (!d.checked) n.classList.add('k-nodata');
  else {
    // filled in proportion, with a floor so a short problem is still visible (and never looks like a lost day)
    const band = (min, floor) => (min > 0 ? Math.max(floor, Math.round((min / counted) * 100)) : 0);
    const parts = [['b-down', band(d.down, 22)], ['b-slow', band(d.slow, 22)], ['b-nodata', band(d.nodata, 14)]];
    for (const [c, h] of parts) if (h) { const i = el('i', c); i.style.height = Math.min(100, h) + '%'; n.appendChild(i); }
  }
  n.setAttribute('aria-label', dayText(d).label);
  return n;
}

let tipFor = null, pinned = false;
function showTip(dayEl, d, pin) {
  const tip = $('tip');
  const x = dayText(d);
  tip.textContent = '';
  tip.appendChild(el('b', null, x.name));
  for (const l of x.lines) tip.appendChild(typeof l === 'string' ? el('p', null, l) : el('p', l.c || null, l.t));
  if (x.titles && x.titles.length) {
    const ul = el('ul');
    for (const inc of x.titles) { const li = el('li'); const a = el('a', null, incidentTitle(inc) + ' ›'); a.href = '#i-' + inc.id; a.addEventListener('click', () => hideTip()); li.appendChild(a); ul.appendChild(li); }
    tip.appendChild(ul);
  }
  tip.hidden = false;
  const r = dayEl.getBoundingClientRect();
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let left = r.left + r.width / 2 - w / 2 + scrollX;
  left = Math.max(scrollX + 16, Math.min(left, scrollX + document.documentElement.clientWidth - 16 - w));
  let top = r.top + scrollY - h - 10;
  if (r.top - h - 10 < 0) top = r.bottom + scrollY + 10;
  tip.style.left = left + 'px'; tip.style.top = top + 'px';
  if (tipFor && tipFor !== dayEl) tipFor.classList.remove('cur');
  dayEl.classList.add('cur');
  tipFor = dayEl; pinned = !!pin;
}
function hideTip() {
  $('tip').hidden = true;
  if (tipFor) tipFor.classList.remove('cur');
  tipFor = null; pinned = false;
}

function parts() {
  const list = $('part-list');
  list.textContent = '';
  const n = phone.matches ? 30 : 90;
  const live = overallNow() !== 'stale';
  for (const p of PARTS) {
    const st = data && live ? (data.parts || []).find((x) => x.id === p.id) : null;
    const s = st ? st.state : 'unknown';
    const li = el('li', 'part');
    const row = el('div', 'part-row');
    const nm = el('span', 'part-name', p.name);
    nm.appendChild(el('span', 'part-what', p.what));
    const det = st && st.last && st.last.detail;
    if (det && s !== 'unknown') {
      if (det.delivered_ms != null) nm.appendChild(el('span', 'part-what part-detail', fill(W.mailDelivered, { secs: secs(det.delivered_ms) })));
      else if (det.missed === 1) nm.appendChild(el('span', 'part-what part-detail', W.mailMissedOnce));
    }
    row.appendChild(nm);
    const state = el('span', 'state');
    state.dataset.s = s;
    state.appendChild(el('span', 'dot'));
    state.appendChild(document.createTextNode(W.state[s]));
    row.appendChild(state);
    li.appendChild(row);

    const hist = data && data.history ? (data.history[p.id] || []).slice(-n) : [];
    const bar = el('div', 'bar');
    bar.tabIndex = 0;
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', p.name + ', the last ' + n + ' days. Use the arrow keys to go day by day.');
    hist.forEach((d, i) => {
      const dn = dayNode(d);
      dn.dataset.i = i;
      dn.addEventListener('mouseenter', () => { if (!pinned) showTip(dn, d, false); });
      dn.addEventListener('mouseleave', () => { if (!pinned) hideTip(); });
      dn.addEventListener('click', (e) => { e.stopPropagation(); if (pinned && tipFor === dn) hideTip(); else showTip(dn, d, true); });
      bar.appendChild(dn);
    });
    bar.addEventListener('keydown', (e) => {
      const days = bar.children;
      if (!days.length) return;
      let i = tipFor && tipFor.parentNode === bar ? Number(tipFor.dataset.i) : days.length;
      if (e.key === 'ArrowLeft') i = Math.max(0, i - 1);
      else if (e.key === 'ArrowRight') i = Math.min(days.length - 1, i + 1);
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = days.length - 1;
      else if (e.key === 'Escape') { hideTip(); return; }
      else return;
      e.preventDefault();
      showTip(days[i], hist[i], true);
    });
    // leaving the bar with the keyboard closes its own card (never one that a tap on another bar just opened)
    bar.addEventListener('blur', () => { setTimeout(() => { if (tipFor && tipFor.parentNode === bar && !bar.contains(document.activeElement) && !$('tip').contains(document.activeElement)) hideTip(); }, 0); });
    li.appendChild(bar);
    const foot = el('div', 'bar-foot');
    foot.appendChild(el('span', null, fill(W.daysLabel, { n })));
    let down = 0, checked = 0;
    for (const d of hist) { down += d.down; checked += d.checked; }
    const tot = checked ? pct(1 - down / checked, 2) : null;
    foot.appendChild(el('span', 'pct', tot ? fill(W.dayUptime, { pct: tot }) : W.dayUptimeNA));
    foot.appendChild(el('span', null, W.today));
    li.appendChild(foot);
    list.appendChild(li);
  }
}

function services() {
  const ul = $('services');
  ul.textContent = '';
  for (const s of SERVICES) {
    const got = data && (data.services || []).find((x) => x.id === s.id);
    const ind = got ? got.indicator : 'unknown';
    const li = el('li');
    const a = el('a', null, s.name);
    a.href = s.url; a.rel = 'noopener';
    const left = el('span');
    left.appendChild(a);
    left.appendChild(el('span', 'svc-for', s.for));
    li.appendChild(left);
    const st = el('span', 'svc-state');
    st.appendChild(el('span', 'dot ' + (ind === 'none' ? 'ok' : ind)));
    st.appendChild(document.createTextNode(W.serviceState[ind] || W.serviceState.unknown));
    li.appendChild(st);
    ul.appendChild(li);
  }
}

function draw() {
  $('banner-sub').hidden = false;
  banner(); incidents(); parts(); services();
  if (location.hash.startsWith('#i-') && !draw.jumped) {
    const t = document.getElementById(location.hash.slice(1));
    if (t) { draw.jumped = true; t.scrollIntoView(); }
  }
}

async function load() {
  try {
    const r = await fetch('/data/status.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j || typeof j.generated_at !== 'number') throw new Error('bad data');
    data = j; loadedAt = Date.now(); failed = false;
  } catch (_) {
    failed = true;  // keep the last good copy; it goes grey by itself once it's 20 minutes old
  }
  hideTip();
  draw();
}

// ------------------------------------------------------------------ subscribe

function subscribe() {
  const f = $('sub-form'), msg = $('sub-msg'), btn = f.querySelector('button');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('sub-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = W.subBad; $('sub-email').focus(); return; }
    btn.disabled = true; msg.textContent = '';
    try {
      const r = await fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, website: $('sub-website').value }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) { msg.textContent = W.subSent; f.reset(); }
      else msg.textContent = j.error === 'bad_email' ? W.subBad : W.subBusy;
    } catch (_) { msg.textContent = W.subBusy; }
    btn.disabled = false;
  });
}

document.addEventListener('click', (e) => { if (pinned && !$('tip').contains(e.target)) hideTip(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
let lastW = innerWidth;
window.addEventListener('resize', () => { if (innerWidth !== lastW) { lastW = innerWidth; if (tipFor) hideTip(); } }); // (a phone's address bar showing or hiding is not a resize that matters)
phone.addEventListener('change', () => { hideTip(); parts(); });

staticWords();
subscribe();
load();
setInterval(load, REFRESH_MS);
let lastOverall = null;
setInterval(() => { if (!data) return; const o = overallNow(); if (o !== lastOverall) { lastOverall = o; hideTip(); draw(); } else banner(); }, 15000);
window.__status = { reload: load, get data() { return data; } };
