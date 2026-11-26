// Subscriber ids and link tokens, all keyed with SUBSCRIBE_SECRET (a random value only the status site has), so an id
// can't be turned back into an email and a link can't be made up.
import crypto from 'node:crypto';

// (2026-11-25) no one ever handles this value: SUBSCRIBE_SECRET when set, else a random one the site makes for itself the first
// time and keeps in its own private store (Netlify Blobs), the same for every function from then on
let SECRET = (process.env.SUBSCRIBE_SECRET || '').trim();
if (SECRET.length < 32) {
  try {
    const { getStore } = await import('@netlify/blobs');
    const st = getStore({ name: 'status-secret', consistency: 'strong' });
    SECRET = (await st.get('subscribe')) || '';
    if (SECRET.length < 32) { await st.set('subscribe', crypto.randomBytes(32).toString('hex'), { onlyIfNew: true }); SECRET = (await st.get('subscribe')) || ''; }
  } catch (e) { SECRET = ''; }
}
function secret() {
  if (SECRET.length < 32) throw new Error('SUBSCRIBE_SECRET missing');
  return SECRET;
}
const mac = (s) => crypto.createHmac('sha256', secret()).update(s).digest('base64url');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function normEmail(e) {
  const s = String(e || '').trim().toLowerCase();
  if (s.length < 6 || s.length > 254) return null;
  if (!/^[^\s@<>()[\]\\,;:"]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(s)) return null;
  return s;
}
export const idOf = (email) => mac('id:' + email).slice(0, 32);
export const confirmToken = (id, created) => id + '.' + created + '.' + mac('c:' + id + ':' + created).slice(0, 32);
export const unsubToken = (id) => id + '.' + mac('u:' + id).slice(0, 32);
export function readConfirm(t) {
  const m = /^([A-Za-z0-9_-]{32})\.(\d{10,14})\.([A-Za-z0-9_-]{32})$/.exec(String(t || ''));
  if (!m || !same(m[3], mac('c:' + m[1] + ':' + m[2]).slice(0, 32))) return null;
  return { id: m[1], created: Number(m[2]) };
}
export function readUnsub(t) {
  const m = /^([A-Za-z0-9_-]{32})\.([A-Za-z0-9_-]{32})$/.exec(String(t || ''));
  if (!m || !same(m[2], mac('u:' + m[1]).slice(0, 32))) return null;
  return { id: m[1] };
}
export const hashIp = (ip, day) => mac('ip:' + day + ':' + ip).slice(0, 24);
