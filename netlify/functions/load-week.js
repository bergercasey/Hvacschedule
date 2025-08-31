// Load week data from Netlify Blobs (store: "weeks")
exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const weekKey = qs.weekKey || qs.isoWeek || qs.weekStart;
    if (!weekKey) return j(400, { ok:false, error:'missing-weekKey' });

    const { getStore } = await import('@netlify/blobs');
    let store;
    try {
      store = getStore('weeks');
    } catch {
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
      const token  = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
      if (!siteID || !token) return j(500, { ok:false, error:'blobs-not-configured', need:['NETLIFY_SITE_ID','NETLIFY_API_TOKEN'] });
      store = getStore({ name: 'weeks', siteID, token });
    }

    const json = await store.get(weekKey, { type: 'json' });
    const data = (json && json.data && typeof json.data === 'object') ? json.data : (json || {});
    return j(200, { ok:true, data });
  } catch (err) {
    console.error('load-week error', err);
    return j(500, { ok:false, error:String(err) });
  }
};
function j(status, obj){ return { statusCode: status, headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(obj) }; }
