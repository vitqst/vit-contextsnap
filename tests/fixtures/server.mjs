import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';

const fixture = await readFile(new URL('./capture.html', import.meta.url));
const server = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('ready');
    return;
  }
  if (request.url !== '/' && request.url !== '/capture.html') {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'none'",
  });
  response.end(fixture);
});

server.listen(4179, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
