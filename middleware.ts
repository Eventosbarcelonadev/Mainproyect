// Login del equipo de EB delante de todo lo que no es para clientes.
//
// En este dominio conviven la propuesta que se manda al lead y las
// herramientas internas: el panel, los dashboards, los documentos y las
// propuestas de la agencia. Antes todo era público y bastaba con quitar la ruta
// de la URL de una propuesta para llegar al resto. Ahora solo es público lo que
// ve un cliente o un artista (PUBLICAS); el resto pide sesión.
//
// /api no pasa por aquí: cada función comprueba la sesión ella misma
// (lib/sesion-admin.js), porque es ahí donde se leen y escriben los datos.
//
// Es .ts porque el proyecto no declara "type": "module" y Vercel solo garantiza
// el ESM del middleware en ese caso o con TypeScript.

import { next } from '@vercel/functions';
import {
  cookieBorrada,
  cookieDeSesion,
  credencialesValidas,
  loginConfigurado,
  sesionValida,
} from './lib/sesion-admin.js';

export const config = {
  // Todo menos /api y las imágenes, vídeos y fuentes: no hace falta
  // protegerlos y así no cuesta una invocación cada uno.
  matcher: ['/((?!api/|.*\\.(?:png|jpe?g|webp|gif|svg|ico|woff2?|ttf|mp4|mov|webm)$).*)'],
};

// Lo que ve un cliente o un artista. Nada más.
const PUBLICAS = new Set([
  '/formulario-inteligente.html',
  '/formulario-inteligente-en.html',
  '/formulario-artistas.html',
  '/formulario-artistas-en.html',
  '/formulario-cliente',
  '/formulario-cliente/',
  '/formulario-artista',
  '/formulario-artista/',
  '/selector-formulario.html',
  '/catalogo',
  '/catalogo/',
  '/propuesta-catalogo.html',
  '/eb-form.js', // lo carga la web de WordPress para abrir los formularios
  '/robots.txt',
]);

const DESTINO_POR_DEFECTO = '/admin.html';

// Un solo dominio para el equipo y para los clientes. La sesión del admin solo vale
// en el dominio donde se inicia, y con ella api/track-proposal.js sabe que una visita
// a una propuesta es de Xavi y no del cliente. Los enlaces que reciben los clientes
// van por propuestas.eventosbarcelona.com, así que el alias de producción de Vercel
// redirige ahí. Las previews de los PR (eventos-barcelona-git-…) no se tocan, y los
// POST tampoco (el formulario del login perdería los datos).
const DOMINIO = 'propuestas.eventosbarcelona.com';
const ALIAS_VERCEL = 'eventos-barcelona.vercel.app';

function esPublica(url: URL): boolean {
  const p = url.pathname;
  if (p === '/propuesta.html' || p.startsWith('/propuesta/')) {
    // La misma página es el editor de Xavi: ?admin=1 (editar), ?mode=builder
    // (nueva) y ?mode=auto (el url_generador_propuesta de GHL). Al lead solo
    // le llega la vista cliente, sin esos parámetros. Se leen igual que en
    // propuesta.html para que no haya forma de que la página entre en modo
    // editor sin pasar por aquí.
    const q = url.searchParams;
    return q.get('admin') !== '1' && !['builder', 'auto'].includes(q.get('mode') || '');
  }
  return PUBLICAS.has(p);
}

// Solo rutas de este mismo sitio: nada de //otro-dominio ni de volver a /login.
function destinoSeguro(valor: unknown): string {
  const s = typeof valor === 'string' ? valor : '';
  if (!s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\') || s.startsWith('/login')) {
    return DESTINO_POR_DEFECTO;
  }
  return s;
}

function redirigir(destino: string, base: URL, extra: Record<string, string> = {}): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: new URL(destino, base).toString(), 'Cache-Control': 'no-store', ...extra },
  });
}

export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (url.hostname === ALIAS_VERCEL && (request.method === 'GET' || request.method === 'HEAD')) {
    return new Response(null, {
      status: 307,
      headers: { Location: `https://${DOMINIO}${url.pathname}${url.search}`, 'Cache-Control': 'no-store' },
    });
  }

  if (url.pathname === '/login' || url.pathname === '/login/') return login(request, url);
  if (url.pathname === '/logout') return redirigir('/login', url, { 'Set-Cookie': cookieBorrada });

  if (esPublica(url) || (await sesionValida(request.headers.get('cookie')))) return next();

  // El #fragmento no llega al servidor, pero el navegador lo conserva en la
  // redirección y la página de login lo vuelve a pegar al destino.
  return redirigir(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, url);
}

async function login(request: Request, url: URL): Promise<Response> {
  if (request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const destino = destinoSeguro(form?.get('next'));
    const email = String(form?.get('email') || '');
    if (!loginConfigurado()) return paginaLogin(destino, ERROR_SIN_CONFIGURAR, 503, email);
    if (credencialesValidas(email, form?.get('password'))) {
      return redirigir(destino, url, { 'Set-Cookie': await cookieDeSesion() });
    }
    // Frena los intentos a ciegas.
    await new Promise((r) => setTimeout(r, 1000));
    return paginaLogin(destino, 'Correo o contraseña incorrectos.', 401, email);
  }

  const destino = destinoSeguro(url.searchParams.get('next'));
  if (await sesionValida(request.headers.get('cookie'))) return redirigir(destino, url);
  return paginaLogin(destino, loginConfigurado() ? '' : ERROR_SIN_CONFIGURAR, loginConfigurado() ? 200 : 503);
}

const ERROR_SIN_CONFIGURAR =
  'El acceso todavía no está configurado (faltan ADMIN_EMAIL, ADMIN_PASSWORD y ADMIN_SESSION_SECRET en Vercel).';

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function paginaLogin(destino: string, error: string, status: number, email = ''): Response {
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Acceso — Eventos Barcelona</title>
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px;
      font-family: 'Inter', system-ui, sans-serif; background: #161413; color: #f7f7f5;
    }
    main { width: 100%; max-width: 360px; }
    img { width: 64px; height: 64px; object-fit: contain; display: block; margin: 0 auto 20px; }
    h1 { font-family: 'DM Serif Display', serif; font-weight: 400; font-size: 28px; text-align: center; margin: 0 0 6px; }
    p.sub { text-align: center; color: rgba(247,247,245,.6); font-size: 14px; margin: 0 0 28px; }
    label { display: block; font-size: 13px; color: rgba(247,247,245,.75); margin-bottom: 8px; }
    label + input { margin-bottom: 16px; }
    input[type=email], input[type=password] {
      width: 100%; padding: 13px 14px; font: inherit; font-size: 16px; color: #111;
      background: #f7f7f5; border: 2px solid transparent; border-radius: 10px; outline: none;
    }
    input[type=email]:focus, input[type=password]:focus { border-color: #e87461; }
    button {
      width: 100%; margin-top: 4px; padding: 13px; font: inherit; font-weight: 600; font-size: 15px;
      color: #fff; background: #e87461; border: 0; border-radius: 10px; cursor: pointer;
    }
    button:hover { filter: brightness(1.05); }
    .error {
      background: rgba(232,116,97,.14); border: 1px solid rgba(232,116,97,.5); color: #ffd9d2;
      padding: 10px 12px; border-radius: 10px; font-size: 14px; margin-bottom: 18px;
    }
  </style>
</head>
<body>
  <main>
    <img src="/EB-eventos-barcelona-logo-3d.webp" alt="Eventos Barcelona">
    <h1>Área del equipo</h1>
    <p class="sub">Entra con tu cuenta de Eventos Barcelona.</p>
    ${error ? `<div class="error" role="alert">${escapar(error)}</div>` : ''}
    <form method="post" action="/login">
      <input type="hidden" name="next" value="${escapar(destino)}">
      <label for="email">Correo</label>
      <input type="email" id="email" name="email" value="${escapar(email)}" autocomplete="username" required${email ? '' : ' autofocus'}>
      <label for="password">Contraseña</label>
      <input type="password" id="password" name="password" autocomplete="current-password" required${email ? ' autofocus' : ''}>
      <button type="submit">Entrar</button>
    </form>
  </main>
  <script>
    // Conserva la pestaña del panel (#propuestas, #shows…) al volver tras el login.
    document.querySelector('form').addEventListener('submit', function (e) {
      var n = e.target.elements.next;
      if (location.hash && n.value.indexOf('#') === -1) n.value += location.hash;
    });
  </script>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'X-Robots-Tag': 'noindex',
    },
  });
}
