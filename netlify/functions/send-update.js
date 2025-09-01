// netlify/functions/send-update.js  (SMTP via Gmail, baseline-init, Blobs optional, compat)
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
function prettyKey(k){
  // Mon:01:job -> Mon 1 — Job
  try{
    var parts = String(k).split(':'); // [day,row,field]
    var day = parts[0]||'';
    var row = parts[1]||'';
    var field = parts[2]||'';
    if (row.length && row[0]==='0') row = String(parseInt(row,10));
    field = field.replace(/(^|\b)([a-z])/g,function(_,a,b){return a + b.toUpperCase();});
    field = field.replace(/Pto/i,'PTO');
    return (day + ' ' + (row||'') + ' — ' + field).trim();
  } catch(e){ return k; }
}
function renderHtml(weekKey, actor, note, changes, metaNote) {
  const rows = changes.slice(0, 200).map(function(c){
    const fromStr = (c.from === undefined || c.from === null) ? '' : String(c.from);
    const toStr   = (c.to   === undefined || c.to   === null) ? '' : String(c.to);
    return (
      '<tr>' +
      `<td style="padding:6px;border:1px solid #eee;">${escapeHtml(prettyKey(c.key))}</td>` +
      `<td style="padding:6px;border:1px solid #eee;">${escapeHtml(fromStr.substring(0,160))}</td>` +
      `<td style="padding:6px;border:1px solid #eee;">${escapeHtml(toStr.substring(0,160))}</td>` +
      '</tr>'
    );
  }).join('');
  const extra = changes.length > 200 ? `<p>…and ${changes.length - 200} more changes.</p>` : '';
  const link  = SITE_URL ? `<p><a href="${SITE_URL}" target="_blank" rel="noopener">Open the schedule</a></p>` : '';
  const noteBlock = note ? `<p><strong>Note from ${escapeHtml(actor)}:</strong><br/>${escapeHtml(note)}</p>` : '';
  const meta = metaNote ? `<p style="color:#666">${escapeHtml(metaNote)}</p>` : '';
  return (
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#222">` +
      `<p>Schedule updated by <strong>${escapeHtml(actor)}</strong> for <strong>${escapeHtml(weekKey)}</strong>.</p>` +
      noteBlock + meta +
      (rows ? (
        `<table style="border-collapse:collapse;width:100%;border:1px solid #eee;">` +
          `<thead><tr>` +
            `<th style="text-align:left;padding:6px;border:1px solid #eee;">Field</th>` +
            `<th style="text-align:left;padding:6px;border:1px solid #eee;">From</th>` +
            `<th style="text-align:left;padding:6px;border:1px solid #eee;">To</th>` +
          `</tr></thead>` +
          `<tbody>${rows}</tbody>` +
        `</table>`
      ) : `<p>No field changes detected.</p>`) +
      extra + link +
      `<p style="color:#666">You’re receiving this because you’re on the “Send Update” list.</p>` +
    `</div>`
  );
}

// Blobs may be unavailable → don't crash
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

// Fallback: load current week via existing function (reuses auth cookie)
async function loadWeekViaHttp(event, weekKey) {
  try {
    const host = (event.headers && (event.headers['x-forwarded-host'] || event.headers.host)) || '';
    const proto = (event.headers && (event.headers['x-forwarded-proto'] || 'https')) || 'https';
    const url = proto + '://' + host + '/.netlify/functions/load-week?weekKey=' + encodeURIComponent(weekKey);
    const cookie = (event.headers && (event.headers.cookie || event.headers.Cookie)) || '';
    const r = await fetch(url, { headers: { cookie } });
    if (!r.ok) return {};
    const j = await r.json().catch(function(){ return {}; });
    return (j && j.ok && j.data) ? j.data : {};
  } catch (e) {
    console.warn('[send-update] HTTP load-week failed:', e && e.message);
    return {};
  }
}

async function sendEmailSMTP(opts) {
  const host   = process.env.SMTP_HOST;
  const port   = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || 'false') === 'true';
  const user   = process.env.SMTP_USER;
  const pass   = process.env.SMTP_PASS;
  const from   = process.env.EMAIL_FROM;
  const replyTo= process.env.REPLY_TO || undefined;

  if (!host || !user || !pass || !from) throw new Error('Missing SMTP env (host/user/pass/from)');

  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  const mail = { from, to: opts.to, subject: opts.subject, html: opts.html };
  if (replyTo) mail.replyTo = replyTo;

  const info = await transporter.sendMail(mail);
  try { console.log('[send-update] sent', (info && (info.messageId || info.response || 'ok')), 'to', Array.isArray(mail.to) ? mail.to.join(',') : mail.to); } catch {}
}

/* ---------- function ---------- */
exports.handler = async function(event){
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok:false, error:'MethodNotAllowed' }) };
  }

  // parse input
  var body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  var weekKey  = String(body.weekKey || '').trim();
  var to       = Array.isArray(body.to) ? body.to.filter(Boolean) : [];
  var note     = String(body.note || '').slice(0, 2000);
  var baseline = (body && typeof body.baseline === 'object' && body.baseline) ? body.baseline : null;

  if (!weekKey)   return { statusCode: 400, body: JSON.stringify({ ok:false, error:'Missing weekKey' }) };
  if (!to.length) return { statusCode: 400, body: JSON.stringify({ ok:false, error:'No recipients' }) };

  // actor (best-effort)
  var actor = 'unknown';
  try {
    const token = getCookie(event.headers || {});
    const payload = token ? verifyToken(token) : null;
    if (payload && payload.sub) actor = payload.sub;
  } catch (e) {}

  // stores (may be null)
  const weeksStore  = tryGetStore(WEEKS_STORE);
  const notifyStore = tryGetStore(NOTIFY_STORE);

  // current snapshot
  var current = {};
  if (weeksStore) current = await weeksStore.get(weekKey + '.json', { type:'json' }).catch(function(){ return null; }) || {};
  else            current = await loadWeekViaHttp(event, weekKey);

  // previous snapshot (server or client baseline)
  var last = {};
  if (notifyStore) last = await notifyStore.get(weekKey + '.json', { type:'json' }).catch(function(){ return null; }) || {};
  else if (baseline) last = baseline;

  var firstInit = false;
  if (!last || Object.keys(last).length === 0) {
    // No previous snapshot anywhere → treat as first send (initialize baseline, show 0 changes)
    firstInit = true;
    last = current;
  }

  var changes = diffObjects(last, current);
  var metaNote = firstInit
    ? 'First notification for this week — baseline initialized. Future emails will show only changed fields.'
    : ( !notifyStore && baseline ? 'Changes computed against sender’s last-sent baseline.' : '' );

  const subject = 'HVAC schedule update — ' + weekKey + ' (' + changes.length + ' change' + (changes.length === 1 ? '' : 's') + ')';
  const html = renderHtml(weekKey, actor, note, changes, metaNote);

  try { await sendEmailSMTP({ to, subject, html }); }
  catch (e) { return { statusCode: 502, body: JSON.stringify({ ok:false, error: e.message }) }; }

  // Save "last notified" snapshot server-side when possible
  if (notifyStore) {
    try {
      await notifyStore.set(weekKey + '.json', JSON.stringify(current), {
        metadata: { weekKey: weekKey, actor: actor, notifiedAt: Date.now() }
      });
    } catch (e) {
      console.warn('[send-update] failed to write notify snapshot:', e && e.message);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ ok:true, sent: to.length, changes: changes.length, firstInit: firstInit }) };
};
