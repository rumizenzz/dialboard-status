// Where subscribers live: Netlify Blobs, the status site's own private store (no new provider, nothing in git, never in
// Supabase, so signing up works even while Supabase has a problem). Only this site's functions can read it.
// Keys: sub/<id> (one subscriber), sent/<incident id> (which emails went), rl/<hash> (sign-up limits), alert/<kind>.
// The tests swap in an in-memory store with globalThis.__statusStore.

export async function store() {
  if (globalThis.__statusStore) return globalThis.__statusStore;
  const { getStore } = await import('@netlify/blobs');
  const s = getStore({ name: 'status', consistency: 'strong' });
  return {
    get: (k) => s.get(k, { type: 'json' }),
    set: (k, v) => s.setJSON(k, v),
    del: (k) => s.delete(k),
    list: async (prefix) => {
      const out = [];
      for await (const page of s.list({ prefix, paginate: true })) for (const b of page.blobs) out.push(b.key);
      return out;
    },
  };
}

/** A plain in-memory store with the same four calls (tests). */
export function memoryStore() {
  const m = new Map();
  return {
    m,
    get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null),
    set: async (k, v) => { m.set(k, JSON.stringify(v)); },
    del: async (k) => { m.delete(k); },
    list: async (prefix) => [...m.keys()].filter((k) => k.startsWith(prefix)).sort(),
  };
}
