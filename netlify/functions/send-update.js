const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok:false, error:'MethodNotAllowed' }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}
  const { weekKey, to, note, fromUser, before, after, crewNames } = body;

  if (!weekKey) return { statusCode: 400, body: JSON.stringify({ ok:false, error:'Missing weekKey' }) };
  if (!Array.isArray(to) || !to.length) return { statusCode: 400, body: JSON.stringify({ ok:false, error:'No recipients' }) };

  const diffLines = buildWeekDiff(before||{}, after||{}, crewNames||{});
  const diffText = diffLines.length ? diffLines.map(l=>`• ${l}`).join('\n') : 'No changes detected.';
  const sentAt = new Date().toLocaleString('en-US',{hour:'numeric',minute:'2-digit'});
  const safeSender = fromUser || 'Unknown';

  const subject = `Schedule Update — ${weekKey} (by ${safeSender})`;
  const plain = [
    `Schedule Update for ${weekKey}`,
    ``,
    `Sent by: ${safeSender}`,
    `Time: ${sentAt}`,
    note ? `\nNote:\n${note}` : ``,
    ``,
    `Changes:`,
    diffText
  ].join('\n');

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT||587),
    secure: String(process.env.SMTP_SECURE||'false').toLowerCase()==='true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  await transporter.sendMail({
    from: `"${process.env.FROM_NAME||'Schedule Updates'}" <${process.env.FROM_EMAIL||process.env.SMTP_USER}>`,
    to: to.join(','),
    subject,
    text: plain
  });

  return { statusCode: 200, body: JSON.stringify({ ok:true }) };
};

/* ---- diff helper ---- */
function buildWeekDiff(before, after, crewNames){
  const lines = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for(const k of allKeys){
    const a = normalize(after[k]);
    const b = normalize(before[k]);
    if (a === b) continue;
    const label = labelFor(k, crewNames||{});
    if (k.endsWith(':pto') || k.endsWith(':helperPto')){
      if (a===true && !b) lines.push(`${label}: now PTO`);
      else if (!a && b===true) lines.push(`${label}: PTO removed`);
      continue;
    }
    if (!b && a) lines.push(`${label}: set to "${a}"`);
    else if (b && !a) lines.push(`${label}: cleared (was "${b}")`);
    else lines.push(`${label}: "${b}" → "${a}"`);
  }
  return lines;
}
function normalize(v){ if (typeof v==='boolean') return v; return (v==null?'':String(v)); }
function labelFor(key, crewNames){
  const m = key.match(/^(Mon|Tue|Wed|Thu|Fri):(\d{2}):(job|helper|pto|helperPto)$/);
  if (!m) return key;
  const [,day,row,field] = m;
  const prettyField = {job:'Job',helper:'Helper',pto:'Lead PTO',helperPto:'Helper PTO'}[field]||field;
  const crew = crewNames[row]||{};
  const crewLabel = crew.label?` — ${crew.label}`:'';
  return `${day} · Row ${parseInt(row,10)}${crewLabel} · ${prettyField}`;
}
