const { parseUsers, signPayload, makeCookie } = require('./_authUtil');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok:false, error:'MethodNotAllowed' }) };
  }

  let body = {};
  try { body = JSON.parse(event.body||'{}'); } catch {}
  const password = String(body.password||'');
  const unameRaw = String(body.username||'').trim();
  const unameLC  = unameRaw.toLowerCase();
  const remember = !!body.remember;

  // Keep original casing from AUTH_USERS_JSON, but compare lowercased
  const users = parseUsers().map(u => ({ ...u, _lc: String(u.username||'').toLowerCase() }));
  const match = users.find(u => u._lc === unameLC && u.password === password);

  if (!match) {
    return { statusCode: 401, body: JSON.stringify({ ok:false, error:'Invalid credentials' }) };
  }

  const token = signPayload({
    sub: match.username,              // store original casing
    iat: Date.now(),
    exp: Date.now() + (remember ? 1000*60*60*24*7 : 1000*60*60*4)
  });

  return {
    statusCode: 200,
    headers: {
      'Set-Cookie': makeCookie(token, { remember }),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ok:true, user:{ username: match.username } }) // shows original casing
  };
};
