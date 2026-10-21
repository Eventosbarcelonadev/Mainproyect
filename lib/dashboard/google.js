// Search Console y GA4 sin la librería googleapis, que pesa demasiado para una función de Vercel:
// token OAuth de la cuenta de servicio firmado con node:crypto y llamadas REST.
import crypto from 'node:crypto';

const b64url = s => Buffer.from(s).toString('base64url');
const espera = ms => new Promise(res => setTimeout(res, ms));

export async function tokenGoogle(sa, scopes) {
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: scopes.join(' '), aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600 }));
  const firma = crypto.sign('RSA-SHA256', Buffer.from(`${cabecera}.${claims}`), sa.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cabecera}.${claims}.${firma}` }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Google token ${r.status}: ${j.error_description || j.error}`);
  return j.access_token;
}

export function clienteGoogle(token) {
  async function post(url, body) {
    for (let intento = 0; ; intento++) {
      const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return j;
      // Cuota o error puntual de Google: reintenta con espera creciente
      if ((r.status === 429 || r.status >= 500) && intento < 3) { await espera(1500 * (intento + 1)); continue; }
      throw new Error(`${new URL(url).host} ${r.status}: ${(j.error && j.error.message) || ''}`.slice(0, 300));
    }
  }
  return {
    // Search Analytics con paginación de 25.000 filas
    async gsc(site, body) {
      const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
      const filas = [];
      for (let startRow = 0; ; startRow += 25000) {
        const j = await post(url, { ...body, rowLimit: 25000, startRow });
        const lote = j.rows || []; filas.push(...lote);
        if (lote.length < 25000) return filas;
      }
    },
    ga4(property, body) {
      return post(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, body);
    },
  };
}
