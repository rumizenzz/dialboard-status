// The RSS feed, built from the same incidents and the same fixed words as the page. Times in ET.
import { incidentLines, incidentTitle, etTime, W } from '../site/words.js';

const SITE = 'https://status.dialboard.io';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function feed(out) {
  const t = (ts) => etTime(ts);
  const items = (out.incidents || []).slice(0, 50).map((inc) => {
    const last = Math.max(inc.started, ...(inc.updates || []).map((u) => u.at), inc.resolved || 0);
    const title = incidentTitle(inc) + (inc.resolved != null ? ' (' + W.resolved.toLowerCase() + ')' : '');
    return `<item><title>${esc(title)}</title><link>${SITE}/#i-${esc(inc.id)}</link>` +
      `<guid isPermaLink="false">${esc(inc.id + (inc.resolved != null ? '-fixed' : '-open'))}</guid>` +
      `<pubDate>${new Date(last).toUTCString()}</pubDate><description>${esc(incidentLines(inc, t, out.generated_at).join(' '))}</description></item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>Dialboard status</title><link>${SITE}/</link><description>Problems with Dialboard, posted automatically.</description>
<atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
<lastBuildDate>${new Date(out.generated_at || Date.now()).toUTCString()}</lastBuildDate>
${items}
</channel></rss>
`;
}
