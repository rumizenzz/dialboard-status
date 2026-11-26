// A local copy of status.dialboard.io for the browser shots: the static site, /data/status.json from a fixture
// (switch with POST /__scenario?name=down), /feed.xml, and a pretend /api/subscribe. node tests/serve.mjs <port>
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site'), FIX = path.join(ROOT, 'tests/out/fixtures');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.xml': 'application/rss+xml' };
let scenario = 'ok';
export function start(port = 0) {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__scenario') { scenario = u.searchParams.get('name') || 'ok'; res.end('ok'); return; }
    if (u.pathname === '/data/status.json') { res.writeHead(200, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' }); res.end(fs.readFileSync(path.join(FIX, scenario + '.json'))); return; }
    if (u.pathname === '/feed.xml') { res.writeHead(200, { 'content-type': TYPES['.xml'] }); res.end(fs.readFileSync(path.join(FIX, 'feed.xml'))); return; }
    if (u.pathname === '/api/subscribe' || u.pathname === '/api/confirm' || u.pathname === '/api/unsubscribe') { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); }); return; }
    let p = u.pathname === '/' ? '/index.html' : u.pathname === '/confirm' ? '/confirm.html' : u.pathname === '/unsubscribe' ? '/unsubscribe.html' : u.pathname;
    const f = path.join(SITE, path.normalize(p));
    if (!f.startsWith(SITE) || !fs.existsSync(f)) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'" });
    res.end(fs.readFileSync(f));
  });
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r(srv)));
}
if (process.argv[1] && process.argv[1].endsWith('serve.mjs')) start(Number(process.argv[2] || 8787)).then((s) => console.log('http://127.0.0.1:' + s.address().port));
