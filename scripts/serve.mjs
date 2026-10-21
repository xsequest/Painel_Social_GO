import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

const root = resolve(process.argv[2] || '.');
const base = process.argv[3] || '/';
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.topojson': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'
};

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith(base)) {
      response.writeHead(404).end('Not found');
      return;
    }
    const relative = pathname.slice(base.length) || 'index.html';
    const file = resolve(root, relative);
    if (!file.startsWith(root + sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const contents = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    response.end(contents);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Unable to serve file');
  }
}).listen(8080, '127.0.0.1', () => console.log(`http://127.0.0.1:8080${base}`));
