/**
 * OAuth2 callback endpoint
 * Captures Google OAuth code, exchanges for refresh token, and displays it.
 */
export default async function handler(req, res) {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send('Error: no se recibió código de autorización');
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}/api/oauth-callback`
          : 'https://eventos-barcelona.vercel.app/api/oauth-callback',
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenRes.json();

    if (tokens.error) {
      return res.status(400).send(`Error: ${tokens.error} — ${tokens.error_description}`);
    }

    // Show the refresh token (one-time display)
    return res.status(200).send(`
      <html>
        <body style="font-family: sans-serif; max-width: 600px; margin: 50px auto; text-align: center;">
          <h1>Autorización completada!</h1>
          <p>Gracias Xavi. Ya puedes cerrar esta ventana.</p>
          <p style="color: #666; font-size: 12px;">Código procesado correctamente.</p>
          <script>
            // Send token to console for dev pickup
            fetch('/api/oauth-token-store', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token: '${tokens.refresh_token || ''}' })
            }).catch(() => {});
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    return res.status(500).send(`Error: ${err.message}`);
  }
}
