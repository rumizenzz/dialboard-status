// POST /api/subscribe {email, website (the honeypot: must be empty)} → always the same calm answer, whether the address
// is new, waiting or already on the list, so the form can't be used to find out who subscribed.
// Double opt-in: a new or waiting address gets one "Tap to confirm" email; nothing else is ever sent until it's tapped.
// Limits: one confirmation email per address per 10 minutes, 5 sign-ups per browser address (IP, kept only as a keyed
// hash that changes daily) per day, 300 confirmation emails a day in all.
import { store } from './lib/store.mjs';
import { normEmail, idOf, confirmToken, hashIp } from './lib/tokens.mjs';
import { confirmEmail, message, sendBatch, SITE } from './lib/mail.mjs';

const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: H });

export default async (req, context) => {
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  if (body.website) return reply({ ok: true });               // a bot filled the hidden field: say yes, do nothing
  const email = normEmail(body.email);
  if (!email) return reply({ ok: false, error: 'bad_email' }, 400);
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const s = await store();

  const ip = (context && context.ip) || req.headers.get('x-nf-client-connection-ip') || 'unknown';
  const rlKey = 'rl/' + hashIp(ip, day);
  const rl = (await s.get(rlKey)) || { n: 0 };
  if (rl.n >= 5) return reply({ ok: false, error: 'busy' }, 429);
  await s.set(rlKey, { n: rl.n + 1, day });

  const id = idOf(email);
  const cur = await s.get('sub/' + id);
  if (cur && cur.state === 'active') return reply({ ok: true });
  if (cur && cur.state === 'pending' && now - cur.sent < 10 * 60000) return reply({ ok: true });

  const totKey = 'rl/day-' + day;
  const tot = (await s.get(totKey)) || { n: 0 };
  if (tot.n >= 300) return reply({ ok: false, error: 'busy' }, 429);

  const created = cur && cur.state === 'pending' ? cur.created : now;
  await s.set('sub/' + id, { email, state: 'pending', created, sent: now });
  const link = SITE + '/confirm?t=' + encodeURIComponent(confirmToken(id, created));
  const ok = await sendBatch([message(email, confirmEmail(link), null)], 'confirm-' + id + '-' + Math.floor(now / 600000)).catch(() => false);
  await s.set(totKey, { n: tot.n + 1 });
  if (!ok) return reply({ ok: false, error: 'busy' }, 503);
  return reply({ ok: true });
};

export const config = { path: '/api/subscribe' };
