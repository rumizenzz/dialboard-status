// POST /api/unsubscribe?t=… — the mail app's one-click button (RFC 8058: body "List-Unsubscribe=One-Click", answered with
// a plain 200) and the unsubscribe page (JSON {t}). The address is deleted outright, not just switched off.
// GET (someone pasting the link) goes to the page, which does the POST: one tap for a person, nothing for a link scanner.
import { store } from './lib/store.mjs';
import { readUnsub } from './lib/tokens.mjs';

export default async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET') return new Response(null, { status: 303, headers: { Location: '/unsubscribe?t=' + encodeURIComponent(url.searchParams.get('t') || '') } });
  if (req.method !== 'POST') return new Response('', { status: 405 });
  let t = url.searchParams.get('t');
  if (!t && (req.headers.get('content-type') || '').includes('json')) { try { t = (await req.json()).t; } catch { t = null; } }
  const u = readUnsub(t);
  if (!u) return new Response(JSON.stringify({ ok: false, error: 'bad_link' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  const s = await store();
  await s.del('sub/' + u.id);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
};

export const config = { path: '/api/unsubscribe' };
