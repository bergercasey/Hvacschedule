// netlify/functions/send-update.js (SMTP variant)
const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode:405, body:'Method Not Allowed' };

  const { weekKey, to = [], note = '', fromUser = '' } = JSON.parse(event.body||'{}');
  if (!weekKey || !to.length) return { statusCode:400, body: JSON.stringify({ ok:false }) };

  const sentAt = new Date().toLocaleString('en-US', { hour: 'numeric', minute:'2-digit' });
  const subject = `Schedule Update — ${weekKey} (by ${fromUser||'Unknown'})`;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: !!(process.env.SMTP_SECURE === 'true'),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  await transporter.sendMail({
    from: `"${process.env.FROM_NAME||'Schedule Updates'}" <${process.env.FROM_EMAIL}>`,
    to: to.join(','),
    subject,
    text: `Sent by: ${fromUser||'Unknown'}\nTime: ${sentAt}\n\n${note || ''}`,
    html: `<p><b>Sent by:</b> ${escapeHtml(fromUser||'Unknown')}<br/><b>Time:</b> ${sentAt}</p>${note?`<pre>${escapeHtml(note)}</pre>`:''}`
  });

  return { statusCode:200, body: JSON.stringify({ ok:true }) };
};

function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
