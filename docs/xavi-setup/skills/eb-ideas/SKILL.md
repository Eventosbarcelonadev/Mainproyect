---
name: eb-ideas
description: >-
  Convierte un brief de cliente en conceptos de evento accionables para Eventos Barcelona,
  usando el catálogo real y, si hace falta, mirando las webs de referencia del sector.
  Úsala cuando Xavi diga "dame ideas para...", "qué le propongo a este cliente", "necesito
  conceptos para una cena de gala de 200 personas", "se me han acabado las ideas", "algo
  distinto para un kick-off". Deja el resultado en la hoja "EB · Motor de ideas".
  Para convertir un concepto elegido en deck, usa `eb-presentacion`.
---

# Motor de ideas

Xavi lleva años proponiendo lo mismo a clientes parecidos. Esta skill existe para romper eso:
partir del catálogo real, cruzarlo con lo que se está haciendo fuera, y sacar conceptos que
EB pueda producir de verdad.

## Paso 1 · El brief mínimo

Ocasión, número de asistentes, espacio, presupuesto orientativo, tono y fecha.
Si falta algo, preguntá todo junto en una tanda. Si Xavi dice "improvisa", asumí y decilo.

## Paso 2 · Catálogo antes que nada

```bash
curl -s -H "Authorization: Bearer $EB_CATALOG_TOKEN" \
  https://propuestas.eventosbarcelona.com/api/gpt/catalogo
```

Sin esto no sabés qué puede producir la agencia y cualquier show que menciones estará inventado.
La respuesta trae también `referencias`: las webs del sector que mantiene Xavi.

## Paso 3 · Mirar fuera (solo cuando aporta)

Navegá las webs de `referencias` con WebFetch **cuando** el brief traiga un concepto poco habitual,
o cuando el cliente pida algo que suene a tendencia reciente. Si el brief es rutinario y el catálogo
ya lo resuelve, saltátelo: cuesta tiempo y no aporta.

Buscás **formatos y maneras de montar el espectáculo**, nunca textos. Si un formato te gusta,
propónlo con **nuestros** artistas o como producción a medida.

Si navegaste, decilo en una línea al final: "he mirado Scarlett y 42.show para esto".

## Paso 4 · Devolver 3 conceptos

Cada concepto, en este formato exacto:

```
CONCEPTO N · [nombre corto y vendible]
El pitch: dos líneas, como se lo contarías al cliente por teléfono.
Cómo se monta: recepción / momento wow / cierre.
Del catálogo: [nombre del show] (id: xxx) · [nombre del show] (id: xxx)
A producir a medida: [qué falta, o "nada"]
Riesgo: [espacio, presupuesto, disponibilidad, técnico, o "bajo"]
Por qué a este cliente: una línea.
```

Los tres conceptos tienen que ser **distintos entre sí**, no tres versiones del mismo.
Un patrón que funciona: uno seguro (lo que siempre funciona), uno de autor (el que a Xavi le apetece
vender), uno arriesgado (el que puede sorprender o espantar).

## Paso 5 · Registrar

En la hoja "EB · Motor de ideas" (Google Drive), pestaña `Conceptos`: una fila por concepto.
En la pestaña `Briefs`: una fila con el brief.
Si algún concepto necesitó algo que el catálogo no tiene, sumalo a la pestaña `Huecos de catálogo`,
o incrementá el contador si ese hueco ya estaba. Esos huecos son la lista de fichajes de artistas.

## Reglas

- Solo ids exactos devueltos por el catálogo. Nunca inventes un id ni un nombre de show.
- Lo que el catálogo no cubre se dice "a producir a medida", no se disfraza.
- Priorizá lo ejecutable. Un concepto brillante que EB no puede producir no sirve.
- Nada de copiar copy ajeno. Inspiración sí, texto no.
- Sin guion largo (—).
