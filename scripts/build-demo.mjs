// Gera uma versão de DEMONSTRAÇÃO 100% no navegador (sem servidor), para
// apresentar ao cliente. Usa a mesma lógica da API (lib/app.js), mas grava os
// dados no localStorage do aparelho. Não usar como site de produção.
//   node scripts/build-demo.mjs   → dist-demo/
import { cp, rm, readFile, writeFile, readdir, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist-demo');
await rm(out, { recursive: true, force: true });
await cp(join(root, 'public'), out, { recursive: true });
await mkdir(join(out, 'lib'), { recursive: true });
for (const f of ['portfolio.js', 'app.js', 'availability.js', 'time.js', 'validate.js', 'auth.js', 'default-config.js']) {
  await cp(join(root, 'lib', f), join(out, 'lib', f));
}
await rename(join(out, 'admin', 'index.html'), join(out, 'admin.html'));
await rm(join(out, 'admin'), { recursive: true });
await rename(join(out, 'portfolio', 'index.html'), join(out, 'portfolio.html'));
await rm(join(out, 'portfolio'), { recursive: true });
await rm(join(out, 'manifest.webmanifest'));

const BANNER = (link) => `<div class="demo-bar" role="note"><span><b>Demonstração</b> · os agendamentos ficam salvos só neste navegador</span>${link}</div>`;
const BAR_CSS = `<style>.demo-bar{position:relative;z-index:35;display:flex;flex-wrap:wrap;gap:4px 14px;justify-content:center;align-items:center;padding:8px 14px;background:#f3efe7;color:#121110;font:13px/1.4 Jost,system-ui,sans-serif;text-align:center}.demo-bar a{color:#121110;font-weight:500}</style>`;

async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { await walk(p); continue; }
    if (!/\.(html|css|js)$/.test(e.name) || p.includes('/lib/')) continue;
    let s = await readFile(p, 'utf8');
    if (e.name.endsWith('.css')) s = s.replaceAll('url(/assets/', 'url(../assets/');
    if (e.name.endsWith('.js')) s = s.replaceAll("'/assets/", "'assets/").replaceAll('"/assets/', '"assets/').replaceAll('href="/" target="_blank"', 'href="index.html"');
    if (e.name.endsWith('.html')) {
      s = s.replaceAll('"/css/', '"css/').replaceAll('"/js/', '"js/').replaceAll('"/assets/', '"assets/')
        .replace(/\s*<link rel="manifest"[^>]*>/, '')
        .replace(/(<script type="module" src="js\/(site|admin|portfolio)\.js"><\/script>)/, '<script type="module" src="js/demo-backend.js"></script>\n  $1')
        .replace('</head>', `${BAR_CSS}\n</head>`);
      if (e.name === 'admin.html') s = s.replace('<body>', `<body>\n  ${BANNER('<a href="index.html">← Voltar ao site</a>')}`);
      else if (e.name === 'portfolio.html') s = s.replace(/<body([^>]*)>/, `<body$1>\n  ${BANNER('<a href="admin.html">Painel da barbearia</a>')}`);
      else s = s.replace('<a class="skip-link"', `${BANNER('<a href="admin.html">Painel da barbearia</a>')}\n  <a class="skip-link"`);
    }
    await writeFile(p, s);
  }
}
await walk(out);

await writeFile(join(out, 'js', 'demo-backend.js'), `// Backend de demonstração: roda a API real no navegador.
// Dados em localStorage; fotos do portfólio em IndexedDB (mais espaço).
import { handle } from '../lib/app.js';
window.__LS_ROUTES = { home: 'index.html', portfolio: 'portfolio.html', admin: 'admin.html' };
const NS = 'ls_demo:';
const mem = {};
const ls = {
  get(k) { try { return localStorage.getItem(NS + k); } catch { return mem[k] ?? null; } },
  set(k, v) { try { localStorage.setItem(NS + k, v); } catch { mem[k] = v; } },
  del(k) { try { localStorage.removeItem(NS + k); } catch { delete mem[k]; } },
};
let dbp;
const idb = () => dbp ||= new Promise((res, rej) => {
  const r = indexedDB.open('ls_demo', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => {
  const t = db.transaction('kv', mode); const req = fn(t.objectStore('kv'));
  t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); }); };
const isImg = (k) => k.startsWith('pimg:');
const locks = new Map();
const store = {
  async get(k) {
    if (isImg(k)) { try { return (await tx('readonly', (s) => s.get(k))) ?? null; } catch { return mem[k] ?? null; } }
    const v = ls.get(k); return v == null ? null : JSON.parse(v);
  },
  async mget(keys) { return Promise.all(keys.map((k) => store.get(k))); },
  async set(k, v) {
    if (isImg(k)) { try { await tx('readwrite', (s) => s.put(v, k)); } catch { mem[k] = v; } return; }
    ls.set(k, JSON.stringify(v));
  },
  async del(k) { if (isImg(k)) { try { await tx('readwrite', (s) => s.delete(k)); } catch { delete mem[k]; } } else ls.del(k); },
  async incrWindow() { return 1; },
  async withLock(key, fn) {
    const prev = locks.get(key) || Promise.resolve(); let release;
    const next = new Promise((r) => { release = r; }); locks.set(key, prev.then(() => next));
    await prev; try { return await fn(); } finally { release(); }
  },
};
let cookie = '';
try { cookie = sessionStorage.getItem(NS + 'cookie') || ''; } catch {}
const env = { ADMIN_PASSWORD: 'LASANTOS' };
const call = (method, path, query, body) => handle({ method, path, query, body: body ?? null, ip: 'demo', secure: true,
  headers: { cookie, 'x-requested-with': 'lasantos' } }, { store, env });

// sem servidor, as fotos viram endereços blob: gerados a partir do banco local
const blobs = new Map();
async function blobUrl(u) {
  if (blobs.has(u)) return blobs.get(u);
  const q = new URLSearchParams(u.split('?')[1]);
  const r = await call('GET', '/public/portfolio/img', q);
  const url = r.raw ? URL.createObjectURL(new Blob([r.raw], { type: r.headers['content-type'] })) : '';
  blobs.set(u, url); return url;
}
async function fixPhoto(p) { if (p && p.thumbUrl) { p.thumbUrl = await blobUrl(p.thumbUrl); p.fullUrl = await blobUrl(p.fullUrl); } }

window.__LS_API = async ({ method, path, query, body }) => {
  await new Promise((r) => setTimeout(r, 100 + Math.random() * 150)); // latência realista
  const res = await call(method, path, query, body);
  const sc = res.headers['set-cookie'];
  if (sc) { cookie = /Max-Age=0/.test(sc) ? '' : sc.split(';')[0]; try { sessionStorage.setItem(NS + 'cookie', cookie); } catch {} }
  if (res.body && Array.isArray(res.body.photos)) await Promise.all(res.body.photos.map(fixPhoto));
  if (res.body && res.body.photo) await fixPhoto(res.body.photo);
  return { status: res.status, body: res.body };
};
`);
console.log('Demo gerada em dist-demo/');
