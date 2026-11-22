// Servidor local (sem dependências): serve o site e a API.
//   node server.js                → http://localhost:3000
// Usa Upstash se as variáveis existirem; senão grava em ./data/db.json.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeHandler } from './lib/node-adapter.js';
import { upstashFromEnv } from './lib/store/upstash.js';
import { createFileStore } from './lib/store/file.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const pub = join(root, 'public');
const env = { ...process.env };
if (!env.ADMIN_PASSWORD) {
  env.ADMIN_PASSWORD = 'lasantos-dev';
  console.warn('⚠  ADMIN_PASSWORD não definida — usando senha de desenvolvimento "lasantos-dev".');
}
const store = upstashFromEnv(env) || await createFileStore(env.DATA_FILE || join(root, 'data', 'db.json'));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};
const SECURITY = {
  'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY', 'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

async function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(pub, p));
  if (!file.startsWith(pub)) { res.statusCode = 403; return res.end(); }
  try {
    let f = file;
    if ((await stat(f)).isDirectory()) f = join(f, 'index.html');
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream', ...SECURITY,
      'cache-control': f.includes('/assets/') ? 'public, max-age=86400' : 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Não encontrado');
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/v1/')) return await nodeHandler(req, res, { store, env });
    if (req.url === '/admin') { res.writeHead(301, { location: '/admin/' }); return res.end(); }
    return await serveStatic(req, res);
  } catch (e) {
    console.error(e); res.statusCode = 500; res.end();
  }
});
const port = Number(env.PORT || 3000);
server.listen(port, () => console.log(`LA SANTOS rodando em http://localhost:${port}  (painel: /admin)`));
