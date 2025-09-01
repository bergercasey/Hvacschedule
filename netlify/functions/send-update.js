// netlify/functions/send-update.js
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ ok:false, error:'MethodNotAllowed' }) };
    }

    // ---- Parse request ----
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch {}
    const weekKey   = String(body.weekKey || '').trim();
    const to        = Array.isArray(body.to) ? body.to : [];
    const note      = String(body.note || '').trim();
    const fromUser  = String(body.fromUser || '').trim();
    const before    = (body.before && typeof body.before === 'object') ? body.before : {};
    const after     = (body.after  && typeof body.after  === 'object') ? body.after  : {};
    const crewNames = (body.crewNames && typeof body.crewNames === 'object') ? body.crewNames : {}; // 👈 NEW

    if (!weekKey)   return { statusCode: 400, body: JSON.stringify({ ok:false, error:'Missing weekKey' }) };
    if (!to.length) return { statusCode: 400, body: JSON.stringify({ ok:false, error:'No recipients' }) };

    // ---- Build diff text/HTML ----
    const diffLines = buildWeekDiff(before, after, crewNames); // 👈 pass crewNames
    const diffText  = diffLines.length ? diffLines.map(l => `• ${l}`).join('\n') : 'No changes detected.';
    const diffHTML  = diffLines.length
      ? `<ul style="margin:8px 0 0; padding-left:20px;">${diffLines.map(l=>`<li>${escapeHtml(l)}</li>`).join('')}</ul>`
      : `<div style="color:#666;">No changes detected.</div>`;

    // ---- Email meta ----
    const sentAt = new Date().toLocaleString('en-US', { hour: 'numeric', minute:'2-digit' });
    const safeSender = fromUser || 'Unknown';
    const subject = `Schedule Update — ${weekKey} (by ${safeSender})`;

    const appURL   = process.env.APP_URL || '';
    const plain = [
      `Schedule Update for ${weekKey}`,
      ``,
      `Sent by: ${safeSender}`,
      `Time: ${sentAt}`,
      appURL ? `Open app: ${appURL}` : ``,
      note ? `` : ``,
      note ? `Note from sender:` : ``,
      note ? note : ``,
      ``,
      `Changes in this update:`,
      diffText,
      ``,
      `— This email was sent automatically from the Schedule app.`
    ].filter(Boolean).join('\n');

    const html = `<!doctype html>
<html>
  <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#111; line-height:1.5;">
    <h2 style="margin:0 0 8px;">Schedule Update <span style="font-weight:400;">${escapeHtml(weekKey)}</span></h2>
    <p style="margin:0 0 6px;">
      <strong>Sent by:</strong> ${escapeHtml(safeSender)}<br/>
      <strong>Time:</strong> ${escapeHtml(sentAt)}
      ${appURL ? `<br/><strong>Open app:</strong> <a href="${escapeAttr(appURL)}">${escapeHtml(appURL)}</a>` : ``}
    </p>
    ${note ? `<div style="margin:12px 0; padding:10px 12px; background:#f6f7f9; border:1px solid #e5e7eb; border-radius:8px;">
      <div style="font-size:12px; color:#555; text-transform:uppercase; letter-spacing:.03em; margin-bottom:6px;">Note from sender</div>
      <div style="white-space:pre-wrap;">${escapeHtml(note)}</div>
    </div>` : ``}
    <div style="margin:12px 0;">
      <div style="font-size:12px; color:#555; text-transform:uppercase; letter-spacing:.03em;">Changes in this update</div>
      ${diffHTML}
    </div>
    <p style="color:#666; font-size:12px; margin-top:16px;">
      This email was sent automatically from the Schedule app.
    </p>
  </body>
</html>`;

    // ---- Send via SendGrid ----
    const apiKey   = process.env.SENDGRID_API_KEY;
    const fromEmail= process.env.FROM_EMAIL;
    const fromName = process.env.FROM_NAME || 'Schedule Updates';
    if (!apiKey || !fromEmail) {
      return { statusCode: 500, body: JSON.stringify({ ok:false, error:'Email not configured (SENDGRID_API_KEY / FROM_EMAIL)' }) };
    }

    const sgResp = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: to.map(email => ({ email })), subject }],
        from: { email: fromEmail, name: fromName },
        content: [
          { type: 'text/plain', value: plain },
          { type: 'text/html',  value: html  }
        ]
      })
    });
    if (sgResp.status !== 202) {
      const text = await sgResp.text().catch(()=> '');
      console.error('SendGrid error:', sgResp.status, text);
      return { statusCode: 502, body: JSON.stringify({ ok:false, error:'Email provider error', status: sgResp.status }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok:true }) };
  } catch (err) {
    console.error('send-update error:', err);
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:'Server error' }) };
  }
};

// ---------- Diff helpers ----------
function buildWeekDiff(before={}, after={}, crewNames={}){
  const lines = [];
  const allKeys = new Set([...Object.keys(before||{}), ...Object.keys(after||{})]);

  const labelFor = (key) => {
    const m = key.match(/^(Mon|Tue|Wed|Thu|Fri):(\d{2}):(job|helper|pto|helperPto)$/);
    if (!m) return key;
    const [ , day, row, field ] = m;
    const prettyField = ({
      job: 'Job',
      helper: 'Helper',
      pto: 'Lead PTO',
      helperPto: 'Helper PTO'
    })[field] || field;

    const crew = crewNames[row] || {};
    const crewLabel = crew.label ? ` — ${crew.label}` : ''; // ← “ — John / Sam”
    return `${day} · Row ${parseInt(row,10)}${crewLabel} · ${prettyField}`;
  };

  for (const k of allKeys) {
    const a = normalize(after[k]);
    const b = normalize(before[k]);
    if (a === b) continue;

    if (k.endsWith(':pto') || k.endsWith(':helperPto')) {
      const label = labelFor(k);
      if (a === true && b !== true) lines.push(`${label}: now PTO`);
      else if (a !== true && b === true) lines.push(`${label}: PTO removed`);
      else lines.push(`${label}: ${String(b)} → ${String(a)}`);
      continue;
    }

    const label = labelFor(k);
    const prev = (b || '').trim();
    const curr = (a || '').trim();
    if (!prev && curr) lines.push(`${label}: set to "${curr}"`);
    else if (prev && !curr) lines.push(`${label}: cleared (was "${prev}")`);
    else lines.push(`${label}: "${prev}" → "${curr}"`);
  }

  return lines.slice(0, 200);
}

function normalize(v){
  if (typeof v === 'boolean') return v;
  if (v === null || v === undefined) return '';
  return String(v);
}
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function escapeAttr(s=''){ return String(s).replace(/"/g,'&quot;'); }
