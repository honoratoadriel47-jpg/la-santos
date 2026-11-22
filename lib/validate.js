// Validação e saneamento de tudo que chega do navegador.
import { isValidDate, isValidTime, toMin } from './time.js';

export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status; this.code = code; this.extra = extra;
  }
}

const bad = (msg, code = 'invalid') => new HttpError(400, code, msg);

export function cleanText(v, max = 120) {
  if (typeof v !== 'string') return '';
  // remove caracteres de controle e espaços repetidos
  return v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function onlyDigits(v) { return typeof v === 'string' ? v.replace(/\D/g, '') : ''; }

/** Telefone brasileiro: DDD + 8 ou 9 dígitos (aceita +55 na frente). */
export function normalizePhone(v) {
  let d = onlyDigits(v);
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  if (d[0] === '0') return null;
  if (d.length === 11 && d[2] !== '9') return null;
  return d;
}

export function slugId(prefix = '') {
  const a = new Uint8Array(6);
  globalThis.crypto.getRandomValues(a);
  return prefix + Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
}

/** Código curto e legível para o cliente (sem 0/O/1/I). */
export function bookingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint8Array(6);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (b) => alphabet[b % alphabet.length]).join('');
}

export function validateBookingInput(body) {
  if (!body || typeof body !== 'object') throw bad('Dados do agendamento ausentes.');
  if (typeof body.website === 'string' && body.website.trim()) throw bad('Não foi possível concluir.', 'spam');
  const name = cleanText(body.name, 60);
  if (name.length < 2) throw bad('Informe seu nome.', 'name');
  const phone = normalizePhone(body.phone);
  if (!phone) throw bad('Informe um WhatsApp válido com DDD.', 'phone');
  if (!isValidDate(body.date)) throw bad('Data inválida.', 'date');
  if (!isValidTime(body.time)) throw bad('Horário inválido.', 'time');
  const serviceId = cleanText(body.serviceId, 80);
  if (!serviceId) throw bad('Escolha um serviço.', 'service');
  const professionalId = cleanText(body.professionalId || 'any', 40) || 'any';
  const requestId = cleanText(body.requestId, 40).replace(/[^a-zA-Z0-9_-]/g, '');
  return { name, phone, date: body.date, time: body.time, serviceId, professionalId, requestId };
}

// --- configuração -----------------------------------------------------------
function hoursDay(d, label) {
  if (!d || typeof d !== 'object') throw bad(`Horário de ${label} inválido.`);
  const open = !!d.open;
  const start = isValidTime(d.start) ? d.start : '09:00';
  const end = isValidTime(d.end) ? d.end : '18:00';
  const breakStart = isValidTime(d.breakStart) ? d.breakStart : '';
  const breakEnd = isValidTime(d.breakEnd) ? d.breakEnd : '';
  if (open && toMin(end) <= toMin(start)) throw bad(`${label}: o fechamento precisa ser depois da abertura.`);
  if ((breakStart && !breakEnd) || (!breakStart && breakEnd)) throw bad(`${label}: preencha início e fim do intervalo.`);
  if (breakStart && open) {
    if (toMin(breakEnd) <= toMin(breakStart)) throw bad(`${label}: o intervalo termina antes de começar.`);
    if (toMin(breakStart) < toMin(start) || toMin(breakEnd) > toMin(end)) throw bad(`${label}: o intervalo precisa estar dentro do expediente.`);
  }
  return { open, start, end, breakStart, breakEnd };
}

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function hoursWeek(arr) {
  if (!Array.isArray(arr) || arr.length !== 7) throw bad('Horários de funcionamento incompletos.');
  return arr.map((d, i) => hoursDay(d, DAY_LABELS[i]));
}

function int(v, min, max, label) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${label} precisa estar entre ${min} e ${max}.`);
  return n;
}

export function sanitizeConfig(input, current) {
  if (!input || typeof input !== 'object') throw bad('Configuração inválida.');
  const b = input.business || {};
  let instagram = cleanText(b.instagram, 60).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '');
  if (instagram && !/^[a-zA-Z0-9._]{1,30}$/.test(instagram)) throw bad('Usuário do Instagram inválido.');
  let mapsUrl = cleanText(b.mapsUrl, 400);
  if (mapsUrl && !/^https:\/\//i.test(mapsUrl)) throw bad('O link do mapa precisa começar com https://');
  const whatsapp = onlyDigits(b.whatsapp || '');
  if (whatsapp && !normalizePhone(whatsapp)) throw bad('WhatsApp da barbearia inválido (use DDD + número).');

  const bk = input.booking || {};
  const booking = {
    slotStepMin: int(bk.slotStepMin, 5, 60, 'Intervalo entre horários'),
    minLeadMin: int(bk.minLeadMin, 0, 2880, 'Antecedência mínima'),
    maxDaysAhead: int(bk.maxDaysAhead, 1, 120, 'Janela de agendamento'),
    bufferMin: int(bk.bufferMin, 0, 60, 'Folga entre atendimentos'),
  };

  const categories = current.categories;
  const catIds = new Set(categories.map((c) => c.id));
  if (!Array.isArray(input.services)) throw bad('Lista de serviços inválida.');
  if (input.services.length > 200) throw bad('Serviços demais.');
  const seen = new Set();
  const services = input.services.map((s) => {
    const name = cleanText(s.name, 90);
    if (name.length < 2) throw bad('Todo serviço precisa de um nome.');
    let id = cleanText(s.id, 80).replace(/[^a-z0-9-]/g, '');
    if (!id || seen.has(id)) id = slugId('s-');
    seen.add(id);
    const priceCents = Number(s.priceCents);
    if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 10_000_00) throw bad(`Preço inválido em "${name}".`);
    const durationMin = Number(s.durationMin);
    if (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > 480) throw bad(`Duração inválida em "${name}".`);
    const category = catIds.has(s.category) ? s.category : categories[0].id;
    return { id, name, category, priceCents, durationMin, active: s.active !== false };
  });

  if (!Array.isArray(input.professionals) || input.professionals.length > 30) throw bad('Lista de profissionais inválida.');
  const proSeen = new Set();
  const professionals = input.professionals.map((p) => {
    const name = cleanText(p.name, 50);
    if (name.length < 2) throw bad('Todo profissional precisa de um nome.');
    let id = cleanText(p.id, 40).replace(/[^a-z0-9-]/g, '');
    if (!id || proSeen.has(id) || id === '_casa' || id === 'any') id = slugId('p-');
    proSeen.add(id);
    const customHours = !!p.customHours;
    return { id, name, active: p.active !== false, customHours, hours: customHours ? hoursWeek(p.hours) : null };
  });

  const today = input.__today;
  if (!Array.isArray(input.blocks) || input.blocks.length > 1000) throw bad('Lista de bloqueios inválida.');
  const blocks = input.blocks
    .filter((bl) => !today || (isValidDate(bl.date) && bl.date >= today))
    .map((bl) => {
      if (!isValidDate(bl.date)) throw bad('Bloqueio com data inválida.');
      const allDay = !!bl.allDay;
      let start = '', end = '';
      if (!allDay) {
        if (!isValidTime(bl.start) || !isValidTime(bl.end) || toMin(bl.end) <= toMin(bl.start)) throw bad(`Bloqueio de ${bl.date}: horário inválido.`);
        start = bl.start; end = bl.end;
      }
      const professionalId = bl.professionalId && proSeen.has(bl.professionalId) ? bl.professionalId : null;
      const id = cleanText(bl.id, 40).replace(/[^a-z0-9-]/g, '') || slugId('b-');
      return { id, date: bl.date, allDay, start, end, professionalId, reason: cleanText(bl.reason, 80) };
    })
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  return {
    version: current.version,
    business: {
      name: cleanText(b.name, 40) || 'LA SANTOS',
      tagline: cleanText(b.tagline, 40) || 'Barbearia',
      instagram,
      address: cleanText(b.address, 160),
      mapsUrl,
      whatsapp,
    },
    timezone: current.timezone,
    booking,
    hoursConfirmed: !!input.hoursConfirmed,
    hours: hoursWeek(input.hours),
    categories,
    services,
    professionals,
    blocks,
  };
}
