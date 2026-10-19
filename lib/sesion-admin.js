// Sesión del equipo de EB.
//
// Todo lo interno (el panel, los dashboards y las acciones de /api que
// escriben o leen datos de clientes) pide estar dentro. Se entra de dos formas:
//   - Navegador: /login con la contraseña compartida ADMIN_PASSWORD. Deja una
//     cookie firmada con ADMIN_SESSION_SECRET que dura 30 días. Cambiar el
//     secreto cierra todas las sesiones abiertas.
//   - Scripts (el Claude de Xavi): cabecera `Authorization: Bearer
//     <ADMIN_API_TOKEN>`.
//
// Lo usan middleware.js (páginas y login) y las funciones de /api. La barrera
// de verdad son las funciones: el middleware solo evita que la página cargue.
// Sin las variables configuradas no entra nadie (falla cerrado).

export const COOKIE = 'eb_admin';
export const DURACION_S = 30 * 24 * 3600;

const enc = new TextEncoder();

// Vercel a veces guarda las variables con un \n al final (ver api/admin.js).
const leer = (env, k) => (typeof env[k] === 'string' ? env[k].trim() : '');

function base64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function firmar(secreto, texto) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return base64url(await crypto.subtle.sign('HMAC', key, enc.encode(texto)));
}

// Comparación en tiempo constante para no filtrar el secreto carácter a carácter.
function iguales(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function leerCookie(cabecera, nombre) {
  for (const parte of String(cabecera || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > -1 && parte.slice(0, i).trim() === nombre) return parte.slice(i + 1).trim();
  }
  return '';
}

export function loginConfigurado(env = process.env) {
  return !!(leer(env, 'ADMIN_PASSWORD') && leer(env, 'ADMIN_SESSION_SECRET'));
}

export function passwordValida(password, env = process.env) {
  return iguales(String(password || ''), leer(env, 'ADMIN_PASSWORD'));
}

export async function cookieDeSesion(env = process.env) {
  const exp = Math.floor(Date.now() / 1000) + DURACION_S;
  const firma = await firmar(leer(env, 'ADMIN_SESSION_SECRET'), `eb-admin|${exp}`);
  return `${COOKIE}=${exp}.${firma}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DURACION_S}`;
}

export const cookieBorrada = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function sesionValida(cabeceraCookie, env = process.env) {
  const secreto = leer(env, 'ADMIN_SESSION_SECRET');
  if (!secreto) return false;
  const [exp, firma] = leerCookie(cabeceraCookie, COOKIE).split('.');
  if (!/^\d+$/.test(exp || '') || Number(exp) < Date.now() / 1000) return false;
  return iguales(firma, await firmar(secreto, `eb-admin|${exp}`));
}

export function tokenValido(cabeceraAuth, env = process.env) {
  const recibido = String(cabeceraAuth || '').replace(/^Bearer\s+/i, '').trim();
  return iguales(recibido, leer(env, 'ADMIN_API_TOKEN'));
}

// Para las funciones de /api: `req` de Node, con las cabeceras en minúsculas.
export async function esEquipo(req, env = process.env) {
  const h = (req && req.headers) || {};
  return tokenValido(h.authorization, env) || sesionValida(h.cookie, env);
}

export function noAutorizado(res) {
  return res.status(401).json({ error: 'Hay que iniciar sesión en /login' });
}
