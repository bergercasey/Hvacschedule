// netlify/functions/blob-diag.js
exports.handler = async () => {
  try {
    const { getStore } = await import('@netlify/blobs');
    const weeks = getStore('weeks');
    const persistent = getStore('persistent');
    let weeksList = [], persList = [];
    try { weeksList = await weeks.list(); } catch {}
    try { persList = await persistent.list(); } catch {}
    const testKey = '__diag_test__';
    await weeks.setJSON(testKey, { when: Date.now(), env: process.env.CONTEXT || 'unknown' });
    const testRead = await weeks.get(testKey, { type: 'json' });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        context: process.env.CONTEXT || 'unknown',
        weeksKeysCount: Array.isArray(weeksList) ? weeksList.length : -1,
        persistentKeysCount: Array.isArray(persList) ? persList.length : -1,
        testWriteRead: testRead
      })
    };
  } catch (e) {
    return { statusCode: 200, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ok:false, error: String(e) }) };
  }
};
