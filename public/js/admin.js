// LA SANTOS — painel administrativo.
import {
  api, ApiError, money, duration, longDate, shortDate, fullDate, addDays, formatPhone, esc, mapsLink, instaLink, waLink, toast, ICONS, routes,
} from './shared.js';

const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const clone = (o) => JSON.parse(JSON.stringify(o));
const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const VIEWS = {
  agenda: { label: 'Agenda' },
  servicos: { label: 'Serviços' },
  equipe: { label: 'Equipe' },
  horarios: { label: 'Horários' },
  bloqueios: { label: 'Bloqueios' },
  barbearia: { label: 'Barbearia' },
  portfolio: { label: 'Portfólio' },
};

const A = {
  cfg: null, draft: null, today: null, dirty: false, saving: false, view: 'agenda',
  ag: { date: null, mode: 'day', pro: 'all', showCancelled: false, data: null, loading: false, error: '', nowMinute: 0 },
  svcSearch: '',
  pf: { photos: null, error: '', queue: [], max: 80 },
};

const ICON = {
  trash: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  x: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  refresh: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>',
  plus: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
};

// =============================================================== início / login
async function boot() {
  try {
    const s = await api('/admin/session');
    if (!s.configured) return renderBlocked();
    if (!s.authenticated) return renderLogin();
    await loadConfig();
    renderShell();
  } catch (e) {
    app.className = 'login';
    app.innerHTML = `<div class="login-card"><img src="/assets/logo.png" alt="LA SANTOS" width="720" height="620">
      <div class="notice is-error">${ICONS.alert}<div><strong>Painel indisponível.</strong><br>${esc(e.message)}</div></div>
      <button class="btn" onclick="location.reload()">Tentar de novo</button></div>`;
  }
}

function renderBlocked() {
  app.className = 'login';
  app.innerHTML = `<div class="login-card"><img src="/assets/logo.png" alt="LA SANTOS" width="720" height="620">
    <h1>Painel não configurado</h1>
    <p>Defina a variável de ambiente <code>ADMIN_PASSWORD</code> no servidor (Vercel → Settings → Environment Variables) e publique novamente.</p></div>`;
}

function renderLogin(msg = '') {
  app.className = 'login';
  app.innerHTML = `<div class="login-card">
    <img src="/assets/logo.png" alt="LA SANTOS Barbearia" width="720" height="620">
    <div><h1>Painel da barbearia</h1><p>Acesso restrito ao responsável.</p></div>
    <form id="loginForm" novalidate>
      <div class="field"><label for="pw">Senha</label>
        <input class="input" id="pw" type="password" autocomplete="current-password" required></div>
      <div class="field-error" id="loginErr" role="alert">${esc(msg)}</div>
      <button class="btn btn-primary" type="submit" id="loginBtn">Entrar</button>
    </form></div>`;
  $('#pw').focus();
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn');
    btn.classList.add('is-loading');
    try {
      await api('/admin/login', { method: 'POST', body: { password: $('#pw').value } });
      await loadConfig();
      renderShell();
    } catch (err) {
      btn.classList.remove('is-loading');
      $('#loginErr').textContent = err.message;
      $('#pw').select();
    }
  });
}

async function loadConfig() {
  const { config, today } = await api('/admin/config');
  A.cfg = config; A.draft = clone(config); A.today = today; A.dirty = false;
  A.ag.date ??= today;
}

function onAuthError(e) {
  if (e instanceof ApiError && e.status === 401) { renderLogin('Sua sessão expirou. Entre novamente.'); return true; }
  return false;
}

// =============================================================== estrutura
function pendingSetup() {
  const c = A.cfg, b = c.business, out = [];
  if (!c.hoursConfirmed) out.push(['horarios', 'Confirmar o horário de funcionamento (hoje usa um padrão provisório)']);
  if (!b.address) out.push(['barbearia', 'Informar o endereço']);
  if (!b.instagram) out.push(['barbearia', 'Informar o Instagram oficial']);
  if (!b.whatsapp) out.push(['barbearia', 'Informar o WhatsApp da barbearia (opcional, recomendado)']);
  return out;
}

function renderShell() {
  app.className = '';
  A.view = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'agenda';
  const pend = pendingSetup();
  app.innerHTML = `<header class="bar">
      <div class="bar-top">
        <a class="bar-brand" href="#agenda"><img src="/assets/logo-mark.png" alt="" width="564" height="352"><div><b>LA SANTOS</b><span>Painel</span></div></a>
        <div class="bar-actions">
          <a class="btn btn-sm btn-ghost" href="${routes().home}" target="_blank" rel="noopener">Ver site</a>
          <button class="btn btn-sm" data-act="logout">Sair</button>
        </div>
      </div>
      <nav class="tabs" aria-label="Seções">${Object.entries(VIEWS).map(([id, v]) => `<a class="tab" href="#${id}" ${A.view === id ? 'aria-current="page"' : ''}>${v.label}${
        pend.some((p) => p[0] === id) ? '<i class="dot" aria-label="pendente"></i>' : ''}</a>`).join('')}</nav>
    </header>
    <main class="main" id="main"></main>
    <div id="savebarSlot"></div>`;
  renderView();
}

function renderView() {
  const main = $('#main');
  main.innerHTML = RENDER[A.view]();
  document.title = `${VIEWS[A.view].label} · Painel LA SANTOS`;
  document.querySelectorAll('.tab').forEach((t) => t.toggleAttribute('aria-current', t.getAttribute('href') === '#' + A.view));
  document.querySelectorAll('.tab[aria-current]').forEach((t) => t.setAttribute('aria-current', 'page'));
  if (A.view === 'agenda') loadAgenda();
  if (A.view === 'portfolio') loadPortfolio();
  renderSavebar();
}

addEventListener('hashchange', () => {
  if (!A.cfg) return;
  const v = location.hash.slice(1);
  if (VIEWS[v] && v !== A.view) { A.view = v; renderView(); scrollTo(0, 0); }
});
addEventListener('beforeunload', (e) => { if (A.dirty) { e.preventDefault(); e.returnValue = ''; } });

// =============================================================== AGENDA
const RENDER = {
  agenda() {
    const ag = A.ag;
    const pros = A.cfg.professionals;
    const pend = pendingSetup();
    const label = ag.mode === 'day' ? cap(longDate(ag.date)) : `${shortDate(ag.date)} – ${shortDate(addDays(ag.date, 6))}`;
    return `${pend.length ? `<div class="setup"><strong>Antes de divulgar o site</strong><ul>${pend.map(([v, t]) => `<li><a href="#${v}">${t}</a></li>`).join('')}</ul></div>` : ''}
      <div class="view-head"><div><h1>Agenda</h1><p>${ag.date === A.today && ag.mode === 'day' ? 'Hoje · ' : ''}${esc(label)}</p></div>
        <button class="btn btn-sm" data-act="reload">${ICON.refresh} Atualizar</button></div>
      <div class="toolbar">
        <div class="datenav">
          <button class="round" data-act="shift" data-n="-1" aria-label="Anterior">${ICONS.left}</button>
          <label class="datebox">${ICONS.cal}<span>${esc(shortDate(ag.date))}</span><input type="date" id="agDate" value="${ag.date}" aria-label="Escolher data"></label>
          <button class="round" data-act="shift" data-n="1" aria-label="Próximo">${ICONS.right}</button>
          ${ag.date !== A.today ? '<button class="btn btn-sm btn-ghost" data-act="today">Hoje</button>' : ''}
        </div>
        <div class="seg" role="group" aria-label="Período">
          <button data-act="mode" data-mode="day" aria-pressed="${ag.mode === 'day'}">Dia</button>
          <button data-act="mode" data-mode="week" aria-pressed="${ag.mode === 'week'}">7 dias</button>
        </div>
        ${pros.length ? `<select class="select" id="agPro" aria-label="Profissional">
          <option value="all">Todos os profissionais</option>
          ${pros.map((p) => `<option value="${esc(p.id)}" ${ag.pro === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>` : ''}
        <label class="toggle-line"><input type="checkbox" id="agCancelled" ${ag.showCancelled ? 'checked' : ''}> Mostrar cancelados</label>
      </div>
      <div id="agBody">${agendaBody()}</div>`;
  },
};

function agendaBody() {
  const ag = A.ag;
  if (ag.error) return `<div class="notice is-error">${ICONS.alert}<div><strong>Não foi possível carregar a agenda.</strong><br>${esc(ag.error)}</div></div>`;
  if (!ag.data) return `<div class="stats">${'<div class="stat skeleton" style="height:78px"></div>'.repeat(3)}</div><div class="bookings">${'<div class="skeleton" style="height:78px"></div>'.repeat(4)}</div>`;
  let list = ag.data;
  if (ag.pro !== 'all') list = list.filter((b) => b.resourceId === ag.pro);
  const active = list.filter((b) => b.status === 'confirmed');
  const shown = ag.showCancelled ? list : active;
  const revenue = active.reduce((s, b) => s + b.priceCents, 0);
  const isFuture = (b) => b.date > A.today || (b.date === A.today && toMin(b.start) >= A.ag.nowMinute);
  const next = active.filter(isFuture).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0];
  const stats = `<div class="stats">
    <div class="stat"><span>Agendamentos</span><strong>${active.length}</strong></div>
    <div class="stat"><span>Previsto</span><strong>${money(revenue)}</strong></div>
    <div class="stat"><span>Próximo</span><strong>${next ? (ag.mode === 'week' && next.date !== A.today ? `${shortDate(next.date).split(',')[0]} ${next.start}` : next.start) : '—'}</strong></div>
    ${!ag.showCancelled && list.length > active.length ? `<div class="stat"><span>Cancelados</span><strong>${list.length - active.length}</strong></div>` : ''}
  </div>`;
  if (!shown.length) {
    return stats + `<div class="empty-admin"><strong>Nenhum agendamento</strong>${ag.mode === 'day' ? 'Neste dia ainda não há horários marcados.' : 'Nenhum horário marcado nestes 7 dias.'}</div>`;
  }
  const byDate = {};
  for (const b of shown) (byDate[b.date] ||= []).push(b);
  return stats + Object.keys(byDate).sort().map((d) => {
    const items = byDate[d].sort((a, b) => a.start.localeCompare(b.start));
    const count = items.filter((b) => b.status === 'confirmed').length;
    return `${ag.mode === 'week' ? `<div class="day-head"><span>${esc(cap(longDate(d)))}</span><span>${count} ${count === 1 ? 'horário' : 'horários'}</span></div>` : ''}
      <div class="bookings">${items.map((b) => bookingCard(b, next && b.id === next.id, !isFuture(b))).join('')}</div>`;
  }).join('');
}

function bookingCard(b, isNext, isPast) {
  const cancelled = b.status === 'cancelled';
  const wa = waLink(b.phone, [
    `Olá, ${b.name.split(' ')[0]}! Aqui é da LA SANTOS Barbearia.`,
    'Sobre o seu agendamento:',
    '',
    `*Serviço:* ${b.serviceName}`,
    b.professionalName ? `*Profissional:* ${b.professionalName}` : null,
    `*Data:* ${fullDate(b.date)}`,
    `*Horário:* ${b.start} às ${b.end}`,
    `*Valor:* ${money(b.priceCents)}`,
    `*Código:* ${b.code}`,
    '',
  ].filter((l) => l !== null).join('\n'));
  return `<article class="bk ${cancelled ? 'is-cancelled' : ''} ${isNext ? 'is-next' : ''} ${isPast && !cancelled ? 'is-past' : ''}">
    <div class="bk-time"><strong class="tabular">${b.start}</strong><span>até ${b.end}</span></div>
    <div class="bk-main">
      <div class="bk-name">${esc(b.name)}</div>
      <div class="bk-meta"><span>${esc(b.serviceName)}</span>${b.professionalName ? `<span>com ${esc(b.professionalName)}${b.chosenProfessional ? '' : ' (sem preferência)'}</span>` : ''}
        <a href="tel:+55${esc(b.phone)}" class="tabular">${esc(formatPhone(b.phone))}</a><span style="color:var(--muted)">#${esc(b.code)}</span></div>
    </div>
    <div class="bk-side">
      ${cancelled ? '<span class="badge is-cancel">Cancelado</span>' : isNext ? '<span class="badge">Próximo</span>' : ''}
      <span class="bk-price">${money(b.priceCents)}</span>
      <a class="icon-btn" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="WhatsApp de ${esc(b.name)}">${ICONS.wa}</a>
      ${!cancelled ? `<button class="icon-btn danger" data-act="cancel" data-id="${esc(b.id)}" aria-label="Cancelar agendamento de ${esc(b.name)}">${ICON.x}</button>` : ''}
    </div>
  </article>`;
}

async function loadAgenda() {
  const ag = A.ag;
  const key = `${ag.mode}|${ag.date}`;
  ag.key = key; ag.error = '';
  const to = ag.mode === 'day' ? ag.date : addDays(ag.date, 6);
  try {
    const res = await api('/admin/bookings', { query: { from: ag.date, to } });
    if (ag.key !== key) return;
    ag.data = res.bookings; ag.nowMinute = res.nowMinute; A.today = res.today;
  } catch (e) {
    if (onAuthError(e)) return;
    if (ag.key !== key) return;
    ag.error = e.message;
  }
  if (A.view === 'agenda' && $('#agBody')) $('#agBody').innerHTML = agendaBody();
}

function cancelDialog(id) {
  const b = A.ag.data.find((x) => x.id === id);
  if (!b) return;
  const dlg = $('#dialog');
  dlg.innerHTML = `<form method="dialog" id="cancelForm">
    <h2>Cancelar agendamento?</h2>
    <p>${esc(b.name)} · ${esc(b.serviceName)}<br>${esc(cap(longDate(b.date)))} às ${b.start}. O horário volta a ficar livre no site.</p>
    <div class="field"><label for="cReason">Motivo (opcional, uso interno)</label><input class="input" id="cReason" maxlength="120"></div>
    <div class="actions"><button class="btn btn-ghost" value="no" type="submit">Voltar</button>
      <button class="btn btn-danger" value="yes" type="submit" id="cYes">Cancelar agendamento</button></div>
  </form>`;
  dlg.showModal();
  $('#cancelForm').addEventListener('submit', async (e) => {
    if (e.submitter?.value !== 'yes') return;
    e.preventDefault();
    const btn = $('#cYes'); btn.classList.add('is-loading');
    try {
      await api('/admin/bookings/cancel', { method: 'POST', body: { id, reason: $('#cReason').value } });
      dlg.close();
      toast('Agendamento cancelado. O horário foi liberado.');
      loadAgenda();
    } catch (err) {
      dlg.close();
      if (!onAuthError(err)) toast(err.message, { error: true });
    }
  });
}

// =============================================================== SERVIÇOS
RENDER.servicos = () => {
  const d = A.draft;
  const q = A.svcSearch.trim().toLowerCase();
  const cats = d.categories;
  const rows = d.services.map((s, i) => ({ s, i })).filter(({ s }) => !q || s.name.toLowerCase().includes(q));
  return `<div class="view-head"><div><h1>Serviços e preços</h1><p>Edite nome, categoria, valor e duração. Serviços desativados somem do site, mas os agendamentos já feitos continuam.</p></div>
      <button class="btn btn-sm" data-act="addService">${ICON.plus} Novo serviço</button></div>
    <div class="toolbar"><input class="input-sm search" id="svcSearch" type="search" placeholder="Buscar serviço" value="${esc(A.svcSearch)}" aria-label="Buscar serviço">
      <span style="color:var(--muted);font-size:13.5px">${d.services.filter((s) => s.active).length} ativos de ${d.services.length}</span></div>
    <div class="col-labels" aria-hidden="true"><span>Serviço</span><span>Categoria</span><span>Valor</span><span>Duração</span><span>Ativo</span></div>
    <div class="rows">${rows.map(({ s, i }) => `
      <div class="srow ${s.active ? '' : 'is-off'}" data-row="${i}">
        <input class="input s-name" data-bind="services.${i}.name" value="${esc(s.name)}" aria-label="Nome do serviço" maxlength="90">
        <select class="input s-cat" data-bind="services.${i}.category" aria-label="Categoria">${cats.map((c) => `<option value="${c.id}" ${s.category === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>
        <div class="with-prefix"><span>R$</span><input class="input tabular" data-bind="services.${i}.priceCents" data-type="money" inputmode="decimal" value="${centsToField(s.priceCents)}" aria-label="Valor de ${esc(s.name)}"></div>
        <div class="with-suffix"><input class="input tabular" data-bind="services.${i}.durationMin" data-type="int" inputmode="numeric" value="${s.durationMin}" aria-label="Duração em minutos de ${esc(s.name)}"><span>min</span></div>
        <div class="row-actions">
          <label class="switch" title="Ativo no site"><input type="checkbox" data-bind="services.${i}.active" data-type="bool" data-rerender ${s.active ? 'checked' : ''} aria-label="Ativo no site"><i></i></label>
          <button class="icon-btn danger" data-act="delService" data-i="${i}" aria-label="Excluir ${esc(s.name)}">${ICON.trash}</button>
        </div>
      </div>`).join('') || '<div class="empty-admin"><strong>Nada encontrado</strong>Nenhum serviço com esse nome.</div>'}
    </div>`;
};

// =============================================================== EQUIPE
RENDER.equipe = () => {
  const pros = A.draft.professionals;
  return `<div class="view-head"><div><h1>Equipe</h1><p>Com a equipe cadastrada, o cliente escolhe o profissional (ou "sem preferência") e cada um tem a própria agenda.
      Sem ninguém cadastrado, o site funciona como uma agenda única da barbearia.</p></div>
      <button class="btn btn-sm" data-act="addPro">${ICON.plus} Novo profissional</button></div>
    ${pros.length ? pros.map((p, i) => `<div class="pro-card">
      <div class="pro-top">
        <input class="input" data-bind="professionals.${i}.name" value="${esc(p.name)}" placeholder="Nome do profissional" aria-label="Nome do profissional" maxlength="50">
        <label class="toggle-line"><span class="switch"><input type="checkbox" data-bind="professionals.${i}.active" data-type="bool" ${p.active ? 'checked' : ''}><i></i></span> Atende pelo site</label>
        <label class="toggle-line"><span class="switch"><input type="checkbox" data-bind="professionals.${i}.customHours" data-type="bool" data-rerender ${p.customHours ? 'checked' : ''}><i></i></span> Horário próprio</label>
        <button class="icon-btn danger" data-act="delPro" data-i="${i}" aria-label="Remover ${esc(p.name || 'profissional')}">${ICON.trash}</button>
      </div>
      ${p.customHours ? `<div style="margin-top:14px">${hoursEditor(`professionals.${i}.hours`, p.hours)}
        <p class="hint" style="margin:10px 0 0">O horário do profissional é limitado ao funcionamento da barbearia.</p></div>` : ''}
    </div>`).join('') : `<div class="empty-admin"><strong>Nenhum profissional cadastrado</strong>A agenda está funcionando como agenda única da barbearia.</div>`}`;
};

// =============================================================== HORÁRIOS
RENDER.horarios = () => {
  const d = A.draft;
  const bk = d.booking;
  return `<div class="view-head"><div><h1>Horários</h1><p>Funcionamento da barbearia e regras da agenda online.</p></div></div>
    <div class="card"><h2>Funcionamento</h2><p class="hint">Dias fechados não aparecem no calendário. O intervalo (ex.: almoço) é opcional.</p>
      ${hoursEditor('hours', d.hours)}
      <label class="toggle-line" style="margin-top:12px"><input type="checkbox" data-bind="hoursConfirmed" data-type="bool" ${d.hoursConfirmed ? 'checked' : ''}>
        Estes são os horários reais — mostrar no site</label>
      ${!d.hoursConfirmed ? '<div class="notice" style="margin-top:10px">' + ICONS.alert + '<div><strong>Horário provisório.</strong> A agenda já usa estes horários; marque a caixa acima depois de conferir para exibi-los também no rodapé do site.</div></div>' : ''}
    </div>
    <div class="card"><h2>Regras do agendamento</h2><p class="hint">Valem para todos os serviços.</p>
      <div class="grid2">
        ${numField('booking.slotStepMin', bk.slotStepMin, 'Intervalo entre horários', 'min', 'Ex.: 15 → 09:00, 09:15, 09:30…')}
        ${numField('booking.minLeadMin', bk.minLeadMin, 'Antecedência mínima', 'min', 'Tempo mínimo entre o agendamento e o atendimento.')}
        ${numField('booking.maxDaysAhead', bk.maxDaysAhead, 'Agenda aberta para', 'dias', 'Até quantos dias à frente o cliente pode marcar.')}
        ${numField('booking.bufferMin', bk.bufferMin, 'Folga após cada atendimento', 'min', 'Tempo para limpeza/preparação entre clientes.')}
      </div>
    </div>`;
};

function numField(path, val, label, unit, hint) {
  const id = path.replace(/\./g, '-');
  return `<div class="field"><label for="${id}">${label}</label>
    <div class="with-suffix"><input class="input tabular" id="${id}" data-bind="${path}" data-type="int" inputmode="numeric" value="${val}"><span>${unit}</span></div>
    <span style="font-size:12.5px;color:var(--muted)">${hint}</span></div>`;
}

function hoursEditor(base, hours) {
  return `<div class="hhead" aria-hidden="true"><span>Dia</span><span>Aberto</span><span>Abre</span><span>Fecha</span><span></span><span>Intervalo de</span><span>até</span></div>
    ${WEEK_ORDER.map((i) => {
      const h = hours[i];
      const p = `${base}.${i}`;
      return `<div class="hrow ${h.open ? '' : 'is-closed'}">
        <span class="hday">${DAYS[i]}</span>
        <label class="switch"><input type="checkbox" data-bind="${p}.open" data-type="bool" data-rerender ${h.open ? 'checked' : ''} aria-label="${DAYS[i]} aberto"><i></i></label>
        <input class="input h-in" type="time" step="300" data-bind="${p}.start" value="${h.start}" aria-label="${DAYS[i]} abre">
        <input class="input h-in" type="time" step="300" data-bind="${p}.end" value="${h.end}" aria-label="${DAYS[i]} fecha">
        <span class="sep">·</span>
        <span class="h-break-label">Intervalo (opcional)</span>
        <input class="input h-in" type="time" step="300" data-bind="${p}.breakStart" value="${h.breakStart}" aria-label="${DAYS[i]} início do intervalo">
        <input class="input h-in" type="time" step="300" data-bind="${p}.breakEnd" value="${h.breakEnd}" aria-label="${DAYS[i]} fim do intervalo">
      </div>`;
    }).join('')}`;
}

// =============================================================== BLOQUEIOS
RENDER.bloqueios = () => {
  const d = A.draft;
  const pros = d.professionals;
  const blocks = [...d.blocks].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return `<div class="view-head"><div><h1>Bloqueios</h1><p>Feriados, folgas, compromissos ou atendimentos marcados por fora. Horários bloqueados somem do site.</p></div></div>
    <div class="card"><h2>Novo bloqueio</h2>
      <form id="blockForm" class="form-grid" novalidate>
        <div class="field"><label for="bDate">Data</label><input class="input" id="bDate" type="date" min="${A.today}" value="${A.today}" required></div>
        <div class="field"><label for="bType">Período</label><select class="input" id="bType"><option value="range">Intervalo de horário</option><option value="day">Dia inteiro</option></select></div>
        <div class="field b-range"><label for="bStart">De</label><input class="input" id="bStart" type="time" step="300" value="12:00"></div>
        <div class="field b-range"><label for="bEnd">Até</label><input class="input" id="bEnd" type="time" step="300" value="13:00"></div>
        ${pros.length ? `<div class="field"><label for="bPro">Quem</label><select class="input" id="bPro"><option value="">Toda a barbearia</option>${pros.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></div>` : ''}
        <div class="field"><label for="bReason">Motivo (opcional)</label><input class="input" id="bReason" maxlength="80" placeholder="Ex.: feriado"></div>
        <button class="btn btn-primary" type="submit">Adicionar bloqueio</button>
      </form>
    </div>
    <div class="block-list">${blocks.length ? blocks.map((b) => `<div class="block">
        <div><b>${esc(cap(longDate(b.date)))}</b>
          <span>${b.allDay ? 'Dia inteiro' : `${b.start} – ${b.end}`} · ${b.professionalId ? esc(pros.find((p) => p.id === b.professionalId)?.name || 'Profissional') : 'Toda a barbearia'}${b.reason ? ` · ${esc(b.reason)}` : ''}</span></div>
        <button class="icon-btn danger" data-act="delBlock" data-id="${esc(b.id)}" aria-label="Remover bloqueio">${ICON.trash}</button>
      </div>`).join('') : '<div class="empty-admin"><strong>Nenhum bloqueio</strong>A agenda segue o horário de funcionamento normalmente.</div>'}</div>`;
};

// =============================================================== BARBEARIA
RENDER.barbearia = () => {
  const b = A.draft.business;
  const maps = mapsLink(b), insta = instaLink(b.instagram), wa = waLink(b.whatsapp);
  const preview = (url, label) => (url ? `<a class="btn btn-sm btn-ghost" href="${esc(url)}" target="_blank" rel="noopener" style="padding:0">${label} ↗</a>` : '');
  return `<div class="view-head"><div><h1>Barbearia</h1><p>Informações exibidas no site, no rodapé e na confirmação do cliente.</p></div></div>
    <div class="card"><div class="grid2">
      <div class="field"><label for="fInsta">Instagram</label>
        <div class="with-prefix"><span>@</span><input class="input" id="fInsta" data-bind="business.instagram" value="${esc(b.instagram)}" placeholder="usuario.da.barbearia" autocapitalize="off" spellcheck="false"></div>
        ${preview(insta, 'Testar link do Instagram')}</div>
      <div class="field"><label for="fWa">WhatsApp da barbearia</label>
        <input class="input tabular" id="fWa" data-bind="business.whatsapp" data-type="phone" inputmode="numeric" value="${esc(formatPhone(b.whatsapp))}" placeholder="(00) 00000-0000">
        ${preview(wa, 'Testar link do WhatsApp')}</div>
      <div class="field" style="grid-column:1/-1"><label for="fAddr">Endereço</label>
        <input class="input" id="fAddr" data-bind="business.address" value="${esc(b.address)}" placeholder="Rua, número — bairro, cidade/UF"></div>
      <div class="field" style="grid-column:1/-1"><label for="fMaps">Link do Google Maps (opcional)</label>
        <input class="input" id="fMaps" data-bind="business.mapsUrl" value="${esc(b.mapsUrl)}" placeholder="https://maps.app.goo.gl/…" autocapitalize="off" spellcheck="false">
        <span style="font-size:12.5px;color:var(--muted)">Sem link, o botão "Abrir no mapa" busca pelo endereço acima.</span>
        ${preview(maps, 'Testar localização')}</div>
    </div></div>`;
};


// =============================================================== PORTFÓLIO
RENDER.portfolio = () => {
  const pf = A.pf;
  const pros = A.cfg.professionals;
  const n = pf.photos ? pf.photos.length : 0;
  const head = `<div class="view-head"><div><h1>Portfólio</h1>
      <p>Fotos dos trabalhos exibidas na página <a href="${routes().portfolio}" target="_blank" rel="noopener">Portfólio</a> do site. Só o painel pode enviar, editar ou excluir.
      As fotos são reduzidas automaticamente antes do envio.</p></div>
      <label class="btn btn-primary btn-sm pf-upload ${pf.photos && n >= pf.max ? 'is-disabled' : ''}">${ICON.plus} Adicionar fotos
        <input type="file" id="pfFiles" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple ${pf.photos && n >= pf.max ? 'disabled' : ''}></label></div>`;
  if (pf.error) return head + `<div class="notice is-error">${ICONS.alert}<div><strong>Não foi possível carregar o portfólio.</strong><br>${esc(pf.error)}</div></div>`;
  if (!pf.photos) return head + `<div class="pf-admin">${'<div class="skeleton" style="aspect-ratio:3/4"></div>'.repeat(4)}</div>`;
  const queue = pf.queue.map((q) => `<div class="pf-card is-uploading"><div class="pf-thumb">${q.preview ? `<img src="${q.preview}" alt="">` : ''}<span class="pf-status">${esc(q.status)}</span></div></div>`).join('');
  if (!n && !queue) {
    return head + `<label class="pf-drop" for="pfFiles">${ICONS.camera}<strong>Nenhuma foto ainda</strong><span>Toque para escolher fotos do celular ou do computador. Você também pode arrastar as imagens para cá.</span></label>`;
  }
  return head + `<p class="hint" style="margin:-6px 0 14px;color:var(--muted);font-size:13.5px">${n} de ${pf.max} fotos · a primeira aparece no topo do portfólio</p>
    <div class="pf-admin" id="pfGrid">${queue}${pf.photos.map((p, i) => `
      <div class="pf-card" data-id="${esc(p.id)}">
        <div class="pf-thumb"><img src="${esc(p.thumbUrl)}" alt="" loading="lazy" width="${p.w}" height="${p.h}"></div>
        <div class="pf-fields">
          <input class="input" data-pf="caption" data-id="${esc(p.id)}" value="${esc(p.caption)}" maxlength="100" placeholder="Legenda (opcional)" aria-label="Legenda da foto">
          ${pros.length ? `<select class="input" data-pf="pro" data-id="${esc(p.id)}" aria-label="Profissional">
            <option value="">Sem profissional</option>${pros.map((pr) => `<option value="${esc(pr.id)}" ${p.professionalId === pr.id ? 'selected' : ''}>${esc(pr.name)}</option>`).join('')}</select>` : ''}
          <div class="pf-actions">
            <button class="icon-btn" data-act="pfMove" data-id="${esc(p.id)}" data-dir="-1" aria-label="Mover para antes" ${i === 0 ? 'disabled' : ''}>${ICONS.left}</button>
            <button class="icon-btn" data-act="pfMove" data-id="${esc(p.id)}" data-dir="1" aria-label="Mover para depois" ${i === n - 1 ? 'disabled' : ''}>${ICONS.right}</button>
            <button class="icon-btn danger" data-act="pfDel" data-id="${esc(p.id)}" aria-label="Excluir foto">${ICON.trash}</button>
          </div>
        </div>
      </div>`).join('')}</div>`;
};

async function loadPortfolio() {
  try {
    const res = await api('/admin/portfolio');
    A.pf.photos = res.photos; A.pf.max = res.max; A.pf.error = '';
  } catch (e) {
    if (onAuthError(e)) return;
    A.pf.error = e.message;
  }
  refreshPortfolio();
}
function refreshPortfolio() { if (A.view === 'portfolio') $('#main').innerHTML = RENDER.portfolio(); }

// reduz a foto no navegador: lado maior 1600 px (miniatura 640 px), WebP ou JPEG
async function decode(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {}
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode(); return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
async function encode(src, maxSide, quality) {
  const w0 = src.width, h0 = src.height;
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.round(w0 * k), h = Math.round(h0 * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, w, h);
  const toBlob = (type, q) => new Promise((r) => c.toBlob(r, type, q));
  let blob = await toBlob('image/webp', quality);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', quality);
  const dataUrl = await new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = j; fr.readAsDataURL(blob); });
  return { dataUrl, w, h, bytes: blob.size };
}
async function prepare(file) {
  let src;
  try { src = await decode(file); } catch { throw new Error('Formato não suportado. Use fotos JPG, PNG ou WebP.'); }
  let full = await encode(src, 1600, 0.82);
  if (full.bytes > 1_400_000) full = await encode(src, 1400, 0.7);
  const thumb = await encode(src, 640, 0.74);
  src.close?.();
  return { image: full.dataUrl, thumb: thumb.dataUrl, w: full.w, h: full.h, preview: thumb.dataUrl };
}

async function uploadFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
  if (!list.length) return toast('Escolha arquivos de imagem.', { error: true });
  const room = A.pf.max - (A.pf.photos?.length || 0);
  if (list.length > room) toast(`Só cabem mais ${room} foto(s). As demais foram ignoradas.`, { error: true });
  const items = list.slice(0, room).map((f) => ({ file: f, status: 'Na fila', preview: '' }));
  A.pf.queue.push(...items); refreshPortfolio();
  let ok = 0;
  for (const it of items) {
    try {
      it.status = 'Preparando…'; refreshPortfolio();
      const data = await prepare(it.file);
      it.preview = data.preview; it.status = 'Enviando…'; refreshPortfolio();
      const res = await api('/admin/portfolio', { method: 'POST', body: { image: data.image, thumb: data.thumb, w: data.w, h: data.h } });
      A.pf.photos.unshift(res.photo); ok++;
    } catch (e) {
      if (onAuthError(e)) return;
      toast(`${it.file.name}: ${e.message}`, { error: true, ms: 6000 });
    }
    A.pf.queue = A.pf.queue.filter((q) => q !== it); refreshPortfolio();
  }
  if (ok) toast(ok === 1 ? 'Foto publicada no portfólio.' : `${ok} fotos publicadas no portfólio.`);
}

async function pfUpdate(id, patch) {
  try {
    const { photo } = await api('/admin/portfolio/update', { method: 'POST', body: { id, ...patch } });
    const i = A.pf.photos.findIndex((p) => p.id === id); if (i >= 0) A.pf.photos[i] = { ...A.pf.photos[i], ...photo };
    toast('Foto atualizada.');
  } catch (e) { if (!onAuthError(e)) toast(e.message, { error: true }); }
}

async function pfMove(id, dir) {
  const arr = A.pf.photos, i = arr.findIndex((p) => p.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  refreshPortfolio();
  try { await api('/admin/portfolio/reorder', { method: 'POST', body: { ids: arr.map((p) => p.id) } }); }
  catch (e) { if (!onAuthError(e)) { toast(e.message, { error: true }); loadPortfolio(); } }
}

document.addEventListener('change', (e) => {
  if (e.target.id === 'pfFiles') { uploadFiles(e.target.files); e.target.value = ''; return; }
  const f = e.target.closest('[data-pf]');
  if (!f) return;
  if (f.dataset.pf === 'caption') pfUpdate(f.dataset.id, { caption: f.value });
  if (f.dataset.pf === 'pro') pfUpdate(f.dataset.id, { professionalId: f.value || null });
});
document.addEventListener('dragover', (e) => { if (A.view === 'portfolio') { e.preventDefault(); document.body.classList.add('is-dragging'); } });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('is-dragging'); });
document.addEventListener('drop', (e) => {
  document.body.classList.remove('is-dragging');
  if (A.view !== 'portfolio' || !e.dataTransfer?.files?.length) return;
  e.preventDefault(); uploadFiles(e.dataTransfer.files);
});

// =============================================================== edição / salvar
function setPath(obj, path, val) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys.at(-1)] = val;
}
function centsToField(c) { return Number.isFinite(c) ? (c / 100).toFixed(2).replace('.', ',') : ''; }
function fieldToCents(v) {
  const s = String(v).replace(/[^\d,.]/g, '');
  if (!s) return NaN;
  const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return Math.round(parseFloat(norm) * 100);
}
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function readInput(el) {
  const t = el.dataset.type;
  if (t === 'bool') return el.checked;
  if (t === 'int') return el.value === '' ? NaN : Number(el.value);
  if (t === 'money') return fieldToCents(el.value);
  if (t === 'phone') return el.value.replace(/\D/g, '').slice(0, 11);
  return el.value;
}

function onEdit(e) {
  const el = e.target.closest('[data-bind]');
  if (!el || !A.draft) return;
  const path = el.dataset.bind;
  // ligar horário próprio copia o horário da casa como ponto de partida
  if (/^professionals\.\d+\.customHours$/.test(path) && el.checked) {
    const i = Number(path.split('.')[1]);
    if (!A.draft.professionals[i].hours) A.draft.professionals[i].hours = clone(A.draft.hours);
  }
  if (el.dataset.type === 'phone' && e.type === 'input') el.value = formatPhone(el.value);
  setPath(A.draft, path, readInput(el));
  markDirty();
  if (el.hasAttribute('data-rerender')) {
    const y = scrollY;
    $('#main').innerHTML = RENDER[A.view]();
    scrollTo(0, y);
  }
}

function markDirty() {
  A.dirty = JSON.stringify(A.draft) !== JSON.stringify(A.cfg);
  renderSavebar();
}

function renderSavebar() {
  const slot = $('#savebarSlot');
  if (!slot) return;
  if (!A.dirty) { slot.innerHTML = ''; return; }
  if (slot.firstChild) { slot.querySelector('.btn-dark').classList.toggle('is-loading', A.saving); return; }
  slot.innerHTML = `<div class="savebar" role="region" aria-label="Alterações não salvas"><span>Alterações não salvas</span>
    <button class="btn btn-ghost" data-act="discard">Descartar</button>
    <button class="btn btn-dark${A.saving ? ' is-loading' : ''}" data-act="save">Salvar</button></div>`;
}

function validateDraft() {
  const d = A.draft;
  for (const s of d.services) {
    if (!s.name.trim()) return 'Há um serviço sem nome.';
    if (!Number.isInteger(s.priceCents) || s.priceCents < 0) return `Valor inválido em "${s.name}".`;
    if (!Number.isInteger(s.durationMin) || s.durationMin < 1) return `Duração inválida em "${s.name}".`;
  }
  for (const p of d.professionals) if (p.name.trim().length < 2) return 'Informe o nome de todos os profissionais.';
  return '';
}

async function save() {
  if (A.saving) return;
  const err = validateDraft();
  if (err) { toast(err, { error: true }); return; }
  A.saving = true; renderSavebar();
  try {
    const res = await api('/admin/config', { method: 'PUT', body: A.draft });
    A.cfg = res.config; A.draft = clone(res.config); A.dirty = false; A.saving = false;
    renderShell();
    toast('Alterações salvas. O site já está atualizado.');
    if (res.conflicts?.length) {
      const dlg = $('#dialog');
      dlg.innerHTML = `<form method="dialog"><h2>Atenção</h2><p>Os bloqueios cobrem agendamentos já confirmados. Eles não foram cancelados automaticamente:</p>
        <ul style="color:var(--ink-2);font-size:14.5px;padding-left:18px">${res.conflicts.map((c) => `<li>${esc(shortDate(c.date))} às ${c.start} — ${esc(c.name)}</li>`).join('')}</ul>
        <div class="actions"><button class="btn btn-primary">Entendi</button></div></form>`;
      dlg.showModal();
    }
  } catch (e) {
    A.saving = false; renderSavebar();
    if (onAuthError(e)) return;
    if (e.code === 'version') {
      const dlg = $('#dialog');
      dlg.innerHTML = `<form method="dialog"><h2>Configuração desatualizada</h2><p>${esc(e.message)}</p>
        <div class="actions"><button class="btn btn-ghost" value="no">Fechar</button><button class="btn btn-primary" value="reload">Recarregar</button></div></form>`;
      dlg.showModal();
      dlg.addEventListener('close', async () => { if (dlg.returnValue === 'reload') { await loadConfig(); renderShell(); } }, { once: true });
      return;
    }
    toast(e.message, { error: true, ms: 5000 });
  }
}

function confirmDialog(title, text, okLabel, fn) {
  const dlg = $('#dialog');
  dlg.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2><p>${esc(text)}</p>
    <div class="actions"><button class="btn btn-ghost" value="no">Voltar</button><button class="btn btn-danger" value="ok">${esc(okLabel)}</button></div></form>`;
  dlg.showModal();
  dlg.addEventListener('close', () => { if (dlg.returnValue === 'ok') fn(); }, { once: true });
}

// =============================================================== eventos
document.addEventListener('input', (e) => {
  if (e.target.id === 'svcSearch') {
    A.svcSearch = e.target.value;
    const pos = e.target.selectionStart;
    $('#main').innerHTML = RENDER.servicos();
    const s = $('#svcSearch'); s.focus(); s.setSelectionRange(pos, pos);
    return;
  }
  if (e.target.matches('[data-bind]') && e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT') onEdit(e);
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches('[data-bind]')) {
    onEdit(e);
    if (t.dataset.type === 'money' && Number.isFinite(fieldToCents(t.value))) t.value = centsToField(fieldToCents(t.value));
    return;
  }
  if (t.id === 'agDate' && t.value) { A.ag.date = t.value; A.ag.data = null; $('#main').innerHTML = RENDER.agenda(); loadAgenda(); }
  if (t.id === 'agPro') { A.ag.pro = t.value; $('#agBody').innerHTML = agendaBody(); }
  if (t.id === 'agCancelled') { A.ag.showCancelled = t.checked; $('#agBody').innerHTML = agendaBody(); }
  if (t.id === 'bType') document.querySelectorAll('.b-range').forEach((el) => { el.style.display = t.value === 'day' ? 'none' : ''; });
});

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'blockForm') return;
  e.preventDefault();
  const date = $('#bDate').value, allDay = $('#bType').value === 'day';
  const start = $('#bStart').value, end = $('#bEnd').value;
  if (!date || date < A.today) return toast('Escolha uma data a partir de hoje.', { error: true });
  if (!allDay && (!start || !end || end <= start)) return toast('O horário final precisa ser depois do inicial.', { error: true });
  A.draft.blocks.push({
    id: 'b-' + Math.random().toString(36).slice(2, 10), date, allDay, start: allDay ? '' : start, end: allDay ? '' : end,
    professionalId: $('#bPro')?.value || null, reason: $('#bReason').value.trim(),
  });
  markDirty();
  $('#main').innerHTML = RENDER.bloqueios();
  toast('Bloqueio adicionado. Clique em Salvar para aplicar.');
});

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const ag = A.ag;
  switch (act) {
    case 'logout': {
      const out = async () => { await api('/admin/logout', { method: 'POST' }).catch(() => {}); A.cfg = null; A.dirty = false; renderLogin(); };
      if (A.dirty) confirmDialog('Sair sem salvar?', 'Há alterações não salvas que serão perdidas.', 'Sair', out);
      else out();
      break;
    }
    case 'reload': ag.data = null; $('#agBody').innerHTML = agendaBody(); loadAgenda(); break;
    case 'shift': ag.date = addDays(ag.date, Number(el.dataset.n) * (ag.mode === 'week' ? 7 : 1)); ag.data = null; renderView(); break;
    case 'today': ag.date = A.today; ag.data = null; renderView(); break;
    case 'mode': ag.mode = el.dataset.mode; ag.data = null; renderView(); break;
    case 'cancel': cancelDialog(el.dataset.id); break;
    case 'addService':
      A.draft.services.unshift({ id: '', name: 'Novo serviço', category: A.draft.categories[0].id, priceCents: 0, durationMin: 30, active: true });
      A.svcSearch = ''; markDirty(); $('#main').innerHTML = RENDER.servicos();
      $('.srow .s-name')?.select();
      break;
    case 'delService': {
      const i = Number(el.dataset.i);
      confirmDialog('Excluir serviço?', `"${A.draft.services[i].name}" sairá do site. Agendamentos já feitos continuam na agenda.`, 'Excluir', () => {
        A.draft.services.splice(i, 1); markDirty(); $('#main').innerHTML = RENDER.servicos();
      });
      break;
    }
    case 'addPro':
      A.draft.professionals.push({ id: '', name: '', active: true, customHours: false, hours: null });
      markDirty(); $('#main').innerHTML = RENDER.equipe();
      document.querySelectorAll('.pro-card .input').forEach((x, i, all) => { if (i === all.length - 1) x.focus(); });
      break;
    case 'delPro': {
      const i = Number(el.dataset.i);
      confirmDialog('Remover profissional?', 'Ele deixa de aparecer no site. Agendamentos já marcados com ele continuam na agenda — cancele ou remaneje se necessário.', 'Remover', () => {
        const id = A.draft.professionals[i].id;
        A.draft.professionals.splice(i, 1);
        A.draft.blocks = A.draft.blocks.filter((b) => b.professionalId !== id || !id);
        markDirty(); $('#main').innerHTML = RENDER.equipe();
      });
      break;
    }
    case 'delBlock':
      A.draft.blocks = A.draft.blocks.filter((b) => b.id !== el.dataset.id);
      markDirty(); $('#main').innerHTML = RENDER.bloqueios();
      break;
    case 'pfMove': pfMove(el.dataset.id, Number(el.dataset.dir)); break;
    case 'pfDel':
      confirmDialog('Excluir foto?', 'Ela sai do portfólio do site imediatamente.', 'Excluir', async () => {
        try {
          await api('/admin/portfolio/delete', { method: 'POST', body: { id: el.dataset.id } });
          A.pf.photos = A.pf.photos.filter((p) => p.id !== el.dataset.id); refreshPortfolio(); toast('Foto excluída.');
        } catch (err) { if (!onAuthError(err)) toast(err.message, { error: true }); }
      });
      break;
    case 'discard': A.draft = clone(A.cfg); A.dirty = false; renderView(); break;
    case 'save': save(); break;
  }
});


// atualiza a agenda a cada minuto quando visível
setInterval(() => { if (A.cfg && A.view === 'agenda' && !document.hidden && !$('#dialog').open) loadAgenda(); }, 60_000);

boot();
