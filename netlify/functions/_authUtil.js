// Shared helpers for auth functions
const crypto = require('crypto');

const COOKIE_NAME = process.env.COOKIE_NAME || 'sched_session';
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'change-me-please';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days default

function parseUsers() {
  try {
    const raw = process.env.AUTH_USERS_JSON || '[]';
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) throw new Error('AUTH_USERS_JSON must be an array');
    return arr.map(u => ({ username: String(u.username||''), password: String(u.password||'') }));
  } catch (e) {
    console.error('AUTH_USERS_JSON parse error:', e.message);
    return [];
  }
}

function signPayload(obj) {
  const json = JSON.stringify(obj);
  const sig  = crypto.createHmac('sha256', COOKIE_SECRET).update(json).digest('hex');
  return Buffer.from(JSON.stringify({ json, sig })).toString('base64url');
}

function verifyToken(token) {
  try {
    const { json, sig } = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    const expected = crypto.createHmac('sha256', COOKIE_SECRET).update(json).digest('hex');
    if (sig !== expected) return null;
    const data = JSON.parse(json);
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

function makeCookie(value, { remember=false } = {}) {
  const maxAge = remember ? COOKIE_MAX_AGE : 60 * 60 * 4; // 4h if not remember
  const parts = [
    `${COOKIE_NAME}=${value}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Secure`
  ];
  if (maxAge) parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}

function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

function getCookie(headers) {
  const cookie = headers.cookie || headers.Cookie || '';
  const found = cookie.split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE_NAME}=`));
  return found ? found.split('=').slice(1).join('=') : '';
}

module.exports = {
  COOKIE_NAME,
  parseUsers,
  signPayload,
  verifyToken,
  makeCookie,
  clearCookie,
  getCookie,
};
