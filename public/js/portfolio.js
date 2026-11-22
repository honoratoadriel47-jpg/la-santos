// LA SANTOS — página pública de portfólio.
import { api, esc, mapsLink, instaLink, waLink, formatPhone, ICONS, routes } from './shared.js';

const $ = (s) => document.querySelector(s);
const P = { photos: [], pros: [], filter: 'all', index: -1 };
const R = routes();

['#homeLink', '#bookTop', '#bookBottom'].forEach((s) => { $(s).href = R.home; });

const visible = () => (P.filter === 'all' ? P.photos : P.photos.filter((p) => p.professionalId === P.filter));

function renderFilters() {
  const used = P.pros.filter((pr) => P.photos.some((p) => p.professionalId === pr.id));
  const box = $('#pfFilters');
  if (!used.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = [{ id: 'all', name: 'Todos' }, ...used].map((p) =>
    `<button type="button" class="chip" data-filter="${esc(p.id)}" aria-pressed="${P.filter === p.id}">${esc(p.name)}</button>`).join('');
}

function renderGallery() {
  const list = visible();
  const g = $('#gallery');
  if (!list.length) {
    g.innerHTML = `<div class="pf-empty"><h2>Em breve</h2><p>Os trabalhos da LA SANTOS vão aparecer aqui. Enquanto isso, garanta seu horário.</p>
      <a class="btn btn-primary" href="${esc(R.home)}">Agendar horário</a></div>`;
    return;
  }
  g.innerHTML = `<div class="gallery-grid">${list.map((p, i) => `
    <button type="button" class="ph" data-i="${i}" style="animation-delay:${Math.min(i, 12) * 40}ms" aria-label="Ampliar foto${p.caption ? ': ' + esc(p.caption) : ''}">
      <img src="${esc(p.thumbUrl)}" alt="${esc(p.caption || 'Trabalho da LA SANTOS Barbearia')}" width="${p.w}" height="${p.h}" loading="${i < 6 ? 'eager' : 'lazy'}" decoding="async">
      ${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}
    </button>`).join('')}</div>`;
  g.querySelectorAll('.ph img').forEach((img) => {
    const done = () => img.classList.add('is-loaded');
    if (img.complete) done(); else { img.addEventListener('load', done); img.addEventListener('error', done); }
  });
}

// --- ampliação --------------------------------------------------------------
const lb = $('#lightbox'), lbImg = $('#lbImg');
let lastFocus = null;

function show(i) {
  const list = visible();
  P.index = (i + list.length) % list.length;
  const p = list[P.index];
  lbImg.classList.add('is-loading');
  lbImg.src = p.thumbUrl; // mostra a miniatura enquanto a foto grande carrega
  lbImg.alt = p.caption || 'Trabalho da LA SANTOS Barbearia';
  const full = new Image();
  full.onload = () => { if (visible()[P.index] === p) { lbImg.src = p.fullUrl; lbImg.classList.remove('is-loading'); } };
  full.src = p.fullUrl;
  $('#lbCap').textContent = p.caption || '';
  $('#lbCount').textContent = `${P.index + 1} / ${list.length}`;
  const multi = list.length > 1;
  lb.querySelectorAll('.lb-prev, .lb-next').forEach((b) => { b.hidden = !multi; });
  // pré-carrega a próxima
  if (multi) new Image().src = list[(P.index + 1) % list.length].fullUrl;
}

function open(i) {
  lastFocus = document.activeElement;
  lb.hidden = false;
  document.body.style.overflow = 'hidden';
  show(i);
  lb.querySelector('.lb-close').focus();
}
function close() {
  lb.hidden = true;
  document.body.style.overflow = '';
  lastFocus?.focus();
}

document.addEventListener('click', (e) => {
  const f = e.target.closest('[data-filter]');
  if (f) { P.filter = f.dataset.filter; renderFilters(); renderGallery(); return; }
  const ph = e.target.closest('.ph');
  if (ph) { open(Number(ph.dataset.i)); return; }
  const b = e.target.closest('[data-lb]');
  if (b) { ({ close, prev: () => show(P.index - 1), next: () => show(P.index + 1) })[b.dataset.lb](); return; }
  if (e.target === lb) close();
});
document.addEventListener('keydown', (e) => {
  if (lb.hidden) return;
  if (e.key === 'Escape') close();
  if (e.key === 'ArrowRight') show(P.index + 1);
  if (e.key === 'ArrowLeft') show(P.index - 1);
  if (e.key === 'Tab') { // mantém o foco dentro da ampliação
    const f = [...lb.querySelectorAll('button:not([hidden])')];
    const i = f.indexOf(document.activeElement);
    e.preventDefault();
    f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
  }
});
// deslizar no celular
let sx = null;
lb.addEventListener('pointerdown', (e) => { sx = e.clientX; });
lb.addEventListener('pointerup', (e) => {
  if (sx == null) return;
  const dx = e.clientX - sx; sx = null;
  if (Math.abs(dx) > 50 && visible().length > 1) show(P.index + (dx < 0 ? 1 : -1));
});

// --- rodapé -------------------------------------------------------------------
function renderFoot(b) {
  const maps = mapsLink(b), insta = instaLink(b.instagram), wa = waLink(b.whatsapp);
  $('#foot').innerHTML = `<div class="foot-inner">
    <img class="foot-logo" src="/assets/logo.png" alt="LA SANTOS Barbearia" width="720" height="620" loading="lazy">
    <nav class="foot-links" aria-label="Links">
      <a href="${esc(R.home)}">Agendar horário</a>
      ${insta ? `<a href="${esc(insta)}" target="_blank" rel="noopener">${ICONS.insta} Instagram</a>` : ''}
      ${wa ? `<a href="${esc(wa)}" target="_blank" rel="noopener">${ICONS.wa} ${esc(formatPhone(b.whatsapp))}</a>` : ''}
      ${maps ? `<a href="${esc(maps)}" target="_blank" rel="noopener">${ICONS.pin} Como chegar</a>` : ''}
    </nav>
    ${b.address ? `<p class="foot-addr">${esc(b.address)}</p>` : ''}
    <div class="foot-legal"><span>© ${new Date().getFullYear()} LA SANTOS Barbearia. Todos os direitos reservados.</span><span>Desenvolvido por Pulso Agency</span></div>
  </div>`;
}

async function boot() {
  try {
    const data = await api('/public/portfolio');
    P.photos = data.photos; P.pros = data.professionals;
    renderFilters(); renderGallery(); renderFoot(data.business);
  } catch (e) {
    $('#gallery').innerHTML = `<div class="notice is-error" role="alert">${ICONS.alert}<div><strong>Não foi possível carregar o portfólio.</strong><br>${esc(e.message)}
      <div style="margin-top:10px"><button class="btn btn-sm" onclick="location.reload()">Tentar de novo</button></div></div></div>`;
  }
}
boot();
