const { getCookie, verifyToken } = require('./_authUtil');
const nodemailer = require('nodemailer');

function buildTransport(){
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = String(process.env.SMTP_SECURE || 'false') === 'true';
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure, auth:{ user, pass } });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode:405, body:'Method Not Allowed' };
  const token = getCookie(event.headers||{});
  if (!token || !verifyToken(token)) return { statusCode:401, body:'Unauthorized' };
  let body = {}; try{ body = JSON.parse(event.body||'{}'); }catch{}
  const { to=[], note='', weekKey='', fromUser='', before={}, after={} } = body || {};
  if (!Array.isArray(to) || to.length===0) return { statusCode:400, body:'Missing recipients' };

  const from = process.env.EMAIL_FROM || 'no-reply@example.com';
  const subject = `HVAC Schedule Update — ${weekKey}`;

  function changedKeys(a,b){ const keys=new Set([...Object.keys(a||{}), ...Object.keys(b||{})]); const out=[]; for (const k of keys){ const va=JSON.stringify(a[k]??''); const vb=JSON.stringify(b[k]??''); if (va!==vb) out.push(k); } return out.sort(); }
  const changes = changedKeys(before, after);
  const text = [`From: ${fromUser||'unknown user'}`,`Week: ${weekKey}`, note?`Note: ${note}`:null,'',`Changes (${changes.length}):`, ...changes.map(k=>`  - ${k}: "${before[k]??''}" → "${after[k]??''}"`)].filter(Boolean).join('\n');

  const transporter = buildTransport();
  if (!transporter){ return { statusCode:200, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ok:false, error:'SMTP not configured' }) }; }

  try{
    await transporter.sendMail({ from, to: to.join(','), subject, text });
    return { statusCode:200, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ok:true }) };
  }catch(e){
    return { statusCode:200, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ok:false, error:String(e&&e.message||e) }) };
  }
};
