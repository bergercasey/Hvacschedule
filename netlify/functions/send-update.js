// netlify/functions/send-update.js  (SMTP via Outlook/Gmail)
const { getStore } = require('@netlify/blobs');
const { getCookie, verifyToken } = require('./_authUtil');
const nodemailer = require('nodemailer');

const WEEKS_STORE  = process.env.WEEKS_STORE  || 'weeks';
const NOTIFY_STORE = process.env.NOTIFY_STORE || 'notified';
const SITE_URL     = process.env.SITE_URL     || '';

function diffObjects(prev={}, next={}) {
  const keys = new Set([...Object.keys(prev||{}), ...Object.keys(next||{})]);
  const changes = [];
  for (const k of keys) {
    const a = prev[k], b = next[k];
    const same = (typeof a === 'object' || typeof b === 'object') ? JSON.stringify(a)===JSON.stringify(b) : a===b;
    if (!same) changes.push({ key:k, from:a, to:b });
  }
  return changes;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function renderHtml(weekKey, actor, note, changes){
  const rows = changes.slice(0, 100).map(c => `
    <tr>
      <td style="padding:6px;border:1px solid #eee;">${c.key}</td>
      <td style="padding:6px;border:1px solid #eee;">${(c.from??'').toString().substring(0,120)}</td>
      <td style="padding:6px;border:1px solid #eee;">${(c.to??'').toString().substring(0,120)}</td>
    </tr>`).join('');
  const extra = changes.length>100 ? `<p>…and ${changes.length-100} more changes.</p>` : '';
  const link = SITE_URL ? `<p><a href="${SITE_URL}" target="_blank" rel="noopener">Open the schedule</a></p>` : '';
  const noteBlock = note ? `<p><strong>Note from ${actor}:</strong><br/>${escapeHtml(note)}</p>` : '';
  return `
    <div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, sans-serif; font-size:14px; color:#222">
      <p>Schedule updated by <strong>${actor}</strong> for <strong>${weekKey}</strong>.</p>
      ${noteBlock}
      <table style="border-collapse:collapse; width:100%; border:1px solid #eee;">
        <thead>
          <tr><th style="text-align:left;padding:6px;border:1px solid #eee;">Field</th>
              <th style="text-align:left;padding:6px;border:1px solid #eee;">From</th>
              <th style="text-align:left;padding:6px;border:1px solid #eee;">To</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${extra}
      ${link}
      <p style="color:#666">You’re receiving this because you’re on the “Send Update” list.</p>
    </div>
  `;
}

async function sendEmailSMTP({ to, subject, html }) {
  const host   = process.env.SMTP_HOST;
  const port   = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || 'false') === 'true'; // STARTTLS → false
  const user   = process.env.SMTP_USER;
  const pass   = process.env.SMTP_PASS;
  const from   = process.env.EMAIL_FROM; // e.g. "HVAC Schedule <you@outlook.com>"

  if (!host || !user || !pass || !from) throw new Error('Missing SMTP env (host/user/pass/from)');

  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  await transporter.sendMail({ from, to, subject, html });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ ok:false, error:'MethodNotAllowed' }) };

  let body={}; try { body = JSON.parse(event.body||'{}'); } catch {}
  const weekKey = String(body.weekKey||'').trim();
  const to = Array.isArray(body.to) ? body.to.filter(Boolean) : [];
  const note = String(body.note||'').slice(0,2000);
  if (!weekKey)  return { statusCode: 400, body: JSON.stringify({ ok:false, error:'Missing weekKey' }) };
  if (!to.length) return { statusCode: 400, body: JSON.stringify({ ok:false, error:'No recipients' }) };

  // actor (from login)
  let actor='unknown';
  try { const t = getCookie(event.headers||{}); const p = t ? verifyToken(t) : null; if (p?.sub) actor = p.sub; } catch {}

  // load current & last-notified snapshots
  const weeks = getStore({ name: WEEKS_STORE });
  const notified = getStore({ name: NOTIFY_STORE });
  const current = await weeks.get(`${weekKey}.json`, { type:'json' }).catch(()=> null) || {};
  const last    = await notified.get(`${weekKey}.json`, { type:'json' }).catch(()=> null) || {};
  const changes = diffObjects(last, current);

  const subject = `HVAC schedule update — ${weekKey} (${changes.length} change${changes.length===1?'':'s'})`;
  const html = renderHtml(weekKey, actor, note, changes);

  try { await sendEmailSMTP({ to, subject, html }); }
  catch (e) { return { statusCode: 502, body: JSON.stringify({ ok:false, error: e.message }) }; }

  await notified.set(`${weekKey}.json`, JSON.stringify(current), { metadata:{ weekKey, actor, notifiedAt: Date.now() } });
  return { statusCode: 200, body: JSON.stringify({ ok:true, sent: to.length, changes: changes.length }) };
};
