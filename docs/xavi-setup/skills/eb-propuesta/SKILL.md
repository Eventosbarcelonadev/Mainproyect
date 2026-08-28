---
name: eb-propuesta
description: >-
  Crea una propuesta REAL de Eventos Barcelona dentro del sistema que ya existe: queda guardada en
  la base, con su URL propia en propuestas.eventosbarcelona.com, lista para que Xavi la revise y la
  apruebe desde /admin. Úsala cuando Xavi diga "hazme la propuesta para X", "prepara el presupuesto
  de este lead", "monta la propuesta de la agencia Y", "responde a esta petición con una propuesta",
  o cuando pase un email o un formulario con una petición de presupuesto. La deja SIEMPRE en estado
  "revisión", nunca aprobada. Para un deck temático suelto sin lead detrás, usa `eb-presentacion`.
---

# Propuesta automática en el sistema real

Esto no genera un archivo suelto. Genera una propuesta **dentro del sistema de EB**, igual que si
Xavi la hubiera montado a mano en el builder de `/admin`: con su URL, su PDF cuando se apruebe, y
enganchada al contacto y la oportunidad de GoHighLevel.

## La regla que no se rompe

**Todo se guarda en `status: "revision"`. Nunca `"approved"`.**

Aprobar dispara dos cosas irreversibles de cara al cliente: escribe la URL validada en el campo
`URL Propuesta Validada` de la oportunidad en GHL, y da la propuesta por buena. Eso lo hace Xavi,
con un clic, después de mirar los precios. Es el mismo criterio que con el correo: Claude prepara
el borrador, la persona envía.

El guardarraíl bloquea cualquier intento de guardar como aprobada. No es una sugerencia.

## Paso 1 · Reunir el contexto del lead

Cuanta más de estas fuentes cruces, mejor sale. Buscá en este orden:

1. **El lead en el CRM** (`ghl-lectura`): contacto, oportunidad, etapa, notas, conversaciones.
   Ahí suele estar el brief tal cual lo escribió el cliente.
2. **El correo** (`gmail`): el hilo con la petición. Detalles que no llegan al CRM.
3. **Propuestas anteriores a ese cliente**: `list-proposals?q=<empresa>`. Si ya le mandamos algo,
   mirá qué shows llevaba, qué margen y en qué quedó. Repetir lo que ya rechazó es el peor error.
4. **Su web** (WebFetch): sector, tono, qué celebran.

Si falta el brief mínimo (ocasión, fecha, número de invitados, espacio, presupuesto), preguntá
**todo junto en una tanda** antes de montar nada.

## Paso 2 · Elegir los shows del catálogo real

```bash
curl -s -H "Authorization: Bearer $EB_CATALOG_TOKEN" \
  https://propuestas.eventosbarcelona.com/api/gpt/catalogo

curl -s -H "Authorization: Bearer $EB_CATALOG_TOKEN" \
  "https://propuestas.eventosbarcelona.com/api/gpt/show?ids=ID1,ID2,ID3"
```

El segundo devuelve lo que hace falta para montar la propuesta: `base_price`, `price_note`,
`image_url`, `video_url` y la biografía del artista.

Entre 3 y 6 shows, agrupados en momentos (recepción, momento wow, cierre). Cada uno justificado
en una línea. Si el concepto necesita algo que no está en catálogo, no lo metas como show:
mencionalo en el texto del concepto como producción a medida.

## Paso 3 · Los precios

`currentPrice` arranca **igual que `base_price` del catálogo**. El margen lo pone Xavi con el campo
`global_margin` desde `/admin`, que es un solo control y lo aplica a todo.

**Nunca inventes un precio.** Si un show no tiene `base_price` en el catálogo, ponelo en `0` y
avisá a Xavi en el resumen final de que ese hay que completarlo a mano.

## Paso 4 · Guardar

```bash
curl -s -X POST https://propuestas.eventosbarcelona.com/api/save-proposal \
  -H "Content-Type: application/json" \
  -d @propuesta.json
```

Estructura de `propuesta.json`:

```json
{
  "status": "revision",
  "lang": "es",
  "category": "shows",
  "client":  { "name": "", "company": "", "email": "", "phone": "" },
  "event":   { "name": "", "type": "", "date": "AAAA-MM-DD", "guests": 0, "location": "" },
  "concept": { "title": "", "text": "", "titleEn": null, "textEn": null },
  "heroSub": "",
  "heroImageUrl": null,
  "globalMargin": 0,
  "hideSummary": false,
  "conditions": null,
  "ghlContactId": null,
  "ghlOpportunityId": null,
  "shows": [
    {
      "id": "id-exacto-del-catalogo",
      "name": "Nombre del show",
      "description": "Qué es, duración, qué incluye y qué no",
      "currentPrice": 1600,
      "base_price": 1600,
      "priceNote": "4 bailarinas",
      "contextLabel": "ACUÁTICO",
      "extras": []
    }
  ]
}
```

Notas de campos:

- `category` fija el color del tema: `shows`, `danza`, `musica`, `circo`, `wow`.
- `contextLabel` es la etiqueta corta que sale sobre la foto. En mayúsculas, una o dos palabras.
- `ghlContactId` y `ghlOpportunityId`: **ponelos siempre que existan**. Es lo que engancha la
  propuesta al CRM. Salen de la oportunidad que buscaste en el paso 1.
- `conditions`: dejalo en `null` salvo que Xavi pida condiciones distintas de las estándar.
- Si el cliente es internacional, rellená también `titleEn`, `textEn` y los `nameEn` /
  `descriptionEn` / `priceNoteEn` de cada show.

La respuesta trae `id` y `url`. La dirección para abrirla es:
`https://propuestas.eventosbarcelona.com/propuesta.html?id=<id>`

## Paso 5 · Cerrar

Decile a Xavi, en cuatro líneas:

1. El enlace de la propuesta.
2. Los shows elegidos y por qué ese conjunto.
3. **Qué le falta**: precios en cero, margen por poner, datos que asumiste.
4. Que la apruebe desde `/admin` cuando esté conforme, y que ahí es cuando se genera el PDF y se
   escribe la URL en la oportunidad de GHL.

Si Xavi pide cambios, se edita la misma propuesta mandando el mismo JSON con el campo `id` añadido.
No crees una propuesta nueva cada vez que corrige algo.

## Lo que está bloqueado, y por qué

| Acción | Motivo |
|---|---|
| Guardar con `status: "approved"` | Escribe en la oportunidad de GHL y da la propuesta por válida. Es de Xavi |
| `validate-proposal` | Mismo motivo |
| `delete-proposal` | Irreversible |
| `generate-proposal-pdf` | Se dispara solo al aprobar. No hay que llamarlo a mano |

Si Xavi insiste en que apruebes una, la respuesta es: "no puedo, y es a propósito. Abrila en /admin
y le das a aprobar, son dos clics".
