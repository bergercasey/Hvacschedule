// netlify/functions/send-update.js  (SMTP via Gmail, Blobs-safe, compat)
"use strict";
const { getStore } = require('@netlify/blobs');
const { getCookie, verifyToken } = require('./_authUtil');
const nodemailer = require('nodemailer');

const WEEKS_STORE  = process.env.WEEKS_STORE  || 'weeks';
const NOTIFY_STORE = process.env.NOTIFY_STORE || 'notified';
const SITE_URL     = process.env.SITE_URL     || '';

/* ---------- helpers ---------- */
function diffObjects(prev, next) {
  prev = prev || {};
  next = next || {};
  const keys = {};
  Object.keys(prev).forEach(k => { keys[k] = 1; });
  Object.keys(next).forEach(k => { keys[k] = 1; });
  const changes = [];
  for (const k in keys) {
    const a = prev[k], b = next[k];
    const same = (typeof a === 'object' || typeof b === 'object')
      ? JSON.stringify(a) === JSON.stringify(b)
      : a === b;
    if (!same) changes.push({ key: k, from: a, to: b });
  }
  return changes;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function(m){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m];
  });
}
function renderHtml(weekKey, actor, note, changes) {
  const rows = changes.slice(0, 100).map(function(c){
    const fromStr = (c.from === undefined || c.from === null) ? '' : String(c.from);
    const toStr   = (c.to   === undefined || c.to   === null) ? '' : String(c.to);
    return (
      '<tr>' +
      `<td style="padding:6px;border:1px solid #eee;">${c.key}</td>` +
      `<td style="padding:6px;border:1px solid #eee;">${fromStr.substring(0,120)}</td>` +
      `<td style="padding:6px;border:1px solid #eee;">${toStr.substring(0,120)}</td>` +
      '</tr>'
    );
  }).join('');
  const extra = changes.length > 100 ? `<p>…and ${changes.length - 100} more changes.</p>` : '';
  const link  = SITE_URL ? `<p><a href="${SITE_URL}" target="_blank" rel="noopener">Open the schedule</a></p>` : '';
  const noteBlock = note ? `<p><strong>Note from ${escapeHtml(actor)}:</strong><br/>${escapeHtml(note)}</p>` : '';
  return (
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#222">` +
      `<p>Schedule updated by <strong>${escapeHtml(actor)}</strong> for <strong>${escapeHtml(weekKey)}</strong>.</p>` +
      noteBlock +
      `<table style="border-collapse:collapse;width:100%;border:1px solid #eee;">` +
        `<thead><tr>` +
          `<th style="text-align:left;padding:6px;border:1px solid #eee;">Field</th>` +
          `<th style="text-align:left;padding:6px;border:1px solid #eee;">From</th>` +
          `<th style="text-align:left;padding:6px;border:1px solid #eee;">To</th>` +
        `</tr></thead>` +
        `<tbody>${rows}</tbody>` +
      `</table>` +
      extra +
      link +
      `<p style="color:#666">You’re receiving thi
