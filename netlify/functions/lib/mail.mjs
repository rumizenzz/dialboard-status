// Status emails in Dialboard's house look (a sticky on the wall, a marker stripe, one big button, "— Dialboard"), sent
// through Resend with the status site's own SENDING-ONLY key (RESEND_STATUS_KEY). Every subscriber email carries a
// one-tap unsubscribe link in the body plus List-Unsubscribe and List-Unsubscribe-Post: One-Click (RFC 8058).
// Tests capture sends with globalThis.__statusSend.
import { W, fill } from '../../../site/words.js';

export const SITE = (process.env.STATUS_URL || 'https://status.dialboard.io').replace(/\/+$/, '');
const FROM = process.env.STATUS_EMAIL_FROM || 'Dialboard Status <status@dialboard.io>';
const REPLY_TO = 'hello@dialboard.io';
const HEAD = "'Marker Felt','Segoe Print','Arial Black',Arial,sans-serif";
const BODY = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const STRIPE = { red: '#d1311f', green: '#0d7a4c', blue: '#1b46c2' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** {subject, html, text}. lines: sentences; button: [label, href]; unsub: the stop link or null. */
export function render({ subject, heading, lines, button, unsub, stripe = 'blue', extra = [] }) {
  const foot = 'Dialboard · New Jersey, USA · hello@dialboard.io';
  const text = [heading.toUpperCase(), '', ...lines.flatMap((l) => [l, '']), button ? button[0] + ' ' + button[1] : '', '', '— Dialboard', '',
    ...extra.flatMap((l) => [l]), unsub ? W.mailWhy + ' ' + W.mailUnsub + ': ' + unsub : '', '--', foot].filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n') + '\n';
  const c = STRIPE[stripe] || STRIPE.blue;
  const p = (s) => `<tr><td style="padding:0 0 12px 0;font-family:${BODY};font-size:16px;line-height:24px;color:#1d1d1f;">${esc(s)}</td></tr>`;
  const small = (s, href) => `<tr><td style="padding:6px 0 0 0;font-family:${BODY};font-size:13px;line-height:19px;color:#3f3b2d;">${href ? `${esc(s)} <a href="${esc(href)}" style="color:#3f3b2d;text-decoration:underline;">${esc(W.mailUnsub)}</a>` : esc(s)}</td></tr>`;
  const btn = button ? `<tr><td style="padding:8px 0 18px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#1d1d1f" style="border-radius:8px;background:#1d1d1f;"><a href="${esc(button[1])}" style="display:inline-block;padding:14px 26px;min-width:180px;font-family:${BODY};font-size:17px;line-height:24px;color:#ffffff;text-decoration:none;font-weight:bold;text-align:center;">${esc(button[0])}</a></td></tr></table></td></tr>` : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(subject)}</title>
<style>@media (prefers-color-scheme: dark) { body, .wall { background:#1f2328 !important; } .sticky { background:#e8d96a !important; } .foot, .foot a { color:#c9c3b0 !important; } }</style></head>
<body style="margin:0;padding:0;background:#f3efe6;">
<table role="presentation" class="wall" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3efe6" style="background:#f3efe6;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
<tr><td height="6" bgcolor="${c}" style="height:6px;font-size:1px;line-height:6px;background:${c};border-radius:3px 3px 0 0;">&nbsp;</td></tr>
<tr><td class="sticky" bgcolor="#fff27a" style="background:#fff27a;padding:20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:0 0 4px 0;font-family:${HEAD};font-size:15px;line-height:20px;color:#1b46c2;">Dialboard status</td></tr>
<tr><td style="padding:0 0 14px 0;font-family:${HEAD};font-size:20px;line-height:26px;color:#1d1d1f;">${esc(heading.toUpperCase())}</td></tr>
${lines.map(p).join('\n')}
${btn}
<tr><td style="padding:8px 0 2px 0;font-family:${HEAD};font-size:18px;line-height:24px;color:#1d1d1f;">— Dialboard</td></tr>
${extra.map((s) => small(s)).join('\n')}
${unsub ? small(W.mailWhy, unsub) : ''}
</table></td></tr>
<tr><td class="foot" style="padding:18px 4px 0 4px;font-family:${BODY};font-size:13px;line-height:20px;color:#3f3b2d;">${esc(foot)}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html, text };
}

export function confirmEmail(link) {
  return render({ subject: W.mailConfirmSubject, heading: W.confirmTitle, lines: [W.mailConfirmBody], button: [W.mailConfirmButton, link], unsub: null, stripe: 'blue', extra: [W.mailConfirmIgnore] });
}

export const UNSUB_SLOT = '%%UNSUB%%';

/** One message, ready for Resend. The body's stop link (UNSUB_SLOT in a shared render) becomes this person's own link. */
export function message(to, r, unsubLink) {
  const put = (s) => (unsubLink ? s.split(UNSUB_SLOT).join(unsubLink) : s);
  const m = { from: FROM, to: [to], reply_to: REPLY_TO, subject: r.subject, html: put(r.html), text: put(r.text) };
  if (unsubLink) {
    const oneClick = SITE + '/api/unsubscribe?t=' + encodeURIComponent(new URL(unsubLink).searchParams.get('t'));
    m.headers = { 'List-Unsubscribe': '<' + oneClick + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
  }
  return m;
}

/** Send up to 100 messages in one call. Returns true when Resend took them. */
export async function sendBatch(msgs, idemKey) {
  if (!msgs.length) return true;
  if (globalThis.__statusSend) return globalThis.__statusSend(msgs, idemKey);
  const key = (process.env.RESEND_STATUS_KEY || '').trim();
  if (!key) throw new Error('RESEND_STATUS_KEY missing');
  const one = msgs.length === 1;
  const r = await fetch(one ? 'https://api.resend.com/emails' : 'https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(idemKey ? { 'Idempotency-Key': idemKey.slice(0, 250) } : {}) },
    body: JSON.stringify(one ? msgs[0] : msgs),
    signal: AbortSignal.timeout(15000),
  });
  await r.text().catch(() => '');
  return r.ok;
}

export { fill };
