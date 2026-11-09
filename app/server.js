// Minimal static server for the BankPolicy Copilot lab web chat (no dependencies).
// Usage: node app/server.js   (PORT defaults to 3000)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3000);
const PAGE = path.join(__dirname, 'index.html');

http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', app: 'bankpolicy-web-chat', build: '1.2.1' }));
  }
  if (req.url === '/' || req.url.startsWith('/?')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(PAGE).pipe(res);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}).listen(PORT, '127.0.0.1', () => {
  console.log(`BankPolicy web chat running at http://127.0.0.1:${PORT}/`);
});
