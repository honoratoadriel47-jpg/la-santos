// Converte req/res do Node (Vercel ou servidor local) para o handler da API.
import { handle } from './app.js';

const MAX_BODY = 32 * 1024;
const MAX_UPLOAD = 3 * 1024 * 1024; // envio de foto do portfólio (já reduzida no navegador)

async function readBody(req, limit) {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return null; } }
    if (Buffer.isBuffer(req.body)) { try { return JSON.parse(req.body.toString('utf8')); } catch { return null; } }
    return req.body;
  }
  if (req.method === 'GET' || req.method === 'HEAD') return null;
  let size = 0; const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) return null;
    chunks.push(c);
  }
  if (!chunks.length) return null;
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}

export async function nodeHandler(req, res, { store, env, routeOverride }) {
  const url = new URL(req.url, 'http://local');
  let path = routeOverride ?? url.searchParams.get('route') ?? url.pathname.replace(/^\/api\/v1/, '');
  url.searchParams.delete('route');
  if (!path.startsWith('/')) path = '/' + path;

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
  const ip = (headers['x-forwarded-for'] || '').split(',')[0].trim() || headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
  const secure = headers['x-forwarded-proto'] === 'https' || !!req.socket?.encrypted;

  const out = await handle({
    method: req.method, path, query: url.searchParams, headers, body: await readBody(req, path === '/admin/portfolio' ? MAX_UPLOAD : MAX_BODY), ip, secure,
  }, { store, env });

  res.statusCode = out.status;
  if (out.raw) { // imagem
    for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
    res.setHeader('x-content-type-options', 'nosniff');
    return res.end(Buffer.from(out.raw));
  }
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('x-content-type-options', 'nosniff');
  if (!out.headers['cache-control']) res.setHeader('cache-control', 'no-store');
  for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
  res.end(JSON.stringify(out.body));
}
