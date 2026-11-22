// Armazenamento local para desenvolvimento e testes: um arquivo JSON.
// Não use em produção serverless (o disco da Vercel não é persistente).
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function createFileStore(path) {
  await mkdir(dirname(path), { recursive: true });
  let data = {};
  try { data = JSON.parse(await readFile(path, 'utf8')); } catch { data = {}; }
  const counters = new Map();
  const locks = new Map();
  let writing = Promise.resolve();

  const persist = () => {
    writing = writing.then(async () => {
      const tmp = `${path}.tmp`;
      await writeFile(tmp, JSON.stringify(data, null, 1));
      await rename(tmp, path);
    });
    return writing;
  };
  const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));

  return {
    async get(key) { return clone(data[key]); },
    async mget(keys) { return keys.map((k) => clone(data[k])); },
    async set(key, value) { data[key] = clone(value); await persist(); },
    async del(key) { delete data[key]; await persist(); },
    async incrWindow(key, ttlSec) {
      const now = Date.now();
      const c = counters.get(key);
      if (!c || c.exp < now) { counters.set(key, { n: 1, exp: now + ttlSec * 1000 }); return 1; }
      c.n += 1; return c.n;
    },
    async withLock(key, fn) {
      const prev = locks.get(key) || Promise.resolve();
      let release;
      const next = new Promise((r) => { release = r; });
      locks.set(key, prev.then(() => next));
      await prev;
      try { return await fn(); } finally { release(); }
    },
  };
}
