// Portfólio: fotos enviadas pelo painel e exibidas na página pública /portfolio.
// As imagens chegam já reduzidas pelo navegador (WebP/JPEG) e ficam no mesmo
// banco (Redis), em chaves separadas; a lista com legendas fica em "portfolio".

import { HttpError, cleanText, slugId } from './validate.js';

export const MAX_PHOTOS = 80;
const MAX_FULL = 1_600_000;   // bytes
const MAX_THUMB = 250_000;
const KEY = 'portfolio';
const imgKey = (id, size) => `pimg:${id}:${size}`;
const ID_RE = /^ph-[a-z0-9]{6,12}$/;

function decodeImage(dataUrl, max, label) {
  const m = typeof dataUrl === 'string' && dataUrl.match(/^data:(image\/(?:jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new HttpError(400, 'image', `${label}: formato inválido (use JPEG ou WebP).`);
  const b64 = m[2];
  const size = Math.floor(b64.length * 3 / 4);
  if (size > max) throw new HttpError(413, 'too_large', `${label}: arquivo grande demais.`);
  const head = atob(b64.slice(0, 24));
  const bytes = Array.from(head, (c) => c.charCodeAt(0));
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP';
  if ((m[1] === 'image/jpeg' && !isJpeg) || (m[1] === 'image/webp' && !isWebp)) {
    throw new HttpError(400, 'image', `${label}: o conteúdo não é uma imagem válida.`);
  }
  return { type: m[1], b64 };
}

const publicPhoto = (p) => ({
  id: p.id, caption: p.caption, professionalId: p.professionalId, w: p.w, h: p.h,
  thumbUrl: `/api/v1/public/portfolio/img?id=${p.id}&size=thumb&v=${p.v || 1}`,
  fullUrl: `/api/v1/public/portfolio/img?id=${p.id}&size=full&v=${p.v || 1}`,
});

async function list(store) { return (await store.get(KEY)) || []; }

export async function publicList(store, config) {
  const pros = (config.professionals || []).filter((p) => p.active);
  const proIds = new Set(pros.map((p) => p.id));
  const photos = (await list(store)).map(publicPhoto)
    .map((p) => ({ ...p, professionalId: proIds.has(p.professionalId) ? p.professionalId : null }));
  return { photos, professionals: pros.map(({ id, name }) => ({ id, name })) };
}

export async function count(store) { return (await list(store)).length; }

export async function image(store, q) {
  const id = q.get('id') || '';
  const size = q.get('size') === 'full' ? 'full' : 'thumb';
  if (!ID_RE.test(id)) throw new HttpError(404, 'not_found', 'Imagem não encontrada.');
  const data = await store.get(imgKey(id, size));
  if (!data) throw new HttpError(404, 'not_found', 'Imagem não encontrada.');
  const bin = atob(data.b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return {
    status: 200, raw: bytes,
    headers: { 'content-type': data.type, 'cache-control': 'public, max-age=604800, immutable' },
  };
}

export async function add(store, config, body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'body', 'Envio inválido.');
  const full = decodeImage(body.image, MAX_FULL, 'Foto');
  const thumb = decodeImage(body.thumb, MAX_THUMB, 'Miniatura');
  const w = Math.max(1, Math.min(10000, Math.round(Number(body.w) || 1)));
  const h = Math.max(1, Math.min(10000, Math.round(Number(body.h) || 1)));
  const caption = cleanText(body.caption, 100);
  const professionalId = (config.professionals || []).some((p) => p.id === body.professionalId) ? body.professionalId : null;

  return store.withLock('lock:portfolio', async () => {
    const items = await list(store);
    if (items.length >= MAX_PHOTOS) throw new HttpError(409, 'limit', `Limite de ${MAX_PHOTOS} fotos. Exclua alguma para enviar novas.`);
    const id = slugId('ph-');
    await store.set(imgKey(id, 'full'), full);
    await store.set(imgKey(id, 'thumb'), thumb);
    const item = { id, caption, professionalId, w, h, v: 1, createdAt: new Date().toISOString() };
    items.unshift(item); // fotos novas aparecem primeiro
    await store.set(KEY, items);
    return { photo: publicPhoto(item), total: items.length };
  });
}

export async function update(store, config, body) {
  const id = cleanText(body && body.id, 20);
  return store.withLock('lock:portfolio', async () => {
    const items = await list(store);
    const item = items.find((p) => p.id === id);
    if (!item) throw new HttpError(404, 'not_found', 'Foto não encontrada.');
    if ('caption' in body) item.caption = cleanText(body.caption, 100);
    if ('professionalId' in body) {
      item.professionalId = (config.professionals || []).some((p) => p.id === body.professionalId) ? body.professionalId : null;
    }
    await store.set(KEY, items);
    return { photo: publicPhoto(item) };
  });
}

export async function remove(store, body) {
  const id = cleanText(body && body.id, 20);
  return store.withLock('lock:portfolio', async () => {
    const items = await list(store);
    if (!items.some((p) => p.id === id)) throw new HttpError(404, 'not_found', 'Foto não encontrada.');
    await store.set(KEY, items.filter((p) => p.id !== id));
    await store.del(imgKey(id, 'full'));
    await store.del(imgKey(id, 'thumb'));
    return { ok: true };
  });
}

export async function reorder(store, body) {
  const ids = Array.isArray(body && body.ids) ? body.ids.map((x) => cleanText(x, 20)) : null;
  if (!ids) throw new HttpError(400, 'ids', 'Ordem inválida.');
  return store.withLock('lock:portfolio', async () => {
    const items = await list(store);
    const byId = new Map(items.map((p) => [p.id, p]));
    if (ids.length !== items.length || ids.some((id) => !byId.has(id))) {
      throw new HttpError(409, 'stale', 'O portfólio mudou em outro aparelho. Recarregue a página.');
    }
    await store.set(KEY, ids.map((id) => byId.get(id)));
    return { ok: true };
  });
}

export async function adminList(store) {
  return { photos: (await list(store)).map((p) => ({ ...publicPhoto(p), createdAt: p.createdAt })), max: MAX_PHOTOS };
}
