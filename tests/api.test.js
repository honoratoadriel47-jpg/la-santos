// Testes da API e da lógica de disponibilidade.  Rodar: node --test tests/
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handle } from '../lib/app.js';
import { createFileStore } from '../lib/store/file.js';

const env = { ADMIN_PASSWORD: 'senha-de-teste-123' };
// Segunda 23/11/2026, 10:00 em São Paulo
let clockNow = { date: '2026-11-23', minute: 600 };
let store;

beforeEach(async () => {
  store = await createFileStore(join(await mkdtemp(join(tmpdir(), 'ls-')), 'db.json'));
  clockNow = { date: '2026-11-23', minute: 600 };
});

async function call(method, path, { body, query, cookie, csrf = true, ip = '1.1.1.1' } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (csrf) headers['x-requested-with'] = 'lasantos';
  const res = await handle({ method, path, query: new URLSearchParams(query || {}), headers, body, ip, secure: false },
    { store, env, clock: () => clockNow });
  return res;
}
async function adminCookie() {
  const r = await call('POST', '/admin/login', { body: { password: env.ADMIN_PASSWORD } });
  assert.equal(r.status, 200);
  return r.headers['set-cookie'].split(';')[0];
}
const book = (over = {}, opts = {}) => call('POST', '/public/bookings', {
  body: { serviceId: 'barba', professionalId: 'any', date: '2026-11-24', time: '09:00', name: 'João Teste', phone: '(27) 99999-1111', ...over }, ...opts,
});

test('config pública traz os 24 serviços e nenhum dado sensível', async () => {
  const r = await call('GET', '/public/config');
  assert.equal(r.status, 200);
  assert.equal(r.body.services.length, 24);
  const corte = r.body.services.find((s) => s.name === 'Corte + Nevou');
  assert.deepEqual([corte.priceCents, corte.durationMin], [14000, 60]);
  assert.equal(r.body.blocks, undefined);
  assert.equal(r.body.professionals.length, 0);
});

test('horários respeitam funcionamento, duração e antecedência', async () => {
  // terça 09:00–19:00, Corte + Nevou (60 min) → último início 18:00
  let r = await call('GET', '/public/slots', { query: { date: '2026-11-24', service: 'corte-nevou' } });
  assert.equal(r.body.slots[0], '09:00');
  assert.equal(r.body.slots.at(-1), '18:00');
  // segunda está fechada
  r = await call('GET', '/public/slots', { query: { date: '2026-11-23', service: 'barba' } });
  assert.deepEqual(r.body.slots, []);
  // hoje (terça) às 10:00 com 60 min de antecedência → primeiro horário 11:00
  clockNow = { date: '2026-11-24', minute: 600 };
  r = await call('GET', '/public/slots', { query: { date: '2026-11-24', service: 'barba' } });
  assert.equal(r.body.slots[0], '11:00');
  // data passada e além da janela
  r = await call('GET', '/public/slots', { query: { date: '2026-11-20', service: 'barba' } });
  assert.deepEqual(r.body.slots, []);
  r = await call('GET', '/public/slots', { query: { date: '2027-03-01', service: 'barba' } });
  assert.deepEqual(r.body.slots, []);
});

test('agendamento é registrado e aparece no painel', async () => {
  const r = await book();
  assert.equal(r.status, 201);
  assert.match(r.body.booking.code, /^[A-Z2-9]{6}$/);
  assert.equal(r.body.booking.priceCents, 2500);
  assert.equal(r.body.booking.end, '09:15');
  assert.equal(r.body.booking.phone, undefined, 'resposta pública não devolve telefone');
  const cookie = await adminCookie();
  const list = await call('GET', '/admin/bookings', { cookie, query: { from: '2026-11-24', to: '2026-11-24' } });
  assert.equal(list.status, 200);
  assert.equal(list.body.bookings.length, 1);
  assert.equal(list.body.bookings[0].phone, '27999991111');
});

test('horário ocupado some e não pode ser reservado de novo', async () => {
  assert.equal((await book({ serviceId: 'corte-nevou' })).status, 201); // 09:00–10:00
  const slots = (await call('GET', '/public/slots', { query: { date: '2026-11-24', service: 'barba' } })).body.slots;
  assert.ok(!slots.includes('09:00') && !slots.includes('09:45'));
  assert.ok(slots.includes('10:00'));
  const again = await book({ time: '09:30', phone: '27988887777', name: 'Outro' });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'slot_taken');
});

test('20 pedidos simultâneos no mesmo horário: só 1 é aceito', async () => {
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    book({ time: '14:00', phone: `2799${String(1000000 + i).padStart(7, '0')}`, name: `Cliente ${i}` }, { ip: `9.9.9.${i}` })));
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 19);
});

test('mesmo pedido enviado duas vezes não duplica (idempotência)', async () => {
  const a = await book({ requestId: 'req-abc-123' });
  const b = await book({ requestId: 'req-abc-123' });
  assert.equal(a.status, 201); assert.equal(b.status, 200);
  assert.equal(a.body.booking.code, b.body.booking.code);
});

test('mesmo telefone não marca dois horários sobrepostos', async () => {
  const cookie = await adminCookie();
  const cfg = (await call('GET', '/admin/config', { cookie })).body.config;
  cfg.professionals = [{ name: 'Profissional A' }, { name: 'Profissional B' }];
  assert.equal((await call('PUT', '/admin/config', { cookie, body: cfg })).status, 200);
  assert.equal((await book()).status, 201);
  const dup = await book({ time: '09:00' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'duplicate');
});

test('validação de dados do cliente', async () => {
  assert.equal((await book({ name: 'A' })).body.error.code, 'name');
  assert.equal((await book({ phone: '1234' })).body.error.code, 'phone');
  assert.equal((await book({ time: '25:00' })).body.error.code, 'time');
  assert.equal((await book({ serviceId: 'nao-existe' })).status, 404);
  assert.equal((await book({ website: 'http://spam' })).status, 400);
  assert.equal((await book({ time: '09:07' })).status, 409, 'fora da grade de horários');
});

test('painel exige login e cabeçalho anti-CSRF', async () => {
  assert.equal((await call('GET', '/admin/config')).status, 401);
  assert.equal((await call('POST', '/admin/login', { body: { password: 'errada' } })).status, 401);
  const cookie = await adminCookie();
  assert.equal((await call('GET', '/admin/config', { cookie })).status, 200);
  const cfg = (await call('GET', '/admin/config', { cookie })).body.config;
  assert.equal((await call('PUT', '/admin/config', { cookie, body: cfg, csrf: false })).status, 403);
  assert.equal((await call('GET', '/admin/config', { cookie: 'ls_admin=forjado.abc' })).status, 401);
});

test('alteração de preço e duração reflete no site e na disponibilidade', async () => {
  const cookie = await adminCookie();
  const cfg = (await call('GET', '/admin/config', { cookie })).body.config;
  const barba = cfg.services.find((s) => s.id === 'barba');
  barba.priceCents = 3000; barba.durationMin = 600; // impossível caber no dia
  const save = await call('PUT', '/admin/config', { cookie, body: cfg });
  assert.equal(save.status, 400, 'duração acima de 480 é recusada');
  barba.durationMin = 30;
  assert.equal((await call('PUT', '/admin/config', { cookie, body: cfg })).status, 200);
  const pub = await call('GET', '/public/config');
  assert.equal(pub.body.services.find((s) => s.id === 'barba').priceCents, 3000);
  const r = await book();
  assert.equal(r.body.booking.priceCents, 3000);
  assert.equal(r.body.booking.end, '09:30');
  // salvar com versão antiga é recusado (edição em dois aparelhos)
  assert.equal((await call('PUT', '/admin/config', { cookie, body: cfg })).status, 409);
});

test('bloqueio de horário e de data', async () => {
  const cookie = await adminCookie();
  const cfg = (await call('GET', '/admin/config', { cookie })).body.config;
  cfg.blocks = [
    { date: '2026-11-24', allDay: false, start: '12:00', end: '14:00', reason: 'Almoço' },
    { date: '2026-11-25', allDay: true, reason: 'Folga' },
  ];
  assert.equal((await call('PUT', '/admin/config', { cookie, body: cfg })).status, 200);
  const s24 = (await call('GET', '/public/slots', { query: { date: '2026-11-24', service: 'corte-maquina' } })).body.slots;
  assert.ok(!s24.includes('12:00') && !s24.includes('13:45') && !s24.includes('11:45'));
  assert.ok(s24.includes('11:30') && s24.includes('14:00'));
  const cal = (await call('GET', '/public/calendar', { query: { month: '2026-11', service: 'barba' } })).body.days;
  assert.equal(cal['2026-11-25'], 'blocked');
  assert.equal(cal['2026-11-23'], 'closed');
  assert.equal(cal['2026-11-22'], 'past');
  assert.equal(cal['2026-11-24'], 'available');
  assert.equal((await book({ date: '2026-11-25' })).status, 409);
});

test('cancelamento libera o horário', async () => {
  const r = await book({ serviceId: 'luzes' });
  const cookie = await adminCookie();
  const list = (await call('GET', '/admin/bookings', { cookie, query: { from: '2026-11-24' } })).body.bookings;
  const c = await call('POST', '/admin/bookings/cancel', { cookie, body: { id: list[0].id } });
  assert.equal(c.status, 200);
  assert.equal(c.body.booking.status, 'cancelled');
  assert.equal((await book({ serviceId: 'luzes', phone: '27911112222' })).status, 201);
  assert.equal(r.status, 201);
});

test('profissionais com agenda própria e "sem preferência"', async () => {
  const cookie = await adminCookie();
  const cfg = (await call('GET', '/admin/config', { cookie })).body.config;
  const week = cfg.hours.map((d) => ({ ...d }));
  week[2] = { open: true, start: '14:00', end: '19:00', breakStart: '', breakEnd: '' };
  cfg.professionals = [{ name: 'Ana' }, { name: 'Bruno', customHours: true, hours: week }];
  const saved = (await call('PUT', '/admin/config', { cookie, body: cfg })).body.config;
  const [ana, bruno] = saved.professionals;
  const sb = (await call('GET', '/public/slots', { query: { date: '2026-11-24', service: 'barba', pro: bruno.id } })).body.slots;
  assert.equal(sb[0], '14:00');
  // 09:00 só a Ana atende: dois clientes, o segundo deve ser recusado
  assert.equal((await book({ professionalId: 'any' })).body.booking.professionalName, 'Ana');
  assert.equal((await book({ professionalId: 'any', phone: '27922223333' })).status, 409);
  // 14:00 dois profissionais → dois clientes cabem
  assert.equal((await book({ time: '14:00', phone: '27933334444' })).status, 201);
  assert.equal((await book({ time: '14:00', phone: '27944445555' })).status, 201);
  assert.equal((await book({ time: '14:00', phone: '27955556666' })).status, 409);
  assert.ok(ana.id && bruno.id);
});

test('sem banco configurado a API recusa em vez de fingir', async () => {
  const r = await handle({ method: 'POST', path: '/public/bookings', query: new URLSearchParams(), headers: {}, body: {} }, { store: null, env });
  assert.equal(r.status, 503);
  assert.equal(r.body.error.code, 'storage_unconfigured');
});
