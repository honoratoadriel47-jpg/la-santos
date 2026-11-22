// Utilitários compartilhados entre o site e o painel.

const BASE = '/api/v1';

/** Endereços das páginas (a versão de demonstração usa arquivos .html). */
export const routes = () => window.__LS_ROUTES || { home: '/', portfolio: '/portfolio/', admin: '/admin/' };

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

/** Chamada à API. Em modo demonstração, window.__LS_API substitui o servidor. */
export async function api(path, { method = 'GET', body, query } = {}) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString() : '';
  let status, data;
  try {
    if (window.__LS_API) {
      ({ status, body: data } = await window.__LS_API({ method, path, query: new URLSearchParams(qs.slice(1)), body }));
    } else {
      const res = await fetch(BASE + path + qs, {
        method,
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'lasantos' },
        body: body ? JSON.stringify(body) : undefined,
      });
      status = res.status;
      data = await res.json().catch(() => null);
    }
  } catch {
    throw new ApiError(0, 'network', 'Sem conexão. Verifique sua internet e tente de novo.');
  }
  if (status >= 400 || !data) {
    const e = (data && data.error) || {};
    throw new ApiError(status, e.code || 'unknown', e.message || 'Algo deu errado. Tente novamente.');
  }
  return data;
}

export const money = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const moneyParts = (cents) => {
  const s = (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return { cur: 'R$', value: s };
};

export function duration(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${String(m).padStart(2, '0')}` : `${h}h`;
}

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const WD_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export { WEEKDAYS, WD_SHORT, MONTHS };

export function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }; }
export function addDays(s, n) { const { y, m, d } = parseDate(s); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
export function longDate(s) { const { m, d, wd } = parseDate(s); return `${WEEKDAYS[wd]}, ${d} de ${MONTHS[m - 1]}`; }
export function fullDate(s) { const { y, m, d, wd } = parseDate(s); const w = WEEKDAYS[wd]; return `${w.charAt(0).toUpperCase() + w.slice(1)}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`; }
export function shortDate(s) { const { m, d, wd } = parseDate(s); return `${WD_SHORT[wd]}, ${d} ${MONTHS[m - 1].slice(0, 3)}`; }
export function monthLabel(ym) { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; }
export function shiftMonth(ym, n) { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); }

export function formatPhone(digits) {
  const d = String(digits || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function initials(name) {
  const p = String(name).trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

export function mapsLink(business) {
  if (business.mapsUrl) return business.mapsUrl;
  if (business.address) return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${business.name} ${business.address}`);
  return '';
}
export const instaLink = (handle) => (handle ? `https://instagram.com/${handle}` : '');
export const waLink = (digits, text) => (digits ? `https://wa.me/55${digits}${text ? '?text=' + encodeURIComponent(text) : ''}` : '');

export function toast(msg, { error = false, ms = 3800 } = {}) {
  const wrap = document.getElementById('toasts');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' is-error' : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, ms);
}

export const ICONS = {
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  clock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  left: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  insta: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none"/></svg>',
  pin: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  wa: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/><path d="M9 9.5c.3 1.8 2.6 4.4 4.9 4.9l1.2-1.2 2 .9c-.2 1.2-1.2 2-2.4 1.9C11 15.6 8.4 13 8 9.4 7.9 8.2 8.7 7.2 9.9 7l.9 2z" stroke-width="1.2"/></svg>',
  alert: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01" stroke-linecap="round"/></svg>',
  camera: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.6"/></svg>',
  cal: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
};
