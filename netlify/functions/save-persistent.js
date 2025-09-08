// Save persistent lists (Leads/Apprentices/Floaters/Todo) into Blobs store "persistent"
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return j(405, { ok:false, error:'method-not-allowed' });

    let body; try { body = JSON.parse(event.body || '{}'); } catch { return j(400, { ok:false, error:'invalid-json' }); }
    const data = body.data && typeof body.data === 'object' ? body.data : {};
    if (!Object.keys(data).length) return j(400, { ok:false, error:'missing-data' });

    const { getStore } = await import('@netlify/blobs');
    let store;
    try { store = getStore('persistent'); }
    catch {
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
      const token  = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
      if (!siteID || !token) return j(500, { ok:false, error:'blobs-not-configured' });
      store = getStore({ name:'persistent', siteID, token });
    }

    await store.set('v1', JSON.stringify({ ok:true, data }), { metadata:{ contentType:'application/json' } });
    return j(200, { ok:true, saved:Object.keys(data).length });
  } catch (e) { return j(500, { ok:false, error:String(e) }); }
};
function j(s,o){ return { statusCode:s, headers:{'Content-Type':'application/json'}, body: JSON.stringify(o) }; }
