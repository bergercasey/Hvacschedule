// netlify/functions/weeks-dump.js
// GET /.netlify/functions/weeks-dump?key=YYYY-W##
exports.handler = async (event) => {
  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore('weeks');
    const key = event.queryStringParameters && event.queryStringParameters.key;
    if (key) {
      const data = await store.get(key, { type: 'json' }) || {};
      return { statusCode:200, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ok:true, key, data }) };
    }
    let keys = [];
    try { keys = await store.list(); } catch {}
    return { statusCode:200, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ok:true, context: process.env.CONTEXT, keys }) };
  } catch (e) {
    return { statusCode: 200, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ok:false, error: String(e) }) };
  }
};
