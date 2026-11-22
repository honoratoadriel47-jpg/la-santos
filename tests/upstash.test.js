// Testa o adaptador Upstash contra um servidor REST simulado (mesmo protocolo
// da Upstash: POST com o comando em JSON), incluindo a trava distribuída.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createUpstashStore } from '../lib/store/upstash.js';
import { handle } from '../lib/app.js';

const db = new Map(); const exp = new Map();
let server, url;
const alive = (k) => { if (exp.has(k) && exp.get(k) < Date.now()) { db.delete(k); exp.delete(k); } return db.has(k); };

function run(cmd) {
  const [op, ...a] = cmd;
  switch (op.toUpperCase()) {
    case 'GET': return alive(a[0]) ? db.get(a[0]) : null;
    case 'MGET': return a.map((k) => (alive(k) ? db.get(k) : null));
    case 'SET': {
      const [k, v, ...opts] = a;
      const nx = opts.includes('NX'); const px = opts.indexOf('PX');
      if (nx && alive(k)) return null;
      db.set(k, v); exp.delete(k);
      if (px >= 0) exp.set(k, Date.now() + Number(opts[px + 1]));
      return 'OK';
    }
    case 'DEL': { const had = db.delete(a[0]); return had ? 1 : 0; }
    case 'INCR': { const n = Number(alive(a[0]) ? db.get(a[0]) : 0) + 1; db.set(a[0], String(n)); return n; }
    case 'EXPIRE': exp.set(a[0], Date.now() + Number(a[1]) * 1000); return 1;
    case 'EVAL': { const [, , k, v] = a; if (alive(k) && db.get(k) === v) { db.delete(k); return 1; } return 0; }
    default: throw new Error('cmd ' + op);
  }
}

before(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.headers.authorization !== 'Bearer tok') { res.statusCode = 401; return res.end('{"error":"unauthorized"}'); }
      // latência aleatória para provocar corridas
      setTimeout(() => {
        try { res.end(JSON.stringify({ result: run(JSON.parse(body)) })); } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })); }
      }, Math.random() * 8);
    });
  });
  await new Promise((r) => server.listen(0, r));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('Upstash: grava, lê e impede reserva dupla sob concorrência', async () => {
  const store = createUpstashStore(url, 'tok');
  await store.set('x', { a: 1 });
  assert.deepEqual(await store.get('x'), { a: 1 });
  assert.deepEqual(await store.mget(['x', 'nada']), [{ a: 1 }, null]);

  const clock = () => ({ date: '2026-11-23', minute: 600 });
  const env = { ADMIN_PASSWORD: 'x' };
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => handle({
    method: 'POST', path: '/public/bookings', query: new URLSearchParams(), headers: {}, ip: `10.0.0.${i}`,
    body: { serviceId: 'corte-maquina', date: '2026-11-24', time: '10:00', name: `Cliente ${i}`, phone: `2799${String(1000000 + i)}` },
  }, { store, env, clock })));
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  const saved = await store.get('bk:2026-11-24');
  assert.equal(saved.length, 1);
  assert.equal([...db.keys()].filter((k) => k.includes('lock:')).length, 0, 'travas liberadas');
});
