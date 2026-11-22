// Armazenamento em produção: Upstash Redis via REST (funciona em funções
// serverless da Vercel, sem dependências). Variáveis aceitas:
//   KV_REST_API_URL / KV_REST_API_TOKEN          (integração Upstash pela Vercel)
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN

import { HttpError } from '../validate.js';

const PREFIX = 'lasantos:';
const UNLOCK = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export function upstashFromEnv(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return createUpstashStore(url.replace(/\/+$/, ''), token);
}

export function createUpstashStore(url, token) {
  async function call(cmd) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(`Upstash: ${data.error || res.status}`);
    return data.result;
  }
  const parse = (v) => (v == null ? null : JSON.parse(v));

  return {
    async get(key) { return parse(await call(['GET', PREFIX + key])); },
    async mget(keys) {
      if (!keys.length) return [];
      return (await call(['MGET', ...keys.map((k) => PREFIX + k)])).map(parse);
    },
    async set(key, value) { await call(['SET', PREFIX + key, JSON.stringify(value)]); },
    async del(key) { await call(['DEL', PREFIX + key]); },
    async incrWindow(key, ttlSec) {
      const n = await call(['INCR', PREFIX + key]);
      if (n === 1) await call(['EXPIRE', PREFIX + key, String(ttlSec)]);
      return n;
    },
    async withLock(key, fn) {
      const k = PREFIX + key;
      const id = crypto.randomUUID();
      for (let i = 0; i < 50; i++) {
        if ((await call(['SET', k, id, 'NX', 'PX', '10000'])) === 'OK') {
          try { return await fn(); } finally { await call(['EVAL', UNLOCK, '1', k, id]).catch(() => {}); }
        }
        await new Promise((r) => setTimeout(r, 60 + Math.random() * 60));
      }
      throw new HttpError(503, 'busy', 'Muitos agendamentos ao mesmo tempo. Tente novamente.');
    },
  };
}
