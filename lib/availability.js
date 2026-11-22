// Lógica de disponibilidade — fonte única de verdade.
// Funções puras: recebem a configuração, os agendamentos do dia e o "agora",
// e devolvem os horários livres. O servidor usa estas mesmas funções para
// validar cada agendamento dentro de uma trava (lock), então o que o cliente
// vê e o que o servidor aceita nunca divergem.

import { toMin, fromMin, weekday, diffDays, addDays, daysInMonth } from './time.js';

export const SHOP_RESOURCE = '_casa';

/** Profissionais ativos ou, sem equipe cadastrada, a agenda única da casa. */
export function resources(config) {
  const pros = (config.professionals || []).filter((p) => p.active);
  if (pros.length) return pros.map((p) => ({ id: p.id, name: p.name, pro: p }));
  return [{ id: SHOP_RESOURCE, name: null, pro: null }];
}

/** Intervalos de trabalho [[ini, fim]] em minutos de um recurso numa data. */
export function workIntervals(config, date, resource) {
  const wd = weekday(date);
  const pro = resource.pro;
  const day = pro && pro.customHours && Array.isArray(pro.hours) ? pro.hours[wd] : config.hours[wd];
  if (!day || !day.open) return [];
  // Profissional com horário próprio ainda respeita o funcionamento da casa.
  let intervals = [[toMin(day.start), toMin(day.end)]];
  if (day.breakStart && day.breakEnd) intervals = subtract(intervals, [toMin(day.breakStart), toMin(day.breakEnd)]);
  if (pro && pro.customHours) {
    const shop = config.hours[wd];
    if (!shop || !shop.open) return [];
    let shopIv = [[toMin(shop.start), toMin(shop.end)]];
    if (shop.breakStart && shop.breakEnd) shopIv = subtract(shopIv, [toMin(shop.breakStart), toMin(shop.breakEnd)]);
    intervals = intersect(intervals, shopIv);
  }
  return intervals.filter(([a, b]) => b > a);
}

/** Bloqueios que afetam um recurso numa data. */
export function blocksFor(config, date, resourceId) {
  return (config.blocks || []).filter((b) => b.date === date &&
    (!b.professionalId || b.professionalId === resourceId));
}

/** Intervalos ocupados (agendamentos confirmados + bloqueios) de um recurso. */
export function busyIntervals(config, date, resourceId, bookings) {
  const buffer = config.booking.bufferMin || 0;
  const busy = [];
  for (const b of bookings) {
    if (b.status !== 'confirmed' || b.date !== date || b.resourceId !== resourceId) continue;
    busy.push([toMin(b.start), toMin(b.end) + buffer]);
  }
  for (const bl of blocksFor(config, date, resourceId)) {
    if (bl.allDay) busy.push([0, 24 * 60]);
    else busy.push([toMin(bl.start), toMin(bl.end)]);
  }
  return busy;
}

/**
 * Horários livres de um recurso para um serviço.
 * @returns {string[]} lista "HH:MM"
 */
export function slotsForResource(config, date, resource, durationMin, bookings, now) {
  const window = dateWindowStatus(config, date, now);
  if (window !== 'ok') return [];
  const step = config.booking.slotStepMin || 15;
  const buffer = config.booking.bufferMin || 0;
  const earliest = date === now.date ? now.minute + (config.booking.minLeadMin || 0) : -1;
  const busy = busyIntervals(config, date, resource.id, bookings);
  const out = [];
  for (const [start, end] of workIntervals(config, date, resource)) {
    for (let t = start; t + durationMin <= end; t += step) {
      if (t < earliest) continue;
      const occ = [t, t + durationMin + buffer];
      if (busy.some((iv) => overlaps(occ, iv))) continue;
      out.push(fromMin(t));
    }
  }
  return out;
}

/**
 * Horários livres considerando o profissional escolhido (ou qualquer um).
 * @returns {{time:string, resourceIds:string[]}[]}
 */
export function availableSlots(config, { date, durationMin, professionalId }, bookings, now) {
  const all = resources(config);
  const pool = professionalId && professionalId !== 'any'
    ? all.filter((r) => r.id === professionalId) : all;
  const map = new Map();
  for (const r of pool) {
    for (const t of slotsForResource(config, date, r, durationMin, bookings, now)) {
      if (!map.has(t)) map.set(t, []);
      map.get(t).push(r.id);
    }
  }
  return [...map.entries()].sort((a, b) => toMin(a[0]) - toMin(b[0]))
    .map(([time, resourceIds]) => ({ time, resourceIds }));
}

/** 'past' | 'too-far' | 'ok' */
export function dateWindowStatus(config, date, now) {
  const d = diffDays(now.date, date);
  if (d < 0) return 'past';
  if (d > config.booking.maxDaysAhead) return 'too-far';
  return 'ok';
}

/** Situação de cada dia de um mês, para o calendário. */
export function monthStatus(config, ym, { durationMin, professionalId }, bookingsByDate, now) {
  const all = resources(config);
  const pool = professionalId && professionalId !== 'any' ? all.filter((r) => r.id === professionalId) : all;
  const out = {};
  const n = daysInMonth(ym);
  for (let i = 1; i <= n; i++) {
    const date = `${ym}-${String(i).padStart(2, '0')}`;
    const w = dateWindowStatus(config, date, now);
    if (w !== 'ok') { out[date] = w; continue; }
    const open = pool.some((r) => workIntervals(config, date, r).length > 0);
    if (!open) { out[date] = 'closed'; continue; }
    const blockedAll = pool.every((r) => blocksFor(config, date, r.id).some((b) => b.allDay) || workIntervals(config, date, r).length === 0);
    if (blockedAll) { out[date] = 'blocked'; continue; }
    const has = pool.some((r) => slotsForResource(config, date, r, durationMin, bookingsByDate[date] || [], now).length > 0);
    out[date] = has ? 'available' : 'full';
  }
  return out;
}

/** Datas (YYYY-MM-DD) cobertas por um mês, limitadas à janela de agendamento. */
export function datesInWindow(config, ym, now) {
  const out = [];
  const n = daysInMonth(ym);
  for (let i = 1; i <= n; i++) {
    const date = `${ym}-${String(i).padStart(2, '0')}`;
    if (dateWindowStatus(config, date, now) === 'ok') out.push(date);
  }
  return out;
}

export function lastBookableDate(config, now) {
  return addDays(now.date, config.booking.maxDaysAhead);
}

// --- intervalos ---------------------------------------------------------------
export function overlaps([a1, b1], [a2, b2]) { return a1 < b2 && a2 < b1; }

function subtract(intervals, [s, e]) {
  const out = [];
  for (const [a, b] of intervals) {
    if (e <= a || s >= b) { out.push([a, b]); continue; }
    if (s > a) out.push([a, s]);
    if (e < b) out.push([e, b]);
  }
  return out;
}

function intersect(xs, ys) {
  const out = [];
  for (const [a, b] of xs) for (const [c, d] of ys) {
    const s = Math.max(a, c), e = Math.min(b, d);
    if (e > s) out.push([s, e]);
  }
  return out;
}
