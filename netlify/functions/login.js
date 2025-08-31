// login.js – validates username/password against APP_USERS
function parseUsers(env) {
  const map = new Map();
  (env || "").split(";").map(s => s.trim()).filter(Boolean).forEach(pair => {
    const [u, ...rest] = pair.split(":");
    const p = rest.join(":");
    if (u && p != null) map.set(u.trim(), p);
  });
  return map;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const body = JSON.parse(event.body || '{}');
    const { username, password } = body;
    const users = parseUsers(process.env.APP_USERS);
    const expected = users.get(username);
    if (expected && expected === password) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true })
      };
    }
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Invalid credentials' })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(e) })
    };
  }
};
