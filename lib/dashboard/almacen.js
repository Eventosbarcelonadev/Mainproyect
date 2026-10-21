// Informes del dashboard guardados en Supabase Storage, bucket privado "informes", carpeta dashboard/:
//   AAAA-MM-DD.html  el informe tal y como se generó ese día
//   AAAA-MM-DD.json  sus datos (solo cifras agregadas)
//   indice.json      la lista, del más reciente al más antiguo
// Solo se leen desde las funciones de /api con la clave de servicio: el bucket no es público.
const BUCKET = 'informes';
const CARPETA = 'dashboard';

function conf(env) {
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
  return { url, h: { Authorization: `Bearer ${key}`, apikey: key } };
}

export async function crearBucket(env) {
  const { url, h } = conf(env);
  const r = await fetch(`${url}/storage/v1/bucket`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }) });
  if (!r.ok && !/already exists|Duplicate/i.test(await r.text())) throw new Error(`No se pudo crear el bucket ${BUCKET}: ${r.status}`);
}

export async function subir(env, nombre, cuerpo, tipo) {
  const { url, h } = conf(env);
  const r = await fetch(`${url}/storage/v1/object/${BUCKET}/${CARPETA}/${nombre}`, { method: 'POST', headers: { ...h, 'Content-Type': tipo, 'x-upsert': 'true' }, body: cuerpo });
  if (!r.ok) throw new Error(`Supabase Storage ${r.status} al subir ${nombre}: ${(await r.text()).slice(0, 200)}`);
}

// null si no existe
export async function bajar(env, nombre) {
  const { url, h } = conf(env);
  const r = await fetch(`${url}/storage/v1/object/${BUCKET}/${CARPETA}/${nombre}`, { headers: h });
  if (r.ok) return r.text();
  const t = await r.text();
  if (r.status === 404 || /not.?found|404/i.test(t)) return null;
  throw new Error(`Supabase Storage ${r.status} al leer ${nombre}: ${t.slice(0, 200)}`);
}

export async function leerIndice(env) {
  const t = await bajar(env, 'indice.json');
  return t ? JSON.parse(t) : [];
}

export async function publicarInforme(env, { fecha, html, datos, resumen }) {
  await subir(env, `${fecha}.html`, html, 'text/html; charset=utf-8');
  if (datos) await subir(env, `${fecha}.json`, JSON.stringify(datos), 'application/json');
  const indice = (await leerIndice(env)).filter(x => x.fecha !== fecha);
  indice.push({ fecha, ...resumen });
  indice.sort((a, b) => b.fecha.localeCompare(a.fecha));
  await subir(env, 'indice.json', JSON.stringify(indice, null, 1), 'application/json');
  return indice;
}
