// Simple Basic Auth for Netlify Functions.
// Env: APP_USERS="user1:pass1; user2:pass2"
function parseUsers(env) {
  const map = new Map();
  (env || "").split(";").map(s => s.trim()).filter(Boolean).forEach(pair => {
    const [u, ...rest] = pair.split(":");
    const p = rest.join(":"); // allow ":" in password
    if (u && p != null) map.set(u.trim(), p);
  });
  return map;
}

function unauthorized(message = "Unauthorized") {
  return {
    statusCode: 401,
    headers: {
      "Content-Type": "application/json",
      // So browsers show a login dialog if you hit the function URL directly
      "WWW-Authenticate": 'Basic realm="HVAC Schedule", charset="UTF-8"',
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify({ ok: false, error: message })
  };
}

function checkAuth(event) {
  const users = parseUsers(process.env.APP_USERS);
  if (!users.size) return unauthorized("APP_USERS not configured");

  const auth = event.headers?.authorization || event.headers?.Authorization;
  if (!auth?.startsWith("Basic ")) return unauthorized();

  const b64 = auth.slice(6).trim();
  let userpass;
  try { userpass = Buffer.from(b64, "base64").toString("utf8"); } catch { /* noop */ }
  if (!userpass || !userpass.includes(":")) return unauthorized();

  const [user, pass] = userpass.split(":");
  const expected = users.get(user);
  if (!expected || expected !== pass) return unauthorized();

  // OK
  return null;
}

module.exports = { checkAuth, unauthorized };
