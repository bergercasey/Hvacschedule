// Load persistent lists from Blobs store "persistent"
exports.handler = async () => {
  try {
    const { getStore } = await import('@netlify/blobs');
    let store;
    try { store = getStore('persistent'); }
    catch {
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
      const token  = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
      if (!siteID || !token) return j(200, { ok:true, data:{} }); // no config yet, just return empty
      store = getStore({ name:'persistent', siteID, token });
    }
    const json = await store.get('v1', { type:'json' });
    const data = (json && json.data && typeof json.data === 'object') ? json.data : (json || {});
    return j(200, { ok:true, data });
  } catch (e) { return j(500, { ok:false, error:String(e) }); }
};
function j(s,o){ return { statusCode:s, headers:{'Content-Type':'application/json'}, body: JSON.stringify(o) }; }
