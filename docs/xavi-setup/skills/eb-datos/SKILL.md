---
name: eb-datos
description: >-
  Consulta toda la base de datos de Eventos Barcelona (artistas, shows, propuestas, referencias)
  y todo el CRM de GoHighLevel (contactos, oportunidades, conversaciones, agenda, campos, pagos).
  Úsala cuando Xavi pregunte cosas como "cuántos artistas tenemos de danza", "qué propuestas hay
  abiertas", "dame el teléfono de este artista", "qué presupuestos enviamos este mes", "qué me
  contestó esta agencia", "quién no tiene fotos", "cuántos leads entraron". SOLO LECTURA:
  los cambios los hace Xavi a mano en /admin o en GoHighLevel.
---

# Consultar los datos del negocio

Xavi tiene dos bases: la del proyecto (artistas, shows, propuestas) y el CRM (GoHighLevel).
Esta skill las cruza. Todo es de lectura.

## Regla número uno

**No escribas nunca.** Solo peticiones GET, y solo las acciones `list-*`, `get-*` y `shows-pending`.
Las acciones de escritura (`add-*`, `edit-*`, `delete-*`, `set-*`, `save-*`, `upload-*`) están
bloqueadas por el guardarraíl y con razón: corren con permisos totales sobre la base de datos.

Si Xavi pide un cambio, la respuesta es: "esto lo cambiás vos en /admin, te digo exactamente dónde".
Y le decís el sitio: `https://propuestas.eventosbarcelona.com/admin.html`

## Base del proyecto

Todo cuelga de `https://propuestas.eventosbarcelona.com/api/admin?action=...`

| Acción | Qué devuelve | Parámetros |
|---|---|---|
| `list-artistas` | Ficha completa: nombre, nombre artístico, compañía, email, teléfono, ciudad, disciplinas, formato, bio, vídeos, fotos | `q`, `disciplina`, `tipo`, `archived`, `limit` (máx 200), `offset` |
| `get-artista-detail` | Un artista con todo su detalle y sus shows vinculados | `id` |
| `list-proposals` | Propuestas: cliente, empresa, email, teléfono, evento, fecha, invitados, categoría, concepto, shows, margen, ids de GHL, estado, PDF | `status`, `q`, `limit`, `offset` |
| `shows-pending` | Shows pendientes de revisión | |
| `list-referencias` | Fuentes del sector que mantiene Xavi | |
| `geo-metrics` | Métricas de SEO y GEO | |

**Ojo con la paginación:** por defecto devuelve 50 registros. La respuesta trae `total`. Si `total`
es mayor que lo devuelto, hay que ir pidiendo con `offset`. Si Xavi pregunta "cuántos artistas
tenemos", la respuesta correcta sale del campo `total`, no de contar las filas de la primera página.

```bash
curl -s "https://propuestas.eventosbarcelona.com/api/admin?action=list-artistas&limit=200&offset=0"
curl -s "https://propuestas.eventosbarcelona.com/api/admin?action=list-proposals&status=approved&limit=200"
```

Para el catálogo activo, mejor `/api/gpt/catalogo` (más limpio y trae solo lo publicable).

## CRM (GoHighLevel)

Con el conector `ghl-lectura`. Disponible en lectura: contactos, tareas, oportunidades, pipelines,
conversaciones y mensajes, agenda y notas de citas, campos personalizados, datos de la cuenta,
pedidos y transacciones, entradas de blog y publicaciones en redes.

Antes de buscar contactos o oportunidades por un campo raro, mirá `locations_get-custom-fields`:
EB tiene bastantes campos propios (`partner_*`, tipo de contacto, validación de propuesta) y sin
verlos primero se buscan cosas que no existen.

`contact_type` puede ser: Cliente, Artista, Proveedor, Freelance, Venue, Partner.

## Cruzar las dos

Es donde está el valor. Las propuestas traen `ghl_contact_id` y `ghl_opportunity_id`, así que se
puede ir de una propuesta a su ficha de CRM y al revés.

Preguntas típicas que solo se contestan cruzando:

- "¿Qué propuestas mandamos a esta agencia y en qué quedaron?" → `list-proposals?q=` y después la
  oportunidad en GHL.
- "¿Qué artistas no hemos usado nunca en una propuesta?" → artistas contra los `shows` de propuestas.
- "¿Qué clientes de hace un año no han vuelto?" → oportunidades ganadas en GHL por fecha.
- "¿Qué artistas están sin foto o sin vídeo?" → `list-artistas` filtrando por campos vacíos.

## Cómo contestar

- Números redondos y en una línea. Xavi no quiere una tabla de 200 filas, quiere el dato.
- Si la respuesta es una lista larga, dá el total y los 10 más relevantes, y ofrecé el resto.
- Si vas a volcar algo a una hoja, preguntá antes.
- Los datos de artistas son personales (email y teléfono). No los pegues en documentos de cliente
  ni en presentaciones. Sirven para que Xavi los llame, no para publicarlos.
