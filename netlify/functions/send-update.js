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
      `<p style="color:#666">You’re receiving this because you’re on the “Send Update” list.</p>` +
    `</div>`
  );
}

// Gracefully handle sites where Blobs isn't available
function tryGetStore(name) {
  try { return getStore({ name }); }
  catch (e) {
    const msg = String((e && (e.message || e.name)) || '');
    if (msg.indexOf('MissingBlobsEnvironmentError') !== -1 || msg.toLowerCase().indexOf('blobs') !== -1) {
      console.warn('[send-update] Blobs not available; proceeding without snapshots.');
      return null;
    }
    throw e;
  }
}

async function sendEmailSMTP(opts) {
  const host   = process.env.SMTP_HOST;      // smtp.gmail.com
  const port   = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || 'false') === 'true'; // STARTTLS -> false
  const user   = process.env.SMTP_USER;      // your Gmail
  const pass   = process.env.SMTP_PASS;      // 16-char app password
  const from   = process.env.EMAIL_FROM;     // "HVAC Schedule <yourgmail@gmail.com>"
  const replyTo= process.env.REPLY_TO || undefined;

  if (!host || !user || !pass || !from) throw new Error('Missing SMTP env (host/user/pass/from)');

  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  const mail = { from, to: opts.to, subject: opts.subject, html: opts.html };
  if (replyTo) mail.replyTo = replyTo;
  await transporter.sendMail(mail);
}

/* ---------- function ---------- */
exports.handler = async function(event){
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok:false, error:'MethodNotAllowed' }) };
  }

  // parse input
  var body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  var weekKey = String(body.weekKey || '').trim();
  var to = Array.isArray(body.to) ? body.to.filter(Boolean) : [];
  var note = String(body.note || '').slice(0, 2000);

  if (!weekKey)   return { statusCode: 400, body: JSON.stringify({ ok:false, error:'Missing weekKey' }) };
  if (!to.length) return { statusCode: 400, body: JSON.stringify({ ok:false, error:'No recipients' }) };

  // actor from auth cookie (best-effort)
  var actor = 'unknown';
  try {
    const token = getCookie(event.headers || {});
    const payload = token ? verifyToken(token) : null;
    if (payload && payload.sub) actor = payload.sub;
  } catch (e) {}

  // get stores (or null if Blobs not available)
  const weeksStore  = tryGetStore(WEEKS_STORE);
  const notifyStore = tryGetStore(NOTIFY_STORE);

  // read current & last-notified snapshots (tolerant)
  const current = weeksStore
    ? (await weeksStore.get(weekKey + '.json', { type:'json' }).catch(function(){ return null; })) || {}
    : {};
  const last = notifyStore
    ? (await notifyStore.get(weekKey + '.json', { type:'json' }).catch(function(){ return null; })) || {}
    : {};

  const changes = diffObjects(last, current);

  const subject = 'HVAC schedule update — ' + weekKey + ' (' + changes.length + ' change' + (changes.length === 1 ? '' : 's') + ')';
  const html = renderHtml(weekKey, actor, note, changes);

  try {
    await sendEmailSMTP({ to, subject, html });
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ ok:false, error: e.message }) };
  }

  // save "last notified" snapshot if Blobs is available
  if (notifyStore) {
    try {
      await notifyStore.set(weekKey + '.json', JSON.stringify(current), {
        metadata: { weekKey: weekKey, actor: actor, notifiedAt: Date.now() }
      });
    } catch (e) {
      console.warn('[send-update] failed to write notify snapshot:', e && e.message);
      // don't fail the request just because snapshot write failed
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      sent: to.length,
      changes: changes.length,
      blobs: { weeks: !!weeksStore, notified: !!notifyStore }
    })
  };
};
