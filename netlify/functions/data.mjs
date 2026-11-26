// /data/status.json and /feed.xml: the checker's latest results, read from the status-data branch on GitHub and passed
// on with the right type. Netlify's edge keeps each answer 30 seconds, so GitHub is asked at most about twice a minute
// however many people have the page open. If GitHub can't be reached, the page shows "Status unknown right now".
const BASE = (process.env.STATUS_DATA_BASE || 'https://raw.githubusercontent.com/rumizenzz/dialboard-status/status-data').replace(/\/+$/, '');
const TYPES = { 'status.json': 'application/json; charset=utf-8', 'feed.xml': 'application/rss+xml; charset=utf-8' };

export default async (req) => {
  const file = new URL(req.url).pathname.endsWith('feed.xml') ? 'feed.xml' : 'status.json';
  try {
    const r = await fetch(BASE + '/' + file + '?t=' + Math.floor(Date.now() / 30000), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('upstream ' + r.status);
    return new Response(await r.text(), { status: 200, headers: {
      'Content-Type': TYPES[file], 'Cache-Control': 'public, max-age=30',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30', 'Access-Control-Allow-Origin': '*',
    } });
  } catch {
    return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
};

export const config = { path: ['/data/status.json', '/feed.xml'] };
