// API de agendamentos — independente de plataforma.
// Recebe uma requisição simples e um "store" (Upstash Redis em produção,
// arquivo JSON local em desenvolvimento) e devolve { status, body, headers }.

import { defaultConfig } from './default-config.js';
import { availableSlots, monthStatus, resources, datesInWindow, dateWindowStatus, lastBookableDate, overlaps, SHOP_RESOURCE } from './availability.js';
import { nowInZone, isValidDate, toMin, fromMin, addDays, diffDays } from './time.js';
import { HttpError, validateBookingInput, sanitizeConfig, slugId, bookingCode, cleanText } from './validate.js';
import * as portfolio from './portfolio.js';
import { passwordMatches, createToken, verifyToken, sessionCookie, clearCookie, readCookie, COOKIE } from './auth.js';

const MAX_ACTIVE_PER_PHONE_PER_DAY = 2;

const json = (status, body, headers = {}) => ({ status, body, headers });
const keyDay = (date) => `bk:${date}`;

// --- configuração ------------------------------------------------------------
async function loadConfig(store) {
  const saved = await store.get('config');
  const base = defaultConfig();
  if (!saved) return base;
  // garante campos novos em configurações antigas
  return {
    ...base, ...saved,
    business: { ...base.business, ...saved.business },
    booking: { ...base.booking, ...saved.booking },
    categories: base.categories,
  };
}

function publicConfig(config, now) {
  const hasPros = (config.professionals || []).some((p) => p.active);
  return {
    business: config.business,
    categories: config.categories,
    services: config.services.filter((s) => s.active)
      .map(({ id, name, category, priceCents, durationMin }) => ({ id, name, category, priceCents, durationMin })),
    professionals: hasPros ? config.professionals.filter((p) => p.active).map(({ id, name }) => ({ id, name })) : [],
    hours: config.hoursConfirmed ? config.hours : null,
    booking: { maxDaysAhead: config.booking.maxDaysAhead },
    today: now.date,
    maxDate: lastBookableDate(config, now),
  };
}

function findService(config, id) {
  const s = config.services.find((x) => x.id === id && x.active);
  if (!s) throw new HttpError(404, 'service', 'Serviço não encontrado. Atualize a página e tente novamente.');
  return s;
}

function checkPro(config, id) {
  if (!id || id === 'any') return 'any';
  const ok = resources(config).some((r) => r.id === id);
  if (!ok) throw new HttpError(404, 'professional', 'Profissional indisponível. Escolha outro.');
  return id;
}

// --- rotas públicas -----------------------------------------------------------
async function getCalendar(ctx, q) {
  const { store, config, now } = ctx;
  const month = q.get('month') || now.date.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, 'month', 'Mês inválido.');
  const service = findService(config, q.get('service'));
  const professionalId = checkPro(config, q.get('pro'));
  const dates = datesInWindow(config, month, now);
  const lists = dates.length ? await store.mget(dates.map(keyDay)) : [];
  const byDate = Object.fromEntries(dates.map((d, i) => [d, lists[i] || []]));
  const days = monthStatus(config, month, { durationMin: service.durationMin, professionalId }, byDate, now);
  return json(200, { month, days, today: now.date, maxDate: lastBookableDate(config, now) });
}

async function getSlots(ctx, q) {
  const { store, config, now } = ctx;
  const date = q.get('date');
  if (!isValidDate(date)) throw new HttpError(400, 'date', 'Data inválida.');
  const service = findService(config, q.get('service'));
  const professionalId = checkPro(config, q.get('pro'));
  const bookings = (await store.get(keyDay(date))) || [];
  const slots = availableSlots(config, { date, durationMin: service.durationMin, professionalId }, bookings, now);
  return json(200, { date, slots: slots.map((s) => s.time), window: dateWindowStatus(config, date, now) }, { 'cache-control': 'no-store' });
}

async function createBooking(ctx, body) {
  const { store, config, ip } = ctx;
  const hits = await store.incrWindow(`rl:bk:${ip}`, 3600);
  if (hits > 15) throw new HttpError(429, 'rate', 'Muitas tentativas. Aguarde alguns minutos.');

  const input = validateBookingInput(body);
  const service = findService(config, input.serviceId);
  const professionalId = checkPro(config, input.professionalId);

  return store.withLock(`lock:${keyDay(input.date)}`, async () => {
    const now = ctx.clock(); // "agora" medido já dentro da trava
    if (dateWindowStatus(config, input.date, now) !== 'ok') throw new HttpError(409, 'date_closed', 'Essa data não está aberta para agendamento.');
    const bookings = (await store.get(keyDay(input.date))) || [];

    if (input.requestId) {
      const prev = bookings.find((b) => b.requestId === input.requestId && b.status === 'confirmed');
      if (prev) return json(200, { booking: publicBooking(prev), repeated: true });
    }

    const start = toMin(input.time), end = start + service.durationMin;
    const mine = bookings.filter((b) => b.status === 'confirmed' && b.phone === input.phone);
    if (mine.some((b) => overlaps([start, end], [toMin(b.start), toMin(b.end)]))) {
      throw new HttpError(409, 'duplicate', 'Você já tem um agendamento nesse horário.');
    }
    if (mine.length >= MAX_ACTIVE_PER_PHONE_PER_DAY) {
      throw new HttpError(409, 'limit', 'Você já tem agendamentos nesse dia. Fale com a barbearia para marcar mais.');
    }

    const slots = availableSlots(config, { date: input.date, durationMin: service.durationMin, professionalId }, bookings, now);
    const slot = slots.find((s) => s.time === input.time);
    if (!slot) throw new HttpError(409, 'slot_taken', 'Esse horário acabou de ficar indisponível. Escolha outro.');

    // "Sem preferência": entrega para quem tem menos atendimentos no dia.
    const load = (id) => bookings.filter((b) => b.status === 'confirmed' && b.resourceId === id).length;
    const resourceId = professionalId !== 'any' ? professionalId
      : [...slot.resourceIds].sort((a, b) => load(a) - load(b))[0];
    const pro = config.professionals.find((p) => p.id === resourceId);

    const booking = {
      id: `${input.date}.${slugId()}`,
      code: bookingCode(),
      date: input.date,
      start: input.time,
      end: fromMin(end),
      serviceId: service.id,
      serviceName: service.name,
      priceCents: service.priceCents,
      durationMin: service.durationMin,
      resourceId,
      professionalName: pro ? pro.name : null,
      chosenProfessional: professionalId !== 'any',
      name: input.name,
      phone: input.phone,
      status: 'confirmed',
      requestId: input.requestId || null,
      createdAt: new Date().toISOString(),
    };
    bookings.push(booking);
    bookings.sort((a, b) => toMin(a.start) - toMin(b.start));
    await store.set(keyDay(input.date), bookings);
    return json(201, { booking: publicBooking(booking) });
  });
}

/** O que o cliente pode ver do próprio agendamento (sem dados de outros). */
function publicBooking(b) {
  return {
    code: b.code, date: b.date, start: b.start, end: b.end,
    serviceName: b.serviceName, priceCents: b.priceCents, durationMin: b.durationMin,
    professionalName: b.professionalName, name: b.name,
  };
}

// --- painel -------------------------------------------------------------------
async function isAdmin(ctx) {
  return verifyToken(ctx.env, readCookie(ctx.headers.cookie, COOKIE));
}

async function requireAdmin(ctx, method) {
  if (!ctx.env.ADMIN_PASSWORD) throw new HttpError(503, 'admin_unconfigured', 'Defina a variável ADMIN_PASSWORD para liberar o painel.');
  if (!(await isAdmin(ctx))) throw new HttpError(401, 'auth', 'Sessão expirada. Entre novamente.');
  // proteção extra contra CSRF: escrita exige cabeçalho próprio
  if (method !== 'GET' && ctx.headers['x-requested-with'] !== 'lasantos') throw new HttpError(403, 'csrf', 'Requisição recusada.');
}

async function login(ctx, body) {
  if (!ctx.env.ADMIN_PASSWORD) throw new HttpError(503, 'admin_unconfigured', 'Painel ainda não configurado: defina ADMIN_PASSWORD no servidor.');
  const hits = await ctx.store.incrWindow(`rl:login:${ctx.ip}`, 900);
  if (hits > 8) throw new HttpError(429, 'rate', 'Muitas tentativas. Tente de novo em 15 minutos.');
  const ok = await passwordMatches(body && body.password, ctx.env.ADMIN_PASSWORD);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 400));
    throw new HttpError(401, 'password', 'Senha incorreta.');
  }
  const token = await createToken(ctx.env);
  return json(200, { ok: true }, { 'set-cookie': sessionCookie(token, ctx.secure) });
}

async function adminConfig(ctx) {
  const { config, now } = ctx;
  // bloqueios passados são removidos da visualização
  return json(200, { config: { ...config, blocks: config.blocks.filter((b) => b.date >= now.date) }, today: now.date });
}

async function saveConfig(ctx, body) {
  const { store, now } = ctx;
  return store.withLock('lock:config', async () => {
    const current = await loadConfig(store);
    if (!body || body.version !== current.version) {
      throw new HttpError(409, 'version', 'A configuração foi alterada em outro aparelho. Recarregue para ver a versão atual.');
    }
    const next = sanitizeConfig({ ...body, __today: now.date }, current);
    next.version = current.version + 1;
    await store.set('config', next);

    // avisa se algum bloqueio novo cobre agendamentos já confirmados
    const dates = [...new Set(next.blocks.map((b) => b.date))].slice(0, 120);
    const lists = dates.length ? await store.mget(dates.map(keyDay)) : [];
    const conflicts = [];
    dates.forEach((date, i) => {
      for (const bk of lists[i] || []) {
        if (bk.status !== 'confirmed') continue;
        const hit = next.blocks.some((bl) => bl.date === date && (!bl.professionalId || bl.professionalId === bk.resourceId) &&
          (bl.allDay || overlaps([toMin(bl.start), toMin(bl.end)], [toMin(bk.start), toMin(bk.end)])));
        if (hit) conflicts.push({ date, start: bk.start, name: bk.name });
      }
    });
    return json(200, { config: next, conflicts });
  });
}

async function listBookings(ctx, q) {
  const { store, now } = ctx;
  const from = q.get('from') || now.date;
  const to = q.get('to') || from;
  if (!isValidDate(from) || !isValidDate(to) || diffDays(from, to) < 0) throw new HttpError(400, 'range', 'Período inválido.');
  if (diffDays(from, to) > 62) throw new HttpError(400, 'range', 'Período máximo de 62 dias.');
  const dates = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  const lists = await store.mget(dates.map(keyDay));
  const bookings = lists.flatMap((l) => l || []).map(({ requestId, ...b }) => b);
  return json(200, { from, to, bookings, today: now.date, nowMinute: now.minute }, { 'cache-control': 'no-store' });
}

async function cancelBooking(ctx, body) {
  const id = cleanText(body && body.id, 60);
  const date = id.split('.')[0];
  if (!isValidDate(date)) throw new HttpError(400, 'id', 'Agendamento inválido.');
  return ctx.store.withLock(`lock:${keyDay(date)}`, async () => {
    const list = (await ctx.store.get(keyDay(date))) || [];
    const b = list.find((x) => x.id === id);
    if (!b) throw new HttpError(404, 'not_found', 'Agendamento não encontrado.');
    if (b.status === 'cancelled') return json(200, { booking: b });
    b.status = 'cancelled';
    b.cancelledAt = new Date().toISOString();
    b.cancelReason = cleanText(body.reason, 120);
    await ctx.store.set(keyDay(date), list);
    return json(200, { booking: b });
  });
}

// --- roteador -------------------------------------------------------------------
/**
 * @param {{method:string, path:string, query:URLSearchParams, headers:Object, body:any, ip:string, secure:boolean}} req
 * @param {{store:any, env:Object, clock?:Function}} deps
 */
export async function handle(req, deps) {
  try {
    if (!deps.store) {
      throw new HttpError(503, 'storage_unconfigured',
        'Agendamento indisponível: o banco de dados ainda não foi configurado no servidor.');
    }
    const clockTz = { tz: 'America/Sao_Paulo' };
    const config = await loadConfig(deps.store);
    clockTz.tz = config.timezone;
    const clock = deps.clock || (() => nowInZone(clockTz.tz));
    const ctx = {
      store: deps.store, env: deps.env || {}, config, clock, now: clock(),
      headers: req.headers || {}, ip: req.ip || 'unknown', secure: !!req.secure,
    };
    const q = req.query || new URLSearchParams();
    const route = `${req.method} ${req.path.replace(/\/+$/, '')}`;

    switch (route) {
      case 'GET /health': return json(200, { ok: true });
      case 'GET /public/config':
        return json(200, { ...publicConfig(config, ctx.now), portfolioCount: await portfolio.count(ctx.store) }, { 'cache-control': 'no-store' });
      case 'GET /public/portfolio': return json(200, { ...(await portfolio.publicList(ctx.store, config)), business: config.business }, { 'cache-control': 'no-store' });
      case 'GET /public/portfolio/img': return await portfolio.image(ctx.store, q);
      case 'GET /public/calendar': return await getCalendar(ctx, q);
      case 'GET /public/slots': return await getSlots(ctx, q);
      case 'POST /public/bookings': return await createBooking(ctx, req.body);

      case 'POST /admin/login': return await login(ctx, req.body);
      case 'POST /admin/logout': return json(200, { ok: true }, { 'set-cookie': clearCookie(ctx.secure) });
      case 'GET /admin/session':
        return json(200, { authenticated: await isAdmin(ctx), configured: !!ctx.env.ADMIN_PASSWORD });
    }
    if (route.startsWith('GET /admin/') || route.startsWith('PUT /admin/') || route.startsWith('POST /admin/')) {
      await requireAdmin(ctx, req.method);
      switch (route) {
        case 'GET /admin/config': return await adminConfig(ctx);
        case 'PUT /admin/config': return await saveConfig(ctx, req.body);
        case 'GET /admin/bookings': return await listBookings(ctx, q);
        case 'POST /admin/bookings/cancel': return await cancelBooking(ctx, req.body);
        case 'GET /admin/portfolio': return json(200, await portfolio.adminList(ctx.store));
        case 'POST /admin/portfolio': return json(201, await portfolio.add(ctx.store, config, req.body));
        case 'POST /admin/portfolio/update': return json(200, await portfolio.update(ctx.store, config, req.body));
        case 'POST /admin/portfolio/delete': return json(200, await portfolio.remove(ctx.store, req.body));
        case 'POST /admin/portfolio/reorder': return json(200, await portfolio.reorder(ctx.store, req.body));
      }
    }
    return json(404, { error: { code: 'not_found', message: 'Rota não encontrada.' } });
  } catch (err) {
    if (err instanceof HttpError) {
      return json(err.status, { error: { code: err.code, message: err.message, ...(err.extra || {}) } });
    }
    console.error('[la-santos] erro interno', err);
    return json(500, { error: { code: 'internal', message: 'Erro inesperado. Tente novamente em instantes.' } });
  }
}

export { SHOP_RESOURCE };
