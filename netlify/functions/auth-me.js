const { getCookie, verifyToken } = require('./_authUtil');

exports.handler = async (event) => {
  const token = getCookie(event.headers || {});
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return { statusCode: 401, body: JSON.stringify({ ok:false }) };
  }
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok:true, user:{ username: payload.sub } })
  };
};
