const { checkAuth } = require('./_auth');

exports.handler = async (event) => {
  const authErr = checkAuth(event);
  if (authErr) return authErr;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true })
  };
};
