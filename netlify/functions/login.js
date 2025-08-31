const { parseUsers, signPayload, makeCookie } = require('./_authUtil');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok:false, error:'MethodNotAllowed' }) };
  }

  let body = {};
  try { body = JSON.parse(event.body||'{}'); } catch {}
  const username = String(body.username||'').trim();
  const password = String(body.password||'');
  const remember = !!body.remember;

  const users = parseUsers();
  const match = users.find(u => u.username === username && u.password === password);

  if (!match) {
    return { statusCode: 401, body: JSON.stringify({ ok:false, error:'Invalid credentials' }) };
  }

  const token = signPayload({
    sub: match.username,
    iat: Date.now(),
    exp: Date.now() + (remember ? 1000*60*60*24*7 : 1000*60*60*4)
  });

  return {
    statusCode: 200,
    headers: {
      'Set-Cookie': makeCookie(token, { remember }),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ok:true, user:{ username: match.username } })
  };
};
