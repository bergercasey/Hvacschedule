// Shared helpers for auth functions (HMAC token, no external deps)
const crypto = require('crypto');

const COOKIE_NAME = process.env.COOKIE_NAME || 'sched_session';
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'change-me-please';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function b64urlJSON(obj){ return b64url(JSON.stringify(obj)); }

function signPayload(payload){
  const header = { alg: 'HS256', typ: 'JWT-lite' };
  const body = { ...payload };
  const data = b64urlJSON(header) + '.' + b64urlJSON(body);
  const sig = crypto.createHmac('sha256', COOKIE_SECRET).update(data).digest('base64url');
  return data + '.' + sig;
}

function verifyToken(token){
  try{
    const parts = String(token||'').split('.');
    if (parts.length !== 3) return null;
    const [h, b, s] = parts;
    const data = h + '.' + b;
    const expected = crypto.createHmac('sha256', COOKIE_SECRET).update(data).digest('base64url');
    if (expected !== s) return null;
    const payload = JSON.parse(Buffer.from(b, 'base64').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  }catch{ return null; }
}

function parseUsers(){
  try{
    const raw = process.env.AUTH_USERS_JSON || '[]';
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(u => ({ username: String(u.username||''), password: String(u.password||'') }));
  }catch{ return []; }
}

function makeCookie(value, { remember=false } = {}){
  const maxAge = remember ? COOKIE_MAX_AGE : 60 * 60 * 4; // 4h
  const secure = true;
  const cookie = `${COOKIE_NAME}=${value}; Max-Age=${maxAge}; Path=/; SameSite=Lax; ${secure?'Secure;':''} HttpOnly`;
  return cookie;
}

function getCookie(headers){
  const h = headers || {};
  const raw = h.cookie || h.Cookie || '';
  const parts = String(raw).split(/;\s*/);
  for (const p of parts){
    if (!p) continue;
    const [k, v] = p.split('=');
    if (k === COOKIE_NAME) return v;
  }
  return null;
}

module.exports = { parseUsers, signPayload, makeCookie, getCookie, verifyToken };
