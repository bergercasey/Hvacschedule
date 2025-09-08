const { getCookie, verifyToken } = require('./_authUtil');
exports.handler = async (event) => {
  const token = getCookie(event.headers||{});
  if (!token || !verifyToken(token)) return { statusCode:401, body:'Unauthorized' };
  const weekKey = (event.queryStringParameters && event.queryStringParameters.weekKey) || '';
  if (!weekKey) return { statusCode:400, body:'Missing weekKey' };
  const { getStore } = await import('@netlify/blobs');
  const store = getStore('weeks');
  const data = await store.get(weekKey, { type:'json' }) || {};
  return { statusCode:200, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ok:true, data }) };
};
