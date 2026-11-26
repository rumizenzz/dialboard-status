// The confirm page (one button: a POST, so a mail scanner opening the link confirms nothing) and the unsubscribe page
// (it unsubscribes as it opens, with JavaScript: one tap for a person, nothing for a scanner that only fetches links).
import { W } from './words.js';
const $ = (id) => document.getElementById(id);
const t = new URLSearchParams(location.search).get('t') || '';
history.replaceState(null, '', location.pathname);   // the token leaves the address bar (and any shared link)
$('back').textContent = W.backToStatus;
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json().catch(() => ({})).then((j) => ({ ok: r.ok && j.ok, j })));

if (document.body.dataset.page === 'confirm') {
  $('title').textContent = W.confirmTitle;
  $('body').textContent = W.confirmBody;
  const b = document.createElement('button');
  b.className = 'btn'; b.type = 'button'; b.textContent = W.confirmButton;
  b.addEventListener('click', async () => {
    b.disabled = true;
    const r = await post('/api/confirm', { t }).catch(() => ({ ok: false }));
    $('act').textContent = '';
    $('body').textContent = r.ok ? W.confirmDone : W.confirmOld;
  });
  $('act').appendChild(b);
} else {
  $('title').textContent = W.unsubWorking;
  post('/api/unsubscribe', { t }).then((r) => {
    $('title').textContent = r.ok ? W.unsubDone : W.unsubBad;
  }, () => { $('title').textContent = W.unsubBad; });
}
