// POST /api/confirm {t} — the confirm page's button (a POST, so mail scanners that open links can't confirm by themselves).
// Links last 7 days.
import { store } from './lib/store.mjs';
import { readConfirm } from './lib/tokens.mjs';

const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: H });

export default async (req) => {
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  let body = {};
  try { body = await req.json(); } catch { body = {}; }
  const t = readConfirm(body.t);
  if (!t) return reply({ ok: false, error: 'bad_link' }, 400);
  const s = await store();
  const cur = await s.get('sub/' + t.id);
  if (cur && cur.state === 'active') return reply({ ok: true });
  if (!cur || cur.state !== 'pending' || cur.created !== t.created || Date.now() - t.created > 7 * 86400000) return reply({ ok: false, error: 'old_link' }, 410);
  await s.set('sub/' + t.id, { email: cur.email, state: 'active', created: cur.created, confirmed: Date.now() });
  return reply({ ok: true });
};

export const config = { path: '/api/confirm' };
