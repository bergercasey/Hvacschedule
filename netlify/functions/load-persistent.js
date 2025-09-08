const { getCookie, verifyToken } = require('./_authUtil');
exports.handler = async (event) => {
  const token = getCookie(event.headers||{});
  if (!token || !verifyToken(token)) return { statusCode:401, body:'Unauthorized' };
  const { getStore } = await import('@netlify/blobs');
  const store = getStore('persistent');
  const data = await store.get('persistent', { type:'json' }) || {};
  return { statusCode:200, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ok:true, data }) };
};
