// /api/geo-metrics.js
// Vercel serverless endpoint que consume el MCP/REST de eventosbarcelona.com (WordPress)
// con auth server-side y devuelve métricas GEO/AEO/SEO normalizadas para el dashboard.
//
// Sin secretos en el browser: WP_USER + WP_PASS viven solo en Vercel.
// Cache HTTP 600s para no ahogar el sitio si el dashboard se abre muchas veces.

const WP_BASE = 'https://www.eventosbarcelona.com/wp-json';

async function wp(method, path, body) {
  const user = process.env.WP_USER;
  const pass = process.env.WP_PASS;
  if (!user || !pass) {
    throw new Error('WP_USER / WP_PASS no configurados en Vercel env vars');
  }
  const auth = Buffer.from(`${user}:${pass}`).toString('base64');
  const opts = {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(WP_BASE + path, opts);
  if (!res.ok) {
    return { _error: `HTTP ${res.status}`, _path: path };
  }
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');

  try {
    const [
      visibility,
      audit,
      llmsStatus,
      robotsStatus,
      siteInfo,
      botTraffic,
      schemaStatus,
      recommendations,
      topPages,
    ] = await Promise.all([
      wp('POST', '/llm-analytics/v1/visibility-score/calculate', {}),
      wp('POST', '/llm-analytics/v1/agent-audit/run', {}),
      wp('GET', '/wp-abilities/v1/abilities/llmagnet/get-llms-txt-status/run'),
      wp('GET', '/wp-abilities/v1/abilities/llmagnet/get-robots-txt-status/run'),
      wp('GET', '/wp-abilities/v1/abilities/llmagnet/get-site-info/run'),
      wp('GET', '/wp-abilities/v1/abilities/llmagnet/get-bot-traffic/run'),
      wp('GET', '/wp-abilities/v1/abilities/llmagnet/get-schema-status/run'),
      wp('GET', '/wp-abilities/v1/abilities/llmagnet/get-recommendations/run'),
      wp('GET', '/wp-abilities/v1/abilities/llmagnet/get-top-pages/run'),
    ]);

    const payload = {
      generated_at: new Date().toISOString(),
      visibility: visibility?.score_data ?? visibility,
      audit: {
        score: audit?.score,
        agent_ready: audit?.agent_ready,
        counts: audit?.counts,
        flag_checks: audit?.flag_checks,
        domains: audit?.domains,
      },
      llms_txt: llmsStatus?.data ?? llmsStatus,
      robots: robotsStatus?.data ?? robotsStatus,
      site: siteInfo?.data ?? siteInfo,
      bots: botTraffic?.data ?? botTraffic,
      schema: schemaStatus?.data ?? schemaStatus,
      recommendations: recommendations?.data ?? recommendations,
      top_pages: topPages?.data ?? topPages,
    };

    res.status(200).json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
}
