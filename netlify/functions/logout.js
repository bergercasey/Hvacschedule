const { makeCookie } = require('./_authUtil');
exports.handler = async () => {
  // Expire cookie immediately
  const gone = makeCookie('x', { remember:false }).replace(/Max-Age=\d+/, 'Max-Age=0');
  return { statusCode:200, headers:{ 'Set-Cookie': gone, 'Content-Type':'application/json' }, body: JSON.stringify({ ok:true }) };
};
