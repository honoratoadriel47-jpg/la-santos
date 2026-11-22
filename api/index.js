// Função serverless da Vercel: todas as rotas /api/v1/* chegam aqui
// (ver rewrites em vercel.json).
import { nodeHandler } from '../lib/node-adapter.js';
import { upstashFromEnv } from '../lib/store/upstash.js';

const store = upstashFromEnv(process.env); // null => API responde 503 (sem confirmação falsa)

export default async function handler(req, res) {
  await nodeHandler(req, res, { store, env: process.env });
}
