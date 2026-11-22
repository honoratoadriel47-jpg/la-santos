// LA SANTOS — fluxo público de agendamento.
import {
  api, ApiError, money, moneyParts, duration, longDate, shortDate, fullDate, monthLabel, shiftMonth, parseDate, addDays,
  formatPhone, esc, initials, mapsLink, instaLink, waLink, toast, ICONS, WD_SHORT, routes,
} from './shared.js';

const $ = (s, r = document) => r.querySelector(s);
const panel = $('#panel');

const META = {
  servico: { label: 'Serviço', title: 'Escolha o serviço' },
  profissional: { label: 'Profissional', title: 'Com quem você quer agendar?' },
  data: { label: 'Data', title: 'Escolha o dia' },
  horario: { label: 'Horário', title: 'Escolha o horário' },
  dados: { label: 'Seus dados', title: 'Seus dados' },
  revisao: { label: 'Confirmar', title: 'Confira seu agendamento' },
  confirmado: { label: 'Pronto', title: 'Agendamento confirmado' },
};

const S = {
  cfg: null, cat: 'all',
  serviceId: null, proId: 'any', date: null, time: null, month: null,
  name: '', phone: '', remember: true,
  requestId: null, booking: null, sending: false,
  cal: new Map(), // cache do calendário por mês/serviço/profissional
  slots: null, slotsKey: '', slotsState: 'idle', slotsError: '',
  calState: 'idle', calError: '',
  current: null,
};

// ---------------------------------------------------------------- dados
const service = () => S.cfg?.services.find((s) => s.id === S.serviceId) || null;
const hasPros = () => (S.cfg?.professionals || []).length > 0;
const pro = () => (S.cfg?.professionals || []).find((p) => p.id === S.proId) || null;
const steps = () => ['servico', ...(hasPros() ? ['profissional'] : []), 'data', 'horario', 'dados', 'revisao'];
const phoneDigits = () => S.phone.replace(/\D/g, '');
const phoneOk = () => /^[1-9]\d(9\d{8}|\d{8})$/.test(phoneDigits());
const nameOk = () => S.name.trim().length >= 2;

function canEnter(step) {
  switch (step) {
    case 'servico': return true;
    case 'profissional': return !!service() && hasPros() && !S.booking;
    case 'data': return !!service() && !S.booking;
    case 'horario': return !!(service() && S.date) && !S.booking;
    case 'dados': return !!(service() && S.date && S.time) && !S.booking;
    case 'revisao': return !!(service() && S.date && S.time && nameOk() && phoneOk()) && !S.booking;
    case 'confirmado': return !!S.booking;
    default: return false;
  }
}

function stepFromHash() {
  const h = location.hash.slice(1);
  if (!h) return 'servico';
  return META[h] ? h : (S.current || 'servico'); // âncoras comuns (#agendar) não mudam a etapa
}

function go(step, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', step === 'servico' ? location.pathname : '#' + step);
  else if (location.hash.slice(1) !== step) { location.hash = step; return; }
  route();
}

function route() {
  if (!S.cfg) { render('servico'); return; } // ainda carregando: mantém o endereço como está
  let step = stepFromHash();
  if (!canEnter(step)) {
    // volta para a etapa mais avançada permitida
    const allowed = steps().filter(canEnter);
    step = S.booking ? 'confirmado' : allowed[allowed.length - 1] || 'servico';
    history.replaceState(null, '', step === 'servico' ? location.pathname + location.search : '#' + step);
  }
  render(step);
}

// ---------------------------------------------------------------- render
function render(step) {
  const changed = S.current !== step;
  S.current = step;
  $('.layout').classList.toggle('is-done', step === 'confirmado');
  const list = steps();
  const idx = list.indexOf(step);
  $('#stepCounter').textContent = step === 'confirmado' ? 'Tudo certo' : `Etapa ${idx + 1} de ${list.length} · ${META[step].label}`;
  $('#flowTitle').textContent = META[step].title;
  document.title = step === 'servico' ? 'LA SANTOS Barbearia · Agendamento online' : `${META[step].label} · LA SANTOS`;

  $('#stepper').innerHTML = step === 'confirmado' ? '' : list.map((s, i) => {
    const cls = i < idx ? 'done' : i === idx ? 'current' : '';
    const inner = i < idx && canEnter(s)
      ? `<button type="button" data-act="goto" data-step="${s}">${META[s].label}<span class="sr-only"> (concluída — voltar)</span></button>`
      : `<span class="st"${i === idx ? ' aria-current="step"' : ''}>${META[s].label}</span>`;
    return `<li class="${cls}">${inner}</li>`;
  }).join('');

  panel.innerHTML = VIEWS[step]();
  if (changed) {
    panel.classList.remove('enter'); void panel.offsetWidth; panel.classList.add('enter');
    const top = $('.flow').getBoundingClientRect().top + scrollY - 80;
    if (scrollY > top + 10) scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    panel.focus({ preventScroll: true });
  }
  AFTER[step]?.();
  renderChrome();
}

const VIEWS = {
  servico() {
    if (!S.cfg) return loadingList();
    const cats = S.cfg.categories.filter((c) => S.cfg.services.some((s) => s.category === c.id));
    const chips = `<div class="chips" role="toolbar" aria-label="Filtrar por categoria">
      <button type="button" class="chip" data-act="cat" data-cat="all" aria-pressed="${S.cat === 'all'}">Todos</button>
      ${cats.map((c) => `<button type="button" class="chip" data-act="cat" data-cat="${c.id}" aria-pressed="${S.cat === c.id}">${esc(c.label)}</button>`).join('')}
    </div>`;
    if (!S.cfg.services.length) return chips + empty('Nenhum serviço disponível', 'A agenda online está sendo atualizada. Volte em instantes.');
    const groups = (S.cat === 'all' ? cats : cats.filter((c) => c.id === S.cat)).map((c) => {
      const items = S.cfg.services.filter((s) => s.category === c.id);
      return `<div class="svc-group" role="group" aria-label="${esc(c.label)}">
        <h3>${esc(c.label)}</h3>
        <div class="svc-list">${items.map(svcRow).join('')}</div>
      </div>`;
    }).join('');
    return chips + groups;
  },

  profissional() {
    const items = [{ id: 'any', name: 'Sem preferência', sub: 'Primeiro profissional disponível' },
      ...S.cfg.professionals.map((p) => ({ id: p.id, name: p.name, sub: 'Ver horários' }))];
    return `<p class="panel-sub">Cada profissional tem a própria agenda.</p>
      <div class="pro-list">${items.map((p) => `
        <button type="button" class="pro" data-act="pro" data-id="${esc(p.id)}" aria-pressed="${S.proId === p.id}">
          <span class="monogram" aria-hidden="true">${p.id === 'any' ? '✦' : esc(initials(p.name))}</span>
          <span><strong style="font-weight:500">${esc(p.name)}</strong><small>${p.sub}</small></span>
        </button>`).join('')}
      </div>`;
  },

  data() {
    const s = service();
    const pr = pro();
    return `<p class="panel-sub">${esc(s.name)} · ${duration(s.durationMin)}${pr ? ` · com ${esc(pr.name)}` : ''}</p>
      <div class="cal" id="cal">${calendarInner()}</div>`;
  },

  horario() {
    const pill = `<div class="date-pill"><span>${esc(capitalize(longDate(S.date)))}</span>
      <button type="button" data-act="goto" data-step="data">Trocar dia</button></div>`;
    return pill + `<div id="slotsBox">${slotsInner()}</div>`;
  },

  dados() {
    return `<form class="form" id="clientForm" novalidate>
      <div class="field">
        <label for="fName">Nome</label>
        <input class="input" id="fName" name="name" autocomplete="name" autocapitalize="words" maxlength="60" required placeholder="Como devemos te chamar?" value="${esc(S.name)}">
        <div class="field-error" id="eName"></div>
      </div>
      <div class="field">
        <label for="fPhone">WhatsApp</label>
        <input class="input" id="fPhone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="16" required placeholder="(00) 00000-0000" value="${esc(formatPhone(S.phone))}">
        <div class="field-error" id="ePhone"></div>
      </div>
      <div class="hp" aria-hidden="true"><label>Não preencha <input name="website" id="fWebsite" tabindex="-1" autocomplete="off"></label></div>
      <label class="check"><input type="checkbox" id="fRemember" ${S.remember ? 'checked' : ''}> Lembrar meus dados neste aparelho</label>
      <p class="privacy">Usamos seu nome e WhatsApp somente para este agendamento.</p>
      <button type="submit" class="sr-only">Revisar</button>
    </form>`;
  },

  revisao() {
    if (!S.requestId) S.requestId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 36);
    const s = service();
    const pr = pro();
    const proLine = hasPros() ? row('Profissional', pr ? esc(pr.name) : 'Sem preferência') : '';
    return `<div class="ticket">
        ${ticketTop()}
        <dl class="ticket-rows">
          ${row('Serviço', `<span class="big">${esc(s.name)}</span>`)}
          ${row('Data', esc(capitalize(longDate(S.date))))}
          ${row('Horário', `<span class="tabular">${S.time}</span> <span style="color:#6d675e">· ${duration(s.durationMin)}</span>`)}
          ${proLine}
          ${row('Cliente', `${esc(S.name.trim())}<br><span style="color:#6d675e" class="tabular">${esc(formatPhone(S.phone))}</span>`)}
        </dl>
        <div class="ticket-cut"></div>
        <div class="ticket-total"><span>Valor</span><strong>${money(s.priceCents)}</strong></div>
      </div>
      <div id="reviewError" style="max-width:480px"></div>
      <div class="review-actions">
        <button type="button" class="btn btn-primary${S.cfg.business.whatsapp ? ' btn-wa' : ''}" data-act="confirm" id="confirmBtn">${S.cfg.business.whatsapp ? `${ICONS.wa} Confirmar pelo WhatsApp` : 'Confirmar agendamento'}</button>
        <button type="button" class="btn btn-ghost" data-act="goto" data-step="dados">Editar dados</button>
      </div>
      <p class="after-note">${S.cfg.business.whatsapp ? 'Ao confirmar, seu horário é reservado e o WhatsApp abre com todos os detalhes para você enviar à barbearia. ' : ''}O pagamento é feito na barbearia, no dia do atendimento.</p>`;
  },

  confirmado() {
    const b = S.booking;
    const biz = S.cfg.business;
    const wa = bookingWaLink(b);
    const first = esc(b.name.split(' ')[0]);
    const head = `<div class="success-head">
          <span class="success-mark" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
          <p style="margin:0;color:var(--ink-2)">${wa ? `Pronto, ${first}! Seu horário está reservado e a mensagem foi aberta no WhatsApp — é só tocar em enviar por lá.` : `Seu horário está reservado, ${first}. Guarde o código abaixo.`}</p>
        </div>`;
    return `${head}
      <div class="ticket">
        ${ticketTop()}
        <dl class="ticket-rows">
          ${row('Serviço', `<span class="big">${esc(b.serviceName)}</span>`)}
          ${row('Data', esc(capitalize(longDate(b.date))))}
          ${row('Horário', `<span class="tabular">${b.start} – ${b.end}</span>`)}
          ${b.professionalName ? row('Profissional', esc(b.professionalName)) : ''}
          ${row('Valor', money(b.priceCents))}
        </dl>
        <div class="ticket-cut"></div>
        <div class="ticket-code"><span>Código do agendamento</span><strong>${esc(b.code)}</strong></div>
      </div>
      <div class="after-list">
        ${wa ? `<a class="btn" href="${esc(wa)}" target="_blank" rel="noopener">${ICONS.wa} O WhatsApp não abriu? Toque aqui</a>` : ''}
        <a class="btn" href="${esc(googleCal(b))}" target="_blank" rel="noopener">${ICONS.cal} Adicionar à minha agenda</a>
        <button type="button" class="btn btn-ghost" data-act="again">Fazer outro agendamento</button>
      </div>
      <p class="after-note">Precisa remarcar ou cancelar? ${biz.whatsapp ? 'Fale com a barbearia pelo WhatsApp informando o código.' : 'Entre em contato com a barbearia informando o código.'}</p>`;
  },
};

/** Mensagem com os detalhes do agendamento, uma informação por linha. */
function bookingWaLink(b) {
  const text = [
    'Olá, LA SANTOS Barbearia!',
    'Acabei de agendar pelo site e envio os detalhes para confirmação:',
    '',
    `*Cliente:* ${b.name}`,
    `*Serviço:* ${b.serviceName}`,
    b.professionalName ? `*Profissional:* ${b.professionalName}` : null,
    `*Data:* ${fullDate(b.date)}`,
    `*Horário:* ${b.start} às ${b.end}`,
    `*Duração:* ${duration(b.durationMin)}`,
    `*Valor:* ${money(b.priceCents)}`,
    `*Código:* ${b.code}`,
    '',
    'Aguardo a confirmação. Obrigado!',
  ].filter((l) => l !== null).join('\n');
  return waLink(S.cfg.business.whatsapp, text);
}

const AFTER = {
  data() { loadCalendar(); },
  horario() { loadSlots(); },
  dados() {
    const f = $('#clientForm');
    const name = $('#fName'), phone = $('#fPhone');
    name.addEventListener('input', () => { S.name = name.value; clearErr(name, '#eName'); renderChrome(); });
    phone.addEventListener('input', () => {
      const digits = phone.value.replace(/\D/g, '').slice(0, 11);
      const caret = phone.selectionStart === phone.value.length;
      phone.value = formatPhone(digits);
      if (caret) phone.setSelectionRange(phone.value.length, phone.value.length);
      S.phone = digits; clearErr(phone, '#ePhone'); renderChrome();
    });
    $('#fRemember').addEventListener('change', (e) => { S.remember = e.target.checked; });
    f.addEventListener('submit', (e) => { e.preventDefault(); submitClient(); });
    if (!S.name && matchMedia('(min-width: 960px)').matches) name.focus({ preventScroll: true });
  },
};

// ---------------------------------------------------------------- partes
function svcRow(s) {
  const p = moneyParts(s.priceCents);
  const on = S.serviceId === s.id;
  return `<button type="button" class="svc" data-act="svc" data-id="${esc(s.id)}" aria-pressed="${on}">
    <span class="svc-name">${esc(s.name)}</span>
    <span class="svc-meta">${ICONS.clock} ${duration(s.durationMin)}</span>
    <span class="svc-price"><span><small>${p.cur}</small>${p.value}</span><span class="tick">${ICONS.check}</span></span>
  </button>`;
}

function row(label, html) { return `<div><dt>${label}</dt><dd>${html}</dd></div>`; }
function ticketTop() {
  return `<div class="ticket-top"><div class="ticket-brand">LA SANTOS<small>Barbearia</small></div>
    <img src="/assets/logo-mark.png" alt="" width="564" height="352"></div>`;
}
function empty(title, text, action = '') {
  return `<div class="empty"><h2 class="panel-title">${title}</h2><p>${text}</p>${action}</div>`;
}
function errorBox(msg, act) {
  return `<div class="notice is-error" role="alert">${ICONS.alert}<div><strong>Não foi possível carregar.</strong><br>${esc(msg)}
    ${act ? `<div style="margin-top:10px"><button type="button" class="btn btn-sm" data-act="${act}">Tentar de novo</button></div>` : ''}</div></div>`;
}
function loadingList() {
  return `<div class="list-skeleton" aria-label="Carregando">${'<div class="skeleton" style="height:66px"></div>'.repeat(5)}</div>`;
}
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- calendário
const calKey = (m = S.month) => `${m}|${S.serviceId}|${S.proId}`;

function calendarInner() {
  const ym = S.month;
  const data = S.cal.get(calKey());
  const minM = S.cfg.today.slice(0, 7), maxM = S.cfg.maxDate.slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let cells = WD_SHORT.map((d) => `<div class="cal-dow" aria-hidden="true">${d.slice(0, 1)}</div>`).join('');
  cells += '<div></div>'.repeat(first);
  for (let d = 1; d <= n; d++) {
    const date = `${ym}-${String(d).padStart(2, '0')}`;
    const st = data ? data.days[date] : null;
    const today = date === S.cfg.today ? ' is-today' : '';
    const label = capitalize(longDate(date));
    if (!data) { cells += `<div class="day skeleton${today}" aria-hidden="true"></div>`; continue; }
    if (st === 'available') {
      cells += `<button type="button" class="day is-available${today}" data-act="day" data-date="${date}" aria-pressed="${S.date === date}" aria-label="${label}, disponível">${d}</button>`;
    } else {
      const why = { full: 'lotado', closed: 'fechado', blocked: 'indisponível', past: 'passado', 'too-far': 'ainda não aberto' }[st] || 'indisponível';
      cells += `<button type="button" class="day ${st === 'full' ? 'is-full' : 'is-off'}${today}" aria-disabled="true" disabled aria-label="${label}, ${why}">${d}</button>`;
    }
  }
  return `<div class="cal-head">
      <div class="cal-month" aria-live="polite">${monthLabel(ym)}</div>
      <div class="cal-nav">
        <button type="button" class="round" data-act="month" data-dir="-1" aria-label="Mês anterior" ${ym <= minM ? 'disabled' : ''}>${ICONS.left}</button>
        <button type="button" class="round" data-act="month" data-dir="1" aria-label="Próximo mês" ${ym >= maxM ? 'disabled' : ''}>${ICONS.right}</button>
      </div>
    </div>
    ${S.calState === 'error' ? errorBox(S.calError, 'reloadCal') : `<div class="cal-grid" role="group" aria-label="Dias de ${monthLabel(ym)}">${cells}</div>`}
    <div class="cal-legend" aria-hidden="true"><span><i class="lg-av"></i>Disponível</span><span><i class="lg-full"></i>Lotado</span><span><i class="lg-off"></i>Fechado</span></div>
    ${data && !Object.values(data.days).includes('available') && S.calState !== 'error'
      ? `<p class="panel-sub" style="margin:14px 4px 0">Sem horários livres neste mês${ym < maxM ? ' — veja o próximo.' : '.'}</p>` : ''}`;
}

async function fetchMonth(ym) {
  const key = calKey(ym);
  const hit = S.cal.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit;
  const data = await api('/public/calendar', { query: { month: ym, service: S.serviceId, pro: S.proId } });
  const entry = { days: data.days, at: Date.now() };
  S.cal.set(key, entry);
  return entry;
}

async function loadCalendar() {
  S.calState = 'loading';
  const ym = S.month;
  try {
    await fetchMonth(ym);
    S.calState = 'ok';
  } catch (e) {
    S.calState = 'error'; S.calError = e.message;
  }
  if (S.current === 'data' && S.month === ym) $('#cal').innerHTML = calendarInner();
}

// ---------------------------------------------------------------- horários
const slotsKey = () => `${S.date}|${S.serviceId}|${S.proId}`;

function slotsInner() {
  if (S.slotsKey !== slotsKey() || S.slotsState === 'loading') {
    return `<div class="slots" aria-label="Carregando horários">${'<div class="skeleton" style="height:50px"></div>'.repeat(12)}</div>`;
  }
  if (S.slotsState === 'error') return errorBox(S.slotsError, 'reloadSlots');
  if (!S.slots.length) {
    return empty('Sem horários neste dia', 'Todos os horários foram reservados ou o dia está indisponível.',
      `<button type="button" class="btn btn-primary" data-act="nextDay">Ver próximo dia disponível</button>`);
  }
  const groups = [['Manhã', (t) => t < '12:00'], ['Tarde', (t) => t >= '12:00' && t < '18:00'], ['Noite', (t) => t >= '18:00']];
  return groups.map(([label, fn]) => {
    const list = S.slots.filter(fn);
    if (!list.length) return '';
    return `<div class="slot-group"><h3>${label}<span>${list.length} ${list.length === 1 ? 'horário' : 'horários'}</span></h3>
      <div class="slots">${list.map((t) => `<button type="button" class="slot" data-act="slot" data-time="${t}" aria-pressed="${S.time === t}">${t}</button>`).join('')}</div></div>`;
  }).join('');
}

async function loadSlots(force = false) {
  const key = slotsKey();
  if (!force && S.slotsKey === key && S.slotsState === 'ok') return;
  S.slotsKey = key; S.slotsState = 'loading';
  if ($('#slotsBox')) $('#slotsBox').innerHTML = slotsInner();
  try {
    const data = await api('/public/slots', { query: { date: S.date, service: S.serviceId, pro: S.proId } });
    if (S.slotsKey !== key) return;
    S.slots = data.slots; S.slotsState = 'ok';
    if (S.time && !S.slots.includes(S.time)) S.time = null;
  } catch (e) {
    if (S.slotsKey !== key) return;
    S.slotsState = 'error'; S.slotsError = e.message;
  }
  if (S.current === 'horario' && $('#slotsBox')) { $('#slotsBox').innerHTML = slotsInner(); renderChrome(); }
}

async function nextAvailableDay() {
  const btn = panel.querySelector('[data-act="nextDay"]');
  btn?.classList.add('is-loading');
  try {
    let ym = S.date.slice(0, 7);
    const maxM = S.cfg.maxDate.slice(0, 7);
    while (ym <= maxM) {
      const m = await fetchMonth(ym);
      const next = Object.keys(m.days).sort().find((d) => d > S.date && m.days[d] === 'available');
      if (next) { S.date = next; S.time = null; S.month = next.slice(0, 7); render('horario'); return; }
      ym = shiftMonth(ym, 1);
    }
    toast('Não há horários livres nos próximos dias. Fale com a barbearia.', { error: true });
  } catch (e) { toast(e.message, { error: true }); }
  btn?.classList.remove('is-loading');
}

// ---------------------------------------------------------------- dados do cliente
function setErr(input, sel, msg) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', sel.slice(1)); $(sel).textContent = msg; }
function clearErr(input, sel) { input.removeAttribute('aria-invalid'); $(sel).textContent = ''; }

function submitClient() {
  const name = $('#fName'), phone = $('#fPhone');
  if (!name || !phone) return;
  S.name = name.value.replace(/\s+/g, ' ').trim();
  S.phone = phone.value.replace(/\D/g, '');
  let first = null;
  if (!nameOk()) { setErr(name, '#eName', 'Informe seu nome.'); first ??= name; }
  if (!phoneOk()) { setErr(phone, '#ePhone', 'Informe um WhatsApp válido com DDD.'); first ??= phone; }
  if ($('#fWebsite')?.value) return; // robô
  if (first) { first.focus(); return; }
  try {
    if (S.remember) localStorage.setItem('ls_client', JSON.stringify({ name: S.name, phone: S.phone }));
    else localStorage.removeItem('ls_client');
  } catch {}
  go('revisao');
}

// ---------------------------------------------------------------- confirmação
async function confirmBooking() {
  if (S.sending) return;
  const btn = $('#confirmBtn');
  const errBox = $('#reviewError');
  // Abre a aba do WhatsApp AINDA DENTRO DO TOQUE (antes de qualquer espera),
  // senão o celular bloqueia. Depois que a reserva é gravada, ela vai para a conversa.
  let tab = null;
  if (S.cfg.business.whatsapp) {
    try {
      tab = window.open('', '_blank');
      if (tab) tab.document.write('<!doctype html><meta name="viewport" content="width=device-width"><title>LA SANTOS</title><body style="margin:0;display:grid;place-items:center;height:100vh;background:#0a0a0a;color:#f3efe7;font:16px system-ui,sans-serif">Abrindo o WhatsApp…</body>');
    } catch { tab = null; }
  }
  S.sending = true;
  btn?.classList.add('is-loading'); renderChrome();
  if (errBox) errBox.innerHTML = '';
  try {
    const { booking } = await api('/public/bookings', {
      method: 'POST',
      body: { serviceId: S.serviceId, professionalId: S.proId, date: S.date, time: S.time, name: S.name, phone: S.phone, requestId: S.requestId, website: '' },
    });
    S.booking = booking;
    S.cal.clear(); S.slotsKey = '';
    S.sending = false;
    rememberBooking(booking);
    const wa = bookingWaLink(booking);
    if (wa && tab && !tab.closed) {
      try { tab.opener = null; tab.location.href = wa; } catch { tab = null; }
    }
    if (wa && (!tab || tab.closed)) {
      // sem aba nova (navegador de app, bloqueio): abre o WhatsApp nesta mesma aba;
      // ao voltar, a tela de confirmação é restaurada.
      history.replaceState(null, '', '#confirmado');
      location.href = wa;
      return;
    }
    go('confirmado');
  } catch (e) {
    try { tab?.close(); } catch {}
    S.sending = false;
    btn?.classList.remove('is-loading'); renderChrome();
    if (e instanceof ApiError && e.code === 'slot_taken') {
      S.time = null; S.slotsKey = ''; S.cal.clear(); S.requestId = null;
      toast(e.message, { error: true, ms: 5000 });
      go('horario');
      return;
    }
    if (e instanceof ApiError && e.code === 'date_closed') { S.date = null; S.time = null; S.cal.clear(); toast(e.message, { error: true }); go('data'); return; }
    const wa = waLink(S.cfg.business.whatsapp);
    if (errBox) {
      errBox.innerHTML = `<div class="notice is-error" role="alert" style="margin-top:16px">${ICONS.alert}<div><strong>Agendamento não concluído.</strong><br>${esc(e.message)}
        ${e.status === 503 && wa ? `<br><a href="${esc(wa)}" target="_blank" rel="noopener">Agendar pelo WhatsApp</a>` : ''}</div></div>`;
    }
  }
}

// guarda o último agendamento por alguns minutos, para a tela de confirmação
// voltar mesmo que o navegador recarregue ao sair do WhatsApp
function rememberBooking(b) {
  try { sessionStorage.setItem('ls_last_booking', JSON.stringify({ b, at: Date.now() })); } catch {}
}
function restoreBooking() {
  try {
    const v = JSON.parse(sessionStorage.getItem('ls_last_booking') || 'null');
    if (v && Date.now() - v.at < 30 * 60 * 1000) return v.b;
  } catch {}
  return null;
}

function googleCal(b) {
  const d = b.date.replace(/-/g, '');
  const t = (x) => x.replace(':', '') + '00';
  const biz = S.cfg.business;
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: `${b.serviceName} · LA SANTOS Barbearia`,
    dates: `${d}T${t(b.start)}/${d}T${t(b.end)}`, ctz: 'America/Sao_Paulo',
    details: `Código do agendamento: ${b.code}${b.professionalName ? `\nProfissional: ${b.professionalName}` : ''}`,
    location: biz.address ? `${biz.name} — ${biz.address}` : 'LA SANTOS Barbearia',
  });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

function resetFlow() {
  S.serviceId = null; S.proId = 'any'; S.date = null; S.time = null; S.month = S.cfg.today.slice(0, 7);
  S.booking = null; S.requestId = null; S.slotsKey = ''; S.cal.clear();
  go('servico');
}

// ---------------------------------------------------------------- resumo + barra de ação
function primaryAction() {
  const st = S.current;
  if (!S.cfg || st === 'confirmado') return null;
  if (st === 'servico') return { label: 'Continuar', act: 'next', enabled: !!service() };
  if (st === 'profissional') return { label: 'Continuar', act: 'next', enabled: true };
  if (st === 'data') return { label: 'Ver horários', act: 'next', enabled: !!S.date && canEnter('horario') };
  if (st === 'horario') return { label: 'Continuar', act: 'next', enabled: !!S.time };
  if (st === 'dados') return { label: 'Revisar', act: 'submitClient', enabled: true };
  if (st === 'revisao') return { label: S.sending ? 'Confirmando' : S.cfg.business.whatsapp ? 'Confirmar no WhatsApp' : 'Confirmar', act: 'confirm', enabled: !S.sending, loading: S.sending };
  return null;
}

function renderChrome() {
  const s = service();
  const a = primaryAction();
  // barra inferior (mobile)
  const dock = $('#dock');
  const showDock = !!(a && s);
  dock.hidden = !showDock;
  document.body.classList.toggle('has-dock', showDock);
  if (showDock) {
    const info = [S.date ? shortDate(S.date) : null, S.time].filter(Boolean).join(' · ') || s.name;
    dock.innerHTML = `<div class="dock-info"><strong>${money(s.priceCents)}</strong><span>${esc(info)}</span></div>
      <button type="button" class="btn btn-primary${a.loading ? ' is-loading' : ''}" data-act="${a.act}" ${a.enabled ? '' : 'disabled'}>${a.label}</button>`;
  }
  // comanda lateral (desktop)
  const sum = $('#summary');
  if (!S.cfg) { sum.innerHTML = ''; return; }
  if (S.current === 'confirmado') { sum.innerHTML = ''; return; }
  const p = pro();
  const line = (label, val) => `<div><dt>${label}</dt><dd class="${val ? '' : 'is-empty'}">${val || '—'}</dd></div>`;
  sum.innerHTML = `<div class="sum-card">
    <div class="sum-head"><h2>Seu horário</h2><span>LA SANTOS</span></div>
    <dl class="sum-rows">
      ${line('Serviço', s ? esc(s.name) : '')}
      ${hasPros() ? line('Profissional', s ? esc(p ? p.name : 'Sem preferência') : '') : ''}
      ${line('Data', S.date ? esc(capitalize(shortDate(S.date))) : '')}
      ${line('Horário', S.time ? `<span class="tabular">${S.time}</span>${s ? ` <span style="color:var(--muted)">· ${duration(s.durationMin)}</span>` : ''}` : '')}
      ${line('Cliente', nameOk() && ['revisao', 'dados'].includes(S.current) ? esc(S.name.trim()) : '')}
    </dl>
    <div class="sum-foot">
      <div class="sum-total"><span>Total</span><strong>${s ? money(s.priceCents) : 'R$ —'}</strong></div>
      ${a ? `<button type="button" class="btn btn-primary${a.loading ? ' is-loading' : ''}" data-act="${a.act}" ${a.enabled ? '' : 'disabled'}>${a.label}</button>` : ''}
    </div>
  </div>`;
}

function nextStep() {
  const list = steps();
  const i = list.indexOf(S.current);
  const nxt = list[i + 1];
  if (nxt && canEnter(nxt)) go(nxt);
}

// ---------------------------------------------------------------- eventos
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  switch (act) {
    case 'cat': S.cat = el.dataset.cat; render('servico'); break;
    case 'svc': {
      const id = el.dataset.id;
      if (S.serviceId !== id) { S.serviceId = id; S.time = null; S.slotsKey = ''; }
      panel.querySelectorAll('.svc').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
      renderChrome();
      break;
    }
    case 'pro':
      if (S.proId !== el.dataset.id) { S.proId = el.dataset.id; S.time = null; S.slotsKey = ''; }
      panel.querySelectorAll('.pro').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === S.proId)));
      renderChrome();
      setTimeout(() => { if (S.current === 'profissional') nextStep(); }, 200);
      break;
    case 'month': S.month = shiftMonth(S.month, Number(el.dataset.dir)); $('#cal').innerHTML = calendarInner(); loadCalendar(); break;
    case 'reloadCal': S.cal.delete(calKey()); loadCalendar(); break;
    case 'day':
      if (S.date !== el.dataset.date) { S.date = el.dataset.date; S.time = null; }
      panel.querySelectorAll('.day').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.date === S.date)));
      renderChrome();
      setTimeout(() => { if (S.current === 'data') go('horario'); }, 160);
      break;
    case 'slot':
      S.time = el.dataset.time;
      panel.querySelectorAll('.slot').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.time === S.time)));
      renderChrome();
      break;
    case 'reloadSlots': loadSlots(true); break;
    case 'nextDay': nextAvailableDay(); break;
    case 'goto': if (canEnter(el.dataset.step)) go(el.dataset.step); break;
    case 'next': nextStep(); break;
    case 'submitClient': submitClient(); break;
    case 'confirm': confirmBooking(); break;
    case 'again': resetFlow(); break;
    case 'top': e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); break;
  }
});
addEventListener('hashchange', route);

// ---------------------------------------------------------------- informações + rodapé
// endereço com CEP e "cidade - UF" sem quebra de linha no meio
const addr = (a) => esc(a).replace(/\d{5}-\d{3}/g, '<span class="nowrap">$&</span>').replace(/([A-Za-zÀ-ú]+) - ([A-Z]{2})\b/g, '<span class="nowrap">$1 - $2</span>');
function renderInfo() {
  const b = S.cfg.business;
  const maps = mapsLink(b);
  const insta = instaLink(b.instagram);
  const wa = waLink(b.whatsapp);
  const pending = (t) => `<span class="pending">${t} — a definir</span>`;

  const pf = routes().portfolio; // sempre visível; sem fotos, a página mostra "Em breve"
  $('#topLinks').innerHTML = [
    pf && `<a class="pill-link" href="${esc(pf)}">${ICONS.camera}<span>Portfólio</span></a>`,
    insta && `<a class="icon-link" href="${esc(insta)}" target="_blank" rel="noopener" aria-label="Instagram @${esc(b.instagram)}">${ICONS.insta}</a>`,
    maps && `<a class="icon-link" href="${esc(maps)}" target="_blank" rel="noopener" aria-label="Abrir localização no mapa">${ICONS.pin}</a>`,
  ].filter(Boolean).join('');

  const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const todayWd = parseDate(S.cfg.today).wd;
  const hours = S.cfg.hours ? `<div class="info-item"><h2>Horários</h2><dl class="hours">${[1, 2, 3, 4, 5, 6, 0].map((i) => {
    const d = S.cfg.hours[i];
    const v = d.open ? `${d.start} – ${d.end}` : 'Fechado';
    return `<div class="${i === todayWd ? 'is-today' : ''}"><dt>${DAYS[i]}</dt><dd>${v}</dd></div>`;
  }).join('')}</dl></div>` : '';

  $('#info').innerHTML = `
    <div class="info-item"><h2>Endereço</h2>
      ${b.address ? `<p>${addr(b.address)}</p>` : `<p>${pending('Endereço')}</p>`}
      ${maps ? `<a class="info-link" href="${esc(maps)}" target="_blank" rel="noopener">${ICONS.pin} Abrir no mapa</a>` : ''}
    </div>
    ${hours}
    <div class="info-item"><h2>Contato</h2>
      ${insta ? `<p><a class="info-link" href="${esc(insta)}" target="_blank" rel="noopener">${ICONS.insta} @${esc(b.instagram)}</a></p>` : `<p>${pending('Instagram')}</p>`}
      ${wa ? `<p><a class="info-link" href="${esc(wa)}" target="_blank" rel="noopener">${ICONS.wa} ${esc(formatPhone(b.whatsapp))}</a></p>` : ''}
    </div>`;

  const year = S.cfg.today.slice(0, 4);
  $('#foot').innerHTML = `<div class="foot-inner">
      <img class="foot-logo" src="/assets/logo.png" alt="LA SANTOS Barbearia" width="720" height="620" loading="lazy">
      <nav class="foot-links" aria-label="Links">
        <a href="#agendar" data-act="top">Agendar horário</a>
        ${pf ? `<a href="${esc(pf)}">${ICONS.camera} Portfólio</a>` : ''}
        ${insta ? `<a href="${esc(insta)}" target="_blank" rel="noopener">${ICONS.insta} Instagram</a>` : ''}
        ${wa ? `<a href="${esc(wa)}" target="_blank" rel="noopener">${ICONS.wa} ${esc(formatPhone(b.whatsapp))}</a>` : ''}
        ${maps ? `<a href="${esc(maps)}" target="_blank" rel="noopener">${ICONS.pin} Como chegar</a>` : ''}
      </nav>
      ${b.address ? `<p class="foot-addr">${addr(b.address)}</p>` : ''}
      <div class="foot-legal">
        <span>© ${year} LA SANTOS Barbearia. Todos os direitos reservados.</span>
        <span>Desenvolvido por Pulso Agency</span>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- vinheta
function runIntro() {
  const root = document.documentElement;
  const intro = $('#intro');
  if (!intro) return;
  if (root.classList.contains('intro-off')) { intro.remove(); return; }
  const reduced = root.classList.contains('intro-reduced');
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    intro.classList.add('is-leaving');
    setTimeout(() => { root.classList.remove('intro-on', 'intro-reduced'); root.classList.add('intro-off'); intro.remove(); }, 560);
  };
  setTimeout(finish, reduced ? 650 : 3150);
  intro.addEventListener('click', finish);
  addEventListener('keydown', finish, { once: true });
}

// ---------------------------------------------------------------- início
async function boot() {
  runIntro();
  if (location.hash === '#confirmado') S.booking = restoreBooking(); // voltou do WhatsApp
  try {
    const saved = JSON.parse(localStorage.getItem('ls_client') || 'null');
    if (saved) { S.name = saved.name || ''; S.phone = saved.phone || ''; }
  } catch {}
  route();
  try {
    S.cfg = await api('/public/config');
  } catch (e) {
    panel.innerHTML = errorBox(e.message, 'boot');
    document.addEventListener('click', (ev) => { if (ev.target.closest('[data-act="boot"]')) location.reload(); }, { once: true });
    return;
  }
  S.month = S.cfg.today.slice(0, 7);
  renderInfo();
  route();
}
boot();
