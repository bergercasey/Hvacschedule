const { getCookie, verifyToken } = require('./_authUtil');
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode:405, body:'Method Not Allowed' };
  const token = getCookie(event.headers||{});
  if (!token || !verifyToken(token)) return { statusCode:401, body:'Unauthorized' };
  let body = {}; try{ body = JSON.parse(event.body||'{}'); }catch{}
  const { data } = body || {};
  if (!data || typeof data !== 'object') return { statusCode:400, body:'Bad Request' };
  const { getStore } = await import('@netlify/blobs');
  const store = getStore('persistent');
  await store.setJSON('persistent', data);
  return { statusCode:200, body: JSON.stringify({ ok:true }) };
};
