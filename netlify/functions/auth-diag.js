// /netlify/functions/auth-diag.js
const { readSession } = require('./_authUtil');

exports.handler = async (event) => {
  const sess = readSession(event);
  let users = [];
  try { users = JSON.parse(process.env.AUTH_USERS_JSON || '[]'); } catch {}
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      hasCookie: !!sess,
      sessionUser: sess && sess.username || null,
      authUsersCount: Array.isArray(users) ? users.length : 0,
      // shows first username only, for sanity check
      firstUser: Array.isArray(users) && users[0] ? users[0].username : null
    })
  };
};
