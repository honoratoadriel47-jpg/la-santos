// Sessão do painel: token assinado com HMAC-SHA256 (Web Crypto, sem dependências).
// Guardado em cookie HttpOnly + SameSite=Strict; nunca acessível ao JavaScript.

const enc = new TextEncoder();
const SESSION_HOURS = 12;
export const COOKIE = 'ls_admin';

function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
async function sign(secret, data) {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data)));
}

function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Comparação de senha em tempo constante (compara HMACs, não as strings). */
export async function passwordMatches(input, expected) {
  if (typeof input !== 'string' || !expected) return false;
  const k = 'pw-compare';
  return equalBytes(await sign(k, input), await sign(k, expected));
}

export function sessionSecret(env) {
  return env.SESSION_SECRET || `ls-session:${env.ADMIN_PASSWORD || ''}`;
}

export async function createToken(env, nowMs = Date.now()) {
  const payload = b64url(enc.encode(JSON.stringify({ r: 'admin', exp: nowMs + SESSION_HOURS * 3600e3 })));
  const sig = b64url(await sign(sessionSecret(env), payload));
  return `${payload}.${sig}`;
}

export async function verifyToken(env, token, nowMs = Date.now()) {
  if (!env.ADMIN_PASSWORD || typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  try {
    const expected = await sign(sessionSecret(env), payload);
    if (!equalBytes(expected, fromB64url(sig))) return false;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return data.r === 'admin' && data.exp > nowMs;
  } catch { return false; }
}

export function sessionCookie(token, secure) {
  return `${COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${secure ? '; Secure' : ''}`;
}
export function clearCookie(secure) {
  return `${COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}
