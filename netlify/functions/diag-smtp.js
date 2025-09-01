// netlify/functions/diag-smtp.js
const nodemailer = require('nodemailer');
const { getCookie, verifyToken } = require('./_authUtil');

function mask(s, keep=3){ if(!s) return ''; return s.length<=keep? s : s.slice(0,keep) + '…'; }

exports.handler = async (event) => {
  // Require a signed-in session (same as your app)
  const token = getCookie(event.headers||{});
  const payload = token && verifyToken(token);
  if (!payload) {
    return { statusCode: 401, body: JSON.stringify({ ok:false, error:'Not signed in' }) };
  }

  const host   = process.env.SMTP_HOST;
  const port   = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || 'false') === 'true';
  const user   = process.env.SMTP_USER;
  const pass   = process.env.SMTP_PASS;
  const from   = process.env.EMAIL_FROM;

  if (!host || !user || !pass || !from) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error:'Missing SMTP env (host/user/pass/from)' }) };
  }

  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });

  try {
    // Basic connection/auth check
    await transporter.verify();
  } catch (e) {
    return {
      statusCode: 502,
      body: JSON.stringify({
        ok:false,
        where:'verify',
        error: e.message,
        config: { host, port, secure, user: mask(user) }
      })
    };
  }

  // Optional: send a test email if ?to= is provided
  const url = new URL(event.rawUrl || ('https://x/?'+event.rawQueryString));
  const to = url.searchParams.get('to');

  if (to) {
    try {
      await transporter.sendMail({
        from, to,
        subject: 'SMTP test — HVAC Schedule',
        html: '<p>SMTP test from diag-smtp.</p>'
      });
    } catch (e) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          ok:false,
          where:'sendMail',
          error: e.message,
          config: { host, port, secure, user: mask(user) }
        })
      };
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok:true,
      verified:true,
      sent: !!to,
      info: { host, port, secure, user: mask(user) }
    })
  };
};
