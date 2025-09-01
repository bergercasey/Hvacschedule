// netlify/functions/send-update.js  (SMTP via Gmail, Blobs-safe)
const { getStore } = require('@netlify/blobs');
const { getCookie, verifyToken } = require('./_authUtil');
const nodemailer = require('nodemailer');

const WEEKS_STORE  = process.env.WEEKS_STORE  || 'weeks';
const NOTIFY_STORE = process.env.NOTIFY_STORE || 'notified';
const SITE_URL     = process.env.SITE_URL     || '';

/* ---------- helpers ---------- */
function diffObjects(prev = {}, next = {}) {
  const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]);
  const changes = [];
  for (const k of keys) {
    const a = prev[k], b = next[k];
    const same = (typeof a === 'object' || typeof b === 'object')
      ? JSON.stringify(a) === JSON.stringify(b)
      : a === b;
    if (!same) changes.push({ key: k, from: a, to: b });
  }
  return changes;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}
function renderHtml(weekKey, actor, note, changes) {
  const rows = changes.slice(0, 100).map(c => `
    <tr>
      <td style="padding:6px;border:1px solid #eee;">${c.key}</td>
      <td style="padding:6px;border:1px solid #eee;">${(c.from ?? '').toString().substring(0,120)}</td>
      <td style="padding:6px;border:1px solid #eee;">${(c.to ?? '').toString().substrin
