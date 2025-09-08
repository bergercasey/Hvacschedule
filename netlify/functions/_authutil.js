// netlify/functions/_authUtil.js
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const COOKIE_NAME = 'sess';
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'dev-secret-change-me';

// 30 days by default
const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 30
};

function parseBody(event) {
  try { return JSON.parse(event.body || '{}'); } catch { return {}; }
}

// AUTH_USERS_JSON: [{"username":"manager","password":"secret"}]
function readUserList() {
  try {
    const raw = process.env.AUTH_USERS_JSON || '[]';
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function matchUser(username, password) {
  const list = readUserList();
  return list.find(u => u.username === username && u.password === password);
}

function makeCookie(value, opts = {}) {
  return cookie.serialize(COOKIE_NAME, value, { ...COOKIE_OPTS, ...opts });
}

function clearCookie() {
  return cookie.serialize(COOKIE_NAME, '', { ...COOKIE_OPTS, maxAge: 0 });
}

function signSession(payload) {
  return jwt.sign(payload, COOKIE_SECRET, { expiresIn: '30d' });
}

function verifySession(token) {
  try { return jwt.verify(token, COOKIE_SECRET); } catch { return null; }
}

function readSession(event) {
  const hdr = event.headers || {};
  const raw = hdr.cookie || hdr.Cookie || '';
  const parsed = cookie.parse(raw || '');
  const token = parsed[COOKIE_NAME];
  if (!token) return null;
  return verifySession(token);
}

module.exports = {
  parseBody,
  readUserList,
  matchUser,
  makeCookie,
  clearCookie,
  signSession,
  verifySession,
  readSession,
  COOKIE_NAME
};
