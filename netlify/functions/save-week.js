// Saves week JSON into Netlify Blobs ("weeks" store)
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return j(405, { ok:false, error:'method-not-allowed' });

    let body; try { body = JSON.parse(event.body || '{}'); }
    catch { return j(400, { ok:false, error:'invalid-json' }); }

    const weekKey = body.weekKey || body.isoWeek || body.weekStart;
    if (!weekKey) return j(400, { ok:false, error:'missing-weekKey' });

    // Accept either {data:{...}} or a flattened payload
    let data = (body.data && typeof body.data === 'object') ? body.data : {};
    if (!Object.keys(data).length) {
      for (const [k, v] of Object.entries(body)) {
        if (/^(Mon|Tue|Wed|Thu|Fri):\d{2}:(job|helper|pto|helperPto)$/.test(k)) data[k] = v;
      }
    }
    if (!Object.keys(data).length) return j(400, { ok:false, error:'missing-week-data' });

    const { getStore } = await import('@netlify/blobs');
    let store;
    try {
      store = getStore('weeks');
    } catch {
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
      const token  = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN || process.env.NETLIFY_BLOBS_TOKEN;
      if (!siteID || !token) return j(500, { ok:false, error:'blobs-not-configured', need:['NETLIFY_SITE_ID','NETLIFY_API_TOKEN'] });
      store = getStore({ name:'weeks', siteID, token });
    }

    await store.set(weekKey, JSON.stringify({ ok:true, data }), {
      metadata: { contentType: 'application/json' }
    });

    return j(200, { ok:true, weekKey, saved:Object.keys(data).length });
  } catch (err) {
    return j(500, { ok:false, error:String(err) });
  }
};

function j(s, o) {
  return { statusCode:s, headers:{'Content-Type':'application/json'}, body: JSON.stringify(o) };
}
