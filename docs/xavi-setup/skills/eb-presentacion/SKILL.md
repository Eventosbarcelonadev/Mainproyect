---
name: eb-presentacion
description: >-
  Crea una presentación temática y personalizada para un cliente de Eventos Barcelona
  (gala dinner, kick-off, congreso, aniversario, lanzamiento de producto, cena de empresa,
  team building, inauguración). Úsala cuando Xavi diga "hazme una presentación para X",
  "necesito una propuesta visual para la agencia Y", "prepara un deck de circo para Z",
  "monta algo para la cena de gala de W", o cuando pase un brief de cliente y pida material
  para enseñar. Genera un deck HTML con la identidad visual de EB, usando SOLO shows del
  catálogo real e imágenes del banco propio. Nunca publica nada en la web.
---

# Presentación temática para cliente

Convierte un brief en un deck que Xavi pueda enviar o proyectar el mismo día.

## Regla número uno

Todo show que aparezca en la presentación tiene que existir en el catálogo real, con su `id`.
Si el concepto necesita algo que no está, se etiqueta como **"producción a medida"** y se describe
qué habría que montar. Nunca se inventa un show ni se disfraza uno existente de otra cosa.
Un deck brillante con shows que EB no puede producir no sirve de nada y quema a Xavi delante del cliente.

## Paso 1 · Cerrar el brief

Necesitás estas ocho cosas. Si Xavi no las dio, preguntá **las que falten en una sola tanda**,
nunca de a una:

1. Cliente y sector (y si es agencia intermediaria, quién es el cliente final).
2. Ocasión y fecha.
3. Número de asistentes.
4. Espacio (hotel, masía, sala, exterior, barco) y si tiene altura para aéreos.
5. Presupuesto orientativo, o al menos la horquilla.
6. Tono: elegante, gamberro, sorprendente, emotivo, corporativo puro.
7. Idioma del deck: ES, EN o los dos.
8. Restricciones conocidas: sin fuego, sin ruido después de las 23h, sin desnudos, timing cerrado.

Si Xavi dice "tira con lo que hay", asumí valores razonables, escribilos al principio del deck
en la sección "El brief como lo entendemos" y seguí. Que se vean las asunciones es mejor que frenar.

## Paso 2 · Catálogo real

```bash
curl -s -H "Authorization: Bearer $EB_CATALOG_TOKEN" \
  https://propuestas.eventosbarcelona.com/api/gpt/catalogo
```

Devuelve el catálogo activo (id, nombre, categoría, descripción) y la lista de fuentes de referencia
del sector. Para el detalle de los shows que ya elegiste (precio, vídeo, biografía del artista):

```bash
curl -s -H "Authorization: Bearer $EB_CATALOG_TOKEN" \
  "https://propuestas.eventosbarcelona.com/api/gpt/show?ids=ID1,ID2,ID3"
```

Sin esta llamada no empieces a escribir. Es la diferencia entre una propuesta real y una inventada.

## Paso 3 · Personalización (esto es lo que la hace ganar)

Buscá **tres anclas concretas** del cliente y usalas en el deck:

- Su web (WebFetch): sector, tono de marca, qué celebran, colores, si tienen un aniversario redondo.
- Su historial en el CRM (`ghl-lectura`): si ya fue cliente, qué contrataron, qué presupuesto movieron,
  qué les gustó. Buscá por nombre de empresa y por dominio de email.
- Emails recientes (`gmail`): el hilo del brief suele traer detalles que no están en ningún otro sitio.

Una presentación personalizada de verdad menciona su marca, su ocasión y su espacio en la primera
pantalla. Una genérica se nota en tres segundos.

## Paso 4 · Construir el concepto

No listes shows sueltos. Armá **un hilo narrativo** y colgá de él 5 a 8 shows agrupados en 2 o 3 momentos:

- **Recepción / cóctel**: algo ambiental, que no obligue a mirar.
- **Momento wow**: el pico, normalmente durante o después de la cena.
- **Cierre / fiesta**: lo que deja a la gente de pie.

Cada show se justifica en una línea: por qué ese y no otro, para ese cliente y ese espacio.

## Paso 5 · Imágenes

- La vía principal es automática: `/api/gpt/show?ids=...` devuelve `image_url` y `video_url` de cada
  show, que son URLs públicas del banco de EB. No hacen falta credenciales.
- Para fotos de eventos ya producidos (reportajes), tirá de `imagenes/` (carpeta local sincronizada
  con la carpeta de Drive "EB · Banco de imágenes").
- Miralas antes de usarlas. Elegí la que mejor cuenta el show y escribí un alt text real.
- Foto real del show o del artista. Si no hay foto del show exacto, usá una del mismo artista o
  del mismo formato, y no digas que es de ese show.
- **Nunca** imágenes de otras agencias, ni banco de imágenes genérico, ni imágenes generadas por IA
  para hacer pasar por producción propia.
- Formato de card, siempre: imagen a sangre completa, capa oscura encima, título superpuesto abajo,
  bordes redondeados. Nunca imagen arriba con el título suelto debajo.

## Paso 6 · Montar el deck

Archivo HTML autocontenido en `trabajo/presentaciones/AAAA-MM-DD-cliente-tema/index.html`.

Identidad visual de EB (copiada de la plantilla de propuestas, `mainproyect/propuesta.html`):

```css
--accent: #E87461;   /* por defecto y tema "shows" */
--dark: #1a1a1a;  --text: #333;  --gray: #666;
--light-gray: #f9f9f9;  --border: #e5e5e5;  --white: #fff;
```

Tema según la categoría dominante del deck:

| Tema | Acento |
|---|---|
| shows / general | `#E87461` |
| danza | `#C75B7A` |
| música | `#5B8AC7` |
| circo | `#E8A461` |
| wow / inmersivo | `#8B5BC7` |

Tipografías: `DM Serif Display` para titulares, `Inter` para el resto (Google Fonts).

Estructura, entre 8 y 12 secciones:

1. Portada: nombre del cliente, ocasión, fecha, logo de EB.
2. El brief como lo entendemos (4 o 5 líneas, y aquí van las asunciones si las hubo).
3. El concepto: el hilo, en un párrafo y un titular.
4. El recorrido del evento: línea de tiempo con los momentos.
5. Los shows: una card por show, con foto, nombre, 2 líneas de descripción y duración.
6. Producción y necesidades técnicas: espacio, altura, sonido, camerinos, tiempos de montaje.
7. Opcionales y upgrades: 2 o 3 cosas que suben el evento de nivel.
8. Inversión: tabla con los conceptos. Usá el `base_price` y el `price_note` que devuelve
   `/api/gpt/show`. Si un show no tiene precio en el catálogo, dejá `[PENDIENTE]` bien visible
   para que Xavi lo complete. **Nunca estimes un precio que no esté en el catálogo.**
9. Siguientes pasos: qué hace falta para cerrar y en qué plazo.
10. Quiénes somos: 3 referencias reales de eventos producidos, con foto.

## Paso 7 · Cerrar

- Abrí el HTML en el navegador (`open`) para que Xavi lo revise.
- Si pide PDF, imprimí a PDF desde el navegador o usá la skill `pdf`.
- Si pide PPTX (algunos clientes lo exigen), usá la skill `pptx` con el mismo contenido.
- Si el cliente es internacional, generá también `index-en.html`.
- Anotá la entrada en la hoja "EB · Motor de ideas", pestaña `Briefs`.
- Decile a Xavi en una línea dónde quedó el archivo y qué le falta (normalmente: precios).

## Lo que nunca hay que hacer

- Publicar nada en eventosbarcelona.com. Este deck vive en el ordenador de Xavi y se envía por email.
- Enviar el email solo. Se deja borrador en Gmail y lo envía él.
- Usar el guion largo (—) en el copy. Regla de Xavi.
- Nombrar a otra agencia dentro del documento del cliente.
- Poner un precio que no esté en el catálogo o que no haya dado Xavi.
