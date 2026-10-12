// FundFlow relay: forwards requests to ProPublica's Nonprofit Explorer API
// and adds the CORS header browsers need. Only ProPublica API paths are allowed.
export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    if (!url.pathname.startsWith('/nonprofits/api/v2/')) {
      return new Response('Not found', { status: 404, headers: cors });
    }
    const upstream = 'https://projects.propublica.org' + url.pathname + url.search;
    const res = await fetch(upstream, { cf: { cacheTtl: 86400, cacheEverything: true } });
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    headers.set('Cache-Control', 'public, max-age=86400');
    return new Response(res.body, { status: res.status, headers });
  },
};
