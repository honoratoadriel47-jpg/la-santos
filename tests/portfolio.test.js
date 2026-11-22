// Portfólio: só o painel envia/edita; o público só lê.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handle } from '../lib/app.js';
import { createFileStore } from '../lib/store/file.js';

const env = { ADMIN_PASSWORD: 'senha-teste' };
let store;
beforeEach(async () => { store = await createFileStore(join(await mkdtemp(join(tmpdir(), 'lsp-')), 'db.json')); });

const call = (method, path, { body, query, cookie } = {}) => handle({
  method, path, query: new URLSearchParams(query || {}), body, ip: '1.1.1.1',
  headers: { ...(cookie ? { cookie } : {}), 'x-requested-with': 'lasantos' },
}, { store, env, clock: () => ({ date: '2026-11-23', minute: 600 }) });
const login = async () => (await call('POST', '/admin/login', { body: { password: env.ADMIN_PASSWORD } })).headers['set-cookie'].split(';')[0];

const jpeg = (n = 200) => 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, 7)]).toString('base64');
const webp = () => 'data:image/webp;base64,' + Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(100, 1)]).toString('base64');

test('público não consegue enviar nem apagar fotos', async () => {
  assert.equal((await call('POST', '/admin/portfolio', { body: { image: jpeg(), thumb: jpeg() } })).status, 401);
  assert.equal((await call('POST', '/admin/portfolio/delete', { body: { id: 'ph-abc123' } })).status, 401);
});

test('envio, listagem pública, imagem binária, legenda, ordem e exclusão', async () => {
  const cookie = await login();
  const a = await call('POST', '/admin/portfolio', { cookie, body: { image: jpeg(), thumb: jpeg(50), caption: 'Degradê navalhado', w: 1200, h: 1600 } });
  assert.equal(a.status, 201);
  const b = await call('POST', '/admin/portfolio', { cookie, body: { image: webp(), thumb: webp(), w: 1600, h: 1200 } });
  assert.equal(b.status, 201);

  let pub = await call('GET', '/public/portfolio');
  assert.deepEqual(pub.body.photos.map((p) => p.id), [b.body.photo.id, a.body.photo.id], 'mais nova primeiro');
  assert.equal(pub.body.photos[1].caption, 'Degradê navalhado');
  assert.equal((await call('GET', '/public/config')).body.portfolioCount, 2);

  const img = await call('GET', '/public/portfolio/img', { query: { id: a.body.photo.id, size: 'full' } });
  assert.equal(img.status, 200);
  assert.equal(img.headers['content-type'], 'image/jpeg');
  assert.deepEqual([...img.raw.slice(0, 3)], [0xff, 0xd8, 0xff]);
  assert.equal((await call('GET', '/public/portfolio/img', { query: { id: '../config' } })).status, 404);

  await call('POST', '/admin/portfolio/update', { cookie, body: { id: a.body.photo.id, caption: 'Corte social' } });
  await call('POST', '/admin/portfolio/reorder', { cookie, body: { ids: [a.body.photo.id, b.body.photo.id] } });
  pub = await call('GET', '/public/portfolio');
  assert.equal(pub.body.photos[0].caption, 'Corte social');

  assert.equal((await call('POST', '/admin/portfolio/delete', { cookie, body: { id: a.body.photo.id } })).status, 200);
  assert.equal((await call('GET', '/public/portfolio/img', { query: { id: a.body.photo.id } })).status, 404);
  assert.equal((await call('GET', '/public/portfolio')).body.photos.length, 1);
});

test('rejeita arquivo que não é imagem ou grande demais', async () => {
  const cookie = await login();
  const fake = 'data:image/jpeg;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64');
  assert.equal((await call('POST', '/admin/portfolio', { cookie, body: { image: fake, thumb: jpeg() } })).status, 400);
  assert.equal((await call('POST', '/admin/portfolio', { cookie, body: { image: 'data:image/svg+xml;base64,PHN2Zz4=', thumb: jpeg() } })).status, 400);
  assert.equal((await call('POST', '/admin/portfolio', { cookie, body: { image: jpeg(1_700_000), thumb: jpeg() } })).status, 413);
});
