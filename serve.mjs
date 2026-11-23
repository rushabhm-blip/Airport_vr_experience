// Tiny static server for local development: `node serve.mjs [port]`
// WebXR needs a secure context. `http://localhost` counts as secure, so on a Quest connected by USB use:
//   adb reverse tcp:8080 tcp:8080     then open  http://localhost:8080  in the Quest Browser.
// Otherwise host this folder on any HTTPS static host (GitHub Pages, Netlify, Cloudflare Pages...).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 8080);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4' };

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    const head = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
    // byte ranges: browsers stream video in pieces (Edge will not play an mp4 at all without them)
    const m = /bytes=(d*)-(d*)/.exec(req.headers.range || '');
    if (m) { const start = m[1] ? +m[1] : Math.max(0, data.length - +m[2]), end = m[1] && m[2] ? Math.min(+m[2], data.length - 1) : data.length - 1;
      res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 }); res.end(data.subarray(start, end + 1)); return; }
    res.writeHead(200, { ...head, 'Content-Length': data.length });
    res.end(data);
  });
}).listen(port, '0.0.0.0', () => {
  console.log(`Saath XR dev server:  http://localhost:${port}`);
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log(`  LAN (needs HTTPS for WebXR): http://${i.address}:${port}`);
  console.log('Quest over USB:  adb reverse tcp:%d tcp:%d  then open http://localhost:%d in the Quest Browser', port, port, port);
});
