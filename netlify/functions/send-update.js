// SMTP (Nodemailer) + grid-style update email with dates and crew names.
// Env: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, FROM_EMAIL, [FROM_NAME], [APP_URL]

const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ ok:false, error:'MethodNotAllowed' }) };
    }

    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch {}
    const weekKey   = String(body.weekKey || '').trim();               // e.g. "2025-W36"
    const to        = Array.isArray(body.to) ? body.to : [];
    const note      = String(body.note || '').trim();
    const fromUser  = String(body.fromUser || '').trim();
    const before    = (body.before && typeof body.before === 'object') ? body.before : {};
    const after     = (body.after  && typeof body.after  === 'object') ? body.after  : {};
    const crewNames = (body.crewNames && typeof body.crewNames === 'object') ? body.crewNames : {};

    if (!weekKey)   return { statusCode: 400, body: JSON.stringify({ ok:false, error:'Missing weekKey' }) };
    if (!to.length) return { statusCode: 400, body: JSON.stringify({ ok:false, error:'No recipients' }) };

    // Build diff rows ready for a table
    const monday = isoWeekKeyToMonday(weekKey); // Date obj for Monday
    const rows = buildRows(before, after, crewNames, monday); // [{field, from, to}]
    const changeCount = rows.length;

    // Email meta/content
    const safeSender = fromUser || 'Unknown';
    const subject = `HVAC schedule update — ${weekKey} (${changeCount} change${changeCount===1?'':'s'})`;
    const sentAt = new Date().toLocaleString('en-US',{hour:'numeric', minute:'2-digit'});

    const appURL = process.env.APP_URL || '';

    // Plain text fallback
    const plain = [
      `Schedule updated by ${safeSender} for ${weekKey}.`,
      ``,
      note ? `Note:\n${note}\n` : '',
      changeCount ? 'Changes:' : 'No changes detected.',
      ...rows.map(r => `- ${r.field}: ${r.from || '—'} → ${r.to || '—'}`),
      '',
      appURL ? `Open the schedule: ${appURL}` : ''
    ].filter(Boolean).join('\n');

    // HTML email (table/grid style)
    const html = htmlEmail({
      weekKey, safeSender, sentAt, note, rows, appURL
    });

    // SMTP transport
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      tls: { minVersion: 'TLSv1.2' }
    });

    await transporter.sendMail({
      from: `"${process.env.FROM_NAME || 'HVAC Schedule'}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
      to: to.join(','),
      subject,
      text: plain,
      html
    });

    return { statusCode: 200, body: JSON.stringify({ ok:true }) };
  } catch (err) {
    console.error('send-update (grid) error:', err);
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:'Server error' }) };
  }
};

/* =========================
   Build table rows
   ========================= */
function buildRows(before={}, after={}, crewNames={}, mondayDate){
  const rows = [];
  const allKeys = new Set([...Object.keys(before||{}), ...Object.keys(after||{})]);

  for (const key of allKeys) {
    const a = normalize(after[key]);
    const b = normalize(before[key]);
    if (a === b) continue;

    const meta = parseKey(key); // { day, row, field, offset }
    if (!meta) continue;

    const prettyField = ({
      job: 'Job',
      helper: 'Helper',
      pto: 'Lead PTO',
      helperPto: 'Helper PTO'
    })[meta.field] || meta.field;

    const crew = crewNames[meta.rowPad] || {};
    const nameLabel = crew.label ? ` — ${crew.label}` : '';

    const md = mondayDate ? asMonthDay(addDays(mondayDate, meta.offset)) : meta.day; // "9/1"
    const fieldLabel = `${crewLabel(meta.row)}${nameLabel} — ${meta.day} ${md} — ${prettyField}`;

    // PTO: show ✓ PTO vs —
    if (meta.field === 'pto' || meta.field === 'helperPto') {
      rows.push({
        field: fieldLabel,
        from: b === true ? '✓ PTO' : '—',
        to:   a === true ? '✓ PTO' : '—'
      });
    } else {
      rows.push({
        field: fieldLabel,
        from: (b || '—'),
        to:   (a || '—')
      });
    }
  }

  // Keep reasonable cap (emails can get long)
  return rows.slice(0, 300);
}

/* =========================
   HTML template
   ========================= */
function htmlEmail({ weekKey, safeSender, sentAt, note, rows, appURL }){
  const tableRows = rows.length
    ? rows.map(r => `
      <tr>
        <td style="padding:8px 10px;border:1px solid #ddd;">${escapeHtml(r.field)}</td>
        <td style="padding:8px 10px;border:1px solid #ddd;">${escapeHtml(r.from)}</td>
        <td style="padding:8px 10px;border:1px solid #ddd;">${escapeHtml(r.to)}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" style="padding:10px;border:1px solid #ddd;color:#666;">No changes detected.</td></tr>`;

  const noteBlock = note
    ? `<div style="margin:12px 0; padding:10px 12px; background:#f6f7f9; border:1px solid #e5e7eb; border-radius:8px;">
         <div style="font-size:12px; color:#555; text-transform:uppercase; letter-spacing:.03em; margin-bottom:6px;">Note from sender</div>
         <div style="white-space:pre-wrap;">${escapeHtml(note)}</div>
       </div>`
    : '';

  const openLink = appURL
    ? `<p style="margin:10px 0;"><a href="${escapeAttr(appURL)}" style="color:#0b62ff; text-decoration:underline;">Open the schedule</a></p>`
    : '';

  return `<!doctype html>
<html>
  <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#111; line-height:1.5; margin:0; padding:16px;">
    <h2 style="margin:0 0 8px;">HVAC Schedule</h2>
    <div style="margin:0 0 8px; font-size:14px;">
      Schedule updated by <strong>${escapeHtml(safeSender)}</strong> for <strong>${escapeHtml(weekKey)}</strong>.<br/>
      <span style="color:#555;">Time: ${escapeHtml(sentAt)}</span>
    </div>
    ${openLink}
    ${noteBlock}
    <table style="border-collapse:collapse; width:100%; max-width:820px; margin-top:8px;">
      <thead>
        <tr>
          <th style="text-align:left; padding:8px 10px; border:1px solid #ddd; background:#fafafa;">Field</th>
          <th style="text-align:left; padding:8px 10px; border:1px solid #ddd; background:#fafafa;">From</th>
          <th style="text-align:left; padding:8px 10px; border:1px solid #ddd; background:#fafafa;">To</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
    <p style="color:#666; font-size:12px; margin-top:16px;">
      You're receiving this because you're on the "Send Update" list.
    </p>
  </body>
</html>`;
}

/* =========================
   Helpers
   ========================= */

// Parse key: "Mon:01:job" → { day:"Mon", row:1, rowPad:"01", field:"job", offset:0..4 }
function parseKey(key){
  const m = key.match(/^(Mon|Tue|Wed|Thu|Fri):(\d{2}):(job|helper|pto|helperPto)$/);
  if (!m) return null;
  const day = m[1], rowPad = m[2], field = m[3];
  const dayIndex = ['Mon','Tue','Wed','Thu','Fri'].indexOf(day);
  return { day, row: parseInt(rowPad,10), rowPad, field, offset: dayIndex };
}
function crewLabel(row){ return `Row ${row}`; }

function normalize(v){
  if (typeof v === 'boolean') return v;
  if (v === null || v === undefined) return '';
  return String(v);
}

function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' }[c])); }
function escapeAttr(s=''){ return String(s).replace(/"/g,'&quot;'); }

// Convert "2025-W36" -> Date for Monday of that ISO week (local time, midnight)
function isoWeekKeyToMonday(weekKey){
  const m = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1],10), wk = parseInt(m[2],10);
  // ISO: week 1 is the week with the year's first Thursday; Monday-start weeks.
  // Start with Jan 4th (always in week 1), then go to Monday of that week and add (wk-1)*7.
  const jan4 = new Date(year, 0, 4);
  const day = jan4.getDay() || 7; // 1..7
  const monday = new Date(year, 0, 4 - (day - 1));
  monday.setHours(0,0,0,0);
  monday.setDate(monday.getDate() + (wk - 1) * 7);
  return monday;
}
function addDays(d, n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function asMonthDay(d){ if (!d) return ''; return `${d.getMonth()+1}/${d.getDate()}`; }
